"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e" };

type ClientUser = { id: string; name: string; email: string; createdAt?: string; lastLoginAt?: string; ordersCount?: number; totalSpent?: number; };

export default function ClientsPage() {
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.data().displayName || "", email: d.data().email || "", createdAt: d.data().createdAt || "", lastLoginAt: d.data().lastLoginAt || "" }))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    });
    const u2 = onSnapshot(collection(db, "orders"), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { u1(); u2(); };
  }, []);

  const enriched = users.map((u) => {
    const userOrders = orders.filter((o) => o.userId === u.id || o.phone === u.email);
    return { ...u, ordersCount: userOrders.length, totalSpent: userOrders.filter((o) => o.status === "livre").reduce((s: number, o: any) => s + (o.total ?? 0), 0) };
  });

  const filtered = enriched.filter((u) => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Clients</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{users.length} clients enregistrés</div>
        </div>
        <input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 13, outline: "none", width: 240 }} />
      </div>

      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              {["Nom", "Email", "Commandes", "CA total", "Inscription", "Dernière co."].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.muted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((u, i) => (
              <tr key={u.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                <td style={{ padding: "10px 14px", fontWeight: 500 }}>{u.name || "—"}</td>
                <td style={{ padding: "10px 14px", color: C.muted }}>{u.email}</td>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: C.accent }}>{u.ordersCount ?? 0}</td>
                <td style={{ padding: "10px 14px", fontWeight: 700, color: C.green }}>{(u.totalSpent ?? 0).toFixed(2)} €</td>
                <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
                <td style={{ padding: "10px 14px", color: C.muted, fontSize: 12 }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("fr-FR") : "—"}</td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: C.muted }}>Aucun client</td></tr>}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((pg) => (
            <button key={pg} onClick={() => setPage(pg)} style={{ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", background: pg === page ? C.accent : "rgba(255,255,255,0.06)", color: pg === page ? "#fff" : C.muted, fontWeight: pg === page ? 700 : 400 }}>{pg}</button>
          ))}
        </div>
      )}
    </div>
  );
}
