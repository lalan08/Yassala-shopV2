"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, type Order } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e", red: "#ef4444", blue: "#3b82f6" };

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  nouveau:    { label: "Nouveau",       color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  confirmed:  { label: "Confirmé",      color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  en_cours:   { label: "En livraison",  color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  livre:      { label: "Livré",         color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  annule:     { label: "Annulé",        color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  paid:       { label: "Payé",          color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
  preparing:  { label: "En préparation", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  ready:      { label: "Prêt",          color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  assigned:   { label: "Assigné",       color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
};

function timeAgo(dateStr: string) {
  if (!dateStr) return "—";
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}

export default function CommandesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "archived">("active");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState("");
  const PER_PAGE = 20;

  useEffect(() => {
    return onSnapshot(collection(db, "orders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(data);
    });
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
    showMsg(`Statut → ${status}`);
  };

  const ARCHIVE_STATUSES = ["livre", "annule", "cancelled"];

  const filtered = orders.filter((o) => {
    const isActive = !ARCHIVE_STATUSES.includes(o.status);
    if (filter === "active" && !isActive) return false;
    if (filter === "archived" && isActive) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.name?.toLowerCase().includes(q) ||
        o.phone?.includes(q) ||
        String((o as any).orderNumber)?.includes(q) ||
        o.address?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = {
    total: orders.length,
    active: orders.filter((o) => !ARCHIVE_STATUSES.includes(o.status)).length,
    today: orders.filter((o) => o.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    revenue: orders.filter((o) => o.status === "livre").reduce((s, o) => s + (o.total ?? 0), 0),
  };

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 20px" }}>Commandes</h1>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total",    val: stats.total,                      color: C.accent },
          { label: "Actives",  val: stats.active,                     color: C.blue },
          { label: "Auj.",     val: stats.today,                      color: C.green },
          { label: "CA livré", val: `${stats.revenue.toFixed(0)} €`,  color: "#fbbf24" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {(["active", "all", "archived"] as const).map((f) => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: filter === f ? 700 : 400, background: filter === f ? C.accent : "rgba(255,255,255,0.06)", color: filter === f ? "#fff" : C.muted }}>
            {f === "active" ? "Actives" : f === "archived" ? "Archivées" : "Toutes"}
          </button>
        ))}
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13 }}>
          <option value="all">Tous statuts</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input placeholder="Chercher nom, tel, n°..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ flex: 1, maxWidth: 280, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none" }} />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              {["N°", "Client", "Téléphone", "Montant", "Paiement", "Type", "Statut", "Il y a", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((o, i) => {
              const st = STATUS_MAP[o.status] ?? { label: o.status, color: C.muted, bg: "transparent" };
              return (
                <tr key={o.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: C.accent }}>
                    #{(o as any).orderNumber ?? o.id?.slice(-6).toUpperCase()}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 500 }}>{o.name || "—"}</div>
                    {o.address && <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{o.address.substring(0, 40)}...</div>}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {o.phone ? <a href={`tel:${o.phone}`} style={{ color: C.blue, textDecoration: "none" }}>{o.phone}</a> : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: C.accent }}>{Number(o.total).toFixed(2)} €</td>
                  <td style={{ padding: "10px 14px", color: C.muted }}>{o.paidOnline ? "💳" : "💵"}</td>
                  <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{o.fulfillmentType === "pickup" ? "Retrait" : "Livraison"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{timeAgo(o.createdAt)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <select
                      value={o.status}
                      onChange={(e) => updateStatus(o.id!, e.target.value)}
                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 11, cursor: "pointer" }}
                    >
                      {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: C.muted }}>Aucune commande</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((pg) => (
            <button key={pg} onClick={() => setPage(pg)} style={{ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", background: pg === page ? C.accent : "rgba(255,255,255,0.06)", color: pg === page ? "#fff" : C.muted, fontWeight: pg === page ? 700 : 400 }}>
              {pg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
