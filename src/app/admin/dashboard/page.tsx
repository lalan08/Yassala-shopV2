"use client";

import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

// ── FIREBASE ──
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

// ── TYPES ──
type Order = {
  id: string;
  orderNumber?: number;
  name?: string;
  phone?: string;
  items: string;
  total: number;
  status: string;
  createdAt: string;
  address?: string;
  paidOnline?: boolean;
  fulfillmentType?: "delivery" | "pickup";
};

type Driver = {
  uid: string;
  name: string;
  status: "online" | "offline" | "busy";
  isOnline: boolean;
  zone?: string;
  currentOrderId?: string;
  lastSeen?: any;
  minutesAgo?: number;
};

type Delivery = {
  id: string;
  driverId: string;
  orderId: string;
  cashCollectedAmount: number;
  status: string;
  cashStatus: string;
  totalPay: number;
  createdAt: string;
};

const NAV = [
  {
    section: "OPÉRATIONS",
    items: [
      { key: "dashboard", label: "Tableau de bord", icon: "⊞" },
      { key: "commandes", label: "Commandes", icon: "📋" },
      { key: "dispatch", label: "Dispatch", icon: "🏍️" },
      { key: "paiements", label: "Paiements", icon: "💳" },
    ],
  },
  {
    section: "FINANCE",
    items: [
      { key: "finance-commandes", label: "Commandes", icon: "📊" },
      { key: "finance-dispatch", label: "Dispatch", icon: "📈" },
    ],
  },
];

const ITEMS_PER_PAGE = 10;

export default function AdminDashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [page, setPage] = useState(1);

  // ── Firebase realtime listeners ──
  useEffect(() => {
    const unsubOrders = onSnapshot(
      collection(db, "orders"),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(data);
      }
    );

    const unsubDrivers = onSnapshot(
      collection(db, "drivers"),
      (snap) => {
        const data = snap.docs.map((d) => {
          const raw = d.data();
          let minutesAgo: number | undefined;
          if (raw.lastSeen) {
            const ms = raw.lastSeen?.toDate
              ? raw.lastSeen.toDate().getTime()
              : new Date(raw.lastSeen).getTime();
            minutesAgo = Math.round((Date.now() - ms) / 60000);
          }
          return { uid: d.id, ...raw, minutesAgo } as Driver;
        });
        setDrivers(data);
      }
    );

    const unsubDeliveries = onSnapshot(
      collection(db, "deliveries"),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Delivery));
        setDeliveries(data);
      }
    );

    return () => {
      unsubOrders();
      unsubDrivers();
      unsubDeliveries();
    };
  }, []);

  // ── Computed stats ──
  const activeOrders = orders.filter((o) => !["livre", "annule", "cancelled"].includes(o.status));
  const pending = orders.filter((o) => o.status === "nouveau");
  const inDelivery = orders.filter((o) => o.status === "en_cours");
  const activeDrivers = drivers.filter((d) => d.isOnline);

  const cashPending = deliveries
    .filter((d) => d.cashStatus === "unsettled" && d.status !== "paid")
    .reduce((s, d) => s + (d.cashCollectedAmount || 0), 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const validatedToday = deliveries
    .filter(
      (d) =>
        (d.status === "validated" || d.status === "paid") &&
        d.createdAt?.slice(0, 10) === todayStr
    )
    .reduce((s, d) => s + (d.totalPay || 0), 0);

  const paymentErrors = deliveries.filter(
    (d) => d.cashStatus === "unsettled" && d.createdAt &&
    Date.now() - new Date(d.createdAt).getTime() > 24 * 60 * 60 * 1000
  ).length;

  // ── New orders table (pending + en_cours) ──
  const newOrders = orders.filter((o) => ["nouveau", "en_cours", "confirmed"].includes(o.status));
  const totalPages = Math.max(1, Math.ceil(newOrders.length / ITEMS_PER_PAGE));
  const pagedOrders = newOrders.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const cashPendingOrders = newOrders
    .filter((o) => !o.paidOnline)
    .reduce((s, o) => s + Number(o.total), 0);

  // ── Driver status label ──
  const driverLabel = (d: Driver) => {
    if (!d.isOnline) return { text: "HORS LIGNE", color: "#9ca3af" };
    if (d.status === "busy") {
      const mins = d.minutesAgo != null ? `${d.minutesAgo} min` : "";
      return { text: `En livraison${mins ? " " + mins : ""}`, color: "#3b82f6" };
    }
    return { text: "LIBRE", color: "#22c55e" };
  };

  const driverZone = (d: Driver) => d.zone || "—";

  // ── Update order status ──
  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter', sans-serif", background: "#f9fafb" }}>
      {/* ── SIDEBAR ── */}
      <aside
        style={{
          width: 220,
          background: "#111827",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "24px 20px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "0.05em", color: "#fff" }}>
            YASSALA
          </div>
          <div style={{ fontSize: "0.65rem", color: "#6b7280", letterSpacing: "0.12em", marginTop: 2 }}>
            ADMIN PANEL
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 0" }}>
          {NAV.map((group) => (
            <div key={group.section} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  color: "#4b5563",
                  padding: "8px 20px 6px",
                  textTransform: "uppercase" as const,
                }}
              >
                {group.section}
              </div>
              {group.items.map((item) => {
                const isActive = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveNav(item.key)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 20px",
                      background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                      border: "none",
                      borderLeft: isActive ? "3px solid #f97316" : "3px solid transparent",
                      color: isActive ? "#fff" : "#9ca3af",
                      fontSize: "0.85rem",
                      fontWeight: isActive ? 600 : 400,
                      cursor: "pointer",
                      textAlign: "left" as const,
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem" }}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <a
            href="/admin"
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "#6b7280",
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            ← Admin complet
          </a>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div
          style={{
            padding: "18px 28px",
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "#111827" }}>
            NOUVELLES COMMANDES
          </div>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
          {/* ── STAT CARDS ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
            <StatCard
              label="En attente"
              value={pending.length}
              color="#f97316"
              bg="#fff7ed"
              border="#fed7aa"
            />
            <StatCard
              label="En livraison"
              value={inDelivery.length}
              color="#3b82f6"
              bg="#eff6ff"
              border="#bfdbfe"
            />
            <StatCard
              label="Livreurs actifs"
              value={activeDrivers.length}
              color="#22c55e"
              bg="#f0fdf4"
              border="#bbf7d0"
            />
          </div>

          {/* ── ORDERS TABLE ── */}
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}
          >
            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                  {["N°", "CLIENT", "MONTANT", "PAIEMENT", "ACTIONS"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "11px 16px",
                        textAlign: "left" as const,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: "#6b7280",
                        textTransform: "uppercase" as const,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "32px",
                        textAlign: "center" as const,
                        color: "#9ca3af",
                        fontSize: "0.85rem",
                      }}
                    >
                      Aucune nouvelle commande
                    </td>
                  </tr>
                )}
                {pagedOrders.map((order, i) => {
                  const isEven = i % 2 === 0;
                  const statusBadge = STATUS_BADGE[order.status] ?? { label: order.status, color: "#6b7280", bg: "#f3f4f6" };
                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        background: isEven ? "#fff" : "#fafafa",
                      }}
                    >
                      <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: "0.85rem", color: "#111827" }}>
                        #{order.orderNumber ?? order.id.slice(-4).toUpperCase()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500, color: "#111827" }}>
                          {order.name || order.phone || "—"}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>
                          {order.address?.split(",")[0] ?? "—"}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: "0.9rem", color: "#111827" }}>
                        {Number(order.total).toFixed(0)}€
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: 99,
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            background: order.paidOnline ? "#dcfce7" : "#fef3c7",
                            color: order.paidOnline ? "#15803d" : "#92400e",
                          }}
                        >
                          {order.paidOnline ? "PAYÉ" : "CASH"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {order.status === "nouveau" && (
                            <ActionBtn
                              label="Assigner"
                              color="#3b82f6"
                              onClick={() => updateStatus(order.id, "en_cours")}
                            />
                          )}
                          {order.status === "en_cours" && (
                            <ActionBtn
                              label="Appeler"
                              color="#22c55e"
                              onClick={() => {
                                if (order.phone) window.open(`tel:${order.phone}`);
                              }}
                            />
                          )}
                          <ActionBtn
                            label="Annuler"
                            color="#ef4444"
                            onClick={() => {
                              if (confirm("Annuler cette commande ?")) updateStatus(order.id, "annule");
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── FOOTER ── */}
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <div style={{ fontSize: "0.8rem", color: "#374151" }}>
                <span style={{ fontWeight: 600 }}>Total CASH en attente</span>
                <span
                  style={{
                    marginLeft: 10,
                    fontWeight: 800,
                    fontSize: "1rem",
                    color: "#f97316",
                  }}
                >
                  {cashPendingOrders.toFixed(0)}€
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Pagination */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <PagBtn
                    label="‹"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  />
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const n = i + 1;
                    return (
                      <PagBtn
                        key={n}
                        label={String(n)}
                        onClick={() => setPage(n)}
                        active={page === n}
                      />
                    );
                  })}
                  <PagBtn
                    label="›"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  />
                </div>

                <a
                  href="/admin"
                  style={{
                    fontSize: "0.78rem",
                    color: "#3b82f6",
                    textDecoration: "none",
                    fontWeight: 500,
                  }}
                >
                  Voir toutes les commandes →
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── RIGHT PANEL ── */}
      <aside
        style={{
          width: 260,
          background: "#fff",
          borderLeft: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        {/* LIVREURS */}
        <div style={{ padding: "20px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <div
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "#6b7280",
              marginBottom: 14,
              textTransform: "uppercase" as const,
            }}
          >
            LIVREURS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {drivers.length === 0 && (
              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>Aucun livreur enregistré</div>
            )}
            {drivers.slice(0, 5).map((d) => {
              const st = driverLabel(d);
              return (
                <div
                  key={d.uid}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "#f9fafb",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#111827" }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: 2 }}>
                      {driverZone(d)}
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: st.color,
                        background: st.color + "18",
                        padding: "3px 7px",
                        borderRadius: 99,
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {st.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <a
            href="/admin"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginTop: 12,
              padding: "8px",
              borderRadius: 8,
              border: "1px dashed #d1d5db",
              fontSize: "0.78rem",
              color: "#6b7280",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            + Ajouter livreur
          </a>
        </div>

        {/* PAIEMENTS */}
        <div style={{ padding: "20px 18px" }}>
          <div
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "#6b7280",
              marginBottom: 14,
              textTransform: "uppercase" as const,
            }}
          >
            PAIEMENTS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <PayRow
              label="En attente cash"
              value={`${cashPending.toFixed(0)}€`}
              color="#f97316"
            />
            <PayRow
              label={`Validés (aujourd'hui)`}
              value={`${validatedToday.toFixed(0)}€`}
              color="#22c55e"
            />
            <PayRow
              label="Erreurs de paiement"
              value={String(paymentErrors)}
              color={paymentErrors > 0 ? "#ef4444" : "#9ca3af"}
            />
          </div>

          <a
            href="/admin/payouts"
            style={{
              display: "block",
              marginTop: 16,
              padding: "9px",
              background: "#111827",
              color: "#fff",
              borderRadius: 8,
              textAlign: "center" as const,
              fontSize: "0.78rem",
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "0.05em",
            }}
          >
            Voir les payouts →
          </a>
        </div>
      </aside>
    </div>
  );
}

// ── SMALL COMPONENTS ──

function StatCard({
  label,
  value,
  color,
  bg,
  border,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: "18px 20px",
      }}
    >
      <div style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.1em", color: "#6b7280", textTransform: "uppercase" as const }}>
        {label}
      </div>
      <div style={{ fontWeight: 800, fontSize: "2rem", color, marginTop: 6, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 6,
        border: `1px solid ${color}30`,
        background: `${color}12`,
        color,
        fontSize: "0.72rem",
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap" as const,
      }}
    >
      {label}
    </button>
  );
}

function PagBtn({
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: active ? "none" : "1px solid #e5e7eb",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : disabled ? "#d1d5db" : "#374151",
        fontSize: "0.78rem",
        fontWeight: active ? 700 : 400,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}

function PayRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 12px",
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
      }}
    >
      <span style={{ fontSize: "0.78rem", color: "#374151" }}>{label}</span>
      <span style={{ fontSize: "0.88rem", fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  nouveau: { label: "Nouveau", color: "#92400e", bg: "#fef3c7" },
  confirmed: { label: "Confirmé", color: "#1d4ed8", bg: "#dbeafe" },
  en_cours: { label: "En livraison", color: "#1d4ed8", bg: "#dbeafe" },
  livre: { label: "Livré", color: "#15803d", bg: "#dcfce7" },
  annule: { label: "Annulé", color: "#991b1b", bg: "#fee2e2" },
  cancelled: { label: "Annulé", color: "#991b1b", bg: "#fee2e2" },
};
