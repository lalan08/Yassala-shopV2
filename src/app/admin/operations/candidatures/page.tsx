"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", red: "#ef4444", yellow: "#fbbf24" };

type Application = { id: string; name: string; phone: string; email: string; zone: string; vehicle: string; message: string; status: "nouveau" | "accepte" | "refuse"; createdAt: string; password?: string; contractAccepted?: boolean; };

const STATUS_MAP = { nouveau: { label: "Nouveau",  color: "#f97316" }, accepte: { label: "Accepté",  color: "#22c55e" }, refuse: { label: "Refusé",   color: "#ef4444" } };

export default function CandidaturesPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [filter, setFilter] = useState<"all" | "nouveau" | "accepte" | "refuse">("nouveau");
  const [selected, setSelected] = useState<Application | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "driver_applications"), (snap) => {
      setApps(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Application))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    });
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "driver_applications", id), { status });
    showMsg(`Statut → ${STATUS_MAP[status as keyof typeof STATUS_MAP]?.label ?? status}`);
    if (selected?.id === id) setSelected((s) => s ? { ...s, status: status as any } : s);
  };

  const promoteToDriver = async (app: Application) => {
    await addDoc(collection(db, "drivers"), {
      name: app.name, phone: app.phone, email: app.email, zone: app.zone,
      isOnline: false, status: "offline", createdAt: new Date().toISOString(),
      performanceScore: 5.0, acceptanceRate: 1.0,
    });
    await updateStatus(app.id, "accepte");
    showMsg(`${app.name} ajouté comme livreur !`);
  };

  const filtered = apps.filter((a) => filter === "all" || a.status === filter);

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Candidatures livreurs</h1>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
        {apps.filter((a) => a.status === "nouveau").length} en attente · {apps.length} total
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {(["nouveau", "all", "accepte", "refuse"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: filter === f ? 700 : 400, background: filter === f ? C.accent : "rgba(255,255,255,0.06)", color: filter === f ? "#fff" : C.muted }}>
            {f === "all" ? "Toutes" : STATUS_MAP[f as keyof typeof STATUS_MAP]?.label ?? f}
            {" "}({f === "all" ? apps.length : apps.filter((a) => a.status === f).length})
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 360px" : "1fr", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12, alignContent: "start" }}>
          {filtered.map((a) => {
            const st = STATUS_MAP[a.status] ?? { label: a.status, color: C.muted };
            return (
              <div key={a.id} onClick={() => setSelected(a)} style={{ background: selected?.id === a.id ? "rgba(249,115,22,0.08)" : C.card, border: `1px solid ${selected?.id === a.id ? "rgba(249,115,22,0.3)" : C.border}`, borderRadius: 12, padding: 16, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: st.color + "22", color: st.color }}>{st.label}</span>
                </div>
                <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{a.phone} · {a.email}</div>
                <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>📍 {a.zone} · {a.vehicle}</div>
                {a.status === "nouveau" && (
                  <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => promoteToDriver(a)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "rgba(34,197,94,0.15)", color: C.green, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✓ Accepter + Créer</button>
                    <button onClick={() => updateStatus(a.id, "refuse")} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.12)", color: C.red, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✕ Refuser</button>
                  </div>
                )}
                <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString("fr-FR") : "—"}</div>
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: C.muted }}>Aucune candidature</div>}
        </div>

        {selected && (
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 20, position: "sticky", top: 20, alignSelf: "start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{selected.name}</h3>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            {[["Téléphone", selected.phone], ["Email", selected.email], ["Zone", selected.zone], ["Véhicule", selected.vehicle], ["Statut", STATUS_MAP[selected.status]?.label], ["Candidature", selected.createdAt ? new Date(selected.createdAt).toLocaleDateString("fr-FR") : "—"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: C.muted }}>{k}</span>
                <span style={{ color: C.text }}>{v}</span>
              </div>
            ))}
            {selected.message && (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 8, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                <strong style={{ color: C.text, display: "block", marginBottom: 4 }}>Message :</strong>
                {selected.message}
              </div>
            )}
            {selected.contractAccepted && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.green }}>✅ Contrat accepté</div>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              {selected.status !== "accepte" && (
                <button onClick={() => promoteToDriver(selected)} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: "rgba(34,197,94,0.15)", color: C.green, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✓ Accepter + Créer livreur</button>
              )}
              {selected.status !== "refuse" && (
                <button onClick={() => updateStatus(selected.id, "refuse")} style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: "rgba(239,68,68,0.12)", color: C.red, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✕ Refuser</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
