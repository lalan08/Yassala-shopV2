"use client";

import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
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
  zone?: string;
  paidOnline?: boolean;
  fulfillmentType?: "delivery" | "pickup";
  assignedDriverId?: string;
  cashConfirmed?: boolean;
};

type Driver = {
  uid: string;
  name: string;
  phone?: string;
  status: "online" | "offline" | "busy" | "paused";
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

// ── DESIGN TOKENS ──
const C = {
  bg: "rgba(10,10,20,0.82)",
  sidebar: "rgba(8,8,16,0.90)",
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.09)",
  tableBg: "rgba(255,255,255,0.04)",
  tableRow: "rgba(255,255,255,0.025)",
  tableHead: "rgba(255,255,255,0.06)",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textFaint: "#475569",
  accent: "#f97316",
  purple: "#8B5CF6",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#FBBF24",
  red: "#ef4444",
  border: "rgba(255,255,255,0.08)",
  navActive: "rgba(249,115,22,0.12)",
  glass: "blur(16px)",
};

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  nouveau: { label: "Nouveau", color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  confirmed: { label: "Confirmé", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  en_cours: { label: "En livraison", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  livre: { label: "Livré", color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  annule: { label: "Annulé", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  cancelled: { label: "Annulé", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};

const ITEMS_PER_PAGE = 10;

// ── HELPERS ──
function timeAgo(dateStr: string) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
}

function extractZone(address?: string): string {
  if (!address) return "—";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || parts[0] || "—";
}

function driverStatusInfo(d: Driver) {
  if (!d.isOnline) return { text: "HORS LIGNE", color: C.textFaint };
  if (d.status === "paused") return { text: "PAUSÉ", color: C.yellow };
  if (d.status === "busy") return { text: "EN LIVRAISON", color: C.blue };
  return { text: "LIBRE", color: C.green };
}

// ── MAIN COMPONENT ──
export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [platformCommissions, setPlatformCommissions] = useState<{ id: string; amount: number; createdAt: string }[]>([]);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<"all" | "nouveau" | "en_cours">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & panels
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [assignTargetOrder, setAssignTargetOrder] = useState<Order | null>(null);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);

  // Form states
  const [newOrderForm, setNewOrderForm] = useState({ name: "", phone: "", address: "", items: "", total: "", paidOnline: false });
  const [newDriverForm, setNewDriverForm] = useState({ name: "", phone: "", zone: "" });
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);

  // ── Firebase realtime listeners ──
  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(data);
    });

    const unsubDrivers = onSnapshot(collection(db, "drivers"), (snap) => {
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
    });

    const unsubDeliveries = onSnapshot(collection(db, "deliveries"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Delivery));
      setDeliveries(data);
    });

    const unsubCommissions = onSnapshot(collection(db, "platform_commissions"), (snap) => {
      setPlatformCommissions(snap.docs.map(d => ({
        id: d.id,
        amount: d.data().amount || 0,
        createdAt: d.data().createdAt || "",
      })));
    });

    return () => { unsubOrders(); unsubDrivers(); unsubDeliveries(); unsubCommissions(); };
  }, []);

  // ── Computed stats ──
  const pending = orders.filter((o) => o.status === "nouveau");
  const inDelivery = orders.filter((o) => o.status === "en_cours");
  const activeDrivers = drivers.filter((d) => d.isOnline);

  const cashPending = deliveries
    .filter((d) => d.cashStatus === "unsettled" && d.status !== "paid")
    .reduce((s, d) => s + (d.cashCollectedAmount || 0), 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const validatedToday = deliveries
    .filter((d) => (d.status === "validated" || d.status === "paid") && d.createdAt?.slice(0, 10) === todayStr)
    .reduce((s, d) => s + (d.totalPay || 0), 0);

  const paymentErrors = deliveries.filter(
    (d) => d.cashStatus === "unsettled" && d.createdAt &&
    Date.now() - new Date(d.createdAt).getTime() > 24 * 60 * 60 * 1000
  ).length;

  // Commissions plateforme Yassala (+0,50€ par livraison)
  const totalCommissions = platformCommissions.reduce((s, c) => s + c.amount, 0);
  const commissionsToday = platformCommissions
    .filter(c => c.createdAt.slice(0, 10) === todayStr)
    .reduce((s, c) => s + c.amount, 0);

  // ── Orders table data ──
  const allActiveOrders = orders.filter((o) => ["nouveau", "en_cours", "confirmed"].includes(o.status));
  const filteredOrders = allActiveOrders
    .filter((o) => filterStatus === "all" || o.status === filterStatus)
    .filter((o) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (o.name || "").toLowerCase().includes(q) ||
        (o.phone || "").includes(q) ||
        String(o.orderNumber || "").includes(q)
      );
    });
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const pagedOrders = filteredOrders.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const cashPendingOrders = allActiveOrders.filter((o) => !o.paidOnline).reduce((s, o) => s + Number(o.total), 0);

  // ── Actions ──
  const assignDriverToOrder = async (orderId: string, driverId: string) => {
    setAssigningOrderId(orderId);
    try {
      await updateDoc(doc(db, "orders", orderId), { status: "en_cours", assignedDriverId: driverId });
      await updateDoc(doc(db, "drivers", driverId), { status: "busy", currentOrderId: orderId });
      setAssignTargetOrder(null);
    } finally {
      setAssigningOrderId(null);
    }
  };

  const cancelOrder = async (id: string) => {
    if (!confirm("Annuler cette commande ?")) return;
    await updateDoc(doc(db, "orders", id), { status: "annule" });
  };

  const confirmCash = async (id: string) => {
    await updateDoc(doc(db, "orders", id), { cashConfirmed: true });
  };

  const saveNewOrder = async () => {
    if (!newOrderForm.items || !newOrderForm.total) return;
    setSavingOrder(true);
    try {
      await addDoc(collection(db, "orders"), {
        name: newOrderForm.name || "Client",
        phone: newOrderForm.phone,
        address: newOrderForm.address,
        items: newOrderForm.items,
        total: parseFloat(newOrderForm.total) || 0,
        paidOnline: newOrderForm.paidOnline,
        status: "nouveau",
        createdAt: new Date().toISOString(),
        fulfillmentType: "delivery",
      });
      setShowNewOrderModal(false);
      setNewOrderForm({ name: "", phone: "", address: "", items: "", total: "", paidOnline: false });
    } finally {
      setSavingOrder(false);
    }
  };

  const saveNewDriver = async () => {
    if (!newDriverForm.name) return;
    setSavingDriver(true);
    try {
      await addDoc(collection(db, "drivers"), {
        name: newDriverForm.name,
        phone: newDriverForm.phone,
        zone: newDriverForm.zone,
        status: "online",
        isOnline: false,
        lastSeen: new Date().toISOString(),
      });
      setShowAddDriverModal(false);
      setNewDriverForm({ name: "", phone: "", zone: "" });
    } finally {
      setSavingDriver(false);
    }
  };

  // Driver popup data
  const driverAssignedOrders = selectedDriver
    ? orders.filter((o) => o.assignedDriverId === selectedDriver.uid || o.id === selectedDriver.currentOrderId)
    : [];

  // Available drivers for assignment (online & not busy)
  const availableDrivers = drivers.filter((d) => d.isOnline && d.status !== "busy");

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
        overflow: "hidden",
        background: "#07080f",
      }}
    >
      {/* ── BACKGROUND ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/IMG_0964.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.3) saturate(0.6)",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(5,5,15,0.6) 0%, rgba(10,10,25,0.5) 100%)",
          zIndex: 1,
        }}
      />

      {/* ── SIDEBAR ── */}
      <aside
        style={{
          width: 214,
          background: C.sidebar,
          backdropFilter: C.glass,
          WebkitBackdropFilter: C.glass,
          color: C.text,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 10,
          borderRight: `1px solid ${C.border}`,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "22px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "0.1em", color: "#fff" }}>
            YASSALA
          </div>
          <div style={{ fontSize: "0.6rem", color: C.textFaint, letterSpacing: "0.18em", marginTop: 2 }}>
            ADMIN PANEL
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 0", overflowY: "auto" }}>
          {[
            {
              section: "OPÉRATIONS",
              items: [
                { key: "dashboard", label: "Tableau de bord", icon: "⊞", href: "/admin/dashboard" },
                { key: "commandes", label: "Commandes", icon: "📋", href: "/admin/commandes" },
                { key: "dispatch", label: "Dispatch", icon: "🏍️", href: "#" },
                { key: "paiements", label: "Paiements", icon: "💳", href: "/admin/payouts" },
              ],
            },
            {
              section: "ANALYSE",
              items: [
                { key: "analytics", label: "Analytiques", icon: "📊", href: "/admin/analytics" },
                { key: "fraud", label: "Anti-fraude", icon: "🛡️", href: "/admin/fraud" },
                { key: "settings", label: "Paramètres", icon: "⚙️", href: "/admin/settings/delivery" },
              ],
            },
          ].map((group) => (
            <div key={group.section} style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  color: C.textFaint,
                  padding: "8px 20px 5px",
                  textTransform: "uppercase" as const,
                }}
              >
                {group.section}
              </div>
              {group.items.map((item) => {
                const isActive = item.key === "dashboard";
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "8px 20px",
                      background: isActive ? C.navActive : "transparent",
                      borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent",
                      color: isActive ? "#fff" : C.textMuted,
                      fontSize: "0.82rem",
                      fontWeight: isActive ? 600 : 400,
                      cursor: "pointer",
                      textDecoration: "none",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "0.78rem" }}>{item.icon}</span>
                    {item.label}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}` }}>
          <a
            href="/admin"
            style={{ display: "block", fontSize: "0.71rem", color: C.textFaint, textDecoration: "none", letterSpacing: "0.04em" }}
          >
            ← Admin complet
          </a>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 10 }}>
        {/* Top bar */}
        <div
          style={{
            padding: "12px 24px",
            background: "rgba(8,8,16,0.80)",
            backdropFilter: C.glass,
            WebkitBackdropFilter: C.glass,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#fff", letterSpacing: "0.1em" }}>
              VUE D&apos;ENSEMBLE
            </div>
            <div style={{ fontSize: "0.66rem", color: C.textMuted, marginTop: 1 }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Live indicator */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 7,
                background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
              }}
            >
              <div
                style={{
                  width: 6, height: 6, borderRadius: "50%", background: C.green,
                  boxShadow: `0 0 8px ${C.green}`,
                  animation: "pulse 2s infinite",
                }}
              />
              <span style={{ fontSize: "0.66rem", color: C.green, fontWeight: 600 }}>LIVE</span>
            </div>
            <button
              onClick={() => setShowNewOrderModal(true)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none",
                background: `linear-gradient(135deg, ${C.accent}, #d4560a)`,
                color: "#fff", fontWeight: 700, fontSize: "0.74rem", cursor: "pointer",
                letterSpacing: "0.04em",
                boxShadow: `0 4px 18px rgba(249,115,22,0.35)`,
              }}
            >
              + Commande
            </button>
            <div
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(139,92,246,0.2)", border: `1px solid rgba(139,92,246,0.4)`,
                color: C.purple, display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "0.7rem", cursor: "pointer",
              }}
            >
              CB
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: "auto", padding: "18px 20px" }}>

          {/* ── KPI CARDS ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
            <KpiCard icon="⏳" label="En attente" value={pending.length} sub="commandes nouvelles" color={C.accent} />
            <KpiCard icon="🏍️" label="En livraison" value={inDelivery.length} sub="en cours" color={C.blue} />
            <KpiCard
              icon="👤"
              label="Livreurs actifs"
              value={activeDrivers.length}
              sub={`/${drivers.length} total`}
              color={C.green}
            />
          </div>

          {/* ── SECTION HEADER ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.87rem", color: "#fff", letterSpacing: "0.1em" }}>
                NOUVELLES COMMANDES
              </div>
              <div style={{ fontSize: "0.67rem", color: C.textMuted, marginTop: 2 }}>
                {allActiveOrders.length} commande{allActiveOrders.length !== 1 ? "s" : ""} active{allActiveOrders.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* ── FILTERS + SEARCH ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div
              style={{
                display: "flex", gap: 3,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 9, padding: 3,
                border: `1px solid ${C.border}`, flexShrink: 0,
              }}
            >
              {([
                { key: "all" as const, label: `Toutes (${allActiveOrders.length})` },
                { key: "nouveau" as const, label: `Nouvelles (${pending.length})` },
                { key: "en_cours" as const, label: `Livraison (${inDelivery.length})` },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setFilterStatus(tab.key); setPage(1); }}
                  style={{
                    padding: "5px 10px", borderRadius: 7, border: "none",
                    background: filterStatus === tab.key ? C.accent : "transparent",
                    color: filterStatus === tab.key ? "#fff" : C.textMuted,
                    fontSize: "0.71rem", fontWeight: filterStatus === tab.key ? 700 : 400,
                    cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <span
                style={{
                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                  color: C.textFaint, fontSize: "0.8rem", pointerEvents: "none",
                }}
              >
                🔍
              </span>
              <input
                type="text"
                placeholder="Rechercher nom, téléphone, N°…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                style={{
                  width: "100%", padding: "7px 12px 7px 32px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)",
                  color: C.text, fontSize: "0.78rem", outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
            </div>
          </div>

          {/* ── ORDERS TABLE ── */}
          <div
            style={{
              background: C.tableBg, backdropFilter: C.glass, WebkitBackdropFilter: C.glass,
              borderRadius: 12, border: `1px solid ${C.cardBorder}`, overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.tableHead }}>
                  {["Commande", "Client · Zone", "Montant", "Paiement", "Statut", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left" as const,
                        fontSize: "0.62rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        color: C.textMuted,
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
                      colSpan={6}
                      style={{ padding: "48px", textAlign: "center" as const, color: C.textFaint, fontSize: "0.82rem" }}
                    >
                      <div style={{ fontSize: "2rem", marginBottom: 8 }}>📭</div>
                      Aucune commande active
                    </td>
                  </tr>
                )}
                {pagedOrders.map((order) => {
                  const statusInfo = STATUS_BADGE[order.status] ?? { label: order.status, color: C.textMuted, bg: C.card };
                  const zone = order.zone || extractZone(order.address);
                  const isCash = !order.paidOnline;
                  const assignedDriver = drivers.find((d) => d.uid === order.assignedDriverId);

                  return (
                    <tr
                      key={order.id}
                      style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.12s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.032)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* N° Commande */}
                      <td style={{ padding: "11px 12px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div
                            style={{
                              width: 3, minHeight: 34, borderRadius: 2,
                              background: statusInfo.color, flexShrink: 0, alignSelf: "stretch",
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#fff" }}>
                              #{order.orderNumber ?? order.id.slice(-4).toUpperCase()}
                            </div>
                            <div style={{ fontSize: "0.63rem", color: C.textMuted, marginTop: 1 }}>
                              {timeAgo(order.createdAt)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Client + Zone */}
                      <td style={{ padding: "11px 12px" }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: C.text }}>
                          {order.name || "—"}
                        </div>
                        <div style={{ fontSize: "0.65rem", color: C.textMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          {order.phone && <span>{order.phone}</span>}
                          {zone !== "—" && (
                            <>
                              <span style={{ color: C.textFaint }}>·</span>
                              <span style={{ color: C.accent, fontWeight: 600 }}>{zone}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Montant */}
                      <td style={{ padding: "11px 12px" }}>
                        <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "#fff" }}>
                          {Number(order.total).toFixed(0)}€
                        </div>
                        {assignedDriver && (
                          <div style={{ fontSize: "0.62rem", color: C.blue, marginTop: 2 }}>
                            🏍️ {assignedDriver.name}
                          </div>
                        )}
                      </td>

                      {/* Paiement */}
                      <td style={{ padding: "11px 12px" }}>
                        <PayBadge isPaid={!isCash} />
                        {isCash && order.cashConfirmed && (
                          <div style={{ fontSize: "0.6rem", color: C.green, marginTop: 3 }}>✓ Confirmé</div>
                        )}
                      </td>

                      {/* Statut */}
                      <td style={{ padding: "11px 12px" }}>
                        <span
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "3px 9px", borderRadius: 99,
                            fontSize: "0.63rem", fontWeight: 700, letterSpacing: "0.05em",
                            background: statusInfo.bg, color: statusInfo.color,
                            border: `1px solid ${statusInfo.color}30`,
                            whiteSpace: "nowrap" as const,
                          }}
                        >
                          <span style={{ width: 4, height: 4, borderRadius: "50%", background: statusInfo.color }} />
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "11px 12px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                          {order.status === "nouveau" && (
                            <ActionBtn
                              label={assigningOrderId === order.id ? "…" : "Assigner"}
                              color={C.blue}
                              onClick={() => setAssignTargetOrder(order)}
                            />
                          )}
                          {(order.status === "en_cours" || order.status === "confirmed") && order.phone && (
                            <ActionBtn
                              label="Appeler"
                              color={C.green}
                              onClick={() => window.open(`tel:${order.phone}`)}
                            />
                          )}
                          {isCash && !order.cashConfirmed && order.status !== "annule" && (
                            <ActionBtn
                              label="✓ Cash"
                              color={C.accent}
                              onClick={() => confirmCash(order.id)}
                            />
                          )}
                          <ActionBtn
                            label="✕"
                            color={C.red}
                            onClick={() => cancelOrder(order.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Table footer */}
            <div
              style={{
                padding: "10px 14px", display: "flex", alignItems: "center",
                justifyContent: "space-between", borderTop: `1px solid ${C.border}`,
                background: C.tableHead,
              }}
            >
              <div style={{ fontSize: "0.78rem", color: C.text }}>
                <span style={{ fontWeight: 600 }}>Total CASH en attente</span>
                <span style={{ marginLeft: 8, fontWeight: 800, fontSize: "0.97rem", color: C.accent }}>
                  {cashPendingOrders.toFixed(0)}€
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <PagBtn label="‹" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} />
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => (
                  <PagBtn key={i + 1} label={String(i + 1)} onClick={() => setPage(i + 1)} active={page === i + 1} />
                ))}
                <PagBtn label="›" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── RIGHT PANEL ── */}
      <aside
        style={{
          width: 252,
          background: C.sidebar,
          backdropFilter: C.glass,
          WebkitBackdropFilter: C.glass,
          borderLeft: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
          zIndex: 10,
        }}
      >
        {/* LIVREURS */}
        <div style={{ padding: "18px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div
              style={{
                fontSize: "0.6rem", fontWeight: 700,
                letterSpacing: "0.18em", color: C.textFaint,
                textTransform: "uppercase" as const,
              }}
            >
              LIVREURS
            </div>
            <span
              style={{
                fontSize: "0.68rem", fontWeight: 700,
                color: C.green,
                background: "rgba(34,197,94,0.12)",
                padding: "2px 7px", borderRadius: 99,
              }}
            >
              {activeDrivers.length}/{drivers.length}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drivers.length === 0 && (
              <div style={{ fontSize: "0.78rem", color: C.textFaint, padding: "12px 0" }}>
                Aucun livreur enregistré
              </div>
            )}
            {drivers.map((d) => {
              const st = driverStatusInfo(d);
              return (
                <button
                  key={d.uid}
                  onClick={() => setSelectedDriver(d)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 10px", background: C.card, borderRadius: 8,
                    border: `1px solid ${C.cardBorder}`, cursor: "pointer",
                    textAlign: "left" as const, width: "100%", transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = st.color + "50";
                    (e.currentTarget as HTMLButtonElement).style.background = st.color + "0a";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = C.cardBorder;
                    (e.currentTarget as HTMLButtonElement).style.background = C.card;
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.81rem", color: "#fff" }}>{d.name}</div>
                    {d.zone && (
                      <div style={{ fontSize: "0.63rem", color: C.textMuted, marginTop: 1 }}>{d.zone}</div>
                    )}
                    {d.currentOrderId && (
                      <div style={{ fontSize: "0.61rem", color: C.blue, marginTop: 1 }}>
                        #{d.currentOrderId.slice(-4).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.59rem", fontWeight: 700, letterSpacing: "0.04em",
                      color: st.color, background: st.color + "18",
                      padding: "3px 6px", borderRadius: 99,
                      border: `1px solid ${st.color}30`, whiteSpace: "nowrap" as const,
                    }}
                  >
                    {st.text}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowAddDriverModal(true)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              marginTop: 8, padding: "7px", borderRadius: 8,
              border: `1px dashed ${C.border}`, background: "transparent",
              fontSize: "0.74rem", color: C.textMuted, cursor: "pointer", width: "100%",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = C.accent;
              (e.currentTarget as HTMLButtonElement).style.color = C.accent;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
              (e.currentTarget as HTMLButtonElement).style.color = C.textMuted;
            }}
          >
            + Ajouter livreur
          </button>
        </div>

        {/* PAIEMENTS */}
        <div style={{ padding: "18px 14px" }}>
          <div
            style={{
              fontSize: "0.6rem", fontWeight: 700,
              letterSpacing: "0.18em", color: C.textFaint,
              marginBottom: 12, textTransform: "uppercase" as const,
            }}
          >
            PAIEMENTS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <PayRow label="En attente cash" value={`${cashPending.toFixed(0)}€`} color={C.accent} />
            <PayRow label="Validés (aujourd'hui)" value={`${validatedToday.toFixed(0)}€`} color={C.green} />
            <PayRow
              label="Erreurs de paiement"
              value={String(paymentErrors)}
              color={paymentErrors > 0 ? C.red : C.textFaint}
            />
          </div>

          {/* Commissions plateforme */}
          <div
            style={{
              marginTop: 14, paddingTop: 14,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: "0.6rem", fontWeight: 700,
                letterSpacing: "0.18em", color: C.purple,
                marginBottom: 8, textTransform: "uppercase" as const,
              }}
            >
              COMMISSIONS YASSALA
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <PayRow label="Total cumulé" value={`${totalCommissions.toFixed(2)}€`} color={C.purple} />
              <PayRow label="Aujourd'hui" value={`${commissionsToday.toFixed(2)}€`} color={C.purple} />
              <div
                style={{
                  padding: "5px 10px",
                  background: "rgba(139,92,246,0.06)",
                  border: "1px solid rgba(139,92,246,0.18)",
                  borderRadius: 7,
                  fontSize: "0.67rem", color: C.textFaint,
                }}
              >
                +0,50€ par livraison · {platformCommissions.length} livraison{platformCommissions.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <a
            href="/admin/payouts"
            style={{
              display: "block", marginTop: 12, padding: "8px",
              background: "rgba(249,115,22,0.12)", border: `1px solid rgba(249,115,22,0.28)`,
              color: C.accent, borderRadius: 8, textAlign: "center" as const,
              fontSize: "0.74rem", fontWeight: 600, textDecoration: "none",
              letterSpacing: "0.04em",
            }}
          >
            Voir les payouts →
          </a>
        </div>
      </aside>

      {/* ════════════════════════════════════════════
          ── OVERLAYS & MODALS ──
          ════════════════════════════════════════════ */}

      {/* ── DRIVER DETAIL POPUP ── */}
      {selectedDriver && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.65)", zIndex: 500,
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedDriver(null); }}
        >
          <div
            style={{
              background: "#12131f", border: `1px solid ${C.cardBorder}`,
              borderRadius: 14, padding: 24, width: 420,
              maxHeight: "80vh", overflowY: "auto",
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 46, height: 46, borderRadius: "50%",
                    background: "rgba(139,92,246,0.2)",
                    border: `2px solid rgba(139,92,246,0.45)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, color: C.purple, fontSize: "1.1rem",
                    boxShadow: `0 0 16px rgba(139,92,246,0.3)`,
                  }}
                >
                  {selectedDriver.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>{selectedDriver.name}</div>
                  {selectedDriver.zone && (
                    <div style={{ fontSize: "0.7rem", color: C.textMuted }}>Zone: {selectedDriver.zone}</div>
                  )}
                  {selectedDriver.phone && (
                    <div style={{ fontSize: "0.68rem", color: C.textFaint }}>📞 {selectedDriver.phone}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                style={{ border: "none", background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>

            {/* Status row */}
            {(() => {
              const st = driverStatusInfo(selectedDriver);
              return (
                <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                  <div
                    style={{
                      flex: 1, padding: "10px",
                      background: st.color + "12", border: `1px solid ${st.color}28`,
                      borderRadius: 8, textAlign: "center" as const,
                    }}
                  >
                    <div style={{ fontSize: "0.61rem", color: C.textMuted, fontWeight: 600, letterSpacing: "0.1em" }}>STATUT</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: st.color, marginTop: 4 }}>{st.text}</div>
                    {selectedDriver.minutesAgo != null && (
                      <div style={{ fontSize: "0.61rem", color: C.textFaint, marginTop: 2 }}>vu il y a {selectedDriver.minutesAgo} min</div>
                    )}
                  </div>
                  {selectedDriver.phone && (
                    <a
                      href={`tel:${selectedDriver.phone}`}
                      style={{
                        flex: 1, padding: "10px",
                        background: "rgba(34,197,94,0.1)", border: `1px solid rgba(34,197,94,0.25)`,
                        borderRadius: 8, textAlign: "center" as const, color: C.green,
                        textDecoration: "none", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: 5,
                        fontSize: "0.8rem", fontWeight: 600,
                      }}
                    >
                      📞 Appeler
                    </a>
                  )}
                </div>
              );
            })()}

            {/* Assigned orders */}
            <div
              style={{
                fontSize: "0.61rem", fontWeight: 700, letterSpacing: "0.14em",
                color: C.textFaint, marginBottom: 10, textTransform: "uppercase" as const,
              }}
            >
              Commandes assignées ({driverAssignedOrders.length})
            </div>
            {driverAssignedOrders.length === 0 && (
              <div style={{ fontSize: "0.8rem", color: C.textFaint, padding: "16px 0", textAlign: "center" as const }}>
                Aucune commande assignée
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {driverAssignedOrders.map((o) => {
                const si = STATUS_BADGE[o.status] ?? { label: o.status, color: C.textMuted, bg: C.card };
                return (
                  <div
                    key={o.id}
                    style={{
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
                      borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.81rem", color: "#fff" }}>
                        #{o.orderNumber ?? o.id.slice(-4).toUpperCase()} — {o.name || "Client"}
                      </div>
                      <div style={{ fontSize: "0.66rem", color: C.textMuted, marginTop: 2 }}>
                        {o.address?.split(",")[0] || "—"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontWeight: 700, fontSize: "0.87rem", color: "#fff" }}>
                        {Number(o.total).toFixed(0)}€
                      </div>
                      <span style={{ fontSize: "0.62rem", fontWeight: 700, color: si.color }}>{si.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN DRIVER MODAL ── */}
      {assignTargetOrder && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.65)", zIndex: 500,
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setAssignTargetOrder(null); }}
        >
          <div
            style={{
              background: "#12131f", border: `1px solid ${C.cardBorder}`,
              borderRadius: 14, padding: 24, width: 400,
              boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>Assigner un livreur</div>
                <div style={{ fontSize: "0.7rem", color: C.textMuted, marginTop: 4 }}>
                  Commande #{assignTargetOrder.orderNumber ?? assignTargetOrder.id.slice(-4).toUpperCase()}
                  {" · "}{assignTargetOrder.name || "Client"}
                  {" · "}<span style={{ color: C.accent, fontWeight: 700 }}>{Number(assignTargetOrder.total).toFixed(0)}€</span>
                </div>
                {(assignTargetOrder.zone || assignTargetOrder.address) && (
                  <div style={{ fontSize: "0.67rem", color: C.textFaint, marginTop: 2 }}>
                    📍 {assignTargetOrder.zone || extractZone(assignTargetOrder.address)}
                  </div>
                )}
              </div>
              <button
                onClick={() => setAssignTargetOrder(null)}
                style={{ border: "none", background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em",
                color: C.textFaint, marginBottom: 10, textTransform: "uppercase" as const,
              }}
            >
              Livreurs disponibles ({availableDrivers.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {availableDrivers.length === 0 && (
                <div
                  style={{
                    fontSize: "0.82rem", color: C.textFaint,
                    padding: "20px", textAlign: "center" as const,
                    border: `1px dashed ${C.border}`, borderRadius: 8,
                  }}
                >
                  Aucun livreur disponible actuellement
                </div>
              )}
              {availableDrivers.map((d) => {
                const st = driverStatusInfo(d);
                return (
                  <button
                    key={d.uid}
                    onClick={() => assignDriverToOrder(assignTargetOrder.id, d.uid)}
                    disabled={assigningOrderId === assignTargetOrder.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "11px 13px", borderRadius: 9,
                      border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)",
                      cursor: "pointer", transition: "all 0.12s", width: "100%",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = C.blue + "60";
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(59,130,246,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
                      (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 34, height: 34, borderRadius: "50%",
                          background: "rgba(59,130,246,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: C.blue, fontWeight: 700, fontSize: "0.85rem",
                        }}
                      >
                        {d.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.83rem", color: "#fff" }}>{d.name}</div>
                        {d.zone && <div style={{ fontSize: "0.65rem", color: C.textMuted }}>{d.zone}</div>}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "0.63rem", fontWeight: 700,
                        color: st.color, background: st.color + "18",
                        padding: "3px 7px", borderRadius: 99,
                        border: `1px solid ${st.color}30`,
                      }}
                    >
                      {st.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── NEW ORDER MODAL ── */}
      {showNewOrderModal && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.7)", zIndex: 500,
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewOrderModal(false); }}
        >
          <div
            style={{
              background: "#12131f", border: `1px solid ${C.cardBorder}`,
              borderRadius: 14, padding: 26, width: 420,
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: "0.97rem", color: "#fff" }}>Nouvelle commande</div>
              <button
                onClick={() => setShowNewOrderModal(false)}
                style={{ border: "none", background: "transparent", fontSize: "1.2rem", cursor: "pointer", color: C.textMuted }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ModalField label="Nom client" placeholder="Ex: Jean Dupont"
                value={newOrderForm.name} onChange={(v) => setNewOrderForm((f) => ({ ...f, name: v }))} />
              <ModalField label="Téléphone" placeholder="Ex: +594 6XX XXX XXX"
                value={newOrderForm.phone} onChange={(v) => setNewOrderForm((f) => ({ ...f, phone: v }))} />
              <ModalField label="Adresse livraison" placeholder="Ex: 12 rue des fleurs, Cayenne"
                value={newOrderForm.address} onChange={(v) => setNewOrderForm((f) => ({ ...f, address: v }))} />
              <ModalField label="Articles commandés *" placeholder="Ex: 2 pizzas, 1 coca"
                value={newOrderForm.items} onChange={(v) => setNewOrderForm((f) => ({ ...f, items: v }))} />
              <ModalField label="Montant total (€) *" placeholder="Ex: 25"
                value={newOrderForm.total} onChange={(v) => setNewOrderForm((f) => ({ ...f, total: v }))} type="number" />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox" id="paidOnline"
                  checked={newOrderForm.paidOnline}
                  onChange={(e) => setNewOrderForm((f) => ({ ...f, paidOnline: e.target.checked }))}
                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: C.accent }}
                />
                <label htmlFor="paidOnline" style={{ fontSize: "0.83rem", color: C.text, cursor: "pointer" }}>
                  Payé en ligne
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
              <button
                onClick={() => setShowNewOrderModal(false)}
                style={{
                  flex: 1, padding: "9px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.textMuted, fontWeight: 600, fontSize: "0.83rem", cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                onClick={saveNewOrder}
                disabled={savingOrder || !newOrderForm.items || !newOrderForm.total}
                style={{
                  flex: 2, padding: "9px", borderRadius: 8, border: "none",
                  background: savingOrder || !newOrderForm.items || !newOrderForm.total
                    ? "#374151" : C.accent,
                  color: "#fff", fontWeight: 700, fontSize: "0.83rem",
                  cursor: savingOrder || !newOrderForm.items || !newOrderForm.total ? "default" : "pointer",
                }}
              >
                {savingOrder ? "Enregistrement…" : "Créer la commande"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD DRIVER MODAL ── */}
      {showAddDriverModal && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.7)", zIndex: 500,
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddDriverModal(false); }}
        >
          <div
            style={{
              background: "#12131f", border: `1px solid ${C.cardBorder}`,
              borderRadius: 14, padding: 26, width: 380,
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: "0.97rem", color: "#fff" }}>Ajouter un livreur</div>
              <button
                onClick={() => setShowAddDriverModal(false)}
                style={{ border: "none", background: "transparent", fontSize: "1.2rem", cursor: "pointer", color: C.textMuted }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <ModalField label="Nom complet *" placeholder="Ex: Mohamed Ali"
                value={newDriverForm.name} onChange={(v) => setNewDriverForm((f) => ({ ...f, name: v }))} />
              <ModalField label="Téléphone" placeholder="Ex: +594 6XX XXX XXX"
                value={newDriverForm.phone} onChange={(v) => setNewDriverForm((f) => ({ ...f, phone: v }))} />
              <ModalField label="Zone / Secteur" placeholder="Ex: Cayenne Centre"
                value={newDriverForm.zone} onChange={(v) => setNewDriverForm((f) => ({ ...f, zone: v }))} />
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
              <button
                onClick={() => setShowAddDriverModal(false)}
                style={{
                  flex: 1, padding: "9px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.textMuted, fontWeight: 600, fontSize: "0.83rem", cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                onClick={saveNewDriver}
                disabled={savingDriver || !newDriverForm.name}
                style={{
                  flex: 2, padding: "9px", borderRadius: 8, border: "none",
                  background: savingDriver || !newDriverForm.name ? "#374151" : C.purple,
                  color: "#fff", fontWeight: 700, fontSize: "0.83rem",
                  cursor: savingDriver || !newDriverForm.name ? "default" : "pointer",
                  boxShadow: !savingDriver && newDriverForm.name ? `0 4px 16px rgba(139,92,246,0.35)` : "none",
                }}
              >
                {savingDriver ? "Enregistrement…" : "Ajouter le livreur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SMALL COMPONENTS ──

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: string; label: string; value: number; sub: string; color: string;
}) {
  return (
    <div
      style={{
        background: `${color}0d`, border: `1px solid ${color}25`,
        borderRadius: 12, padding: "15px 16px",
        display: "flex", alignItems: "center", gap: 13,
      }}
    >
      <div
        style={{
          width: 42, height: 42, borderRadius: 10,
          background: `${color}18`, border: `1px solid ${color}28`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.2rem", flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em",
            color: "#94a3b8", textTransform: "uppercase" as const,
          }}
        >
          {label}
        </div>
        <div style={{ fontWeight: 800, fontSize: "1.75rem", color, lineHeight: 1, marginTop: 3 }}>
          {value}
        </div>
        <div style={{ fontSize: "0.62rem", color: "#475569", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function PayBadge({ isPaid }: { isPaid: boolean }) {
  return (
    <span
      style={{
        display: "inline-block", padding: "3px 8px", borderRadius: 99,
        fontSize: "0.61rem", fontWeight: 700, letterSpacing: "0.06em",
        background: isPaid ? "rgba(34,197,94,0.15)" : "rgba(249,115,22,0.15)",
        color: isPaid ? "#22c55e" : "#f97316",
        border: `1px solid ${isPaid ? "rgba(34,197,94,0.3)" : "rgba(249,115,22,0.3)"}`,
      }}
    >
      {isPaid ? "EN LIGNE" : "CASH"}
    </span>
  );
}

function ActionBtn({
  label, color, onClick,
}: {
  label: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 6,
        border: `1px solid ${color}30`, background: `${color}12`,
        color, fontSize: "0.67rem", fontWeight: 700,
        cursor: "pointer", letterSpacing: "0.04em",
        whiteSpace: "nowrap" as const, transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

function PagBtn({
  label, onClick, active = false, disabled = false,
}: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 26, borderRadius: 6,
        border: active ? "none" : "1px solid rgba(255,255,255,0.1)",
        background: active ? "rgba(249,115,22,0.9)" : "rgba(255,255,255,0.04)",
        color: active ? "#fff" : disabled ? "#374151" : "#94a3b8",
        fontSize: "0.75rem", fontWeight: active ? 700 : 400,
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}

function PayRow({
  label, value, color,
}: {
  label: string; value: string; color: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 10px",
        background: "rgba(255,255,255,0.04)", borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: "0.85rem", fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function ModalField({
  label, placeholder, value, onChange, type = "text",
}: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: "block", fontSize: "0.71rem",
          fontWeight: 600, color: "#94a3b8", marginBottom: 4,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 11px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          fontSize: "0.83rem", color: "#fff", outline: "none",
          boxSizing: "border-box" as const,
          background: "rgba(255,255,255,0.06)",
        }}
      />
    </div>
  );
}
