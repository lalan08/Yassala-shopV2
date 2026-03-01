"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  addDoc,
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
  cardBorder: "rgba(255,255,255,0.09)",
  text: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#f97316",
  green: "#10b981",
  danger: "#ef4444",
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
  anomalies: number;
  mostActive: { name: string; count: number }[];
};

export default function AdminRelaisPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  const [relays, setRelays] = useState<RelayWithStats[]>([]);
  const [allLogs, setAllLogs] = useState<RelayLog[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalToday: 0,
    totalWeek: 0,
    anomalies: 0,
    mostActive: [],
  });

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "list" | "logs">("dashboard");

  // Add relay modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRelay, setNewRelay] = useState({
    id: "",
    name: "",
    address: "",
    pin: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

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

      // Compute time boundaries
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      // Compute per-relay stats
      const relayStats: Record<string, { today: number; week: number }> = {};
      let totalToday = 0;
      let totalWeek = 0;

      for (const log of logs) {
        const ts = new Date(log.timestamp);
        const qty = (log.items || []).reduce((s, i) => s + i.qty, 0);
        if (!relayStats[log.relayId]) relayStats[log.relayId] = { today: 0, week: 0 };
        if (ts >= todayStart) {
          relayStats[log.relayId].today += qty;
          totalToday += qty;
        }
        if (ts >= weekStart) {
          relayStats[log.relayId].week += qty;
          totalWeek += qty;
        }
      }

      const relaysWithStats: RelayWithStats[] = relaysData.map((r) => ({
        ...r,
        todayCount: relayStats[r.id]?.today || 0,
        weekCount: relayStats[r.id]?.week || 0,
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
        anomalies: 0, // Could track via a separate anomaly collection
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

      await fetch(`/api/relay/auth`, { method: "GET" }).catch(() => {}); // warm up

      // Create directly in Firestore
      const { doc: docFn, setDoc } = await import("firebase/firestore");
      await setDoc(docFn(db, "relays", newRelay.id), {
        name: newRelay.name,
        address: newRelay.address,
        status: "active",
        pin: hashedPin,
        createdAt: new Date().toISOString(),
      });

      setAddSuccess(`Relais "${newRelay.name}" créé avec succès !`);
      setNewRelay({ id: "", name: "", address: "", pin: "" });
      loadData();
    } catch (err) {
      setAddError("Erreur lors de la création");
    } finally {
      setAddLoading(false);
    }
  }

  if (!authed) return null;

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
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
            ↻
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

      <div style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
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
              {[
                {
                  label: "Produits sortis aujourd'hui",
                  value: globalStats.totalToday,
                  icon: "📦",
                  color: C.green,
                },
                {
                  label: "Produits sortis cette semaine",
                  value: globalStats.totalWeek,
                  icon: "📊",
                  color: C.accent,
                },
                {
                  label: "Relais actifs",
                  value: relays.filter((r) => r.status === "active").length,
                  icon: "🏪",
                  color: "#60a5fa",
                },
                {
                  label: "Total relais",
                  value: relays.length,
                  icon: "🗺️",
                  color: C.muted,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 14,
                    padding: "1.25rem",
                  }}
                >
                  <div style={{ fontSize: 26, marginBottom: 8 }}>{s.icon}</div>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 800,
                      color: s.color,
                      marginBottom: 4,
                    }}
                  >
                    {s.value}
                  </div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Most active relays */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
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
                    fontSize: 14,
                    color: C.muted,
                    fontWeight: 600,
                    letterSpacing: 1,
                  }}
                >
                  RELAIS LES PLUS ACTIFS (semaine)
                </h3>
                {globalStats.mostActive.length === 0 && (
                  <div style={{ color: C.muted, fontSize: 13 }}>
                    Aucune activité
                  </div>
                )}
                {globalStats.mostActive.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom:
                        i < globalStats.mostActive.length - 1
                          ? `1px solid ${C.cardBorder}`
                          : "none",
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      <span
                        style={{
                          color: C.accent,
                          fontWeight: 700,
                          marginRight: 8,
                        }}
                      >
                        #{i + 1}
                      </span>
                      {r.name}
                    </div>
                    <div
                      style={{
                        background: "rgba(16,185,129,0.15)",
                        color: C.green,
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {r.count} art.
                    </div>
                  </div>
                ))}
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
                    fontSize: 14,
                    color: C.muted,
                    fontWeight: 600,
                    letterSpacing: 1,
                  }}
                >
                  DERNIÈRES REMISES
                </h3>
                {allLogs.slice(0, 6).map((log) => {
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
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {relay?.name || log.relayId}
                        </span>
                        <span style={{ color: C.green, fontWeight: 600 }}>
                          {qty} art.
                        </span>
                      </div>
                      <div style={{ color: C.muted }}>
                        {date.toLocaleDateString("fr-FR")}{" "}
                        {date.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        — #{log.orderId.slice(-6)} —{" "}
                        {log.collectedBy === "driver" ? "🚚 livreur" : "👤 client"}
                      </div>
                    </div>
                  );
                })}
                {allLogs.length === 0 && (
                  <div style={{ color: C.muted, fontSize: 13 }}>
                    Aucune activité
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── LIST TAB ──────────────────────────────────────────────────────── */}
        {!loading && tab === "list" && (
          <div>
            {relays.length === 0 && (
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
                Aucun relais. Créez-en un avec le bouton &quot;+ Nouveau relais&quot;.
              </div>
            )}

            {relays.map((relay) => (
              <div
                key={relay.id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 14,
                  padding: "1.25rem",
                  marginBottom: 12,
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
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background:
                            relay.status === "active" ? C.green : C.danger,
                          display: "inline-block",
                        }}
                      />
                      <span style={{ fontWeight: 700, fontSize: 16 }}>
                        {relay.name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          background:
                            relay.status === "active"
                              ? "rgba(16,185,129,0.15)"
                              : "rgba(239,68,68,0.15)",
                          color:
                            relay.status === "active" ? C.green : C.danger,
                          borderRadius: 6,
                          padding: "1px 7px",
                        }}
                      >
                        {relay.status === "active" ? "Actif" : "Inactif"}
                      </span>
                    </div>
                    <div style={{ color: C.muted, fontSize: 13 }}>
                      📍 {relay.address}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                      ID: {relay.id} · Créé le{" "}
                      {new Date(relay.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: C.green,
                        }}
                      >
                        {relay.todayCount}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>
                        aujourd'hui
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: C.accent,
                        }}
                      >
                        {relay.weekCount}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>
                        semaine
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() =>
                      router.push(`/admin/relais/${relay.id}`)
                    }
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
                      color:
                        relay.status === "active" ? C.danger : C.green,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {relay.status === "active" ? "Désactiver" : "Activer"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LOGS TAB ──────────────────────────────────────────────────────── */}
        {!loading && tab === "logs" && (
          <div>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
              {allLogs.length} remise(s) au total
            </div>
            {allLogs.map((log) => {
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
          </div>
        )}
      </div>

      {/* ── ADD RELAY MODAL ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div
            style={{
              background: "rgba(16,16,28,1)",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 20,
              padding: "2rem",
              width: "100%",
              maxWidth: 420,
            }}
          >
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
                <div key={f.key} style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      color: C.muted,
                      fontSize: 13,
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    {f.label}
                  </label>
                  <input
                    type={f.key === "pin" ? "password" : "text"}
                    value={newRelay[f.key as keyof typeof newRelay]}
                    onChange={(e) =>
                      setNewRelay((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    required
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.07)",
                      border: `1px solid ${C.cardBorder}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      color: C.text,
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}

              {addError && (
                <div
                  style={{
                    background: "rgba(239,68,68,0.12)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    color: "#fca5a5",
                    fontSize: 13,
                    marginBottom: "1rem",
                  }}
                >
                  {addError}
                </div>
              )}
              {addSuccess && (
                <div
                  style={{
                    background: "rgba(16,185,129,0.12)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    color: "#6ee7b7",
                    fontSize: 13,
                    marginBottom: "1rem",
                  }}
                >
                  {addSuccess}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.05)",
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
                  type="submit"
                  disabled={addLoading}
                  style={{
                    flex: 1,
                    background: addLoading ? C.muted : C.green,
                    border: "none",
                    borderRadius: 8,
                    padding: "12px",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: addLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {addLoading ? "Création..." : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
