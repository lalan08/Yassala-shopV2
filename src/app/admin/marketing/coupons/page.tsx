"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db, type Coupon } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", red: "#ef4444" };
const EMPTY: Omit<Coupon, "id"> = { code: "", type: "percent", value: 10, minOrder: 0, active: true };

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<Omit<Coupon, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { return onSnapshot(collection(db, "coupons"), (snap) => { setCoupons(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Coupon))); }); }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code.trim()) return;
    setSaving(true);
    const data = { ...form, code: form.code.toUpperCase().trim() };
    try {
      if (editId) { await updateDoc(doc(db, "coupons", editId), data); showMsg("Coupon mis à jour"); }
      else { await addDoc(collection(db, "coupons"), data); showMsg("Coupon créé"); }
      setForm(EMPTY); setEditId(null);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => { if (!confirm("Supprimer ?")) return; await deleteDoc(doc(db, "coupons", id)); showMsg("Supprimé"); };
  const toggle = async (c: Coupon) => { await updateDoc(doc(db, "coupons", c.id!), { active: !c.active }); };

  const copy = (code: string) => { navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 1500); };

  const genCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    F("code", code);
  };

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 24px" }}>Coupons de réduction</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
        {/* List */}
        <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                {["Code", "Type", "Valeur", "Min commande", "Actif", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((c, i) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: C.accent, background: "rgba(249,115,22,0.12)", padding: "3px 10px", borderRadius: 6 }}>{c.code}</span>
                      <button onClick={() => copy(c.code)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }} title="Copier">
                        {copied === c.code ? "✓" : "📋"}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{c.type === "percent" ? "%" : "€ fixe"}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{c.value}{c.type === "percent" ? "%" : " €"}</td>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{c.minOrder ? `${c.minOrder} €` : "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <button onClick={() => toggle(c)} style={{ padding: "4px 10px", borderRadius: 99, border: "none", cursor: "pointer", background: c.active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", color: c.active ? C.green : C.muted, fontWeight: 600, fontSize: 11 }}>
                      {c.active ? "Actif" : "Inactif"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setForm({ ...c } as any); setEditId(c.id!); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "rgba(59,130,246,0.15)", color: "#3b82f6", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Edit</button>
                      <button onClick={() => remove(c.id!)} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "rgba(239,68,68,0.12)", color: C.red, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: C.muted }}>Aucun coupon</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Form */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, alignSelf: "start" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>{editId ? "Modifier" : "Nouveau coupon"}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Code *</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", fontFamily: "monospace", textTransform: "uppercase" }} value={form.code} onChange={(e) => F("code", e.target.value.toUpperCase())} placeholder="CODE10" />
                <button onClick={genCode} style={{ padding: "9px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.06)", color: C.muted, cursor: "pointer", fontSize: 12 }}>🎲 Gen</button>
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Type</label>
              <select style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13 }} value={form.type} onChange={(e) => F("type", e.target.value as "percent" | "fixed")}>
                <option value="percent">Pourcentage (%)</option>
                <option value="fixed">Montant fixe (€)</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Valeur {form.type === "percent" ? "(%)" : "(€)"}</label>
              <input type="number" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as any }} value={form.value} onChange={(e) => F("value", +e.target.value)} min={0} max={form.type === "percent" ? 100 : undefined} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Commande minimum (€)</label>
              <input type="number" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as any }} value={form.minOrder ?? 0} onChange={(e) => F("minOrder", +e.target.value)} min={0} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.text }}>
              <input type="checkbox" checked={form.active} onChange={(e) => F("active", e.target.checked)} style={{ accentColor: C.accent }} />Actif
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {editId && <button onClick={() => { setForm(EMPTY); setEditId(null); }} style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: "rgba(255,255,255,0.06)", color: C.muted, cursor: "pointer" }}>Annuler</button>}
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{saving ? "..." : editId ? "Mettre à jour" : "Créer"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
