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

type NewOrderForm = {
  name: string;
  phone: string;
  address: string;
  items: string;
  total: string;
  paidOnline: boolean;
};

// ── DESIGN TOKENS ──
const C = {
  bg: "rgba(10,10,20,0.82)",
  sidebar: "rgba(8,8,16,0.88)",
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.09)",
  tableBg: "rgba(255,255,255,0.04)",
  tableRow: "rgba(255,255,255,0.025)",
  tableHead: "rgba(255,255,255,0.06)",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textFaint: "#475569",
  accent: "#f97316",
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  border: "rgba(255,255,255,0.08)",
  navActive: "rgba(249,115,22,0.12)",
  glass: "blur(16px)",
};

export default function AdminDashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState<NewOrderForm>({
    name: "", phone: "", address: "", items: "", total: "", paidOnline: false,
  });
  const [savingOrder, setSavingOrder] = useState(false);

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

    return () => { unsubOrders(); unsubDrivers(); unsubDeliveries(); };
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

  // ── New orders table ──
  const newOrders = orders.filter((o) => ["nouveau", "en_cours", "confirmed"].includes(o.status));
  const totalPages = Math.max(1, Math.ceil(newOrders.length / ITEMS_PER_PAGE));
  const pagedOrders = newOrders.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const cashPendingOrders = newOrders.filter((o) => !o.paidOnline).reduce((s, o) => s + Number(o.total), 0);

  // ── Driver status label ──
  const driverLabel = (d: Driver) => {
    if (!d.isOnline) return { text: "HORS LIGNE", color: C.textFaint };
    if (d.status === "busy") {
      const mins = d.minutesAgo != null ? `${d.minutesAgo}min` : "";
      return { text: `En livraison${mins ? " " + mins : ""}`, color: C.blue };
    }
    return { text: "LIBRE", color: C.green };
  };

  // ── Update order status ──
  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
  };

  // ── Save new manual order ──
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
      {/* ── BACKGROUND IMAGE ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/IMG_0964.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.35) saturate(0.7)",
          zIndex: 0,
        }}
      />
      {/* Dark overlay for readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(5,5,15,0.55) 0%, rgba(10,10,25,0.45) 100%)",
          zIndex: 1,
        }}
      />

      {/* ── SIDEBAR ── */}
      <aside
        style={{
          width: 220,
          background: C.sidebar,
          backdropFilter: C.glass,
          WebkitBackdropFilter: C.glass,
          color: C.text,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
          zIndex: 10,
          borderRight: `1px solid ${C.border}`,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "24px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "0.08em", color: "#fff" }}>
            YASSALA
          </div>
          <div style={{ fontSize: "0.62rem", color: C.textFaint, letterSpacing: "0.16em", marginTop: 2 }}>
            ADMIN PANEL
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 0" }}>
          {NAV.map((group) => (
            <div key={group.section} style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  color: C.textFaint,
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
                      background: isActive ? C.navActive : "transparent",
                      border: "none",
                      borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent",
                      color: isActive ? "#fff" : C.textMuted,
                      fontSize: "0.84rem",
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
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
          <a
            href="/admin"
            style={{ display: "block", fontSize: "0.73rem", color: C.textFaint, textDecoration: "none", letterSpacing: "0.05em" }}
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
            padding: "13px 28px",
            background: "rgba(8,8,16,0.75)",
            backdropFilter: C.glass,
            WebkitBackdropFilter: C.glass,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", letterSpacing: "0.08em" }}>
            YASSALA ADMIN
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: "0.77rem", color: C.textMuted }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <button
              style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.card, backdropFilter: C.glass, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem",
              }}
            >
              🔔
            </button>
            <button
              onClick={() => setShowNewOrderModal(true)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none",
                background: C.accent, color: "#fff", fontWeight: 700,
                fontSize: "0.77rem", cursor: "pointer", letterSpacing: "0.04em", whiteSpace: "nowrap",
              }}
            >
              + Nouvelle commande
            </button>
            <div
              style={{
                width: 33, height: 33, borderRadius: "50%", background: "rgba(249,115,22,0.2)",
                border: `1px solid rgba(249,115,22,0.4)`, color: C.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: "0.72rem", flexShrink: 0, cursor: "pointer",
              }}
            >
              CB
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "22px 24px" }}>
          {/* ── SECTION HEADING ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", letterSpacing: "0.1em" }}>
              NOUVELLES COMMANDES
            </div>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              title="Rafraîchir"
              style={{
                width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.card, backdropFilter: C.glass, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1rem", color: C.textMuted,
              }}
            >
              ↻
            </button>
          </div>

          {/* ── STAT CARDS ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            <StatCard label="En attente" value={pending.length} color={C.accent} />
            <StatCard label="En livraison" value={inDelivery.length} color={C.blue} />
            <StatCard label="Livreurs actifs" value={activeDrivers.length} color={C.green} />
          </div>

          {/* ── ORDERS TABLE ── */}
          <div
            style={{
              background: C.tableBg,
              backdropFilter: C.glass,
              WebkitBackdropFilter: C.glass,
              borderRadius: 12,
              border: `1px solid ${C.cardBorder}`,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.tableHead }}>
                  {["N°", "CLIENT", "MONTANT", "PAIEMENT", "ACTIONS"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left" as const,
                        fontSize: "0.68rem",
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
                    <td colSpan={5} style={{ padding: "32px", textAlign: "center" as const, color: C.textFaint, fontSize: "0.85rem" }}>
                      Aucune nouvelle commande
                    </td>
                  </tr>
                )}
                {pagedOrders.map((order, i) => (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: i % 2 === 0 ? "transparent" : C.tableRow,
                      transition: "background 0.1s",
                    }}
                  >
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#fff" }}>
                        #{order.orderNumber ?? order.id.slice(-4).toUpperCase()}
                      </div>
                      {order.items && (
                        <div style={{ fontSize: "0.68rem", color: C.textMuted, marginTop: 2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {order.items}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ fontSize: "0.84rem", fontWeight: 500, color: C.text }}>
                        {order.name || order.phone || "—"}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: C.textMuted, marginTop: 2 }}>
                        {order.address?.split(",")[0] ?? "—"}
                      </div>
                    </td>
                    <td style={{ padding: "11px 16px", fontWeight: 700, fontSize: "0.9rem", color: "#fff" }}>
                      {Number(order.total).toFixed(0)}€
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 9px",
                          borderRadius: 99,
                          fontSize: "0.67rem",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          background: order.paidOnline ? "rgba(34,197,94,0.15)" : "rgba(249,115,22,0.15)",
                          color: order.paidOnline ? C.green : C.accent,
                          border: `1px solid ${order.paidOnline ? "rgba(34,197,94,0.3)" : "rgba(249,115,22,0.3)"}`,
                        }}
                      >
                        {order.paidOnline ? "PAYÉ" : "CASH"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {order.status === "nouveau" && (
                          <ActionBtn label="Assigner" color={C.blue} onClick={() => updateStatus(order.id, "en_cours")} />
                        )}
                        {order.status === "en_cours" && (
                          <ActionBtn label="Appeler" color={C.green} onClick={() => { if (order.phone) window.open(`tel:${order.phone}`); }} />
                        )}
                        <ActionBtn
                          label="Annuler"
                          color={C.red}
                          onClick={() => { if (confirm("Annuler cette commande ?")) updateStatus(order.id, "annule"); }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── FOOTER ── */}
            <div
              style={{
                padding: "11px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: `1px solid ${C.border}`,
                background: C.tableHead,
              }}
            >
              <div style={{ fontSize: "0.8rem", color: C.text }}>
                <span style={{ fontWeight: 600 }}>Total CASH en attente</span>
                <span style={{ marginLeft: 10, fontWeight: 800, fontSize: "1rem", color: C.accent }}>
                  {cashPendingOrders.toFixed(0)}€
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <PagBtn label="‹" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} />
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const n = i + 1;
                    return (
                      <PagBtn key={n} label={String(n)} onClick={() => setPage(n)} active={page === n} />
                    );
                  })}
                  <PagBtn label="›" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
                </div>
                <a
                  href="/admin"
                  style={{ fontSize: "0.77rem", color: C.blue, textDecoration: "none", fontWeight: 500 }}
                >
                  Voir toutes →
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── MODAL NOUVELLE COMMANDE ── */}
      {showNewOrderModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewOrderModal(false); }}
        >
          <div
            style={{
              background: "#12131f",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 14,
              padding: 28,
              width: 440,
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>Nouvelle commande</div>
              <button
                onClick={() => setShowNewOrderModal(false)}
                style={{ border: "none", background: "transparent", fontSize: "1.2rem", cursor: "pointer", color: C.textMuted }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="paidOnline"
                  checked={newOrderForm.paidOnline}
                  onChange={(e) => setNewOrderForm((f) => ({ ...f, paidOnline: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.accent }}
                />
                <label htmlFor="paidOnline" style={{ fontSize: "0.85rem", color: C.text, cursor: "pointer" }}>
                  Payé en ligne
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                onClick={() => setShowNewOrderModal(false)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`,
                  background: "transparent", color: C.textMuted, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                Annuler
              </button>
              <button
                onClick={saveNewOrder}
                disabled={savingOrder || !newOrderForm.items || !newOrderForm.total}
                style={{
                  flex: 2, padding: "10px", borderRadius: 8, border: "none",
                  background: savingOrder || !newOrderForm.items || !newOrderForm.total ? "#374151" : C.accent,
                  color: "#fff", fontWeight: 700, fontSize: "0.85rem",
                  cursor: savingOrder || !newOrderForm.items || !newOrderForm.total ? "default" : "pointer",
                }}
              >
                {savingOrder ? "Enregistrement..." : "Créer la commande"}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ padding: "20px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div
            style={{
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: C.textFaint,
              marginBottom: 13,
              textTransform: "uppercase" as const,
            }}
          >
            LIVREURS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {drivers.length === 0 && (
              <div style={{ fontSize: "0.8rem", color: C.textFaint }}>Aucun livreur enregistré</div>
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
                    padding: "9px 11px",
                    background: C.card,
                    borderRadius: 8,
                    border: `1px solid ${C.cardBorder}`,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.83rem", color: "#fff" }}>
                      {d.name}
                    </div>
                    {d.zone && (
                      <div style={{ fontSize: "0.67rem", color: C.textMuted, marginTop: 1 }}>
                        {d.zone}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.63rem",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: st.color,
                      background: st.color + "18",
                      padding: "3px 7px",
                      borderRadius: 99,
                      whiteSpace: "nowrap" as const,
                      border: `1px solid ${st.color}30`,
                    }}
                  >
                    {st.text}
                  </span>
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
              marginTop: 10,
              padding: "8px",
              borderRadius: 8,
              border: `1px dashed ${C.border}`,
              fontSize: "0.77rem",
              color: C.textMuted,
              textDecoration: "none",
              fontWeight: 500,
              transition: "border-color 0.15s",
            }}
          >
            + Ajouter livreur
          </a>
        </div>

        {/* PAIEMENTS */}
        <div style={{ padding: "20px 16px" }}>
          <div
            style={{
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              color: C.textFaint,
              marginBottom: 13,
              textTransform: "uppercase" as const,
            }}
          >
            PAIEMENTS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <PayRow label="En attente cash" value={`${cashPending.toFixed(0)}€`} color={C.accent} />
            <PayRow label="Validés (aujourd'hui)" value={`${validatedToday.toFixed(0)}€`} color={C.green} />
            <PayRow
              label="Erreurs de paiement"
              value={String(paymentErrors)}
              color={paymentErrors > 0 ? C.red : C.textFaint}
            />
          </div>

          <a
            href="/admin/payouts"
            style={{
              display: "block",
              marginTop: 14,
              padding: "9px",
              background: "rgba(249,115,22,0.15)",
              border: `1px solid rgba(249,115,22,0.3)`,
              color: C.accent,
              borderRadius: 8,
              textAlign: "center" as const,
              fontSize: "0.77rem",
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: `${color}0f`,
        border: `1px solid ${color}28`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRadius: 10,
        padding: "18px 20px",
      }}
    >
      <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", color: "#94a3b8", textTransform: "uppercase" as const }}>
        {label}
      </div>
      <div style={{ fontWeight: 800, fontSize: "2rem", color, marginTop: 6, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 11px",
        borderRadius: 6,
        border: `1px solid ${color}30`,
        background: `${color}12`,
        color,
        fontSize: "0.7rem",
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
  label, onClick, active = false, disabled = false,
}: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 27, height: 27, borderRadius: 6,
        border: active ? "none" : "1px solid rgba(255,255,255,0.1)",
        background: active ? "rgba(249,115,22,0.9)" : "rgba(255,255,255,0.04)",
        color: active ? "#fff" : disabled ? "#374151" : "#94a3b8",
        fontSize: "0.77rem", fontWeight: active ? 700 : 400,
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
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
        padding: "9px 11px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <span style={{ fontSize: "0.77rem", color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: "0.87rem", fontWeight: 700, color }}>{value}</span>
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
      <label style={{ display: "block", fontSize: "0.73rem", fontWeight: 600, color: "#94a3b8", marginBottom: 5 }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)", fontSize: "0.85rem", color: "#fff",
          outline: "none", boxSizing: "border-box" as const,
          background: "rgba(255,255,255,0.06)",
        }}
      />
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  nouveau: { label: "Nouveau", color: "#f97316", bg: "rgba(249,115,22,0.15)" },
  confirmed: { label: "Confirmé", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  en_cours: { label: "En livraison", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  livre: { label: "Livré", color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  annule: { label: "Annulé", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  cancelled: { label: "Annulé", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};
