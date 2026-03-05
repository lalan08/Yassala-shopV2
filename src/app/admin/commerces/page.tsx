"use client";

import { useEffect, useState } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db, type Establishment, type Mode, computeRankingScore } from "@/lib/adminFirebase";
import { useAdminMode, matchesMode } from "@/lib/adminMode";

const C = {
  bg: "#0a0a14",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  text: "#f1f5f9",
  muted: "#64748b",
  accent: "#f97316",
  green: "#22c55e",
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#fbbf24",
};

const EMPTY: Omit<Establishment, "id"> = {
  name: "",
  address: "",
  phone: "",
  cuisineType: "",
  imageUrl: "",
  openingHours: "",
  deliveryZone: "",
  prepTime: 20,
  deliveryFee: 2,
  mode: "both",
  visible: true,
  featured: false,
  isOpen: false,
  lat: undefined,
  lng: undefined,
  orders_7d: 0,
  avg_prep_time: 20,
  cancel_rate: 0,
  ranking_score: 0,
  promo_active: false,
};

function ModeTag({ mode }: { mode: Mode }) {
  const map: Record<Mode, { label: string; color: string }> = {
    day:   { label: "☀️ Jour",  color: "#fbbf24" },
    night: { label: "🌙 Nuit",  color: "#818cf8" },
    both:  { label: "⚡ Les deux", color: "#22c55e" },
  };
  const m = map[mode] ?? map.both;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: m.color + "22", color: m.color,
    }}>
      {m.label}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score > 50 ? C.green : score > 0 ? C.yellow : C.red;
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      background: color + "22", color,
    }}>
      {score.toFixed(0)}
    </span>
  );
}

export default function CommercesPage() {
  const { mode: adminMode } = useAdminMode();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | Mode>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Establishment, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "establishments"), (snap) => {
      const data = snap.docs.map((d) => {
        const e = { id: d.id, ...d.data() } as Establishment;
        e.ranking_score = computeRankingScore(e);
        return e;
      });
      data.sort((a, b) => (b.ranking_score ?? 0) - (a.ranking_score ?? 0));
      setEstablishments(data);
    });
    return () => unsub();
  }, []);

  const showMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const openCreate = () => {
    setForm(EMPTY);
    setEditId(null);
    setShowForm(true);
  };

  const openEdit = (e: Establishment) => {
    setForm({ ...e } as any);
    setEditId(e.id!);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const score = computeRankingScore(form);
    const data = { ...form, ranking_score: score, updatedAt: new Date().toISOString() };
    try {
      if (editId) {
        await updateDoc(doc(db, "establishments", editId), data);
        showMsg("Établissement mis à jour");
      } else {
        await addDoc(collection(db, "establishments"), { ...data, createdAt: new Date().toISOString() });
        showMsg("Établissement créé");
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cet établissement ?")) return;
    await deleteDoc(doc(db, "establishments", id));
    showMsg("Supprimé");
  };

  const toggleField = async (id: string, field: "visible" | "featured" | "isOpen", val: boolean) => {
    await updateDoc(doc(db, "establishments", id), { [field]: val, updatedAt: new Date().toISOString() });
  };

  // Recompute score after toggle
  const toggleIsOpen = async (e: Establishment) => {
    const newIsOpen = !e.isOpen;
    const newScore = computeRankingScore({ ...e, isOpen: newIsOpen });
    await updateDoc(doc(db, "establishments", e.id!), {
      isOpen: newIsOpen, ranking_score: newScore, updatedAt: new Date().toISOString(),
    });
  };

  const filtered = establishments.filter((e) => {
    if (!matchesMode(e.mode, adminMode)) return false;
    const matchMode = modeFilter === "all" || e.mode === modeFilter || e.mode === "both";
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.address.toLowerCase().includes(search.toLowerCase());
    return matchMode && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff",
          padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600, fontSize: 14,
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Établissements</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            {establishments.length} commerce{establishments.length > 1 ? "s" : ""} · triés par score de ranking
          </div>
        </div>
        <button onClick={openCreate} style={btnStyle(C.accent)}>+ Ajouter</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          placeholder="Rechercher un établissement..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={inputStyle}
        />
        {(["all", "day", "night", "both"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setModeFilter(m); setPage(1); }}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
              background: modeFilter === m ? C.accent : "rgba(255,255,255,0.06)",
              color: modeFilter === m ? "#fff" : C.muted,
              fontWeight: modeFilter === m ? 700 : 400,
            }}
          >
            {m === "all" ? "Tous" : m === "day" ? "☀️ Jour" : m === "night" ? "🌙 Nuit" : "⚡ Les deux"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              {["Établissement", "Mode", "Score", "Ouvert", "Visible", "Mis en avant", "Prép.", "Zone", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((e, i) => (
              <tr
                key={e.id}
                style={{
                  borderTop: `1px solid ${C.border}`,
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                }}
              >
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ fontWeight: 600 }}>{e.name}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{e.address}</div>
                  {e.cuisineType && <div style={{ color: C.muted, fontSize: 11 }}>{e.cuisineType}</div>}
                </td>
                <td style={{ padding: "10px 14px" }}><ModeTag mode={e.mode} /></td>
                <td style={{ padding: "10px 14px" }}><ScoreBadge score={e.ranking_score ?? 0} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <Toggle value={e.isOpen ?? false} onChange={() => toggleIsOpen(e)} color={C.green} />
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <Toggle value={e.visible} onChange={() => toggleField(e.id!, "visible", !e.visible)} color={C.blue} />
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <Toggle value={e.featured} onChange={() => toggleField(e.id!, "featured", !e.featured)} color={C.yellow} />
                </td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{e.prepTime ?? "—"} min</td>
                <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{e.deliveryZone || "—"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(e)} style={smallBtn("#3b82f6")}>Modifier</button>
                    <button onClick={() => remove(e.id!)} style={smallBtn("#ef4444")}>Suppr.</button>
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "32px", textAlign: "center", color: C.muted }}>
                  Aucun établissement trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                background: p === page ? C.accent : "rgba(255,255,255,0.06)",
                color: p === page ? "#fff" : C.muted,
                fontWeight: p === page ? 700 : 400,
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Ranking info */}
      <div style={{ marginTop: 28, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, fontSize: 12, color: C.muted }}>
        <strong style={{ color: C.text }}>Formule de ranking :</strong>{" "}
        score = (ouvert ? +50 : -100) + max(0, 30 - prep_time) + orders_7d × 1.5 + (promo ? +10 : 0) − cancel_rate × 100 − distance_km × 5
      </div>

      {/* Form Modal */}
      {showForm && (
        <Modal title={editId ? "Modifier l'établissement" : "Nouvel établissement"} onClose={() => setShowForm(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nom *">
              <input style={inputStyle} value={form.name} onChange={(e) => F("name", e.target.value)} placeholder="Nom de l'établissement" />
            </Field>
            <Field label="Adresse">
              <input style={inputStyle} value={form.address} onChange={(e) => F("address", e.target.value)} placeholder="Adresse complète" />
            </Field>
            <Field label="Téléphone">
              <input style={inputStyle} value={form.phone ?? ""} onChange={(e) => F("phone", e.target.value)} placeholder="+594 XXX XXX" />
            </Field>
            <Field label="Type de cuisine">
              <input style={inputStyle} value={form.cuisineType ?? ""} onChange={(e) => F("cuisineType", e.target.value)} placeholder="Ex: Créole, Fast Food, Pizzeria" />
            </Field>
            <Field label="Image URL">
              <input style={inputStyle} value={form.imageUrl ?? ""} onChange={(e) => F("imageUrl", e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Horaires">
              <input style={inputStyle} value={form.openingHours ?? ""} onChange={(e) => F("openingHours", e.target.value)} placeholder="Ex: Lun-Ven 8h-21h" />
            </Field>
            <Field label="Mode">
              <select style={inputStyle} value={form.mode} onChange={(e) => F("mode", e.target.value as Mode)}>
                <option value="day">☀️ Jour seulement</option>
                <option value="night">🌙 Nuit seulement</option>
                <option value="both">⚡ Jour et Nuit</option>
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Zone de livraison">
                <input style={inputStyle} value={form.deliveryZone ?? ""} onChange={(e) => F("deliveryZone", e.target.value)} placeholder="Ex: Cayenne centre" />
              </Field>
              <Field label="Temps de préparation (min)">
                <input style={inputStyle} type="number" value={form.prepTime ?? 20} onChange={(e) => F("prepTime", +e.target.value)} min={0} />
              </Field>
              <Field label="Frais de livraison (€)">
                <input style={inputStyle} type="number" value={form.deliveryFee ?? 2} onChange={(e) => F("deliveryFee", +e.target.value)} min={0} step={0.5} />
              </Field>
              <Field label="Taux d'annulation">
                <input style={inputStyle} type="number" value={form.cancel_rate ?? 0} onChange={(e) => F("cancel_rate", +e.target.value)} min={0} max={1} step={0.01} placeholder="0.05 = 5%" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Latitude GPS">
                <input style={inputStyle} type="number" value={form.lat ?? ""} onChange={(e) => F("lat", e.target.value ? +e.target.value : undefined)} placeholder="4.922..." step="any" />
              </Field>
              <Field label="Longitude GPS">
                <input style={inputStyle} type="number" value={form.lng ?? ""} onChange={(e) => F("lng", e.target.value ? +e.target.value : undefined)} placeholder="-52.31..." step="any" />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <CheckItem label="Visible" value={form.visible} onChange={(v) => F("visible", v)} />
              <CheckItem label="Mis en avant" value={form.featured} onChange={(v) => F("featured", v)} />
              <CheckItem label="Ouvert maintenant" value={form.isOpen ?? false} onChange={(v) => F("isOpen", v)} />
              <CheckItem label="Promo active" value={form.promo_active ?? false} onChange={(v) => F("promo_active", v)} />
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

// ── SMALL COMPONENTS ──

function Toggle({ value, onChange, color }: { value: boolean; onChange: () => void; color: string }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
        background: value ? color : "rgba(255,255,255,0.1)",
        position: "relative", transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16,
        borderRadius: "50%", background: "#fff", transition: "left 0.2s",
      }} />
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#111827", borderRadius: 16, padding: 28, width: "100%", maxWidth: 600,
        border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflowY: "auto",
      }}>
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

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13,
  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
  color: "#f1f5f9", outline: "none", boxSizing: "border-box",
};

const btnStyle = (bg: string): React.CSSProperties => ({
  padding: "9px 20px", borderRadius: 9, border: "none", background: bg,
  color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
});

const smallBtn = (bg: string): React.CSSProperties => ({
  padding: "5px 10px", borderRadius: 6, border: "none", background: bg + "22",
  color: bg, fontWeight: 600, fontSize: 12, cursor: "pointer",
});
