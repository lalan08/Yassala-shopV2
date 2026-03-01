"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "rgba(10,10,20,0.98)",
  sidebar: "rgba(8,8,16,0.95)",
  card: "rgba(255,255,255,0.05)",
  cardHover: "rgba(255,255,255,0.08)",
  cardBorder: "rgba(255,255,255,0.09)",
  text: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#f97316",
  green: "#10b981",
  blue: "#60a5fa",
  purple: "#a78bfa",
  danger: "#ef4444",
  warning: "#f59e0b",
};

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Relay = {
  id: string;
  name: string;
  address: string;
  status: "active" | "inactive";
  createdAt: string;
};

type RelayWithStats = Relay & {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  totalCount: number;
  pendingOrders: number;
  lastActivity: string | null;
};

type RelayLog = {
  id: string;
  relayId: string;
  orderId: string;
  items: { productId: string; name: string; qty: number }[];
  timestamp: string;
  collectedBy: "driver" | "customer";
};

type GlobalStats = {
  totalToday: number;
  totalWeek: number;
  totalMonth: number;
  totalAll: number;
  activeRelays: number;
  mostActive: { name: string; count: number }[];
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Il y a ${days}j`;
}

function exportCSV(logs: RelayLog[], relays: RelayWithStats[]) {
  const relayMap = Object.fromEntries(relays.map((r) => [r.id, r.name]));
  const rows = [
    ["Date", "Heure", "Relais", "Commande", "Articles", "Quantité", "Remis à"],
    ...logs.map((log) => {
      const d = new Date(log.timestamp);
      const items = log.items.map((i) => `${i.name} x${i.qty}`).join(" | ");
      const qty = log.items.reduce((s, i) => s + i.qty, 0);
      return [
        d.toLocaleDateString("fr-FR"),
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        relayMap[log.relayId] || log.relayId,
        log.orderId.slice(-8),
        items,
        qty,
        log.collectedBy === "driver" ? "Livreur" : "Client",
      ];
    }),
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relais-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminRelaisPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  const [relays, setRelays] = useState<RelayWithStats[]>([]);
  const [allLogs, setAllLogs] = useState<RelayLog[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalToday: 0,
    totalWeek: 0,
    totalMonth: 0,
    totalAll: 0,
    activeRelays: 0,
    mostActive: [],
  });

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "list" | "logs">("dashboard");

  // Filters
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState<"all" | "active" | "inactive">("all");
  const [logSearch, setLogSearch] = useState("");
  const [logRelayFilter, setLogRelayFilter] = useState("");

  // Add relay modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRelay, setNewRelay] = useState({ id: "", name: "", address: "", pin: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  // Edit relay modal
  const [editRelay, setEditRelay] = useState<RelayWithStats | null>(null);
  const [editFields, setEditFields] = useState({ name: "", address: "", pin: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RelayWithStats | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Auth check
  useEffect(() => {
    const key = localStorage.getItem("yassala_admin_auth");
    if (!key) {
      router.push("/admin");
      return;
    }
    setAuthed(true);
  }, [router]);

  useEffect(() => {
    if (authed) loadData();
  }, [authed]);

  async function loadData() {
    setLoading(true);
    try {
      // Load relays
      const relaysSnap = await getDocs(collection(db, "relays"));
      const relaysData: Relay[] = relaysSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Relay, "id">),
      }));

      // Load all logs
      const logsSnap = await getDocs(
        query(collection(db, "relayLogs"), orderBy("timestamp", "desc"))
      );
      const logs: RelayLog[] = logsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RelayLog, "id">),
      }));
      setAllLogs(logs);

      // Load pending orders count per relay
      const pendingOrdersSnap = await getDocs(
        query(
          collection(db, "orders"),
          where("status", "==", "READY_FOR_PICKUP")
        )
      );
      const pendingByRelay: Record<string, number> = {};
      pendingOrdersSnap.docs.forEach((d) => {
        const relayId = d.data().relayId;
        if (relayId) {
          pendingByRelay[relayId] = (pendingByRelay[relayId] || 0) + 1;
        }
      });

      // Compute time boundaries
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      // Compute per-relay stats
      const relayStats: Record<string, { today: number; week: number; month: number; total: number; lastActivity: string | null }> = {};
      let totalToday = 0;
      let totalWeek = 0;
      let totalMonth = 0;
      let totalAll = 0;

      for (const log of logs) {
        const ts = new Date(log.timestamp);
        const qty = (log.items || []).reduce((s, i) => s + i.qty, 0);
        if (!relayStats[log.relayId]) {
          relayStats[log.relayId] = { today: 0, week: 0, month: 0, total: 0, lastActivity: null };
        }
        relayStats[log.relayId].total += qty;
        totalAll += qty;
        if (!relayStats[log.relayId].lastActivity || log.timestamp > relayStats[log.relayId].lastActivity!) {
          relayStats[log.relayId].lastActivity = log.timestamp;
        }
        if (ts >= todayStart) {
          relayStats[log.relayId].today += qty;
          totalToday += qty;
        }
        if (ts >= weekStart) {
          relayStats[log.relayId].week += qty;
          totalWeek += qty;
        }
        if (ts >= monthStart) {
          relayStats[log.relayId].month += qty;
          totalMonth += qty;
        }
      }

      const relaysWithStats: RelayWithStats[] = relaysData.map((r) => ({
        ...r,
        todayCount: relayStats[r.id]?.today || 0,
        weekCount: relayStats[r.id]?.week || 0,
        monthCount: relayStats[r.id]?.month || 0,
        totalCount: relayStats[r.id]?.total || 0,
        pendingOrders: pendingByRelay[r.id] || 0,
        lastActivity: relayStats[r.id]?.lastActivity || null,
      }));
      setRelays(relaysWithStats);

      // Most active (by week)
      const mostActive = [...relaysWithStats]
        .sort((a, b) => b.weekCount - a.weekCount)
        .slice(0, 5)
        .map((r) => ({ name: r.name, count: r.weekCount }));

      setGlobalStats({
        totalToday,
        totalWeek,
        totalMonth,
        totalAll,
        activeRelays: relaysData.filter((r) => r.status === "active").length,
        mostActive,
      });
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function toggleRelayStatus(relay: RelayWithStats) {
    const newStatus = relay.status === "active" ? "inactive" : "active";
    await updateDoc(doc(db, "relays", relay.id), { status: newStatus });
    setRelays((prev) =>
      prev.map((r) => (r.id === relay.id ? { ...r, status: newStatus } : r))
    );
  }

  async function handleAddRelay(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddSuccess("");
    setAddLoading(true);
    try {
      if (!newRelay.id || !newRelay.name || !newRelay.address || !newRelay.pin) {
        setAddError("Tous les champs sont requis");
        return;
      }
      const hashedPin = await sha256(newRelay.pin);
      await setDoc(doc(db, "relays", newRelay.id), {
        name: newRelay.name,
        address: newRelay.address,
        status: "active",
        pin: hashedPin,
        createdAt: new Date().toISOString(),
      });
      setAddSuccess(`Relais "${newRelay.name}" créé avec succès !`);
      setNewRelay({ id: "", name: "", address: "", pin: "" });
      loadData();
    } catch {
      setAddError("Erreur lors de la création");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleEditRelay(e: React.FormEvent) {
    e.preventDefault();
    if (!editRelay) return;
    setEditError("");
    setEditLoading(true);
    try {
      const updates: Record<string, string> = {
        name: editFields.name,
        address: editFields.address,
      };
      if (editFields.pin.length >= 4) {
        updates.pin = await sha256(editFields.pin);
      }
      await updateDoc(doc(db, "relays", editRelay.id), updates);
      setRelays((prev) =>
        prev.map((r) =>
          r.id === editRelay.id
            ? { ...r, name: editFields.name, address: editFields.address }
            : r
        )
      );
      setEditRelay(null);
    } catch {
      setEditError("Erreur lors de la mise à jour");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteRelay() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteDoc(doc(db, "relays", deleteTarget.id));
      setRelays((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      console.error("Erreur suppression");
    } finally {
      setDeleteLoading(false);
    }
  }

  // Filtered lists
  const filteredRelays = useMemo(() => {
    return relays
      .filter((r) => {
        if (listFilter === "active") return r.status === "active";
        if (listFilter === "inactive") return r.status === "inactive";
        return true;
      })
      .filter(
        (r) =>
          !listSearch ||
          r.name.toLowerCase().includes(listSearch.toLowerCase()) ||
          r.address.toLowerCase().includes(listSearch.toLowerCase()) ||
          r.id.toLowerCase().includes(listSearch.toLowerCase())
      );
  }, [relays, listFilter, listSearch]);

  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (logRelayFilter && log.relayId !== logRelayFilter) return false;
      if (logSearch) {
        const relay = relays.find((r) => r.id === log.relayId);
        const search = logSearch.toLowerCase();
        return (
          log.orderId.toLowerCase().includes(search) ||
          (relay?.name || "").toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [allLogs, logRelayFilter, logSearch, relays]);

  if (!authed) return null;

  const StatCard = ({
    icon,
    value,
    label,
    color,
    sub,
  }: {
    icon: string;
    value: number | string;
    label: string;
    color: string;
    sub?: string;
  }) => (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 14,
        padding: "1.25rem",
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ color: C.muted, fontSize: 12 }}>{label}</div>
      {sub && <div style={{ color, fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "system-ui, sans-serif",
        color: C.text,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: C.sidebar,
          borderBottom: `1px solid ${C.cardBorder}`,
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/admin")}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 8,
              padding: "6px 12px",
              color: C.muted,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← Admin
          </button>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            📦 Gestion des Relais
          </h1>
          {!loading && (
            <span
              style={{
                background: "rgba(16,185,129,0.15)",
                color: C.green,
                borderRadius: 20,
                padding: "2px 10px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {globalStats.activeRelays} actifs / {relays.length} total
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => exportCSV(allLogs, relays)}
            disabled={allLogs.length === 0}
            title="Exporter les logs en CSV"
            style={{
              background: "rgba(96,165,250,0.1)",
              border: "1px solid rgba(96,165,250,0.3)",
              borderRadius: 8,
              padding: "8px 14px",
              color: C.blue,
              fontSize: 13,
              cursor: allLogs.length === 0 ? "not-allowed" : "pointer",
              opacity: allLogs.length === 0 ? 0.5 : 1,
            }}
          >
            ↓ Export CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: C.green,
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Nouveau relais
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 8,
              padding: "8px 12px",
              color: C.muted,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${C.cardBorder}`,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {(
          [
            ["dashboard", "📊 Vue globale"],
            ["list", "📋 Liste des relais"],
            ["logs", "📜 Tous les logs"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "12px 20px",
              background: "none",
              border: "none",
              borderBottom:
                tab === t ? `2px solid ${C.accent}` : "2px solid transparent",
              color: tab === t ? C.accent : C.muted,
              fontSize: 13,
              fontWeight: tab === t ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "1.5rem", maxWidth: 1200, margin: "0 auto" }}>
        {loading && (
          <div style={{ textAlign: "center", color: C.muted, padding: "4rem" }}>
            Chargement...
          </div>
        )}

        {/* ── DASHBOARD TAB ─────────────────────────────────────────────────── */}
        {!loading && tab === "dashboard" && (
          <div>
            {/* Global stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginBottom: "2rem",
              }}
            >
              <StatCard icon="📦" value={globalStats.totalToday} label="Articles distribués aujourd'hui" color={C.green} />
              <StatCard icon="📅" value={globalStats.totalWeek} label="Cette semaine" color={C.accent} />
              <StatCard icon="🗓️" value={globalStats.totalMonth} label="Ce mois-ci" color={C.purple} />
              <StatCard icon="📊" value={globalStats.totalAll} label="Total historique" color={C.blue} />
              <StatCard icon="🏪" value={globalStats.activeRelays} label="Relais actifs" color={C.green} sub={`sur ${relays.length} au total`} />
              <StatCard
                icon="⏳"
                value={relays.reduce((s, r) => s + r.pendingOrders, 0)}
                label="Commandes en attente"
                color={C.warning}
                sub="à distribuer"
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              {/* Most active */}
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem",
                    fontSize: 12,
                    color: C.muted,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Relais les plus actifs — semaine
                </h3>
                {globalStats.mostActive.length === 0 && (
                  <div style={{ color: C.muted, fontSize: 13 }}>Aucune activité</div>
                )}
                {globalStats.mostActive.map((r, i) => {
                  const max = globalStats.mostActive[0]?.count || 1;
                  const pct = Math.round((r.count / max) * 100);
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                          fontSize: 13,
                        }}
                      >
                        <span>
                          <span style={{ color: C.accent, fontWeight: 700, marginRight: 6 }}>
                            #{i + 1}
                          </span>
                          {r.name}
                        </span>
                        <span style={{ color: C.green, fontWeight: 600 }}>
                          {r.count} art.
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4,
                          background: "rgba(255,255,255,0.07)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${C.green}, ${C.accent})`,
                            borderRadius: 2,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent logs summary */}
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem",
                    fontSize: 12,
                    color: C.muted,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Dernières remises
                </h3>
                {allLogs.slice(0, 8).map((log) => {
                  const relay = relays.find((r) => r.id === log.relayId);
                  const date = new Date(log.timestamp);
                  const qty = log.items.reduce((s, i) => s + i.qty, 0);
                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: "7px 0",
                        borderBottom: `1px solid ${C.cardBorder}`,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 600 }}>
                          {relay?.name || log.relayId}
                        </span>
                        <span style={{ color: C.green, fontWeight: 600 }}>
                          {qty} art.
                        </span>
                      </div>
                      <div style={{ color: C.muted }}>
                        {date.toLocaleDateString("fr-FR")}{" "}
                        {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}{" "}
                        · #{log.orderId.slice(-6)} ·{" "}
                        {log.collectedBy === "driver" ? "🚚 livreur" : "👤 client"}
                      </div>
                    </div>
                  );
                })}
                {allLogs.length === 0 && (
                  <div style={{ color: C.muted, fontSize: 13 }}>Aucune activité</div>
                )}
              </div>
            </div>

            {/* Pending orders per relay */}
            {relays.some((r) => r.pendingOrders > 0) && (
              <div
                style={{
                  marginTop: 16,
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem",
                    fontSize: 12,
                    color: C.warning,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  ⏳ Commandes en attente de distribution
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {relays
                    .filter((r) => r.pendingOrders > 0)
                    .map((r) => (
                      <div
                        key={r.id}
                        onClick={() => router.push(`/admin/relais/${r.id}`)}
                        style={{
                          background: "rgba(245,158,11,0.12)",
                          border: "1px solid rgba(245,158,11,0.3)",
                          borderRadius: 8,
                          padding: "8px 14px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span
                          style={{
                            marginLeft: 8,
                            background: C.warning,
                            color: "#000",
                            borderRadius: 10,
                            padding: "1px 7px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {r.pendingOrders}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LIST TAB ──────────────────────────────────────────────────────── */}
        {!loading && tab === "list" && (
          <div>
            {/* Filters */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: "1.25rem",
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                placeholder="Rechercher un relais..."
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 200,
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  color: C.text,
                  fontSize: 14,
                  outline: "none",
                }}
              />
              {(["all", "active", "inactive"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setListFilter(f)}
                  style={{
                    background:
                      listFilter === f ? "rgba(249,115,22,0.15)" : C.card,
                    border: `1px solid ${listFilter === f ? "rgba(249,115,22,0.4)" : C.cardBorder}`,
                    borderRadius: 8,
                    padding: "8px 14px",
                    color: listFilter === f ? C.accent : C.muted,
                    fontSize: 13,
                    cursor: "pointer",
                    fontWeight: listFilter === f ? 700 : 400,
                  }}
                >
                  {f === "all" ? "Tous" : f === "active" ? "Actifs" : "Inactifs"}
                </button>
              ))}
            </div>

            {filteredRelays.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: C.muted,
                  padding: "3rem",
                  background: C.card,
                  borderRadius: 12,
                  border: `1px solid ${C.cardBorder}`,
                }}
              >
                {relays.length === 0
                  ? 'Aucun relais. Créez-en un avec "+ Nouveau relais".'
                  : "Aucun relais ne correspond à la recherche."}
              </div>
            )}

            {filteredRelays.map((relay) => (
              <div
                key={relay.id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 14,
                  padding: "1.25rem",
                  marginBottom: 12,
                  transition: "border-color 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: relay.status === "active" ? C.green : C.danger,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{relay.name}</span>
                      <span
                        style={{
                          fontSize: 11,
                          background:
                            relay.status === "active"
                              ? "rgba(16,185,129,0.15)"
                              : "rgba(239,68,68,0.15)",
                          color: relay.status === "active" ? C.green : C.danger,
                          borderRadius: 6,
                          padding: "1px 7px",
                          fontWeight: 600,
                        }}
                      >
                        {relay.status === "active" ? "Actif" : "Inactif"}
                      </span>
                      {relay.pendingOrders > 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            background: C.warning,
                            color: "#000",
                            borderRadius: 10,
                            padding: "1px 8px",
                            fontWeight: 700,
                          }}
                        >
                          {relay.pendingOrders} en attente
                        </span>
                      )}
                    </div>
                    <div style={{ color: C.muted, fontSize: 13 }}>📍 {relay.address}</div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                      ID: <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>{relay.id}</code>
                      {" · "}Créé le {new Date(relay.createdAt).toLocaleDateString("fr-FR")}
                      {relay.lastActivity && (
                        <span style={{ marginLeft: 8, color: C.green }}>
                          · Dernière activité : {timeAgo(relay.lastActivity)}
                        </span>
                      )}
                      {!relay.lastActivity && (
                        <span style={{ marginLeft: 8, color: C.muted }}>
                          · Aucune activité
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    {[
                      { label: "Aujourd'hui", val: relay.todayCount, color: C.green },
                      { label: "Semaine", val: relay.weekCount, color: C.accent },
                      { label: "Mois", val: relay.monthCount, color: C.purple },
                    ].map((s) => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>
                          {s.val}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{ display: "flex", gap: 8, marginTop: "1rem", flexWrap: "wrap" }}
                >
                  <button
                    onClick={() => router.push(`/admin/relais/${relay.id}`)}
                    style={{
                      background: "rgba(99,102,241,0.15)",
                      border: "1px solid rgba(99,102,241,0.3)",
                      borderRadius: 8,
                      padding: "7px 14px",
                      color: "#a5b4fc",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Voir détail →
                  </button>
                  <button
                    onClick={() => {
                      setEditRelay(relay);
                      setEditFields({ name: relay.name, address: relay.address, pin: "" });
                      setEditError("");
                    }}
                    style={{
                      background: "rgba(96,165,250,0.1)",
                      border: "1px solid rgba(96,165,250,0.3)",
                      borderRadius: 8,
                      padding: "7px 14px",
                      color: C.blue,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => toggleRelayStatus(relay)}
                    style={{
                      background:
                        relay.status === "active"
                          ? "rgba(239,68,68,0.1)"
                          : "rgba(16,185,129,0.1)",
                      border: `1px solid ${
                        relay.status === "active"
                          ? "rgba(239,68,68,0.3)"
                          : "rgba(16,185,129,0.3)"
                      }`,
                      borderRadius: 8,
                      padding: "7px 14px",
                      color: relay.status === "active" ? C.danger : C.green,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {relay.status === "active" ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(relay)}
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 8,
                      padding: "7px 14px",
                      color: C.danger,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LOGS TAB ──────────────────────────────────────────────────────── */}
        {!loading && tab === "logs" && (
          <div>
            {/* Filters */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: "1.25rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="Rechercher commande ou relais..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 200,
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  color: C.text,
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <select
                value={logRelayFilter}
                onChange={(e) => setLogRelayFilter(e.target.value)}
                style={{
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  color: C.text,
                  fontSize: 13,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="">Tous les relais</option>
                {relays.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                onClick={() => exportCSV(filteredLogs, relays)}
                disabled={filteredLogs.length === 0}
                style={{
                  background: "rgba(96,165,250,0.1)",
                  border: "1px solid rgba(96,165,250,0.3)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  color: C.blue,
                  fontSize: 13,
                  cursor: filteredLogs.length === 0 ? "not-allowed" : "pointer",
                  opacity: filteredLogs.length === 0 ? 0.5 : 1,
                }}
              >
                ↓ CSV ({filteredLogs.length})
              </button>
            </div>

            <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
              {filteredLogs.length} remise(s) affichée(s) sur {allLogs.length} au total
            </div>

            {filteredLogs.map((log) => {
              const relay = relays.find((r) => r.id === log.relayId);
              const date = new Date(log.timestamp);
              const qty = log.items.reduce((s, i) => s + i.qty, 0);
              return (
                <div
                  key={log.id}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 10,
                    padding: "1rem",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {relay?.name || log.relayId}
                      </div>
                      <div style={{ color: C.muted, fontSize: 12 }}>
                        Commande #{log.orderId.slice(-8)} ·{" "}
                        {date.toLocaleDateString("fr-FR")}{" "}
                        {date.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span
                        style={{
                          background: "rgba(16,185,129,0.15)",
                          color: C.green,
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {qty} article{qty > 1 ? "s" : ""}
                      </span>
                      <span
                        style={{
                          background: "rgba(255,255,255,0.07)",
                          color: C.muted,
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 12,
                        }}
                      >
                        {log.collectedBy === "driver" ? "🚚 livreur" : "👤 client"}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {log.items.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          color: C.muted,
                          paddingLeft: 8,
                          borderLeft: "2px solid rgba(249,115,22,0.3)",
                          marginTop: 3,
                        }}
                      >
                        {item.name} — x{item.qty}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {filteredLogs.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: C.muted,
                  padding: "3rem",
                  background: C.card,
                  borderRadius: 12,
                  border: `1px solid ${C.cardBorder}`,
                }}
              >
                Aucun log ne correspond aux filtres sélectionnés.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ADD RELAY MODAL ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <ModalOverlay onClose={() => setShowAddModal(false)}>
          <h2 style={{ margin: "0 0 1.5rem", fontSize: 18, fontWeight: 700 }}>
            Créer un nouveau relais
          </h2>
          <form onSubmit={handleAddRelay}>
            {[
              { key: "id", label: "ID du relais", placeholder: "relay-cayenne-01" },
              { key: "name", label: "Nom du relais", placeholder: "Relais Cayenne Centre" },
              { key: "address", label: "Adresse", placeholder: "12 rue du Commerce, Cayenne" },
              { key: "pin", label: "Code PIN (4-8 chiffres)", placeholder: "1234" },
            ].map((f) => (
              <ModalField
                key={f.key}
                label={f.label}
                type={f.key === "pin" ? "password" : "text"}
                value={newRelay[f.key as keyof typeof newRelay]}
                placeholder={f.placeholder}
                onChange={(v) => setNewRelay((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}
            {addError && <ModalAlert type="error">{addError}</ModalAlert>}
            {addSuccess && <ModalAlert type="success">{addSuccess}</ModalAlert>}
            <ModalActions
              onCancel={() => setShowAddModal(false)}
              submitLabel={addLoading ? "Création..." : "Créer le relais"}
              loading={addLoading}
              color={C.green}
            />
          </form>
        </ModalOverlay>
      )}

      {/* ── EDIT RELAY MODAL ─────────────────────────────────────────────────── */}
      {editRelay && (
        <ModalOverlay onClose={() => setEditRelay(null)}>
          <h2 style={{ margin: "0 0 0.25rem", fontSize: 18, fontWeight: 700 }}>
            ✏️ Modifier le relais
          </h2>
          <p style={{ color: C.muted, fontSize: 12, margin: "0 0 1.5rem" }}>
            {editRelay.id}
          </p>
          <form onSubmit={handleEditRelay}>
            <ModalField
              label="Nom du relais"
              value={editFields.name}
              onChange={(v) => setEditFields((p) => ({ ...p, name: v }))}
            />
            <ModalField
              label="Adresse"
              value={editFields.address}
              onChange={(v) => setEditFields((p) => ({ ...p, address: v }))}
            />
            <ModalField
              label="Nouveau PIN (laisser vide pour ne pas changer)"
              type="password"
              value={editFields.pin}
              placeholder="Nouveau PIN (optionnel)"
              onChange={(v) => setEditFields((p) => ({ ...p, pin: v }))}
              required={false}
            />
            {editError && <ModalAlert type="error">{editError}</ModalAlert>}
            <ModalActions
              onCancel={() => setEditRelay(null)}
              submitLabel={editLoading ? "Sauvegarde..." : "Sauvegarder"}
              loading={editLoading}
              color={C.blue}
            />
          </form>
        </ModalOverlay>
      )}

      {/* ── DELETE CONFIRMATION ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <ModalOverlay onClose={() => setDeleteTarget(null)}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🗑️</div>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: 18, fontWeight: 700, color: C.danger }}>
              Supprimer ce relais ?
            </h2>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: "0.5rem" }}>
              <strong style={{ color: C.text }}>{deleteTarget.name}</strong>
            </p>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: "1.5rem" }}>
              Cette action est irréversible. Les logs associés ne seront pas supprimés.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  flex: 1,
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8,
                  padding: "12px",
                  color: C.muted,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteRelay}
                disabled={deleteLoading}
                style={{
                  flex: 1,
                  background: deleteLoading ? C.muted : C.danger,
                  border: "none",
                  borderRadius: 8,
                  padding: "12px",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: deleteLoading ? "not-allowed" : "pointer",
                }}
              >
                {deleteLoading ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Reusable modal sub-components ──────────────────────────────────────────

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "rgba(16,16,28,1)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 20,
          padding: "2rem",
          width: "100%",
          maxWidth: 440,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label
        style={{
          color: "#94a3b8",
          fontSize: 13,
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 8,
          padding: "10px 12px",
          color: "#f1f5f9",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function ModalAlert({
  type,
  children,
}: {
  type: "error" | "success";
  children: React.ReactNode;
}) {
  const isError = type === "error";
  return (
    <div
      style={{
        background: isError ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
        borderRadius: 8,
        padding: "8px 12px",
        color: isError ? "#fca5a5" : "#6ee7b7",
        fontSize: 13,
        marginBottom: "1rem",
      }}
    >
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  submitLabel,
  loading,
  color,
}: {
  onCancel: () => void;
  submitLabel: string;
  loading: boolean;
  color: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        onClick={onCancel}
        style={{
          flex: 1,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 8,
          padding: "12px",
          color: "#94a3b8",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Annuler
      </button>
      <button
        type="submit"
        disabled={loading}
        style={{
          flex: 1,
          background: loading ? "#94a3b8" : color,
          border: "none",
          borderRadius: 8,
          padding: "12px",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
