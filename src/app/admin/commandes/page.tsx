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

// ── DESIGN TOKENS ──
const C = {
  bg: "rgba(10,10,20,0.82)",
  sidebar: "rgba(8,8,16,0.92)",
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.09)",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textFaint: "#475569",
  accent: "#f97316",
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
  cyan: "#06b6d4",
  purple: "#a855f7",
  border: "rgba(255,255,255,0.08)",
  navActive: "rgba(249,115,22,0.12)",
  glass: "blur(16px)",
};

// ── STATUS CONFIG ──
type StatusKey = "nouveau" | "en_cours" | "livree" | "probleme" | "confirmed" | "delivering";
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  nouveau: { label: "NOUVEAU", color: "#3b82f6", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)" },
  en_cours: { label: "EN COURS", color: "#eab308", bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.35)" },
  confirmed: { label: "EN COURS", color: "#eab308", bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.35)" },
  livree: { label: "LIVRÉE", color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" },
  delivered: { label: "LIVRÉE", color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" },
  probleme: { label: "PROBLÈME", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)" },
  annulee: { label: "ANNULÉE", color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.35)" },
};

const NAV = [
  {
    section: "OPÉRATIONS",
    items: [
      { key: "dashboard", label: "Tableau de bord", icon: "⊞", href: "/admin/dashboard" },
      { key: "commandes", label: "Commandes", icon: "📋", href: "/admin/commandes" },
      { key: "dispatch", label: "Dispatch", icon: "🏍️", href: "/admin?tab=dispatch" },
      { key: "livreurs", label: "Livreurs en ligne", icon: "🟢", href: "/admin?tab=online_drivers" },
      { key: "clients", label: "Clients", icon: "👤", href: "/admin?tab=users" },
      { key: "candidature", label: "Candidature", icon: "📝", href: "/admin?tab=drivers" },
    ],
  },
  {
    section: "FINANCE",
    items: [
      { key: "paiements", label: "Paiements", icon: "💳", href: "/admin?tab=payouts" },
      { key: "previsions", label: "Prévisions", icon: "📈", href: "/admin/analytics" },
    ],
  },
];

type FilterKey = "tous" | "livraison" | "collect" | "nouveau" | "en_cours" | "terminees" | "probleme";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "livraison", label: "Livraison" },
  { key: "collect", label: "Collect" },
  { key: "nouveau", label: "Nouveau" },
  { key: "en_cours", label: "En cours" },
  { key: "terminees", label: "Terminées" },
  { key: "probleme", label: "Problème" },
];

// ── SOUND NOTIFICATION ──
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch {
    // AudioContext not available
  }
}

// ── TIME AGO ──
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

// ── EXPORT CSV ──
function exportCSV(orders: Order[]) {
  const headers = ["ID", "Numéro", "Client", "Téléphone", "Adresse", "Articles", "Total", "Statut", "Paiement", "Type", "Date"];
  const rows = orders.map((o) => [
    o.id,
    o.orderNumber || "",
    o.name || "Client",
    o.phone || "",
    (o.address || "").replace(/,/g, ";"),
    (o.items || "").replace(/,/g, ";"),
    o.total,
    o.status,
    o.paidOnline ? "En ligne" : "Cash",
    o.fulfillmentType === "pickup" ? "Collect" : "Livraison",
    o.createdAt,
  ]);
  const csvContent = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `commandes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── ACTION BUTTON CONFIG ──
function getActionButton(status: string): { label: string; nextStatus: string; color: string } {
  switch (status) {
    case "nouveau":
      return { label: "Prendre", nextStatus: "en_cours", color: C.blue };
    case "en_cours":
    case "confirmed":
      return { label: "Livrée ✓", nextStatus: "livree", color: C.green };
    case "livree":
    case "delivered":
      return { label: "Archiver", nextStatus: "archivee", color: C.textFaint };
    case "probleme":
      return { label: "Résoudre", nextStatus: "en_cours", color: C.yellow };
    default:
      return { label: "Voir", nextStatus: "", color: C.textMuted };
  }
}

export default function CommandesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<FilterKey>("tous");
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [glowOrderIds, setGlowOrderIds] = useState<Set<string>>(new Set());
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const prevOrderIds = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  // ── Real-time Firebase listener ──
  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));

      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        prevOrderIds.current = new Set(data.map((o) => o.id));
        setOrders(data);
        return;
      }

      // Detect new orders
      const incoming = data.filter((o) => !prevOrderIds.current.has(o.id));
      if (incoming.length > 0) {
        playNotificationSound();
        const newIds = new Set(incoming.map((o) => o.id));
        setNewOrderIds((prev) => new Set([...prev, ...newIds]));
        setGlowOrderIds((prev) => new Set([...prev, ...newIds]));

        // Remove glow after 6 seconds
        setTimeout(() => {
          setGlowOrderIds((prev) => {
            const next = new Set(prev);
            newIds.forEach((id) => next.delete(id));
            return next;
          });
        }, 6000);

        // Auto-scroll to top
        if (listRef.current) {
          listRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }

        prevOrderIds.current = new Set(data.map((o) => o.id));
      }

      setOrders(data);
    });

    return () => unsub();
  }, []);

  // ── Update order status ──
  const updateStatus = useCallback(async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
  }, []);

  // ── Cancel order ──
  const cancelOrder = useCallback(async (id: string) => {
    await updateDoc(doc(db, "orders", id), { status: "annulee" });
  }, []);

  // ── Filter logic ──
  const filteredOrders = orders.filter((o) => {
    switch (filter) {
      case "livraison":
        return o.fulfillmentType !== "pickup";
      case "collect":
        return o.fulfillmentType === "pickup";
      case "nouveau":
        return o.status === "nouveau";
      case "en_cours":
        return o.status === "en_cours" || o.status === "confirmed";
      case "terminees":
        return o.status === "livree" || o.status === "delivered" || o.status === "archivee";
      case "probleme":
        return o.status === "probleme";
      default:
        return true;
    }
  });

  // ── Smart sort: nouveau > en_cours > livree > rest ──
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const priority = (s: string) => {
      if (s === "nouveau") return 0;
      if (s === "en_cours" || s === "confirmed") return 1;
      if (s === "probleme") return 2;
      if (!a.paidOnline) return 3;
      return 4;
    };
    const pa = priority(a.status);
    const pb = priority(b.status);
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // ── Stats ──
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => o.createdAt?.slice(0, 10) === today);
  const activeOrders = orders.filter((o) => ["nouveau", "en_cours", "confirmed"].includes(o.status));
  const cashOrders = activeOrders.filter((o) => !o.paidOnline);
  const paidOrders = activeOrders.filter((o) => o.paidOnline);

  // ── AI anomaly detection (mock) ──
  const runAIDetection = async () => {
    setAiRunning(true);
    setAiResult(null);
    await new Promise((r) => setTimeout(r, 1800));
    const anomalies = orders.filter(
      (o) => !o.paidOnline && o.total > 5000
    );
    if (anomalies.length > 0) {
      setAiResult(`⚠️ ${anomalies.length} anomalie(s) détectée(s) : montants élevés cash non validés.`);
    } else {
      setAiResult("✅ Aucune anomalie détectée sur les commandes actives.");
    }
    setAiRunning(false);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Inter', system-ui, sans-serif",
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

      {/* ── CSS ANIMATIONS ── */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-24px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
          50%       { box-shadow: 0 0 28px 4px rgba(59,130,246,0.45), 0 0 0 2px rgba(59,130,246,0.2); }
        }
        @keyframes shimmerNew {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes vibrate {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-2px); }
          40%       { transform: translateX(2px); }
          60%       { transform: translateX(-2px); }
          80%       { transform: translateX(2px); }
        }
        .order-new { animation: slideDown 0.4s cubic-bezier(.23,1,.32,1) forwards; }
        .order-glow { animation: glowPulse 0.8s ease-in-out 3, vibrate 0.3s ease-in-out; }
        .filter-btn-active { box-shadow: 0 0 14px 2px rgba(249,115,22,0.45); }
        .action-btn:hover { filter: brightness(1.15); transform: scale(1.04); }
        .cancel-btn:hover { filter: brightness(1.1); }
        .order-card { transition: border-color 0.25s, box-shadow 0.25s; }
        .order-card:hover { border-color: rgba(249,115,22,0.3) !important; box-shadow: 0 4px 30px rgba(249,115,22,0.08); }
      `}</style>

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
                const isActive = item.key === "commandes";
                return (
                  <button
                    key={item.key}
                    onClick={() => router.push(item.href)}
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

        {/* Bottom link */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
          <a
            href="/admin"
            style={{ display: "block", fontSize: "0.73rem", color: C.textFaint, textDecoration: "none", letterSpacing: "0.05em" }}
          >
            ← Admin complet
          </a>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 10 }}>

        {/* ── TOP BAR ── */}
        <div
          style={{
            padding: "13px 28px",
            background: "rgba(8,8,16,0.8)",
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
            <div style={{ fontWeight: 900, fontSize: "1.15rem", color: "#fff", letterSpacing: "0.12em" }}>
              COMMANDES
            </div>
            <div style={{ fontSize: "0.68rem", color: C.textMuted, marginTop: 1, letterSpacing: "0.04em" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}
              <span style={{ color: C.green }}>● LIVE</span>
            </div>
          </div>

          {/* Action buttons top-right */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => exportCSV(orders)}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.card,
                color: C.text,
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                letterSpacing: "0.03em",
                backdropFilter: C.glass,
              }}
            >
              📥 Export CSV
            </button>
            <button
              onClick={runAIDetection}
              disabled={aiRunning}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: `1px solid rgba(168,85,247,0.4)`,
                background: "rgba(168,85,247,0.1)",
                color: "#c084fc",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: aiRunning ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                letterSpacing: "0.03em",
                opacity: aiRunning ? 0.7 : 1,
                transition: "all 0.2s",
              }}
            >
              {aiRunning ? "⏳ Analyse..." : "🤖 Détection IA"}
            </button>
          </div>
        </div>

        {/* ── AI RESULT BANNER ── */}
        {aiResult && (
          <div
            style={{
              padding: "9px 28px",
              background: aiResult.startsWith("⚠️")
                ? "rgba(234,179,8,0.12)"
                : "rgba(34,197,94,0.10)",
              borderBottom: `1px solid ${aiResult.startsWith("⚠️") ? "rgba(234,179,8,0.3)" : "rgba(34,197,94,0.25)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "0.78rem", color: aiResult.startsWith("⚠️") ? "#fbbf24" : "#4ade80", fontWeight: 600 }}>
              {aiResult}
            </span>
            <button
              onClick={() => setAiResult(null)}
              style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: "0.9rem" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── SCROLLABLE BODY ── */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {/* ── STAT CARDS ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
            {/* Actives */}
            <div style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: 14,
              padding: "14px 18px",
              backdropFilter: C.glass,
            }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: C.green, textTransform: "uppercase" as const, marginBottom: 4 }}>
                🟢 Actives
              </div>
              <div style={{ fontWeight: 900, fontSize: "2rem", color: "#fff", lineHeight: 1 }}>
                {activeOrders.length}
              </div>
              <div style={{ fontSize: "0.64rem", color: C.textFaint, marginTop: 3 }}>commandes en cours</div>
            </div>

            {/* Cash */}
            <div style={{
              background: "rgba(249,115,22,0.08)",
              border: "1px solid rgba(249,115,22,0.25)",
              borderRadius: 14,
              padding: "14px 18px",
              backdropFilter: C.glass,
            }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: C.accent, textTransform: "uppercase" as const, marginBottom: 4 }}>
                🟡 Cash
              </div>
              <div style={{ fontWeight: 900, fontSize: "2rem", color: "#fff", lineHeight: 1 }}>
                {cashOrders.length}
              </div>
              <div style={{ fontSize: "0.64rem", color: C.textFaint, marginTop: 3 }}>paiement livraison</div>
            </div>

            {/* Payées */}
            <div style={{
              background: "rgba(6,182,212,0.08)",
              border: "1px solid rgba(6,182,212,0.25)",
              borderRadius: 14,
              padding: "14px 18px",
              backdropFilter: C.glass,
            }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: C.cyan, textTransform: "uppercase" as const, marginBottom: 4 }}>
                🔵 Payées
              </div>
              <div style={{ fontWeight: 900, fontSize: "2rem", color: "#fff", lineHeight: 1 }}>
                {paidOrders.length}
              </div>
              <div style={{ fontSize: "0.64rem", color: C.textFaint, marginTop: 3 }}>paiement en ligne</div>
            </div>

            {/* Total jour */}
            <div style={{
              background: "rgba(168,85,247,0.08)",
              border: "1px solid rgba(168,85,247,0.25)",
              borderRadius: 14,
              padding: "14px 18px",
              backdropFilter: C.glass,
            }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: C.purple, textTransform: "uppercase" as const, marginBottom: 4 }}>
                🟣 Total jour
              </div>
              <div style={{ fontWeight: 900, fontSize: "2rem", color: "#fff", lineHeight: 1 }}>
                {todayOrders.length}
              </div>
              <div style={{ fontSize: "0.64rem", color: C.textFaint, marginTop: 3 }}>
                {todayOrders.reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString("fr-FR")} €
              </div>
            </div>
          </div>

          {/* ── FILTER BAR ── */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" as const }}>
            {FILTERS.map((f) => {
              const isActive = filter === f.key;
              // Count badge
              let count = 0;
              if (f.key === "tous") count = orders.length;
              else if (f.key === "livraison") count = orders.filter((o) => o.fulfillmentType !== "pickup").length;
              else if (f.key === "collect") count = orders.filter((o) => o.fulfillmentType === "pickup").length;
              else if (f.key === "nouveau") count = orders.filter((o) => o.status === "nouveau").length;
              else if (f.key === "en_cours") count = orders.filter((o) => ["en_cours", "confirmed"].includes(o.status)).length;
              else if (f.key === "terminees") count = orders.filter((o) => ["livree", "delivered", "archivee"].includes(o.status)).length;
              else if (f.key === "probleme") count = orders.filter((o) => o.status === "probleme").length;

              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={isActive ? "filter-btn-active" : ""}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 20,
                    border: isActive ? `1px solid rgba(249,115,22,0.6)` : `1px solid ${C.border}`,
                    background: isActive ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.04)",
                    color: isActive ? C.accent : C.textMuted,
                    fontSize: "0.78rem",
                    fontWeight: isActive ? 700 : 400,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.15s",
                    backdropFilter: C.glass,
                    letterSpacing: "0.02em",
                  }}
                >
                  {f.label}
                  {count > 0 && (
                    <span style={{
                      background: isActive ? C.accent : "rgba(255,255,255,0.1)",
                      color: isActive ? "#fff" : C.textFaint,
                      borderRadius: 10,
                      padding: "1px 7px",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      minWidth: 20,
                      textAlign: "center" as const,
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── SECTION HEADING ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: "0.8rem", color: C.textMuted, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
              {sortedOrders.length} commande{sortedOrders.length !== 1 ? "s" : ""}
            </div>
            {newOrderIds.size > 0 && (
              <div style={{ fontSize: "0.73rem", color: C.blue, fontWeight: 600, animation: "glowPulse 1s infinite" }}>
                🔔 {newOrderIds.size} nouvelle{newOrderIds.size > 1 ? "s" : ""} commande{newOrderIds.size > 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* ── ORDER LIST ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedOrders.length === 0 ? (
              <div style={{
                textAlign: "center" as const,
                padding: "60px 20px",
                color: C.textFaint,
                fontSize: "0.85rem",
              }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📭</div>
                Aucune commande dans cette catégorie
              </div>
            ) : (
              sortedOrders.map((order) => {
                const statusCfg = STATUS_CONFIG[order.status] || {
                  label: order.status?.toUpperCase(),
                  color: C.textMuted,
                  bg: "rgba(255,255,255,0.04)",
                  border: C.border,
                };
                const actionBtn = getActionButton(order.status);
                const isNew = newOrderIds.has(order.id);
                const isGlowing = glowOrderIds.has(order.id);
                const isTerminee = ["livree", "delivered", "archivee"].includes(order.status);

                return (
                  <div
                    key={order.id}
                    className={`order-card${isNew ? " order-new" : ""}${isGlowing ? " order-glow" : ""}`}
                    style={{
                      background: isNew
                        ? "rgba(59,130,246,0.07)"
                        : isTerminee
                        ? "rgba(255,255,255,0.025)"
                        : "rgba(255,255,255,0.045)",
                      border: `1px solid ${isGlowing ? "rgba(59,130,246,0.5)" : isNew ? "rgba(59,130,246,0.2)" : C.border}`,
                      borderRadius: 14,
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      backdropFilter: C.glass,
                      opacity: isTerminee ? 0.7 : 1,
                      position: "relative" as const,
                      overflow: "hidden" as const,
                    }}
                  >
                    {/* NEW indicator strip */}
                    {isNew && (
                      <div style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        background: "linear-gradient(180deg, #3b82f6, #06b6d4)",
                        borderRadius: "14px 0 0 14px",
                      }} />
                    )}

                    {/* LEFT: Order info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Row 1: ID + Name + Status badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                        <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "#fff", letterSpacing: "0.03em", flexShrink: 0 }}>
                          #{order.orderNumber || order.id.slice(-4).toUpperCase()}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: "0.85rem", color: C.text, flexShrink: 0 }}>
                          {order.name || "Client"}
                        </span>
                        {/* Status badge */}
                        <span style={{
                          background: statusCfg.bg,
                          border: `1px solid ${statusCfg.border}`,
                          color: statusCfg.color,
                          borderRadius: 6,
                          padding: "2px 9px",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          flexShrink: 0,
                        }}>
                          {statusCfg.label}
                        </span>
                        {/* Payment badge */}
                        <span style={{
                          background: order.paidOnline ? "rgba(6,182,212,0.12)" : "rgba(249,115,22,0.12)",
                          border: `1px solid ${order.paidOnline ? "rgba(6,182,212,0.35)" : "rgba(249,115,22,0.35)"}`,
                          color: order.paidOnline ? C.cyan : C.accent,
                          borderRadius: 6,
                          padding: "2px 9px",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          flexShrink: 0,
                        }}>
                          {order.paidOnline ? "PAYÉ" : "CASH"}
                        </span>
                        {/* Fulfillment type badge */}
                        {order.fulfillmentType && (
                          <span style={{
                            background: "rgba(255,255,255,0.06)",
                            border: `1px solid ${C.border}`,
                            color: C.textMuted,
                            borderRadius: 6,
                            padding: "2px 9px",
                            fontSize: "0.65rem",
                            fontWeight: 600,
                            flexShrink: 0,
                          }}>
                            {order.fulfillmentType === "pickup" ? "🏪 COLLECT" : "🏍️ LIVRAISON"}
                          </span>
                        )}
                      </div>

                      {/* Row 2: Address + Items */}
                      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
                        {order.address && (
                          <div style={{ fontSize: "0.77rem", color: C.textMuted, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                            <span style={{ flexShrink: 0 }}>📍</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                              {order.address}
                            </span>
                          </div>
                        )}
                        {order.phone && (
                          <div style={{ fontSize: "0.76rem", color: C.textMuted, flexShrink: 0 }}>
                            📞 {order.phone}
                          </div>
                        )}
                      </div>

                      {/* Row 3: Items + Total + Time */}
                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
                        {order.items && (
                          <div style={{
                            fontSize: "0.73rem",
                            color: C.textFaint,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap" as const,
                            maxWidth: 300,
                          }}>
                            🛒 {order.items}
                          </div>
                        )}
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                          {Number(order.total || 0).toLocaleString("fr-FR")} €
                        </div>
                        <div style={{ fontSize: "0.72rem", color: C.textFaint, flexShrink: 0 }}>
                          🕐 {timeAgo(order.createdAt)}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT: Action buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, flexShrink: 0, alignItems: "flex-end" }}>
                      {/* Primary action */}
                      {actionBtn.nextStatus && (
                        <button
                          className="action-btn"
                          onClick={() => updateStatus(order.id, actionBtn.nextStatus)}
                          style={{
                            padding: "8px 18px",
                            borderRadius: 9,
                            border: "none",
                            background: actionBtn.color,
                            color: "#fff",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            letterSpacing: "0.04em",
                            transition: "all 0.15s",
                            whiteSpace: "nowrap" as const,
                            minWidth: 90,
                          }}
                        >
                          {actionBtn.label}
                        </button>
                      )}
                      {/* Cancel (only for active orders) */}
                      {!isTerminee && order.status !== "annulee" && (
                        <button
                          className="cancel-btn"
                          onClick={() => cancelOrder(order.id)}
                          style={{
                            padding: "5px 14px",
                            borderRadius: 7,
                            border: `1px solid rgba(239,68,68,0.3)`,
                            background: "rgba(239,68,68,0.08)",
                            color: "#f87171",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            whiteSpace: "nowrap" as const,
                          }}
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom spacer */}
          <div style={{ height: 32 }} />
        </div>
      </main>
    </div>
  );
}
