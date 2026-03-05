"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", red: "#ef4444", yellow: "#fbbf24" };

type Delivery = { id: string; driverId: string; driverName?: string; orderId: string; cashCollectedAmount: number; status: string; cashStatus: string; totalPay: number; createdAt: string; };

export default function PaiementsPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [commissions, setCommissions] = useState<{ id: string; amount: number; createdAt: string }[]>([]);
  const [drivers, setDrivers] = useState<{ uid: string; name: string }[]>([]);
  const [filter, setFilter] = useState<"all" | "unsettled" | "settled">("unsettled");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "deliveries"), (snap) => { setDeliveries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Delivery)).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))); });
    const u2 = onSnapshot(collection(db, "platform_commissions"), (snap) => { setCommissions(snap.docs.map((d) => ({ id: d.id, amount: d.data().amount || 0, createdAt: d.data().createdAt || "" }))); });
    const u3 = onSnapshot(collection(db, "drivers"), (snap) => { setDrivers(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || "—" }))); });
    return () => { u1(); u2(); u3(); };
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const settle = async (id: string) => {
    await updateDoc(doc(db, "deliveries", id), { cashStatus: "settled", settledAt: new Date().toISOString() });
    showMsg("Marqué comme réglé");
  };

  const getDriverName = (uid: string) => drivers.find((d) => d.uid === uid)?.name ?? uid.slice(-6);

  const filtered = deliveries.filter((d) => {
    if (filter === "unsettled") return d.cashStatus === "unsettled" && d.cashCollectedAmount > 0;
    if (filter === "settled")   return d.cashStatus === "settled";
    return true;
  });

  const totalUnsettled = deliveries.filter((d) => d.cashStatus === "unsettled").reduce((s, d) => s + (d.cashCollectedAmount ?? 0), 0);
  const totalCommission = commissions.reduce((s, c) => s + c.amount, 0);
  const totalToday = commissions.filter((c) => c.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((s, c) => s + c.amount, 0);

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 20px" }}>Paiements</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
        <StatCard label="Cash non réglé" value={`${totalUnsettled.toFixed(2)} €`} color={C.red} />
        <StatCard label="Commission totale" value={`${totalCommission.toFixed(2)} €`} color={C.accent} />
        <StatCard label="Commission aujourd'hui" value={`${totalToday.toFixed(2)} €`} color={C.green} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {(["unsettled", "all", "settled"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: filter === f ? 700 : 400, background: filter === f ? C.accent : "rgba(255,255,255,0.06)", color: filter === f ? "#fff" : C.muted }}>
            {f === "unsettled" ? "Non réglés" : f === "settled" ? "Réglés" : "Tous"}
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              {["Date", "Livreur", "Commande", "Cash collecté", "Paiement livreur", "Statut cash", "Action"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                <td style={{ padding: "10px 14px", fontWeight: 500 }}>{d.driverName || getDriverName(d.driverId)}</td>
                <td style={{ padding: "10px 14px", color: C.muted, fontFamily: "monospace", fontSize: 12 }}>{d.orderId?.slice(-8)}</td>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: d.cashCollectedAmount > 0 ? C.yellow : C.muted }}>{d.cashCollectedAmount ? `${d.cashCollectedAmount.toFixed(2)} €` : "—"}</td>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: C.accent }}>{d.totalPay ? `${d.totalPay.toFixed(2)} €` : "—"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: d.cashStatus === "settled" ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)", color: d.cashStatus === "settled" ? C.green : C.yellow }}>
                    {d.cashStatus === "settled" ? "Réglé" : "En attente"}
                  </span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  {d.cashStatus !== "settled" && d.cashCollectedAmount > 0 && (
                    <button onClick={() => settle(d.id)} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "rgba(34,197,94,0.15)", color: C.green, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>✓ Régler</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: C.muted }}>Aucune entrée</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "18px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
    </div>
  );
}
