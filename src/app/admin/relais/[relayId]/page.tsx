"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
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

const C = {
  bg: "rgba(10,10,20,0.98)",
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.09)",
  text: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#f97316",
  green: "#10b981",
  danger: "#ef4444",
};

type Relay = {
  id: string;
  name: string;
  address: string;
  status: "active" | "inactive";
  createdAt: string;
};

type RelayLog = {
  id: string;
  relayId: string;
  orderId: string;
  items: { productId: string; name: string; qty: number }[];
  timestamp: string;
  collectedBy: "driver" | "customer";
};

type RelayOrder = {
  id: string;
  orderNumber?: number;
  name?: string;
  phone?: string;
  total: number;
  status: string;
  fulfillmentMode?: string;
  createdAt: string;
  collectedAt?: string;
};

export default function AdminRelayDetailPage() {
  const router = useRouter();
  const params = useParams();
  const relayId = params.relayId as string;

  const [authed, setAuthed] = useState(false);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [logs, setLogs] = useState<RelayLog[]>([]);
  const [orders, setOrders] = useState<RelayOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [totalProducts, setTotalProducts] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);

  useEffect(() => {
    const key = localStorage.getItem("yassala_admin_auth");
    if (!key) {
      router.push("/admin");
      return;
    }
    setAuthed(true);
  }, [router]);

  useEffect(() => {
    if (authed && relayId) loadData();
  }, [authed, relayId]);

  async function loadData() {
    setLoading(true);
    try {
      // Load relay
      const relaySnap = await getDoc(doc(db, "relays", relayId));
      if (relaySnap.exists()) {
        setRelay({ id: relaySnap.id, ...(relaySnap.data() as Omit<Relay, "id">) });
      }

      // Load logs
      const logsSnap = await getDocs(
        query(
          collection(db, "relayLogs"),
          where("relayId", "==", relayId),
          orderBy("timestamp", "desc")
        )
      );
      const logsData: RelayLog[] = logsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RelayLog, "id">),
      }));
      setLogs(logsData);

      // Compute stats from logs
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      weekStart.setHours(0, 0, 0, 0);

      let total = 0;
      let today = 0;
      let week = 0;

      for (const log of logsData) {
        const ts = new Date(log.timestamp);
        const qty = (log.items || []).reduce((s, i) => s + i.qty, 0);
        total += qty;
        if (ts >= todayStart) today += qty;
        if (ts >= weekStart) week += qty;
      }
      setTotalProducts(total);
      setTodayCount(today);
      setWeekCount(week);

      // Load orders for this relay
      const ordersSnap = await getDocs(
        query(
          collection(db, "orders"),
          where("relayId", "==", relayId),
          orderBy("createdAt", "desc")
        )
      );
      const ordersData: RelayOrder[] = ordersSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<RelayOrder, "id">),
      }));
      setOrders(ordersData);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  const statusColors: Record<string, string> = {
    PAID: "#60a5fa",
    READY_FOR_PICKUP: C.accent,
    COLLECTED: C.green,
    CLOSED: C.muted,
  };

  const statusLabels: Record<string, string> = {
    PAID: "Payé",
    READY_FOR_PICKUP: "À récupérer",
    COLLECTED: "Récupéré",
    CLOSED: "Terminé",
  };

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
          background: "rgba(8,8,16,0.95)",
          borderBottom: `1px solid ${C.cardBorder}`,
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={() => router.push("/admin/relais")}
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
          ← Relais
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {loading ? "Chargement..." : relay?.name || relayId}
          </h1>
          {relay && (
            <div style={{ color: C.muted, fontSize: 12 }}>
              📍 {relay.address}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto" }}>
        {loading && (
          <div style={{ textAlign: "center", color: C.muted, padding: "4rem" }}>
            Chargement...
          </div>
        )}

        {!loading && (
          <>
            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
                marginBottom: "2rem",
              }}
            >
              {[
                { label: "Total produits sortis", value: totalProducts, color: C.accent },
                { label: "Aujourd'hui", value: todayCount, color: C.green },
                { label: "Cette semaine", value: weekCount, color: "#60a5fa" },
                { label: "Total commandes", value: orders.length, color: C.muted },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 12,
                    padding: "1rem",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 28,
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

            {/* Relay info */}
            {relay && (
              <div
                style={{
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 12,
                  padding: "1.25rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 1rem",
                    fontSize: 13,
                    color: C.muted,
                    fontWeight: 600,
                    letterSpacing: 1,
                  }}
                >
                  INFORMATIONS DU RELAIS
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 12,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <span style={{ color: C.muted }}>ID</span>
                    <div style={{ fontWeight: 600, fontFamily: "monospace" }}>
                      {relay.id}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: C.muted }}>Statut</span>
                    <div>
                      <span
                        style={{
                          background:
                            relay.status === "active"
                              ? "rgba(16,185,129,0.15)"
                              : "rgba(239,68,68,0.15)",
                          color:
                            relay.status === "active" ? C.green : C.danger,
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {relay.status === "active" ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span style={{ color: C.muted }}>Créé le</span>
                    <div style={{ fontWeight: 600 }}>
                      {new Date(relay.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              {/* Orders */}
              <div>
                <h3
                  style={{
                    fontSize: 13,
                    color: C.muted,
                    fontWeight: 600,
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}
                >
                  COMMANDES ({orders.length})
                </h3>
                {orders.length === 0 && (
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 13,
                      textAlign: "center",
                      padding: "2rem",
                      background: C.card,
                      borderRadius: 10,
                      border: `1px solid ${C.cardBorder}`,
                    }}
                  >
                    Aucune commande
                  </div>
                )}
                {orders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.cardBorder}`,
                      borderRadius: 10,
                      padding: "1rem",
                      marginBottom: 8,
                      fontSize: 13,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        #{order.orderNumber || order.id.slice(-6)}
                      </span>
                      <span
                        style={{
                          background: `${statusColors[order.status] || C.muted}20`,
                          color: statusColors[order.status] || C.muted,
                          borderRadius: 6,
                          padding: "1px 7px",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {statusLabels[order.status] || order.status}
                      </span>
                    </div>
                    <div style={{ color: C.muted }}>
                      {order.name} · {order.total?.toFixed(2)} €
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                      {order.fulfillmentMode === "DELIVERY"
                        ? "🚚 Livraison"
                        : "🏪 Click & Collect"}{" "}
                      ·{" "}
                      {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                    {order.collectedAt && (
                      <div style={{ color: C.green, fontSize: 11, marginTop: 2 }}>
                        ✓ Récupéré le{" "}
                        {new Date(order.collectedAt).toLocaleDateString("fr-FR")}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Logs */}
              <div>
                <h3
                  style={{
                    fontSize: 13,
                    color: C.muted,
                    fontWeight: 600,
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}
                >
                  HISTORIQUE DES REMISES ({logs.length})
                </h3>
                {logs.length === 0 && (
                  <div
                    style={{
                      color: C.muted,
                      fontSize: 13,
                      textAlign: "center",
                      padding: "2rem",
                      background: C.card,
                      borderRadius: 10,
                      border: `1px solid ${C.cardBorder}`,
                    }}
                  >
                    Aucune remise
                  </div>
                )}
                {logs.map((log) => {
                  const qty = log.items.reduce((s, i) => s + i.qty, 0);
                  const date = new Date(log.timestamp);
                  return (
                    <div
                      key={log.id}
                      style={{
                        background: C.card,
                        border: `1px solid ${C.cardBorder}`,
                        borderRadius: 10,
                        padding: "1rem",
                        marginBottom: 8,
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          #{log.orderId.slice(-6)}
                        </span>
                        <span
                          style={{
                            background: "rgba(16,185,129,0.15)",
                            color: C.green,
                            borderRadius: 6,
                            padding: "1px 7px",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {qty} art.
                        </span>
                      </div>
                      <div style={{ color: C.muted }}>
                        {date.toLocaleDateString("fr-FR")}{" "}
                        {date.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ·{" "}
                        {log.collectedBy === "driver"
                          ? "🚚 livreur"
                          : "👤 client"}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        {log.items.map((item, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 11,
                              color: C.muted,
                              paddingLeft: 8,
                              borderLeft: "2px solid rgba(249,115,22,0.3)",
                              marginTop: 2,
                            }}
                          >
                            {item.name} x{item.qty}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
