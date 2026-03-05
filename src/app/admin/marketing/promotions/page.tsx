"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/adminFirebase";
import { useAdminMode, matchesMode } from "@/lib/adminMode";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", red: "#ef4444" };

type Promo = { id?: string; title: string; desc: string; emoji: string; discount: string; active: boolean; order: number; mode: string; endsAt?: string; };
const EMPTY: Omit<Promo, "id"> = { title: "", desc: "", emoji: "🎯", discount: "", active: true, order: 0, mode: "both", endsAt: "" };

export default function PromotionsPage() {
  const { mode: adminMode } = useAdminMode();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [form, setForm] = useState<Omit<Promo, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "yassala_day_offres"), (snap) => {
      setPromos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Promo)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editId) { await updateDoc(doc(db, "yassala_day_offres", editId), { ...form }); showMsg("Mise à jour"); }
      else { await addDoc(collection(db, "yassala_day_offres"), { ...form }); showMsg("Créée"); }
      setShowForm(false); setEditId(null); setForm(EMPTY);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ?")) return;
    await deleteDoc(doc(db, "yassala_day_offres", id));
    showMsg("Supprimée");
  };

  const toggle = async (p: Promo) => {
    await updateDoc(doc(db, "yassala_day_offres", p.id!), { active: !p.active });
  };

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Promotions</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: "4px 0 0" }}>Offres spéciales affichées sur la page d'accueil.</p>
        </div>
        <button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Ajouter</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {promos.filter((p) => matchesMode(p.mode, adminMode)).map((p) => (
          <div key={p.id} style={{ background: C.card, border: `1px solid ${p.active ? "rgba(249,115,22,0.3)" : C.border}`, borderRadius: 14, padding: 18, opacity: p.active ? 1 : 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontSize: 28 }}>{p.emoji}</div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", color: p.active ? C.green : C.muted }}>{p.active ? "Actif" : "Inactif"}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{p.title}</div>
            {p.desc && <div style={{ color: C.muted, fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>{p.desc}</div>}
            {p.discount && <div style={{ fontWeight: 800, fontSize: 18, color: C.accent, marginBottom: 8 }}>{p.discount}</div>}
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Mode: {p.mode ?? "both"}{p.endsAt ? ` · Fin: ${new Date(p.endsAt).toLocaleDateString("fr-FR")}` : ""}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => toggle(p)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: p.active ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", color: p.active ? C.red : C.green, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{p.active ? "Désactiver" : "Activer"}</button>
              <button onClick={() => { setForm({ ...p } as any); setEditId(p.id!); setShowForm(true); }} style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Edit</button>
              <button onClick={() => remove(p.id!)} style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.08)", color: C.red, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ))}
        {promos.length === 0 && <div style={{ gridColumn: "1/-1", padding: 40, textAlign: "center", color: C.muted }}>Aucune promotion</div>}
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111827", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editId ? "Modifier" : "Nouvelle promotion"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {[["Titre *", "title", "text", "Ex: Soirée Créole"], ["Emoji", "emoji", "text", "🎯"], ["Réduction", "discount", "text", "Ex: -20% ou 2 pour 1"], ["Description", "desc", "textarea", "Description courte"]].map(([label, field, type, ph]) => (
                <div key={field as string}>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>{label}</label>
                  {type === "textarea"
                    ? <textarea style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", minHeight: 70, resize: "vertical", boxSizing: "border-box" as any }} value={(form as any)[field as string] ?? ""} onChange={(e) => F(field as any, e.target.value)} placeholder={ph as string} />
                    : <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as any }} value={(form as any)[field as string] ?? ""} onChange={(e) => F(field as any, e.target.value)} placeholder={ph as string} />
                  }
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Mode</label>
                  <select style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13 }} value={form.mode} onChange={(e) => F("mode", e.target.value)}>
                    <option value="both">Les deux</option><option value="day">Jour</option><option value="night">Nuit</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Date fin</label>
                  <input type="date" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as any }} value={form.endsAt ?? ""} onChange={(e) => F("endsAt", e.target.value)} />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.text }}>
                <input type="checkbox" checked={form.active} onChange={(e) => F("active", e.target.checked)} style={{ accentColor: C.accent }} />Active
              </label>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowForm(false)} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: "rgba(255,255,255,0.06)", color: C.muted, cursor: "pointer" }}>Annuler</button>
                <button onClick={save} disabled={saving} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{saving ? "..." : "Enregistrer"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
