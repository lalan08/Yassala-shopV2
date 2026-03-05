"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db, type Banner } from "@/lib/adminFirebase";
import { useAdminMode, matchesMode } from "@/lib/adminMode";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", red: "#ef4444" };
const EMPTY: Omit<Banner, "id"> = { title: "", subtitle: "", desc: "", cta: "Commander", link: "/", gradient: "linear-gradient(135deg,#f97316,#dc2626)", image: "", brightness: 70, active: true, order: 0 };

export default function BannièresPage() {
  const { mode: adminMode } = useAdminMode();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [form, setForm] = useState<Omit<Banner, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => { return onSnapshot(collection(db, "banners"), (snap) => { setBanners(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Banner)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))); }); }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editId) { await updateDoc(doc(db, "banners", editId), { ...form }); showMsg("Bannière mise à jour"); }
      else { await addDoc(collection(db, "banners"), { ...form }); showMsg("Bannière créée"); }
      setShowForm(false); setEditId(null); setForm(EMPTY);
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => { if (!confirm("Supprimer ?")) return; await deleteDoc(doc(db, "banners", id)); showMsg("Supprimée"); };
  const toggle = async (b: Banner) => { await updateDoc(doc(db, "banners", b.id!), { active: !b.active }); };
  const move = async (id: string, delta: number) => {
    const idx = banners.findIndex((b) => b.id === id);
    const swap = idx + delta;
    if (swap < 0 || swap >= banners.length) return;
    await Promise.all([updateDoc(doc(db, "banners", id), { order: banners[swap].order }), updateDoc(doc(db, "banners", banners[swap].id!), { order: banners[idx].order })]);
  };

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Bannières</h1>
        <button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Ajouter</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {banners.filter((b) => matchesMode((b as any).mode, adminMode)).map((b, i) => (
          <div key={b.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center" }}>
            {/* Preview */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px" }}>
              <div style={{ width: 80, height: 50, borderRadius: 8, background: b.gradient || "#f97316", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                {b.image && <img src={b.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: b.brightness / 100 }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{b.title}</div>
                {b.subtitle && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{b.subtitle}</div>}
                {b.desc && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{b.desc}</div>}
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>CTA: {b.cta} → {b.link} · Mode: {(b as any).mode ?? "both"}</div>
              </div>
            </div>
            {/* Controls */}
            <div style={{ display: "flex", gap: 8, padding: "14px 18px", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button onClick={() => move(b.id!, -1)} disabled={i === 0} style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.06)", color: C.muted, cursor: "pointer", fontSize: 10 }}>▲</button>
                <button onClick={() => move(b.id!, 1)} disabled={i === banners.length - 1} style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.06)", color: C.muted, cursor: "pointer", fontSize: 10 }}>▼</button>
              </div>
              <button onClick={() => toggle(b)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: b.active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", color: b.active ? C.green : C.muted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{b.active ? "Actif" : "Inactif"}</button>
              <button onClick={() => { setForm({ ...b } as any); setEditId(b.id!); setShowForm(true); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Edit</button>
              <button onClick={() => remove(b.id!)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.08)", color: C.red, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ))}
        {banners.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Aucune bannière</div>}
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111827", borderRadius: 16, padding: 28, width: "100%", maxWidth: 560, border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editId ? "Modifier la bannière" : "Nouvelle bannière"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {[["Titre *", "title", "text"], ["Sous-titre", "subtitle", "text"], ["Description", "desc", "text"], ["Lien CTA", "link", "text"], ["Texte bouton", "cta", "text"], ["Image URL", "image", "text"], ["Gradient CSS", "gradient", "text"]].map(([label, field]) => (
                <div key={field as string}>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>{label}</label>
                  <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as any }} value={(form as any)[field as string] ?? ""} onChange={(e) => F(field as any, e.target.value)} />
                </div>
              ))}
              <div>
                <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Luminosité image ({form.brightness}%)</label>
                <input type="range" min={10} max={100} value={form.brightness} onChange={(e) => F("brightness", +e.target.value)} style={{ width: "100%", accentColor: C.accent }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Mode</label>
                  <select style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13 }} value={(form as any).mode ?? "both"} onChange={(e) => F("mode" as any, e.target.value)}>
                    <option value="both">Les deux</option><option value="day">Jour</option><option value="night">Nuit</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>Ordre</label>
                  <input type="number" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as any }} value={form.order} onChange={(e) => F("order", +e.target.value)} min={0} />
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
