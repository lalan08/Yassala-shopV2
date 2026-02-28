"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  query,
  orderBy,
  where,
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
};

// ── SOUND ──
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* ignore */ }
}

// ── MODAL NOUVELLE COMMANDE ──
type NewOrderModalProps = {
  onClose: () => void;
  onSave: (data: { name: string; phone: string; address: string; items: string; total: string; paidOnline: boolean }) => void;
};

function NewOrderModal({ onClose, onSave }: NewOrderModalProps) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", items: "", total: "", paidOnline: false });
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "rgba(14,14,28,0.97)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18, padding: "32px 28px", width: 420,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff", letterSpacing: "0.06em", marginBottom: 22 }}>
          NOUVELLE COMMANDE
        </div>
        {[
          { key: "name", label: "Nom client", placeholder: "Ex: Allan" },
          { key: "phone", label: "Téléphone", placeholder: "06 12 34 56 78" },
          { key: "address", label: "Adresse", placeholder: "12 rue de la Paix, Alençon" },
          { key: "items", label: "Articles", placeholder: "2x Burger, 1x Frites" },
          { key: "total", label: "Montant (€)", placeholder: "24" },
        ].map(({ key, label, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 5, textTransform: "uppercase" }}>
              {label}
            </div>
            <input
              value={(form as any)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{
                width: "100%", padding: "9px 13px", borderRadius: 9,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)", color: "#f1f5f9",
                fontSize: "0.85rem", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem", color: "rgba(255,255,255,0.6)" }}>
            <input
              type="checkbox"
              checked={form.paidOnline}
              onChange={(e) => setForm((f) => ({ ...f, paidOnline: e.target.checked }))}
              style={{ accentColor: "#06b6d4", width: 16, height: 16 }}
            />
            Payé en ligne
          </label>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.5)", fontSize: "0.83rem", fontWeight: 600, cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => { onSave(form); onClose(); }}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 10,
              border: "none", background: "#f97316",
              color: "#fff", fontSize: "0.83rem", fontWeight: 700, cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Créer la commande
          </button>
        </div>
      </div>
    </div>
  );
}

const NAV = [
  {
    section: "OPÉRATIONS",
    items: [
      { key: "dashboard", label: "Tableau de bord", icon: "⊞", href: "/admin/dashboard" },
      { key: "commandes", label: "Commandes", icon: "📋", href: "/admin/commandes" },
      { key: "dispatch", label: "Dispatch", icon: "🏍️", href: "/admin?tab=dispatch" },
      { key: "paiements", label: "Paiements", icon: "💳", href: "/admin?tab=payouts" },
    ],
  },
  {
    section: "FINANCE",
    items: [
      { key: "finance-commandes", label: "Commandes", icon: "📊", href: "/admin/analytics" },
      { key: "finance-dispatch", label: "Dispatch", icon: "📈", href: "/admin/payouts" },
    ],
  },
];

const PAGE_SIZE = 8;

export default function CommandesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [page, setPage] = useState(1);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const prevOrderIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // ── Orders listener ──
  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        prevOrderIds.current = new Set(data.map((o) => o.id));
        setOrders(data);
        return;
      }
      const incoming = data.filter((o) => !prevOrderIds.current.has(o.id));
      if (incoming.length > 0) {
        playNotificationSound();
        setNewOrderIds((prev) => new Set([...prev, ...incoming.map((o) => o.id)]));
        setTimeout(() => {
          setNewOrderIds((prev) => {
            const next = new Set(prev);
            incoming.forEach((o) => next.delete(o.id));
            return next;
          });
        }, 8000);
        prevOrderIds.current = new Set(data.map((o) => o.id));
      }
      setOrders(data);
    });
  }, []);

  // ── Drivers listener ──
  useEffect(() => {
    return onSnapshot(collection(db, "drivers"), (snap) => {
      setDrivers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as Driver)));
    });
  }, []);

  const updateStatus = useCallback(async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
  }, []);

  const createOrder = useCallback(async (form: { name: string; phone: string; address: string; items: string; total: string; paidOnline: boolean }) => {
    await addDoc(collection(db, "orders"), {
      name: form.name,
      phone: form.phone,
      address: form.address,
      items: form.items,
      total: parseFloat(form.total) || 0,
      paidOnline: form.paidOnline,
      status: "nouveau",
      fulfillmentType: "delivery",
      createdAt: new Date().toISOString(),
    });
  }, []);

  // ── Filtered: only "nouvelles" for the main table ──
  const newOrders = orders.filter((o) => o.status === "nouveau");
  const enCours = orders.filter((o) => ["en_cours", "confirmed", "delivering"].includes(o.status));
  const totalPages = Math.max(1, Math.ceil(newOrders.length / PAGE_SIZE));
  const pagedOrders = newOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Stats ──
  const activeDrivers = drivers.filter((d) => d.isOnline);
  const deliveringDrivers = drivers.filter((d) => d.currentOrderId);
  const cashPending = newOrders.filter((o) => !o.paidOnline).reduce((s, o) => s + Number(o.total || 0), 0);
  const cashValidated = orders.filter((o) => ["livree", "delivered"].includes(o.status) && !o.paidOnline)
    .reduce((s, o) => s + Number(o.total || 0), 0);

  // ── Driver status helpers ──
  function driverLabel(d: Driver) {
    if (d.currentOrderId) {
      return { text: "En livraison", color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)" };
    }
    if (d.isOnline) {
      return { text: "LIBRE", color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" };
    }
    return { text: "Hors ligne", color: "#475569", bg: "rgba(71,85,105,0.1)", border: "rgba(71,85,105,0.25)" };
  }

  return (
    <div
      style={{
        display: "flex", height: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
        position: "relative", overflow: "hidden",
        background: "#07080f",
      }}
    >
      {/* ── BACKGROUND IMAGE ── */}
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundImage: "url('/IMG_0964.png')",
          backgroundSize: "cover", backgroundPosition: "center",
          filter: "brightness(0.28) saturate(0.5)", zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(5,5,15,0.65) 0%, rgba(10,10,25,0.55) 100%)",
          zIndex: 1,
        }}
      />

      <style>{`
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
          50%       { box-shadow: 0 0 22px 4px rgba(249,115,22,0.35); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .row-new { animation: glowPulse 0.9s ease-in-out 3; }
        .nav-btn:hover { background: rgba(255,255,255,0.06) !important; color: #fff !important; }
        .action-btn:hover { filter: brightness(1.18); transform: scale(1.04); }
        .cancel-btn:hover { background: rgba(239,68,68,0.15) !important; }
        .assign-btn:hover { filter: brightness(1.15); transform: scale(1.03); }
        .driver-card { transition: border-color 0.2s; }
        .driver-card:hover { border-color: rgba(249,115,22,0.3) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      {/* ── LEFT SIDEBAR ── */}
      <aside
        style={{
          width: 210, background: "rgba(8,8,16,0.88)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          color: "#f1f5f9", display: "flex", flexDirection: "column",
          flexShrink: 0, overflowY: "auto", zIndex: 10,
          borderRight: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div style={{ padding: "22px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "0.1em", color: "#fff" }}>YASSALA</div>
          <div style={{ fontSize: "0.58rem", color: "#475569", letterSpacing: "0.18em", marginTop: 2 }}>ADMIN PANEL</div>
        </div>
        <nav style={{ flex: 1, padding: "14px 0" }}>
          {NAV.map((group) => (
            <div key={group.section} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.18em", color: "#475569", padding: "8px 20px 5px", textTransform: "uppercase" as const }}>
                {group.section}
              </div>
              {group.items.map((item) => {
                const isActive = item.key === "commandes";
                return (
                  <button
                    key={item.key}
                    className="nav-btn"
                    onClick={() => router.push(item.href)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 9,
                      padding: "9px 20px",
                      background: isActive ? "rgba(249,115,22,0.1)" : "transparent",
                      border: "none",
                      borderLeft: isActive ? "3px solid #f97316" : "3px solid transparent",
                      color: isActive ? "#fff" : "#94a3b8",
                      fontSize: "0.82rem", fontWeight: isActive ? 600 : 400,
                      cursor: "pointer", textAlign: "left" as const, transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "0.78rem" }}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <a href="/admin" style={{ fontSize: "0.7rem", color: "#475569", textDecoration: "none" }}>← Admin complet</a>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 10 }}>

        {/* ── HEADER ── */}
        <header
          style={{
            padding: "12px 24px",
            background: "rgba(8,8,16,0.82)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#fff", letterSpacing: "0.12em" }}>
              YASSALA ADMIN
            </div>
            <div style={{ fontSize: "0.64rem", color: "#475569", marginTop: 1, letterSpacing: "0.04em" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              {"  ·  "}
              <span style={{ color: "#22c55e" }}>● LIVE</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Bell */}
            <button
              style={{
                position: "relative", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
                padding: "7px 10px", cursor: "pointer", color: "#94a3b8", fontSize: "1rem",
              }}
            >
              🔔
              {newOrderIds.size > 0 && (
                <span style={{
                  position: "absolute", top: 4, right: 4,
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#f97316", border: "2px solid #07080f",
                }} />
              )}
            </button>
            {/* Nouvelle commande */}
            <button
              onClick={() => setShowNewModal(true)}
              style={{
                padding: "8px 18px", borderRadius: 10,
                border: "none", background: "#f97316",
                color: "#fff", fontSize: "0.8rem", fontWeight: 700,
                cursor: "pointer", letterSpacing: "0.05em",
                display: "flex", alignItems: "center", gap: 7,
                transition: "all 0.15s",
              }}
            >
              + Nouvelle commande
            </button>
            {/* Avatar */}
            <div
              style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "linear-gradient(135deg, #f97316, #ea580c)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: "0.8rem", color: "#fff", flexShrink: 0,
              }}
            >
              CB
            </div>
          </div>
        </header>

        {/* ── SCROLLABLE BODY ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* ── STAT CARDS ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            {/* En attente */}
            <div style={{
              background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.22)",
              borderRadius: 16, padding: "16px 20px", backdropFilter: "blur(16px)",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "rgba(249,115,22,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.3rem", flexShrink: 0,
              }}>⏳</div>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" as const, marginBottom: 3 }}>
                  En attente
                </div>
                <div style={{ fontWeight: 900, fontSize: "2rem", color: "#fff", lineHeight: 1 }}>{newOrders.length}</div>
                <div style={{ fontSize: "0.62rem", color: "#475569", marginTop: 2 }}>nouvelles commandes</div>
              </div>
            </div>

            {/* En livraison */}
            <div style={{
              background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 16, padding: "16px 20px", backdropFilter: "blur(16px)",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.3rem", flexShrink: 0,
              }}>🏍️</div>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", color: "#22c55e", textTransform: "uppercase" as const, marginBottom: 3 }}>
                  En livraison
                </div>
                <div style={{ fontWeight: 900, fontSize: "2rem", color: "#fff", lineHeight: 1 }}>{enCours.length}</div>
                <div style={{ fontSize: "0.62rem", color: "#475569", marginTop: 2 }}>en cours de livraison</div>
              </div>
            </div>

            {/* Livreurs actifs */}
            <div style={{
              background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
              borderRadius: 16, padding: "16px 20px", backdropFilter: "blur(16px)",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "rgba(59,130,246,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.3rem", flexShrink: 0,
              }}>👤</div>
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", color: "#3b82f6", textTransform: "uppercase" as const, marginBottom: 3 }}>
                  Livreurs actifs
                </div>
                <div style={{ fontWeight: 900, fontSize: "2rem", color: "#fff", lineHeight: 1 }}>{activeDrivers.length}</div>
                <div style={{ fontSize: "0.62rem", color: "#475569", marginTop: 2 }}>connectés maintenant</div>
              </div>
            </div>
          </div>

          {/* ── TABLE CONTAINER ── */}
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 18, overflow: "hidden", backdropFilter: "blur(16px)",
          }}>
            {/* Table header */}
            <div style={{
              padding: "14px 22px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#fff", letterSpacing: "0.12em" }}>
                NOUVELLES COMMANDES
                {newOrderIds.size > 0 && (
                  <span style={{
                    marginLeft: 10, background: "rgba(249,115,22,0.15)",
                    border: "1px solid rgba(249,115,22,0.4)",
                    color: "#f97316", borderRadius: 8, padding: "2px 9px",
                    fontSize: "0.65rem", fontWeight: 700, animation: "glowPulse 1s infinite",
                  }}>
                    +{newOrderIds.size} nouvelle{newOrderIds.size > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#475569" }}>
                {newOrders.length} commande{newOrders.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "72px 1fr 100px 90px 180px",
              padding: "10px 22px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(255,255,255,0.02)",
            }}>
              {["N°", "CLIENT", "MONTANT", "PAIEMENT", "ACTIONS"].map((h) => (
                <div key={h} style={{ fontSize: "0.6rem", fontWeight: 700, color: "#475569", letterSpacing: "0.14em", textTransform: "uppercase" as const }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {pagedOrders.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "48px 20px", color: "#475569" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: "0.82rem" }}>Aucune nouvelle commande</div>
              </div>
            ) : (
              pagedOrders.map((order, idx) => {
                const isNew = newOrderIds.has(order.id);
                return (
                  <div
                    key={order.id}
                    className={isNew ? "row-new" : ""}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr 100px 90px 180px",
                      padding: "13px 22px",
                      borderBottom: idx < pagedOrders.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      background: isNew ? "rgba(249,115,22,0.04)" : "transparent",
                      alignItems: "center",
                      transition: "background 0.2s",
                    }}
                  >
                    {/* N° */}
                    <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#f97316", letterSpacing: "0.04em" }}>
                      #{String(order.orderNumber || order.id.slice(-3).toUpperCase()).padStart(3, "0")}
                    </div>

                    {/* CLIENT */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#f1f5f9", marginBottom: 3 }}>
                        {order.name || "Client"}
                        {order.phone && (
                          <span style={{ fontWeight: 400, color: "#475569", marginLeft: 8, fontSize: "0.76rem" }}>
                            {order.phone}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: "0.73rem", color: "#64748b",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                      }}>
                        {order.items}
                        {order.address && (
                          <span style={{ color: "#475569" }}> · 📍 {order.address}</span>
                        )}
                      </div>
                    </div>

                    {/* MONTANT */}
                    <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#fff" }}>
                      {Number(order.total || 0).toLocaleString("fr-FR")} €
                    </div>

                    {/* PAIEMENT */}
                    <div>
                      <span style={{
                        background: order.paidOnline ? "rgba(6,182,212,0.12)" : "rgba(249,115,22,0.12)",
                        border: `1px solid ${order.paidOnline ? "rgba(6,182,212,0.35)" : "rgba(249,115,22,0.35)"}`,
                        color: order.paidOnline ? "#06b6d4" : "#f97316",
                        borderRadius: 7, padding: "4px 10px",
                        fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em",
                      }}>
                        {order.paidOnline ? "PAYÉ" : "CASH"}
                      </span>
                    </div>

                    {/* ACTIONS */}
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <button
                        className="assign-btn"
                        onClick={() => updateStatus(order.id, "en_cours")}
                        style={{
                          padding: "6px 14px", borderRadius: 8,
                          border: "none", background: "#f97316",
                          color: "#fff", fontSize: "0.74rem", fontWeight: 700,
                          cursor: "pointer", letterSpacing: "0.04em",
                          transition: "all 0.15s", whiteSpace: "nowrap" as const,
                        }}
                      >
                        Assigner
                      </button>
                      {order.phone && (
                        <a
                          href={`tel:${order.phone}`}
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: "rgba(34,197,94,0.1)",
                            border: "1px solid rgba(34,197,94,0.25)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.85rem", textDecoration: "none", flexShrink: 0,
                          }}
                        >
                          📞
                        </a>
                      )}
                      <button
                        className="cancel-btn"
                        onClick={() => updateStatus(order.id, "annulee")}
                        style={{
                          padding: "6px 10px", borderRadius: 8,
                          border: "1px solid rgba(239,68,68,0.25)",
                          background: "rgba(239,68,68,0.07)",
                          color: "#f87171", fontSize: "0.72rem", fontWeight: 600,
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* ── TABLE FOOTER ── */}
            <div style={{
              padding: "12px 22px",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              background: "rgba(255,255,255,0.02)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ fontSize: "0.76rem", color: "#94a3b8", fontWeight: 600 }}>
                Total CASH en attente :{" "}
                <span style={{ color: "#f97316", fontWeight: 800 }}>
                  {cashPending.toLocaleString("fr-FR")} €
                </span>
              </div>
              {/* Pagination */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: "5px 12px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: page === 1 ? "transparent" : "rgba(255,255,255,0.05)",
                    color: page === 1 ? "#475569" : "#94a3b8",
                    fontSize: "0.74rem", fontWeight: 600, cursor: page === 1 ? "default" : "pointer",
                  }}
                >
                  Précédent
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      border: p === page ? "1px solid rgba(249,115,22,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      background: p === page ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)",
                      color: p === page ? "#f97316" : "#64748b",
                      fontSize: "0.78rem", fontWeight: p === page ? 700 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: "5px 12px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: page === totalPages ? "transparent" : "rgba(255,255,255,0.05)",
                    color: page === totalPages ? "#475569" : "#94a3b8",
                    fontSize: "0.74rem", fontWeight: 600,
                    cursor: page === totalPages ? "default" : "pointer",
                  }}
                >
                  Suivant
                </button>
              </div>
            </div>
          </div>

          <div style={{ height: 28 }} />
        </div>
      </main>

      {/* ── RIGHT PANEL ── */}
      <aside
        style={{
          width: 268, background: "rgba(8,8,16,0.88)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
          display: "flex", flexDirection: "column", flexShrink: 0,
          overflowY: "auto", zIndex: 10, padding: "20px 16px",
          gap: 24,
        }}
      >
        {/* ── LIVREURS ── */}
        <div>
          <div style={{
            fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.18em",
            color: "#475569", textTransform: "uppercase" as const, marginBottom: 12,
          }}>
            Livreurs
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {drivers.length === 0 ? (
              <div style={{ fontSize: "0.76rem", color: "#475569", textAlign: "center" as const, padding: "16px 0" }}>
                Aucun livreur trouvé
              </div>
            ) : (
              drivers.map((driver) => {
                const lbl = driverLabel(driver);
                return (
                  <div
                    key={driver.uid}
                    className="driver-card"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 12, padding: "11px 13px",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "#f1f5f9", marginBottom: 2 }}>
                        {driver.name}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                        {driver.zone || "—"}
                        {driver.currentOrderId && (
                          <span style={{ color: "#f97316" }}> · En livraison</span>
                        )}
                      </div>
                    </div>
                    <span style={{
                      background: lbl.bg, border: `1px solid ${lbl.border}`,
                      color: lbl.color, borderRadius: 8,
                      padding: "4px 10px", fontSize: "0.62rem", fontWeight: 700,
                      letterSpacing: "0.06em", flexShrink: 0,
                    }}>
                      {lbl.text}
                    </span>
                  </div>
                );
              })
            )}

            {/* Ajouter livreur */}
            <button
              onClick={() => router.push("/admin?tab=drivers")}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 12,
                border: "1px dashed rgba(255,255,255,0.1)",
                background: "transparent", color: "#475569",
                fontSize: "0.76rem", fontWeight: 600, cursor: "pointer",
                letterSpacing: "0.04em", transition: "all 0.15s",
              }}
            >
              + Ajouter livreur
            </button>
          </div>
        </div>

        {/* ── PAIEMENTS ── */}
        <div>
          <div style={{
            fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.18em",
            color: "#475569", textTransform: "uppercase" as const, marginBottom: 12,
          }}>
            Paiements
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "En attente cash", value: `${cashPending.toLocaleString("fr-FR")} €`, color: "#f97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.2)" },
              { label: "Validés (aujourd'hui)", value: `${cashValidated.toLocaleString("fr-FR")} €`, color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)" },
              { label: "Erreurs de paiement", value: "0 €", color: "#ef4444", bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.18)" },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} style={{
                background: bg, border: `1px solid ${border}`,
                borderRadius: 12, padding: "11px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>{label}</div>
                <div style={{ fontWeight: 800, fontSize: "0.9rem", color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── MODAL ── */}
      {showNewModal && (
        <NewOrderModal
          onClose={() => setShowNewModal(false)}
          onSave={createOrder}
        />
      )}
    </div>
  );
}
