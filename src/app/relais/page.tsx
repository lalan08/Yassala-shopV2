"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import type { RelaySession } from "@/types/relay";

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

const RELAY_KEY = "yassala_relay";

// ── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg: "rgba(6,8,18,1)",
  card: "rgba(255,255,255,0.05)",
  cardBorder: "rgba(255,255,255,0.09)",
  text: "#f1f5f9",
  muted: "#94a3b8",
  accent: "#10b981",
  accentDark: "#059669",
  danger: "#ef4444",
  warning: "#f59e0b",
  orange: "#f97316",
};

type ActivityLog = {
  id: string;
  relayId: string;
  orderId: string;
  items: { productId: string; name: string; qty: number }[];
  timestamp: string;
  collectedBy: "driver" | "customer";
};

type PendingOrder = {
  id: string;
  orderNumber?: number;
  name?: string;
  phone?: string;
  total: number;
  status: string;
  fulfillmentMode?: string;
  createdAt: string;
  items: { productId: string; name: string; qty: number }[];
};

type ScannedOrder = {
  id: string;
  qrToken: string;
  orderNumber?: number;
  name?: string;
  phone?: string;
  total: number;
  status: string;
  fulfillmentMode?: string;
  createdAt: string;
  items: { productId: string; name: string; qty: number }[];
};

// ── HTML5-QRCode scanner component ──────────────────────────────────────────
function QrScanner({
  onScan,
  onError,
}: {
  onScan: (data: string) => void;
  onError?: (err: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            onScan(decodedText);
          },
          () => {}
        )
        .catch((err: any) => {
          onError?.("Impossible d'accéder à la caméra: " + String(err));
        });
    });

    return () => {
      scannerRef.current
        ?.stop()
        .then(() => scannerRef.current?.clear())
        .catch(() => {});
    };
  }, [onScan, onError]);

  return (
    <div
      id="qr-reader"
      ref={divRef}
      style={{ width: "100%", maxWidth: 340, margin: "0 auto" }}
    />
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function RelaisPage() {
  const [session, setSession] = useState<RelaySession | null>(null);

  // Login state
  const [relayId, setRelayIdInput] = useState("");
  const [pin, setPin] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Scanner modal state
  const [showScanner, setShowScanner] = useState(false);
  const [scanMode, setScanMode] = useState<"scanning" | "confirm" | "success" | "error">("scanning");
  const [scanError, setScanError] = useState("");
  const [scannedOrder, setScannedOrder] = useState<ScannedOrder | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [collectedBy, setCollectedBy] = useState<"driver" | "customer">("customer");
  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null);

  // Data state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // UX animation state
  const [glowToday, setGlowToday] = useState(false);

  // Vibration refs
  const prevPendingCountRef = useRef<number>(-1);
  const dataLoadedOnce = useRef(false);

  // Load session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RELAY_KEY);
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {}
    }
  }, []);

  // Load data when session is available
  useEffect(() => {
    if (session) loadAll();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vibration on new pending orders
  useEffect(() => {
    if (dataLoading) return;
    if (!dataLoadedOnce.current) {
      dataLoadedOnce.current = true;
      prevPendingCountRef.current = pendingOrders.length;
      return;
    }
    if (pendingOrders.length > prevPendingCountRef.current && prevPendingCountRef.current >= 0) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }
    prevPendingCountRef.current = pendingOrders.length;
  }, [pendingOrders, dataLoading]);

  async function loadAll() {
    setDataLoading(true);
    await Promise.all([loadPending(), loadActivity()]);
    setDataLoading(false);
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/relay/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relayId: relayId.trim(), pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Erreur de connexion");
        return;
      }
      const s: RelaySession = {
        relayId: data.relay.id,
        relayName: data.relay.name,
        relayAddress: data.relay.address,
      };
      localStorage.setItem(RELAY_KEY, JSON.stringify(s));
      setSession(s);
    } catch {
      setLoginError("Erreur réseau");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(RELAY_KEY);
    setSession(null);
    setShowScanner(false);
  }

  // ── Scanner modal ──────────────────────────────────────────────────────────
  function openScanner() {
    setScanMode("scanning");
    setScanError("");
    setScannedOrder(null);
    setConfirmMessage("");
    setCollectedBy("customer");
    setConfirmedAt(null);
    setShowScanner(true);
  }

  function closeScanner() {
    setShowScanner(false);
    setScanError("");
    setScannedOrder(null);
    setConfirmMessage("");
    setConfirmedAt(null);
  }

  // ── QR Scan handler ────────────────────────────────────────────────────────
  const handleQrScan = useCallback(
    async (qrData: string) => {
      if (!session) return;
      if (scanMode === "confirm" || scanMode === "success") return;
      setScanMode("confirm");
      setScanError("");

      try {
        const res = await fetch("/api/relay/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrData, relayId: session.relayId }),
        });
        const data = await res.json();

        if (!res.ok) {
          setScanError(data.error || "QR invalide");
          setScanMode("error");
          return;
        }

        setScannedOrder(data.order);
        setScanMode("confirm");
      } catch {
        setScanError("Erreur réseau lors du scan");
        setScanMode("error");
      }
    },
    [session, scanMode]
  );

  // ── Confirm pickup ─────────────────────────────────────────────────────────
  async function handleConfirmPickup() {
    if (!session || !scannedOrder) return;
    setConfirmLoading(true);
    setScanError("");

    try {
      const res = await fetch("/api/relay/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          orderId: scannedOrder.id,
          qrToken: scannedOrder.qrToken,
          relayId: session.relayId,
          collectedBy,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setScanError(data.error || "Erreur lors de la validation");
        setScanMode("error");
        return;
      }

      setConfirmMessage(data.message || "Commande validée !");
      setConfirmedAt(new Date());
      setScanMode("success");

      // Trigger glow animation on today's stat card
      setGlowToday(true);
      setTimeout(() => setGlowToday(false), 2000);

      // Auto-close scanner and refresh after 3.5s
      setTimeout(() => {
        closeScanner();
        loadAll();
      }, 3500);
    } catch {
      setScanError("Erreur réseau lors de la validation");
      setScanMode("error");
    } finally {
      setConfirmLoading(false);
    }
  }

  // ── Load activity ──────────────────────────────────────────────────────────
  async function loadActivity() {
    if (!session) return;
    try {
      const res = await fetch(`/api/relay/activity?relayId=${session.relayId}`);
      const data = await res.json();
      if (res.ok) {
        setActivityLogs(data.logs || []);
        setTodayCount(data.todayCount || 0);
        setWeekCount(data.weekCount || 0);
      }
    } catch {}
  }

  // ── Load pending orders ────────────────────────────────────────────────────
  async function loadPending() {
    if (!session) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, "orders"),
          where("relayId", "==", session.relayId),
          where("status", "==", "READY_FOR_PICKUP"),
          orderBy("createdAt", "desc")
        )
      );
      const orders: PendingOrder[] = snap.docs.map((d) => {
        const data = d.data();
        let items: PendingOrder["items"] = [];
        try {
          const raw = typeof data.items === "string" ? JSON.parse(data.items) : data.items;
          if (Array.isArray(raw)) {
            items = raw.map((i: any) => ({
              productId: i.productId || i.id || "",
              name: i.name || i.productName || "Produit",
              qty: i.quantity || i.qty || 1,
            }));
          }
        } catch {}
        return {
          id: d.id,
          orderNumber: data.orderNumber,
          name: data.name || data.customerName,
          phone: data.phone || data.customerPhone,
          total: data.total,
          status: data.status,
          fulfillmentMode: data.fulfillmentMode,
          createdAt: data.createdAt,
          items,
        };
      });
      setPendingOrders(orders);
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 20,
            padding: "2rem 1.5rem",
            width: "100%",
            maxWidth: 380,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: 0 }}>
              Espace Relais
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginTop: 6 }}>
              Connectez-vous pour accéder à votre tableau de bord
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ color: C.muted, fontSize: 13, display: "block", marginBottom: 6 }}>
                ID du Relais
              </label>
              <input
                type="text"
                value={relayId}
                onChange={(e) => setRelayIdInput(e.target.value)}
                placeholder="ex: relay-cayenne-01"
                required
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.07)",
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: C.text,
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ color: C.muted, fontSize: 13, display: "block", marginBottom: 6 }}>
                Code PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                required
                maxLength={8}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.07)",
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: C.text,
                  fontSize: 18,
                  letterSpacing: 6,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {loginError && (
              <div
                style={{
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#fca5a5",
                  fontSize: 13,
                  marginBottom: "1rem",
                }}
              >
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: "100%",
                background: loginLoading ? C.muted : C.accent,
                border: "none",
                borderRadius: 10,
                padding: "14px",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                cursor: loginLoading ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
            >
              {loginLoading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const commissionEarned = (todayCount * 0.5).toFixed(2).replace(".", ",");
  const hasPending = pendingOrders.length > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "system-ui, sans-serif",
        color: C.text,
      }}
    >
      {/* ── CSS Keyframe Animations ───────────────────────────────────────── */}
      <style>{`
        @keyframes pulse-fab {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55), 0 6px 24px rgba(16,185,129,0.35); }
          50%       { box-shadow: 0 0 0 14px rgba(16,185,129,0), 0 6px 24px rgba(16,185,129,0.35); }
        }
        @keyframes glow-orange-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(249,115,22,0.35); }
          50%       { box-shadow: 0 0 22px rgba(249,115,22,0.75); }
        }
        @keyframes glow-green {
          0%   { box-shadow: 0 0 0px rgba(16,185,129,0); }
          40%  { box-shadow: 0 0 28px rgba(16,185,129,0.75); }
          100% { box-shadow: 0 0 0px rgba(16,185,129,0); }
        }
        @keyframes count-glow {
          0%, 100% { text-shadow: none; }
          50%       { text-shadow: 0 0 18px rgba(16,185,129,0.9), 0 0 36px rgba(16,185,129,0.4); }
        }
        @keyframes circle-draw {
          from { stroke-dashoffset: 252; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 53; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes scale-in {
          from { transform: scale(0.75); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(14px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes badge-pop {
          0%   { transform: scale(0); }
          70%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        @keyframes number-pop {
          0%   { transform: scale(0.5) translateY(8px); opacity: 0; }
          70%  { transform: scale(1.2) translateY(-2px); }
          100% { transform: scale(1)   translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* ── Scanner Modal Overlay ─────────────────────────────────────────── */}
      {showScanner && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,8,18,0.97)",
            zIndex: 1000,
            overflowY: "auto",
            padding: "1rem",
          }}
        >
          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.5rem",
                paddingTop: "1rem",
              }}
            >
              <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>
                📷 Scanner QR
              </h2>
              <button
                onClick={closeScanner}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  color: C.muted,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ✕ Fermer
              </button>
            </div>

            {/* ── Scanning state ── */}
            {scanMode === "scanning" && (
              <div>
                <div
                  style={{
                    background: C.card,
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 16,
                    padding: "1.5rem",
                    marginBottom: "1rem",
                    textAlign: "center",
                  }}
                >
                  <p style={{ color: C.muted, fontSize: 13, marginBottom: "1rem" }}>
                    Pointez la caméra sur le QR code de la commande
                  </p>
                  <QrScanner
                    onScan={handleQrScan}
                    onError={(err) => {
                      setScanError(err);
                      setScanMode("error");
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── Confirm state ── */}
            {scanMode === "confirm" && scannedOrder && (
              <div>
                <div
                  style={{
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.25)",
                    borderRadius: 16,
                    padding: "1.5rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: "1rem",
                    }}
                  >
                    <span style={{ fontSize: 22 }}>✅</span>
                    <span style={{ fontWeight: 700, color: C.accent, fontSize: 15 }}>
                      QR Code valide
                    </span>
                  </div>

                  <div
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 10,
                      padding: "1rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <span style={{ color: C.muted }}>Commande</span>
                        <div style={{ fontWeight: 600 }}>
                          #{scannedOrder.orderNumber || scannedOrder.id.slice(-6)}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: C.muted }}>Mode</span>
                        <div style={{ fontWeight: 600 }}>
                          {scannedOrder.fulfillmentMode === "DELIVERY"
                            ? "🚚 Livraison"
                            : "🏪 Click & Collect"}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: C.muted }}>Client</span>
                        <div style={{ fontWeight: 600 }}>{scannedOrder.name || "—"}</div>
                      </div>
                      <div>
                        <span style={{ color: C.muted }}>Total</span>
                        <div style={{ fontWeight: 600, color: C.accent }}>
                          {scannedOrder.total?.toFixed(2)} €
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Items list */}
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
                      PRODUITS À REMETTRE
                    </div>
                    {scannedOrder.items.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 0",
                          borderBottom:
                            i < scannedOrder.items.length - 1
                              ? `1px solid ${C.cardBorder}`
                              : "none",
                          fontSize: 14,
                        }}
                      >
                        <span>{item.name}</span>
                        <span
                          style={{
                            background: "rgba(16,185,129,0.2)",
                            borderRadius: 6,
                            padding: "2px 8px",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          x{item.qty}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Collected by selector */}
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
                      REMIS À
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["customer", "driver"] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setCollectedBy(type)}
                          style={{
                            flex: 1,
                            padding: "10px",
                            borderRadius: 8,
                            border:
                              collectedBy === type
                                ? `2px solid ${C.accent}`
                                : `1px solid ${C.cardBorder}`,
                            background:
                              collectedBy === type
                                ? "rgba(16,185,129,0.15)"
                                : "rgba(255,255,255,0.04)",
                            color: collectedBy === type ? C.accent : C.muted,
                            fontSize: 13,
                            fontWeight: collectedBy === type ? 700 : 400,
                            cursor: "pointer",
                          }}
                        >
                          {type === "customer" ? "👤 Client" : "🚚 Livreur"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {scanError && (
                  <div
                    style={{
                      background: "rgba(239,68,68,0.12)",
                      border: "1px solid rgba(239,68,68,0.3)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "#fca5a5",
                      fontSize: 13,
                      marginBottom: "1rem",
                    }}
                  >
                    {scanError}
                  </div>
                )}

                <button
                  onClick={handleConfirmPickup}
                  disabled={confirmLoading}
                  style={{
                    width: "100%",
                    background: confirmLoading ? C.muted : C.accent,
                    border: "none",
                    borderRadius: 12,
                    padding: "16px",
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: confirmLoading ? "not-allowed" : "pointer",
                    marginBottom: 8,
                    transition: "background 0.2s",
                  }}
                >
                  {confirmLoading ? "Validation en cours..." : "✓ Valider la remise"}
                </button>

                <button
                  onClick={() => setScanMode("scanning")}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 10,
                    padding: "12px",
                    color: C.muted,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Rescanner
                </button>
              </div>
            )}

            {/* ── Success state — ENHANCED ── */}
            {scanMode === "success" && (
              <div
                style={{
                  textAlign: "center",
                  paddingTop: "1.5rem",
                  animation: "scale-in 0.4s ease both",
                }}
              >
                <div
                  style={{
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.3)",
                    borderRadius: 20,
                    padding: "2rem 1.5rem",
                  }}
                >
                  {/* Animated SVG check */}
                  <div style={{ marginBottom: 18 }}>
                    <svg
                      width="88"
                      height="88"
                      viewBox="0 0 88 88"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        cx="44"
                        cy="44"
                        r="40"
                        stroke={C.accent}
                        strokeWidth="3"
                        strokeDasharray="252"
                        strokeDashoffset="252"
                        style={{ animation: "circle-draw 0.55s ease 0.1s both" }}
                      />
                      <path
                        d="M26 44 L38 56 L62 30"
                        stroke={C.accent}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="53"
                        strokeDashoffset="53"
                        style={{ animation: "check-draw 0.4s ease 0.6s both" }}
                      />
                    </svg>
                  </div>

                  {/* Title */}
                  <h2
                    style={{
                      color: C.accent,
                      fontSize: 22,
                      fontWeight: 700,
                      margin: "0 0 4px",
                      animation: "slide-up 0.4s ease 0.75s both",
                    }}
                  >
                    Commande validée !
                  </h2>

                  {/* Order details card */}
                  {scannedOrder && (
                    <div
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: 12,
                        padding: "1rem",
                        marginTop: 16,
                        textAlign: "left",
                        animation: "slide-up 0.4s ease 0.9s both",
                      }}
                    >
                      {/* Order ID */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingBottom: 10,
                          marginBottom: 10,
                          borderBottom: `1px solid ${C.cardBorder}`,
                        }}
                      >
                        <span style={{ color: C.muted, fontSize: 12 }}>Commande</span>
                        <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
                          #{scannedOrder.orderNumber || scannedOrder.id.slice(-6)}
                        </span>
                      </div>

                      {/* Products */}
                      <div
                        style={{
                          paddingBottom: 10,
                          marginBottom: 10,
                          borderBottom: `1px solid ${C.cardBorder}`,
                        }}
                      >
                        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
                          PRODUITS REMIS
                        </div>
                        {scannedOrder.items.map((item, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 13,
                              paddingBottom: i < scannedOrder.items.length - 1 ? 4 : 0,
                            }}
                          >
                            <span style={{ color: C.text }}>{item.name}</span>
                            <span style={{ color: C.accent, fontWeight: 600 }}>×{item.qty}</span>
                          </div>
                        ))}
                      </div>

                      {/* Time */}
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: C.muted, fontSize: 12 }}>Heure</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {(confirmedAt ?? new Date()).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Counter increment */}
                  <div
                    style={{
                      marginTop: 20,
                      padding: "12px",
                      background: "rgba(16,185,129,0.12)",
                      borderRadius: 12,
                      animation: "slide-up 0.4s ease 1.05s both",
                    }}
                  >
                    <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
                      RETIRÉS AUJOURD&apos;HUI
                    </div>
                    <div
                      style={{
                        color: C.accent,
                        fontSize: 38,
                        fontWeight: 800,
                        animation: "number-pop 0.5s ease 1.15s both, count-glow 1.5s ease 1.15s",
                      }}
                    >
                      {todayCount + 1}
                    </div>
                  </div>

                  <p style={{ color: C.muted, fontSize: 12, marginTop: 16 }}>
                    {confirmMessage || "Fermeture automatique..."}
                  </p>
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {scanMode === "error" && (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 16,
                    padding: "2rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
                  <h2
                    style={{
                      color: C.danger,
                      fontSize: 18,
                      fontWeight: 700,
                      margin: "0 0 8px",
                    }}
                  >
                    QR code refusé
                  </h2>
                  <p style={{ color: C.muted, fontSize: 14 }}>{scanError}</p>
                </div>
                <button
                  onClick={() => setScanMode("scanning")}
                  style={{
                    width: "100%",
                    background: C.accent,
                    border: "none",
                    borderRadius: 12,
                    padding: "14px",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    marginBottom: 8,
                  }}
                >
                  Réessayer
                </button>
                <button
                  onClick={closeScanner}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 10,
                    padding: "12px",
                    color: C.muted,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Floating Scanner FAB ──────────────────────────────────────────── */}
      {!showScanner && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            right: 24,
            zIndex: 90,
          }}
        >
          <button
            onClick={openScanner}
            aria-label="Scanner un QR code"
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: C.accent,
              border: "none",
              color: "#fff",
              fontSize: 28,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "pulse-fab 2.5s ease-in-out infinite",
            }}
          >
            📷
          </button>
          {/* Badge pending count on FAB */}
          {hasPending && (
            <div
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: C.orange,
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid rgba(6,8,18,1)",
                animation: "badge-pop 0.4s ease both",
              }}
            >
              {pendingOrders.length}
            </div>
          )}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "rgba(16,185,129,0.1)",
          borderBottom: "1px solid rgba(16,185,129,0.2)",
          padding: "1rem 1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📦 {session.relayName}</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {session.relayAddress}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
            <button
              onClick={openScanner}
              style={{
                background: C.accent,
                border: "none",
                borderRadius: 10,
                padding: "10px 18px",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              📷 Scanner QR
            </button>
            <button
              onClick={handleLogout}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 8,
                padding: "5px 10px",
                color: C.muted,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ padding: "1.5rem", maxWidth: 500, margin: "0 auto" }}>

        {/* ── Stats 2×2 grid ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: "1.5rem",
          }}
        >
          {/* En Attente Retrait — orange + glow + badge when pending */}
          <div
            style={{
              position: "relative",
              background: hasPending ? "rgba(249,115,22,0.12)" : C.card,
              border: hasPending
                ? "1px solid rgba(249,115,22,0.45)"
                : `1px solid ${C.cardBorder}`,
              borderRadius: 14,
              padding: "1rem",
              transition: "background 0.4s, border-color 0.4s",
              animation: hasPending ? "glow-orange-pulse 2s ease-in-out infinite" : "none",
            }}
          >
            <div
              style={{
                color: hasPending ? "#fdba74" : C.muted,
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              En Attente Retrait
            </div>
            <div
              style={{
                color: hasPending ? C.orange : C.warning,
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              {dataLoading ? "…" : pendingOrders.length}
            </div>
            {/* Notification badge */}
            {hasPending && !dataLoading && (
              <div
                style={{
                  position: "absolute",
                  top: -7,
                  right: -7,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: C.orange,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid rgba(6,8,18,1)",
                  animation: "badge-pop 0.4s ease both",
                }}
              >
                {pendingOrders.length}
              </div>
            )}
          </div>

          {/* Retirés Aujourd'hui — glow animation on validation */}
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 14,
              padding: "1rem",
              animation: glowToday ? "glow-green 2s ease both" : "none",
            }}
          >
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
              Retirés Aujourd&apos;hui
            </div>
            <div
              style={{
                color: C.accent,
                fontSize: 28,
                fontWeight: 800,
                animation: glowToday ? "count-glow 2s ease both" : "none",
              }}
            >
              {dataLoading ? "…" : todayCount}
            </div>
          </div>

          {/* Produits Semaine */}
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 14,
              padding: "1rem",
            }}
          >
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
              Produits Semaine
            </div>
            <div style={{ color: C.text, fontSize: 28, fontWeight: 800 }}>
              {dataLoading ? "…" : weekCount}
            </div>
          </div>

          {/* Commission Gagnée */}
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 14,
              padding: "1rem",
            }}
          >
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
              Commission Gagnée
            </div>
            <div style={{ color: C.orange, fontSize: 24, fontWeight: 800 }}>
              {dataLoading ? "…" : `${commissionEarned} €`}
            </div>
          </div>
        </div>

        {/* Refresh button */}
        <button
          onClick={loadAll}
          disabled={dataLoading}
          style={{
            width: "100%",
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.25)",
            borderRadius: 10,
            padding: "10px",
            color: C.accent,
            fontSize: 14,
            cursor: dataLoading ? "not-allowed" : "pointer",
            marginBottom: "1.5rem",
          }}
        >
          {dataLoading ? "Chargement..." : "↻ Actualiser"}
        </button>

        {/* ── Section: Commandes à Retirer ─────────────────────────────────── */}
        <div style={{ marginBottom: "2rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, letterSpacing: "0.05em" }}>
              COMMANDES À RETIRER
            </div>
            {pendingOrders.length > 0 && (
              <span
                style={{
                  background: "rgba(245,158,11,0.2)",
                  color: C.warning,
                  borderRadius: 20,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {pendingOrders.length}
              </span>
            )}
          </div>

          {dataLoading ? (
            <div style={{ textAlign: "center", color: C.muted, padding: "2rem" }}>
              Chargement...
            </div>
          ) : pendingOrders.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: C.muted,
                padding: "2rem",
                background: C.card,
                borderRadius: 12,
                border: `1px solid ${C.cardBorder}`,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Aucune commande en attente</div>
              <div style={{ fontSize: 13 }}>Toutes les commandes ont été remises.</div>
            </div>
          ) : (
            pendingOrders.map((order) => {
              const itemsSummary = order.items
                .map((i) => `${i.qty} ${i.name}`)
                .join(", ");
              return (
                <div
                  key={order.id}
                  style={{
                    background: "rgba(245,158,11,0.07)",
                    border: "1px solid rgba(245,158,11,0.25)",
                    borderRadius: 14,
                    padding: "1rem 1.25rem",
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      #{order.orderNumber || order.id.slice(-6)}{" "}
                      {order.name && (
                        <span style={{ color: C.text }}>{order.name}</span>
                      )}
                    </div>
                    <div
                      style={{
                        color: C.muted,
                        fontSize: 13,
                        marginTop: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {itemsSummary}
                    </div>
                  </div>
                  <button
                    onClick={openScanner}
                    style={{
                      background: C.accent,
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 18px",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0,
                      letterSpacing: "0.03em",
                    }}
                  >
                    VALIDER
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* ── Section: Historique des Retraits ─────────────────────────────── */}
        <div style={{ paddingBottom: "6rem" }}>
          <div
            style={{
              color: C.muted,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.05em",
              marginBottom: 12,
            }}
          >
            HISTORIQUE DES RETRAITS
          </div>

          {dataLoading ? (
            <div style={{ textAlign: "center", color: C.muted, padding: "2rem" }}>
              Chargement...
            </div>
          ) : activityLogs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: C.muted,
                padding: "2rem",
                background: C.card,
                borderRadius: 12,
                border: `1px solid ${C.cardBorder}`,
              }}
            >
              Aucune activité enregistrée
            </div>
          ) : (
            activityLogs.map((log) => {
              const totalQty = log.items.reduce((s, i) => s + i.qty, 0);
              const date = new Date(log.timestamp);
              return (
                <div
                  key={log.id}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.cardBorder}`,
                    borderRadius: 12,
                    padding: "1rem",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        #{log.orderId.slice(-6)}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {date.toLocaleDateString("fr-FR")}{" "}
                        {date.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span
                        style={{
                          background: "rgba(16,185,129,0.15)",
                          color: C.accent,
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {totalQty} article{totalQty > 1 ? "s" : ""}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: C.muted,
                          background: "rgba(255,255,255,0.05)",
                          borderRadius: 6,
                          padding: "2px 6px",
                        }}
                      >
                        {log.collectedBy === "driver" ? "🚚" : "👤"}
                      </span>
                    </div>
                  </div>

                  {log.items.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        paddingLeft: 8,
                        borderLeft: "2px solid rgba(16,185,129,0.3)",
                        marginTop: 4,
                      }}
                    >
                      {item.name} — x{item.qty}
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
