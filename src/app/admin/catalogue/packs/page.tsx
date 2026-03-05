"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db, type Pack, type Mode } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316" };
const EMPTY: Omit<Pack, "id"> = { name: "", tag: "", emoji: "🎁", items: "", price: 0, real: 0, star: false, mode: "both", active: true };

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [form, setForm] = useState<Omit<Pack, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "packs"), (snap) => {
      setPacks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pack)));
    });
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, "packs", editId), { ...form });
        showMsg("Pack mis à jour");
      } else {
        await addDoc(collection(db, "packs"), { ...form });
        showMsg("Pack créé");
      }
      setShowForm(false); setEditId(null); setForm(EMPTY);
    } finally { setSaving(false); }
  };

  const openEdit = (p: Pack) => { setForm({ ...p } as any); setEditId(p.id!); setShowForm(true); };
  const remove = async (id: string) => {
    if (!confirm("Supprimer ce pack ?")) return;
    await deleteDoc(doc(db, "packs", id));
    showMsg("Supprimé");
  };

  const toggleActive = async (p: Pack) => {
    await updateDoc(doc(db, "packs", p.id!), { active: !p.active });
  };

  const discount = (p: Pack) => p.real > 0 ? Math.round((1 - p.price / p.real) * 100) : 0;

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Packs</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: "4px 0 0" }}>Packs unifiés jour/nuit avec champ mode.</p>
        </div>
        <button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }} style={btnStyle(C.accent)}>+ Ajouter</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
        {packs.map((p) => (
          <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, position: "relative" }}>
            {p.star && <span style={{ position: "absolute", top: 12, right: 12, fontSize: 18 }}>⭐</span>}
            <div style={{ fontSize: 28, marginBottom: 8 }}>{p.emoji}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{p.name}</div>
            <div style={{ color: C.accent, fontSize: 11, fontWeight: 600, marginBottom: 8 }}>{p.tag}</div>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>{p.items}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 18, color: C.accent }}>{p.price.toFixed(2)} €</span>
              {p.real > 0 && (
                <>
                  <span style={{ color: C.muted, textDecoration: "line-through", fontSize: 13 }}>{p.real.toFixed(2)} €</span>
                  <span style={{ background: "#ef444422", color: "#ef4444", borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>-{discount(p)}%</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,0.06)", color: C.muted }}>{p.mode ?? "both"}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => toggleActive(p)} style={{ ...smallBtn(p.active !== false ? "#22c55e" : "#64748b"), fontSize: 11 }}>
                  {p.active !== false ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => openEdit(p)} style={smallBtn("#3b82f6")}>Modifier</button>
                <button onClick={() => remove(p.id!)} style={smallBtn("#ef4444")}>Suppr.</button>
              </div>
            </div>
          </div>
        ))}
        {packs.length === 0 && (
          <div style={{ gridColumn: "1/-1", padding: 40, textAlign: "center", color: C.muted }}>Aucun pack créé</div>
        )}
      </div>

      {showForm && (
        <Modal title={editId ? "Modifier le pack" : "Nouveau pack"} onClose={() => setShowForm(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Nom *">
                <input style={inputStyle} value={form.name} onChange={(e) => F("name", e.target.value)} placeholder="Super Pack Nuit" />
              </Field>
              <Field label="Emoji">
                <input style={inputStyle} value={form.emoji} onChange={(e) => F("emoji", e.target.value)} placeholder="🎁" />
              </Field>
            </div>
            <Field label="Tag (badge)">
              <input style={inputStyle} value={form.tag} onChange={(e) => F("tag", e.target.value)} placeholder="Ex: BEST DEAL" />
            </Field>
            <Field label="Contenu (items)">
              <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.items} onChange={(e) => F("items", e.target.value)} placeholder="1x Burger + 1x Frites + 1x Boisson" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Prix pack (€)">
                <input style={inputStyle} type="number" value={form.price} onChange={(e) => F("price", +e.target.value)} min={0} step={0.5} />
              </Field>
              <Field label="Prix normal (€)">
                <input style={inputStyle} type="number" value={form.real} onChange={(e) => F("real", +e.target.value)} min={0} step={0.5} />
              </Field>
            </div>
            <Field label="Mode">
              <select style={inputStyle} value={form.mode ?? "both"} onChange={(e) => F("mode", e.target.value as Mode)}>
                <option value="day">☀️ Jour</option>
                <option value="night">🌙 Nuit</option>
                <option value="both">⚡ Les deux</option>
              </select>
            </Field>
            <div style={{ display: "flex", gap: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#f1f5f9" }}>
                <input type="checkbox" checked={form.star} onChange={(e) => F("star", e.target.checked)} style={{ accentColor: "#f97316" }} />
                ⭐ Best Seller
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#f1f5f9" }}>
                <input type="checkbox" checked={form.active !== false} onChange={(e) => F("active", e.target.checked)} style={{ accentColor: "#f97316" }} />
                Actif
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={smallBtn("#64748b")}>Annuler</button>
              <button onClick={save} disabled={saving} style={btnStyle(C.accent)}>{saving ? "..." : "Enregistrer"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#111827", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520, border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflowY: "auto" }}>
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

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#f1f5f9", outline: "none", boxSizing: "border-box" };
const btnStyle = (bg: string): React.CSSProperties => ({ padding: "9px 20px", borderRadius: 9, border: "none", background: bg, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" });
const smallBtn = (bg: string): React.CSSProperties => ({ padding: "5px 10px", borderRadius: 6, border: "none", background: bg + "22", color: bg, fontWeight: 600, fontSize: 12, cursor: "pointer" });
