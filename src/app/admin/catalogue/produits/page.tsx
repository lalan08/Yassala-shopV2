"use client";

import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy,
} from "firebase/firestore";
import { db, type Product, type Mode, type Category } from "@/lib/adminFirebase";
import { useAdminMode, matchesMode } from "@/lib/adminMode";

const C = {
  bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)",
  text: "#f1f5f9", muted: "#64748b", accent: "#f97316",
  green: "#22c55e", red: "#ef4444", blue: "#3b82f6", yellow: "#fbbf24",
};

const EMPTY: Omit<Product, "id"> = {
  name: "", desc: "", price: 0, image: "", cat: "", badge: "",
  stock: 0, available: true, isActive: true, mode: "both",
  featured: false, promotion_active: false, orders_24h: 0, orders_7d: 0,
};

function ModeTag({ mode }: { mode: Mode }) {
  const map: Record<Mode, { label: string; color: string }> = {
    day:   { label: "☀️ Jour",     color: "#fbbf24" },
    night: { label: "🌙 Nuit",     color: "#818cf8" },
    both:  { label: "⚡ Les deux", color: "#22c55e" },
  };
  const m = map[mode] ?? map.both;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: m.color + "22", color: m.color }}>
      {m.label}
    </span>
  );
}

export default function ProduitsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const { mode: adminMode } = useAdminMode();
  const [modeFilter, setModeFilter] = useState<"all" | Mode>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Product, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  useEffect(() => {
    const unsubP = onSnapshot(collection(db, "products"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setProducts(data);
    });
    const unsubC = onSnapshot(collection(db, "categories"), (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    return () => { unsubP(); unsubC(); };
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const openCreate = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (p: Product) => { setForm({ ...p } as any); setEditId(p.id!); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const data = { ...form, updatedAt: new Date().toISOString() };
    try {
      if (editId) {
        await updateDoc(doc(db, "products", editId), data);
        showMsg("Produit mis à jour");
      } else {
        await addDoc(collection(db, "products"), { ...data, createdAt: new Date().toISOString(), order: products.length });
        showMsg("Produit créé");
      }
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    await deleteDoc(doc(db, "products", id));
    showMsg("Supprimé");
  };

  const toggleAvailable = async (p: Product) => {
    await updateDoc(doc(db, "products", p.id!), { available: !p.available, isActive: !p.available });
  };

  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = products.filter((p) => {
    // Global mode filter (from sidebar switch)
    if (!matchesMode(p.mode, adminMode)) return false;
    // Local sub-filter (further refinement within the current mode)
    const matchMode = modeFilter === "all" || p.mode === modeFilter || p.mode === "both";
    const matchCat  = catFilter === "all" || p.cat === catFilter;
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.desc ?? "").toLowerCase().includes(search.toLowerCase());
    return matchMode && matchCat && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <Toast msg={toast} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Produits</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            {products.length} produit{products.length > 1 ? "s" : ""} · mode day/night/both unifié
          </div>
        </div>
        <button onClick={openCreate} style={btnStyle(C.accent)}>+ Ajouter</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Rechercher un produit..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inputStyle, maxWidth: 260 }}
        />
        {(["all", "day", "night", "both"] as const).map((m) => (
          <button key={m} onClick={() => { setModeFilter(m); setPage(1); }} style={filterBtn(modeFilter === m)}>
            {m === "all" ? "Tous" : m === "day" ? "☀️ Jour" : m === "night" ? "🌙 Nuit" : "⚡ Les deux"}
          </button>
        ))}
        <select
          value={catFilter}
          onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, maxWidth: 180 }}
        >
          <option value="all">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.key}>{c.emoji} {c.label}</option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total", val: products.length, color: C.accent },
          { label: "Jour", val: products.filter(p => p.mode === "day" || p.mode === "both").length, color: "#fbbf24" },
          { label: "Nuit", val: products.filter(p => p.mode === "night" || p.mode === "both").length, color: "#818cf8" },
          { label: "Disponibles", val: products.filter(p => p.available !== false).length, color: C.green },
          { label: "En promo", val: products.filter(p => p.promotion_active).length, color: C.red },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              {["Produit", "Mode", "Prix", "Catégorie", "Stock", "Dispo", "Promo", "7j", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((p, i) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {p.image && <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.badge && <div style={{ fontSize: 11, color: C.accent }}>{p.badge}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "10px 14px" }}><ModeTag mode={p.mode ?? "both"} /></td>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: C.accent }}>{p.price?.toFixed(2)} €</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{p.cat || "—"}</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{p.stock ?? "∞"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <Toggle value={p.available !== false} onChange={() => toggleAvailable(p)} color={C.green} />
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {p.promotion_active ? <span style={{ color: C.red, fontWeight: 600, fontSize: 12 }}>🔥 Oui</span> : <span style={{ color: C.muted, fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{p.orders_7d ?? 0}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(p)} style={smallBtn("#3b82f6")}>Modifier</button>
                    <button onClick={() => remove(p.id!)} style={smallBtn("#ef4444")}>Suppr.</button>
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: "center", color: C.muted }}>Aucun produit</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
            <button key={pg} onClick={() => setPage(pg)} style={pgBtn(pg === page)}>{pg}</button>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <Modal title={editId ? "Modifier le produit" : "Nouveau produit"} onClose={() => setShowForm(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nom *">
              <input style={inputStyle} value={form.name} onChange={(e) => F("name", e.target.value)} placeholder="Nom du produit" />
            </Field>
            <Field label="Description">
              <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.desc ?? ""} onChange={(e) => F("desc", e.target.value)} placeholder="Description courte" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Prix (€) *">
                <input style={inputStyle} type="number" value={form.price} onChange={(e) => F("price", +e.target.value)} min={0} step={0.5} />
              </Field>
              <Field label="Stock">
                <input style={inputStyle} type="number" value={form.stock ?? 0} onChange={(e) => F("stock", +e.target.value)} min={0} />
              </Field>
            </div>
            <Field label="Mode *">
              <select style={inputStyle} value={form.mode} onChange={(e) => F("mode", e.target.value as Mode)}>
                <option value="day">☀️ Jour seulement</option>
                <option value="night">🌙 Nuit seulement</option>
                <option value="both">⚡ Jour et Nuit</option>
              </select>
            </Field>
            <Field label="Catégorie">
              <select style={inputStyle} value={form.cat ?? ""} onChange={(e) => F("cat", e.target.value)}>
                <option value="">— Aucune —</option>
                {categories.map((c) => <option key={c.id} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </Field>
            <Field label="Image URL">
              <input style={inputStyle} value={form.image ?? ""} onChange={(e) => F("image", e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Badge (ex: Nouveau, Populaire)">
              <input style={inputStyle} value={form.badge ?? ""} onChange={(e) => F("badge", e.target.value)} placeholder="Ex: 🔥 Populaire" />
            </Field>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <CheckItem label="Disponible" value={form.available !== false} onChange={(v) => { F("available", v); F("isActive", v); }} />
              <CheckItem label="Mis en avant" value={form.featured ?? false} onChange={(v) => F("featured", v)} />
              <CheckItem label="Promotion active" value={form.promotion_active ?? false} onChange={(v) => F("promotion_active", v)} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => setShowForm(false)} style={smallBtn(C.muted)}>Annuler</button>
              <button onClick={save} disabled={saving} style={btnStyle(C.accent)}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── SHARED COMPONENTS ──
function Toggle({ value, onChange, color }: { value: boolean; onChange: () => void; color: string }) {
  return (
    <button onClick={onChange} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: value ? color : "rgba(255,255,255,0.1)", position: "relative", transition: "background 0.2s" }}>
      <span style={{ position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
    </button>
  );
}

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, background: "#f97316", color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600, fontSize: 14 }}>
      {msg}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#111827", borderRadius: 16, padding: 28, width: "100%", maxWidth: 560, border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function CheckItem({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#f1f5f9" }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "#f97316" }} />
      {label}
    </label>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#f1f5f9", outline: "none", boxSizing: "border-box" };
const btnStyle = (bg: string): React.CSSProperties => ({ padding: "9px 20px", borderRadius: 9, border: "none", background: bg, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" });
const smallBtn = (bg: string): React.CSSProperties => ({ padding: "5px 10px", borderRadius: 6, border: "none", background: bg + "22", color: bg, fontWeight: 600, fontSize: 12, cursor: "pointer" });
const filterBtn = (active: boolean): React.CSSProperties => ({ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, background: active ? "#f97316" : "rgba(255,255,255,0.06)", color: active ? "#fff" : "#64748b", fontWeight: active ? 700 : 400 });
const pgBtn = (active: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", background: active ? "#f97316" : "rgba(255,255,255,0.06)", color: active ? "#fff" : "#64748b", fontWeight: active ? 700 : 400 });
