"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", blue: "#3b82f6", yellow: "#fbbf24" };

function getDateRange(period: "7d" | "30d" | "90d"): Date {
  const d = new Date();
  d.setDate(d.getDate() - (period === "7d" ? 7 : period === "30d" ? 30 : 90));
  return d;
}

export default function RapportsPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  useEffect(() => {
    return onSnapshot(collection(db, "orders"), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const cutoff = getDateRange(period);
  const inPeriod = orders.filter((o) => new Date(o.createdAt) >= cutoff);
  const delivered = inPeriod.filter((o) => o.status === "livre");
  const cancelled = inPeriod.filter((o) => ["annule", "cancelled"].includes(o.status));

  const revenue = delivered.reduce((s: number, o: any) => s + (o.total ?? 0), 0);
  const avgOrder = delivered.length > 0 ? revenue / delivered.length : 0;
  const cancelRate = inPeriod.length > 0 ? (cancelled.length / inPeriod.length) * 100 : 0;

  // Group by day
  const byDay: Record<string, { total: number; count: number }> = {};
  delivered.forEach((o: any) => {
    const day = (o.createdAt ?? "").slice(0, 10);
    if (!byDay[day]) byDay[day] = { total: 0, count: 0 };
    byDay[day].total += o.total ?? 0;
    byDay[day].count++;
  });
  const dayEntries = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);

  const maxRevenue = Math.max(...dayEntries.map(([, v]) => v.total), 1);

  // By status
  const byStatus: Record<string, number> = {};
  inPeriod.forEach((o: any) => { byStatus[o.status] = (byStatus[o.status] ?? 0) + 1; });

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Rapports</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: period === p ? 700 : 400, background: period === p ? C.accent : "rgba(255,255,255,0.06)", color: period === p ? "#fff" : C.muted }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        <KPI label="CA livré" value={`${revenue.toFixed(2)} €`} color={C.accent} />
        <KPI label="Commandes livrées" value={String(delivered.length)} color={C.green} />
        <KPI label="Panier moyen" value={`${avgOrder.toFixed(2)} €`} color={C.blue} />
        <KPI label="Taux annulation" value={`${cancelRate.toFixed(1)} %`} color="#ef4444" />
      </div>

      {/* Revenue chart (simple bars) */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>CA par jour (14 derniers jours)</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
          {dayEntries.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>Aucune donnée</div>}
          {dayEntries.map(([day, v]) => {
            const h = Math.max(4, (v.total / maxRevenue) * 110);
            return (
              <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>{v.total >= 100 ? `${(v.total / 100).toFixed(1)}` : v.total.toFixed(0)}€</div>
                <div style={{ width: "100%", height: h, background: `linear-gradient(to top,${C.accent},rgba(249,115,22,0.4))`, borderRadius: "4px 4px 0 0", minHeight: 4 }} title={`${day}: ${v.total.toFixed(2)}€`} />
                <div style={{ fontSize: 9, color: C.muted, transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>{day.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Orders by status */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Répartition des commandes</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 }}>
          {Object.entries(byStatus).map(([status, count]) => (
            <div key={status} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{count}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{status}</div>
            </div>
          ))}
          {Object.keys(byStatus).length === 0 && <div style={{ gridColumn: "1/-1", color: C.muted, textAlign: "center", padding: 20 }}>Aucune donnée</div>}
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "18px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
    </div>
  );
}
