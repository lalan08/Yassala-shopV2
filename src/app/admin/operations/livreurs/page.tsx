"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from "firebase/firestore";
import { db, type OnlineDriver } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", red: "#ef4444", blue: "#3b82f6", yellow: "#fbbf24" };

function minsAgo(ts: any): number {
  if (!ts) return 9999;
  const ms = ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
  return Math.round((Date.now() - ms) / 60000);
}

export default function LivreursPage() {
  const [drivers, setDrivers] = useState<OnlineDriver[]>([]);
  const [driverLocs, setDriverLocs] = useState<Record<string, { lat: number; lng: number; updatedAt: any }>>({});
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", zone: "", email: "" });
  const [toast, setToast] = useState("");

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "drivers"), (snap) => {
      setDrivers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as OnlineDriver)));
    });
    const u2 = onSnapshot(collection(db, "driver_locations"), (snap) => {
      const locs: Record<string, { lat: number; lng: number; updatedAt: any }> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.lat && data.lng) locs[d.id] = { lat: data.lat, lng: data.lng, updatedAt: data.updatedAt };
      });
      setDriverLocs(locs);
    });
    const u3 = onSnapshot(collection(db, "deliveries"), (snap) => {
      setDeliveries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const addDriver = async () => {
    if (!form.name.trim()) return;
    await addDoc(collection(db, "drivers"), { ...form, isOnline: false, status: "offline", createdAt: new Date().toISOString(), performanceScore: 5.0, acceptanceRate: 1.0 });
    setForm({ name: "", phone: "", zone: "", email: "" });
    setShowForm(false);
    showMsg("Livreur ajouté");
  };

  const toggleOnline = async (d: OnlineDriver) => {
    await updateDoc(doc(db, "drivers", d.uid), { isOnline: !d.isOnline, status: !d.isOnline ? "online" : "offline" });
  };

  const remove = async (uid: string) => {
    if (!confirm("Supprimer ce livreur ?")) return;
    await deleteDoc(doc(db, "drivers", uid));
    showMsg("Supprimé");
  };

  const totalForDriver = (uid: string) => deliveries.filter((d) => d.driverId === uid && d.status === "validated").length;
  const cashPending = (uid: string) => deliveries.filter((d) => d.driverId === uid && d.cashStatus === "unsettled").reduce((s: number, d: any) => s + (d.cashCollectedAmount ?? 0), 0);

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Livreurs</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            {drivers.filter((d) => d.isOnline).length} en ligne · {drivers.length} total
          </div>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Ajouter livreur
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {drivers.map((d) => {
          const loc = driverLocs[d.uid];
          const ping = loc ? minsAgo(loc.updatedAt) : null;
          const isOnline = d.isOnline && d.status !== "offline";
          const isBusy = d.status === "busy";
          const delivCount = totalForDriver(d.uid);
          const cashAmt = cashPending(d.uid);

          return (
            <div key={d.uid} style={{ background: C.card, border: `1px solid ${isOnline ? (isBusy ? "rgba(59,130,246,0.3)" : "rgba(34,197,94,0.25)") : C.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{d.name}</div>
                  {d.phone && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{d.phone}</div>}
                  {d.zone && <div style={{ color: C.muted, fontSize: 12 }}>📍 {d.zone}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: isOnline ? (isBusy ? "rgba(59,130,246,0.15)" : "rgba(34,197,94,0.15)") : "rgba(255,255,255,0.06)", color: isOnline ? (isBusy ? C.blue : C.green) : C.muted }}>
                  {!isOnline ? "HORS LIGNE" : isBusy ? "EN COURSE" : d.status === "paused" ? "PAUSE" : "LIBRE"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <Metric label="Score" value={d.performanceScore?.toFixed(1) ?? "—"} color={C.yellow} />
                <Metric label="Courses" value={String(delivCount)} color={C.accent} />
                <Metric label="Acceptation" value={d.acceptanceRate !== undefined ? `${(d.acceptanceRate * 100).toFixed(0)}%` : "—"} color={C.green} />
                {cashAmt > 0 && <Metric label="Cash dû" value={`${cashAmt.toFixed(2)} €`} color={C.red} />}
              </div>

              {ping !== null && (
                <div style={{ fontSize: 11, color: ping < 2 ? C.green : ping < 5 ? C.yellow : C.red, marginBottom: 8 }}>
                  📡 GPS: {ping < 1 ? "maintenant" : `${ping} min`}
                  {loc && (
                    <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" style={{ color: C.blue, marginLeft: 8, textDecoration: "none" }}>📍 Voir</a>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => toggleOnline(d)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: isOnline ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", color: isOnline ? C.red : C.green, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {isOnline ? "Désactiver" : "Activer"}
                </button>
                <button onClick={() => remove(d.uid)} style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.08)", color: C.red, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Suppr.</button>
              </div>
            </div>
          );
        })}
        {drivers.length === 0 && (
          <div style={{ gridColumn: "1/-1", padding: 40, textAlign: "center", color: C.muted }}>Aucun livreur enregistré</div>
        )}
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111827", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Ajouter un livreur</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {[["Nom *", "name", "Jean Dupont"], ["Téléphone", "phone", "+594 XXX XXX"], ["Zone", "zone", "Cayenne centre"], ["Email", "email", "jean@email.com"]].map(([label, field, ph]) => (
                <div key={field}>
                  <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5, fontWeight: 600 }}>{label}</label>
                  <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as any }}
                    value={(form as any)[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} placeholder={ph} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button onClick={() => setShowForm(false)} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: "rgba(255,255,255,0.06)", color: C.muted, cursor: "pointer" }}>Annuler</button>
                <button onClick={addDriver} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Ajouter</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontWeight: 700, fontSize: 16, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{label}</div>
    </div>
  );
}
