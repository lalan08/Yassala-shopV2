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
  lastSeen?: unknown;
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

// ── TIME AGO ──
function timeAgo(isoString: string): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)}j`;
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
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "rgba(14,14,28,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "32px 28px", width: 420, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff", letterSpacing: "0.06em", marginBottom: 22 }}>NOUVELLE COMMANDE</div>
        {[
          { key: "name", label: "Nom client", placeholder: "Ex: Allan" },
          { key: "phone", label: "Téléphone", placeholder: "06 12 34 56 78" },
          { key: "address", label: "Adresse", placeholder: "12 rue de la Paix" },
          { key: "items", label: "Articles", placeholder: "2x Burger, 1x Frites" },
          { key: "total", label: "Montant (€)", placeholder: "24" },
        ].map(({ key, label, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", marginBottom: 5, textTransform: "uppercase" }}>{label}</div>
            <input
              value={(form as Record<string, string>)[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{ width: "100%", padding: "9px 13px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#f1f5f9", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
            />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem", color: "rgba(255,255,255,0.6)" }}>
            <input type="checkbox" checked={form.paidOnline} onChange={(e) => setForm((f) => ({ ...f, paidOnline: e.target.checked }))} style={{ accentColor: "#06b6d4", width: 16, height: 16 }} />
            Payé en ligne
          </label>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", fontSize: "0.83rem", fontWeight: 600, cursor: "pointer" }}>Annuler</button>
          <button onClick={() => { onSave(form); onClose(); }} style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: "#f97316", color: "#fff", fontSize: "0.83rem", fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}>Créer la commande</button>
        </div>
      </div>
    </div>
  );
}

// ── NAV ──
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

// ── STAT CARD ──
function StatCard({ icon, label, value, color, sub }: { icon: string; label: string; value: string | number; color: string; sub: string }) {
  return (
    <div style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 14, padding: "14px 18px", backdropFilter: "blur(16px)", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.14em", color, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
        <div style={{ fontWeight: 900, fontSize: "1.7rem", color: "#fff", lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: "0.6rem", color: "#475569", marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

// ── ORDER CARD ──
function OrderCard({
  order,
  isNew,
  actions,
  statusBadge,
}: {
  order: Order;
  isNew?: boolean;
  actions?: React.ReactNode;
  statusBadge?: React.ReactNode;
}) {
  return (
    <div
      className={isNew ? "order-card row-new" : "order-card"}
      style={{
        background: isNew ? "rgba(249,115,22,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isNew ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 9,
        transition: "all 0.2s",
      }}
    >
      {/* Top: N° + status + time */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 800, fontSize: "0.92rem", color: "#f97316", letterSpacing: "0.04em" }}>
          #{String(order.orderNumber || order.id.slice(-3).toUpperCase()).padStart(3, "0")}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {statusBadge}
          {order.fulfillmentType === "pickup" && (
            <span style={{ fontSize: "0.58rem", fontWeight: 700, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa", borderRadius: 6, padding: "2px 7px" }}>RETRAIT</span>
          )}
          <span style={{ fontSize: "0.63rem", color: "#475569" }}>{timeAgo(order.createdAt)}</span>
        </div>
      </div>

      {/* Client */}
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#f1f5f9" }}>{order.name || "Client"}</div>
        {order.phone && (
          <a href={`tel:${order.phone}`} style={{ fontSize: "0.74rem", color: "#64748b", textDecoration: "none" }}>
            📞 {order.phone}
          </a>
        )}
      </div>

      {/* Items */}
      <div style={{ fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.5, borderLeft: "2px solid rgba(255,255,255,0.06)", paddingLeft: 10 }}>
        {order.items}
      </div>

      {/* Address */}
      {order.address && (
        <div style={{ fontSize: "0.72rem", color: "#475569" }}>📍 {order.address}</div>
      )}

      {/* Footer: total + payment */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 800, fontSize: "0.98rem", color: "#fff" }}>
          {Number(order.total || 0).toLocaleString("fr-FR")} €
        </span>
        <span style={{
          background: order.paidOnline ? "rgba(6,182,212,0.12)" : "rgba(249,115,22,0.12)",
          border: `1px solid ${order.paidOnline ? "rgba(6,182,212,0.35)" : "rgba(249,115,22,0.35)"}`,
          color: order.paidOnline ? "#06b6d4" : "#f97316",
          borderRadius: 7, padding: "3px 9px", fontSize: "0.62rem", fontWeight: 700,
        }}>
          {order.paidOnline ? "PAYÉ" : "CASH"}
        </span>
      </div>

      {/* Actions */}
      {actions && <div style={{ display: "flex", gap: 7, marginTop: 2 }}>{actions}</div>}
    </div>
  );
}

// ── KANBAN COLUMN ──
function KanbanColumn({
  title,
  count,
  color,
  badge,
  children,
}: {
  title: string;
  count: number;
  color: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0 }}>
      {/* Column header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
        padding: "0 2px",
        position: "sticky", top: 0, zIndex: 2,
      }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.18em", color, textTransform: "uppercase" as const }}>{title}</span>
        <span style={{
          background: `${color}18`, border: `1px solid ${color}35`,
          color, borderRadius: 20, padding: "2px 10px",
          fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.04em",
        }}>{count}</span>
        {badge && (
          <span style={{
            background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.45)",
            color: "#f97316", borderRadius: 8, padding: "2px 9px",
            fontSize: "0.62rem", fontWeight: 700, animation: "glowPulse 1s infinite",
          }}>{badge}</span>
        )}
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {count === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "#2d3748", background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.05)", borderRadius: 14 }}>
            <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>—</div>
            <div style={{ fontSize: "0.75rem" }}>Aucune commande</div>
          </div>
        ) : children}
      </div>
    </div>
  );
}

// ── MAIN PAGE ──
export default function CommandesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [alertBanner, setAlertBanner] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());
  const prevOrderIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // Refresh timeAgo every minute
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Orders listener
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
        setAlertBanner(`${incoming.length} nouvelle${incoming.length > 1 ? "s" : ""} commande${incoming.length > 1 ? "s" : ""} !`);
        setTimeout(() => {
          setNewOrderIds((prev) => {
            const next = new Set(prev);
            incoming.forEach((o) => next.delete(o.id));
            return next;
          });
          setAlertBanner(null);
        }, 8000);
        prevOrderIds.current = new Set(data.map((o) => o.id));
      }
      setOrders(data);
    });
  }, []);

  // Drivers listener
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
      name: form.name, phone: form.phone, address: form.address, items: form.items,
      total: parseFloat(form.total) || 0, paidOnline: form.paidOnline,
      status: "nouveau", fulfillmentType: "delivery",
      createdAt: new Date().toISOString(),
    });
  }, []);

  // Kanban groupings
  const today = new Date().toDateString();
  const newOrders = orders.filter((o) => o.status === "nouveau");
  const enCours = orders.filter((o) => ["en_cours", "confirmed", "delivering", "pending_confirmation", "pending_payment"].includes(o.status));
  const terminees = orders.filter((o) => ["livre", "livree", "delivered", "annulee", "annule"].includes(o.status) && new Date(o.createdAt).toDateString() === today);

  // Stats
  const activeDrivers = drivers.filter((d) => d.isOnline);
  const todayRevenue = orders
    .filter((o) => ["livre", "livree", "delivered"].includes(o.status) && new Date(o.createdAt).toDateString() === today)
    .reduce((s, o) => s + Number(o.total || 0), 0);
  const cashPending = newOrders.filter((o) => !o.paidOnline).reduce((s, o) => s + Number(o.total || 0), 0);
  const cashValidated = terminees.filter((o) => !["annulee", "annule"].includes(o.status) && !o.paidOnline).reduce((s, o) => s + Number(o.total || 0), 0);

  const enCoursStatusLabel: Record<string, string> = {
    en_cours: "En cours",
    confirmed: "Confirmé",
    delivering: "En route",
    pending_confirmation: "Confirmation...",
    pending_payment: "Paiement...",
  };

  function driverLabel(d: Driver) {
    if (d.currentOrderId) return { text: "En livraison", color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)" };
    if (d.isOnline) return { text: "LIBRE", color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" };
    return { text: "Hors ligne", color: "#475569", bg: "rgba(71,85,105,0.1)", border: "rgba(71,85,105,0.25)" };
  }

  const btnPrimary = (color: string): React.CSSProperties => ({
    flex: 1, padding: "7px 0", borderRadius: 9, border: "none",
    background: color, color: "#fff", fontSize: "0.75rem", fontWeight: 700,
    cursor: "pointer", letterSpacing: "0.04em", transition: "all 0.15s",
  });

  const btnOutline = (color: string): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: 9, border: `1px solid ${color}40`,
    background: `${color}10`, color, fontSize: "0.8rem", fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter', system-ui, sans-serif", position: "relative", overflow: "hidden", background: "#07080f" }}>

      {/* Background */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/IMG_0964.png')", backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.28) saturate(0.5)", zIndex: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(5,5,15,0.65) 0%, rgba(10,10,25,0.55) 100%)", zIndex: 1 }} />

      <style>{`
        @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); } 50% { box-shadow: 0 0 22px 4px rgba(249,115,22,0.35); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .row-new { animation: glowPulse 0.9s ease-in-out 3; }
        .order-card:hover { border-color: rgba(249,115,22,0.25) !important; background: rgba(255,255,255,0.05) !important; }
        .action-btn:hover { filter: brightness(1.18); transform: scale(1.04); }
        .nav-btn:hover { background: rgba(255,255,255,0.06) !important; color: #fff !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      {/* ── LEFT SIDEBAR ── */}
      <aside style={{ width: 210, background: "rgba(8,8,16,0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", color: "#f1f5f9", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto", zIndex: 10, borderRight: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ padding: "22px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "0.1em", color: "#fff" }}>YASSALA</div>
          <div style={{ fontSize: "0.58rem", color: "#475569", letterSpacing: "0.18em", marginTop: 2 }}>ADMIN PANEL</div>
        </div>
        <nav style={{ flex: 1, padding: "14px 0" }}>
          {NAV.map((group) => (
            <div key={group.section} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.18em", color: "#475569", padding: "8px 20px 5px", textTransform: "uppercase" as const }}>{group.section}</div>
              {group.items.map((item) => {
                const isActive = item.key === "commandes";
                return (
                  <button key={item.key} className="nav-btn" onClick={() => router.push(item.href)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 20px", background: isActive ? "rgba(249,115,22,0.1)" : "transparent", border: "none", borderLeft: isActive ? "3px solid #f97316" : "3px solid transparent", color: isActive ? "#fff" : "#94a3b8", fontSize: "0.82rem", fontWeight: isActive ? 600 : 400, cursor: "pointer", textAlign: "left" as const, transition: "all 0.15s" }}>
                    <span style={{ fontSize: "0.78rem" }}>{item.icon}</span>
                    {item.label}
                    {item.key === "commandes" && newOrders.length > 0 && (
                      <span style={{ marginLeft: "auto", background: "#f97316", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: "0.62rem", fontWeight: 800 }}>{newOrders.length}</span>
                    )}
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
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 10, minWidth: 0 }}>

        {/* HEADER */}
        <header style={{ padding: "11px 24px", background: "rgba(8,8,16,0.82)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: "1.05rem", color: "#fff", letterSpacing: "0.12em" }}>COMMANDES</div>
            <div style={{ fontSize: "0.63rem", color: "#475569", marginTop: 1, letterSpacing: "0.04em" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              {"  ·  "}
              <span style={{ color: "#22c55e" }}>● LIVE</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={{ position: "relative", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: "#94a3b8", fontSize: "1rem" }}>
              🔔
              {newOrderIds.size > 0 && <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "#f97316", border: "2px solid #07080f" }} />}
            </button>
            <button onClick={() => setShowNewModal(true)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#f97316", color: "#fff", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
              + Nouvelle commande
            </button>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #f97316, #ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.8rem", color: "#fff", flexShrink: 0 }}>CB</div>
          </div>
        </header>

        {/* ALERT BANNER */}
        {alertBanner && (
          <div style={{ background: "rgba(249,115,22,0.12)", borderBottom: "1px solid rgba(249,115,22,0.4)", padding: "9px 24px", display: "flex", alignItems: "center", gap: 10, animation: "slideDown 0.3s ease", flexShrink: 0 }}>
            <span style={{ fontSize: "1rem" }}>🔔</span>
            <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#f97316" }}>{alertBanner}</span>
            <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>→ Vérifiez la colonne Nouvelles</span>
          </div>
        )}

        {/* STAT CARDS */}
        <div style={{ padding: "14px 24px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, flexShrink: 0 }}>
          <StatCard icon="⏳" label="En attente" value={newOrders.length} color="#f97316" sub="à traiter" />
          <StatCard icon="🏍️" label="En livraison" value={enCours.length} color="#22c55e" sub="en cours" />
          <StatCard icon="👤" label="Livreurs actifs" value={activeDrivers.length} color="#3b82f6" sub="connectés" />
          <StatCard icon="💶" label="CA du jour" value={`${todayRevenue.toLocaleString("fr-FR")} €`} color="#a78bfa" sub={`${terminees.filter(o => !["annulee","annule"].includes(o.status)).length} livraisons`} />
        </div>

        {/* KANBAN */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>

          {/* ── COLONNE 1: NOUVELLES ── */}
          <KanbanColumn title="Nouvelles" count={newOrders.length} color="#f97316" badge={newOrderIds.size > 0 ? `+${newOrderIds.size}` : undefined}>
            {newOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isNew={newOrderIds.has(order.id)}
                actions={
                  <>
                    <button className="action-btn" onClick={() => updateStatus(order.id, "en_cours")} style={btnPrimary("#f97316")}>
                      Assigner 🏍️
                    </button>
                    {order.phone && (
                      <a href={`tel:${order.phone}`} style={{ ...btnOutline("#22c55e"), textDecoration: "none" }}>📞</a>
                    )}
                    <button className="action-btn" onClick={() => updateStatus(order.id, "annulee")} style={btnOutline("#ef4444")}>✕</button>
                  </>
                }
              />
            ))}
          </KanbanColumn>

          {/* ── COLONNE 2: EN COURS ── */}
          <KanbanColumn title="En cours" count={enCours.length} color="#22c55e">
            {enCours.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                statusBadge={
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", borderRadius: 6, padding: "2px 8px" }}>
                    {enCoursStatusLabel[order.status] || order.status}
                  </span>
                }
                actions={
                  <>
                    <button className="action-btn" onClick={() => updateStatus(order.id, "livre")} style={btnPrimary("#22c55e")}>
                      Livré ✓
                    </button>
                    {order.phone && (
                      <a href={`tel:${order.phone}`} style={{ ...btnOutline("#3b82f6"), textDecoration: "none" }}>📞</a>
                    )}
                    <button className="action-btn" onClick={() => updateStatus(order.id, "annulee")} style={btnOutline("#ef4444")}>✕</button>
                  </>
                }
              />
            ))}
          </KanbanColumn>

          {/* ── COLONNE 3: TERMINÉES ── */}
          <KanbanColumn title="Terminées aujourd'hui" count={terminees.length} color="#475569">
            {terminees.map((order) => {
              const isCancelled = ["annulee", "annule"].includes(order.status);
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  statusBadge={
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, background: isCancelled ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", border: `1px solid ${isCancelled ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`, color: isCancelled ? "#f87171" : "#22c55e", borderRadius: 6, padding: "2px 8px" }}>
                      {isCancelled ? "❌ Annulée" : "✅ Livrée"}
                    </span>
                  }
                />
              );
            })}
          </KanbanColumn>
        </div>
      </main>

      {/* ── RIGHT PANEL ── */}
      <aside style={{ width: 252, background: "rgba(8,8,16,0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderLeft: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto", zIndex: 10, padding: "20px 14px", gap: 22 }}>

        {/* LIVREURS */}
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.18em", color: "#475569", textTransform: "uppercase" as const, marginBottom: 11 }}>Livreurs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {drivers.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "#475569", textAlign: "center", padding: "14px 0" }}>Aucun livreur</div>
            ) : (
              drivers.map((driver) => {
                const lbl = driverLabel(driver);
                const assignedOrder = driver.currentOrderId ? orders.find((o) => o.id === driver.currentOrderId) : null;
                return (
                  <div key={driver.uid} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: assignedOrder ? 6 : 0 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.83rem", color: "#f1f5f9" }}>{driver.name}</div>
                        <div style={{ fontSize: "0.68rem", color: "#64748b" }}>{driver.zone || "—"}</div>
                      </div>
                      <span style={{ background: lbl.bg, border: `1px solid ${lbl.border}`, color: lbl.color, borderRadius: 8, padding: "3px 9px", fontSize: "0.6rem", fontWeight: 700, flexShrink: 0 }}>{lbl.text}</span>
                    </div>
                    {assignedOrder && (
                      <div style={{ fontSize: "0.68rem", color: "#f97316", background: "rgba(249,115,22,0.08)", borderRadius: 7, padding: "4px 8px" }}>
                        #{String(assignedOrder.orderNumber || assignedOrder.id.slice(-3).toUpperCase()).padStart(3, "0")} · {assignedOrder.name || "Client"}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <button onClick={() => router.push("/admin?tab=drivers")} style={{ width: "100%", padding: "8px 0", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "transparent", color: "#475569", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
              + Ajouter livreur
            </button>
          </div>
        </div>

        {/* PAIEMENTS */}
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.18em", color: "#475569", textTransform: "uppercase" as const, marginBottom: 11 }}>Paiements du jour</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { label: "Cash en attente", value: `${cashPending.toLocaleString("fr-FR")} €`, color: "#f97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.2)" },
              { label: "Cash validé", value: `${cashValidated.toLocaleString("fr-FR")} €`, color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)" },
              { label: "CA du jour", value: `${todayRevenue.toLocaleString("fr-FR")} €`, color: "#a78bfa", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.2)" },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 11, padding: "10px 13px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{label}</div>
                <div style={{ fontWeight: 800, fontSize: "0.88rem", color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RÉSUMÉ DU JOUR */}
        <div>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.18em", color: "#475569", textTransform: "uppercase" as const, marginBottom: 11 }}>Résumé du jour</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "Livrées", value: terminees.filter(o => !["annulee","annule"].includes(o.status)).length, color: "#22c55e" },
              { label: "Annulées", value: terminees.filter(o => ["annulee","annule"].includes(o.status)).length, color: "#ef4444" },
              { label: "En attente", value: newOrders.length, color: "#f97316" },
              { label: "En cours", value: enCours.length, color: "#3b82f6" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 9, border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "0.73rem", color: "#94a3b8" }}>{label}</span>
                <span style={{ fontWeight: 800, fontSize: "0.88rem", color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* MODAL */}
      {showNewModal && <NewOrderModal onClose={() => setShowNewModal(false)} onSave={createOrder} />}
    </div>
  );
}
