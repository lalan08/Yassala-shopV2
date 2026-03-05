"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db, type Category, type Mode } from "@/lib/adminFirebase";
import { useAdminMode, matchesMode } from "@/lib/adminMode";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316" };
const EMPTY: Omit<Category, "id"> = { key: "", label: "", emoji: "🍽️", order: 0, mode: "both" };

export default function CategoriesPage() {
  const { mode: adminMode } = useAdminMode();
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState<Omit<Category, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "categories"), (snap) => {
      setCats(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.key.trim() || !form.label.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, "categories", editId), { ...form });
        showMsg("Catégorie mise à jour");
      } else {
        await addDoc(collection(db, "categories"), { ...form, order: cats.length });
        showMsg("Catégorie créée");
      }
      setForm(EMPTY); setEditId(null);
    } finally { setSaving(false); }
  };

  const openEdit = (c: Category) => { setForm({ ...c } as any); setEditId(c.id!); };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette catégorie ?")) return;
    await deleteDoc(doc(db, "categories", id));
    showMsg("Supprimée");
  };

  const moveOrder = async (id: string, delta: number) => {
    const idx = cats.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const swapIdx = idx + delta;
    if (swapIdx < 0 || swapIdx >= cats.length) return;
    const batch: Promise<any>[] = [
      updateDoc(doc(db, "categories", id), { order: cats[swapIdx].order }),
      updateDoc(doc(db, "categories", cats[swapIdx].id!), { order: cats[idx].order }),
    ];
    await Promise.all(batch);
  };

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600, fontSize: 14 }}>{toast}</div>}

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Catégories</h1>
      <p style={{ color: C.muted, fontSize: 13, margin: "0 0 24px" }}>Catégories unifiées pour jour et nuit. Champ mode pour filtrer par contexte.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
        {/* List */}
        <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                {["#", "Emoji", "Label", "Clé", "Mode", "Ordre", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats.filter((c) => matchesMode(c.mode, adminMode)).map((c, i) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{i + 1}</td>
                  <td style={{ padding: "10px 14px", fontSize: 22 }}>{c.emoji}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.label}</td>
                  <td style={{ padding: "10px 14px", color: C.muted, fontFamily: "monospace", fontSize: 12 }}>{c.key}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,0.06)", color: C.muted }}>
                      {c.mode ?? "both"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => moveOrder(c.id!, -1)} style={{ ...smallBtn("#64748b"), padding: "3px 8px" }}>▲</button>
                      <button onClick={() => moveOrder(c.id!, 1)} style={{ ...smallBtn("#64748b"), padding: "3px 8px" }}>▼</button>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(c)} style={smallBtn("#3b82f6")}>Modifier</button>
                      <button onClick={() => remove(c.id!)} style={smallBtn("#ef4444")}>Suppr.</button>
                    </div>
                  </td>
                </tr>
              ))}
              {cats.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: C.muted }}>Aucune catégorie</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Form */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, alignSelf: "start" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>{editId ? "Modifier" : "Nouvelle catégorie"}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Clé (slug) *">
              <input style={inputStyle} value={form.key} onChange={(e) => F("key", e.target.value.toLowerCase().replace(/\s/g, "_"))} placeholder="ex: plats_chauds" />
            </Field>
            <Field label="Label *">
              <input style={inputStyle} value={form.label} onChange={(e) => F("label", e.target.value)} placeholder="Plats Chauds" />
            </Field>
            <Field label="Emoji">
              <input style={inputStyle} value={form.emoji} onChange={(e) => F("emoji", e.target.value)} placeholder="🍽️" />
            </Field>
            <Field label="Mode">
              <select style={inputStyle} value={form.mode ?? "both"} onChange={(e) => F("mode", e.target.value as Mode)}>
                <option value="day">☀️ Jour</option>
                <option value="night">🌙 Nuit</option>
                <option value="both">⚡ Les deux</option>
              </select>
            </Field>
            <Field label="Ordre">
              <input style={inputStyle} type="number" value={form.order} onChange={(e) => F("order", +e.target.value)} min={0} />
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {editId && <button onClick={() => { setForm(EMPTY); setEditId(null); }} style={smallBtn("#64748b")}>Annuler</button>}
              <button onClick={save} disabled={saving} style={{ ...btnStyle(C.accent), flex: 1 }}>
                {saving ? "..." : editId ? "Mettre à jour" : "Créer"}
              </button>
            </div>
          </div>
        </div>
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
