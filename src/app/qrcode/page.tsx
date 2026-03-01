"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import QRCode from "qrcode";
import Link from "next/link";
import { Suspense } from "react";

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

type OrderData = {
  id: string;
  orderNumber?: number;
  name?: string;
  total: number;
  status: string;
  fulfillmentMode?: string;
  qrToken?: string;
  qrExpiresAt?: string;
  relayName?: string;
  items: string;
  createdAt: string;
};

function QrCodeContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [expired, setExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!orderId) {
      setError("Identifiant de commande manquant");
      setLoading(false);
      return;
    }
    loadOrder();
  }, [orderId]);

  async function loadOrder() {
    try {
      const orderSnap = await getDoc(doc(db, "orders", orderId!));
      if (!orderSnap.exists()) {
        setError("Commande introuvable");
        setLoading(false);
        return;
      }

      const data = orderSnap.data() as Omit<OrderData, "id">;
      const orderData = { id: orderSnap.id, ...data };
      setOrder(orderData);

      if (!orderData.qrToken) {
        setError("Aucun QR code disponible pour cette commande");
        setLoading(false);
        return;
      }

      // Check if already collected
      if (orderData.status === "COLLECTED" || orderData.status === "CLOSED") {
        setError("Cette commande a déjà été récupérée");
        setLoading(false);
        return;
      }

      // Check expiry
      if (orderData.qrExpiresAt) {
        const exp = new Date(orderData.qrExpiresAt);
        if (new Date() > exp) {
          setExpired(true);
        }
      }

      // Generate QR code
      const qrPayload = JSON.stringify({
        orderId: orderData.id,
        qrToken: orderData.qrToken,
      });

      const url = await QRCode.toDataURL(qrPayload, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(url);
    } catch (err) {
      console.error(err);
      setError("Erreur lors du chargement");
    }
    setLoading(false);
  }

  // Countdown timer
  useEffect(() => {
    if (!order?.qrExpiresAt) return;

    const updateTimer = () => {
      const exp = new Date(order.qrExpiresAt!);
      const now = new Date();
      const diff = exp.getTime() - now.getTime();

      if (diff <= 0) {
        setExpired(true);
        setTimeLeft("Expiré");
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order?.qrExpiresAt]);

  // Parse items
  let parsedItems: { name: string; qty: number }[] = [];
  if (order?.items) {
    try {
      const raw =
        typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      if (Array.isArray(raw)) {
        parsedItems = raw.map((i: any) => ({
          name: i.name || i.productName || "Produit",
          qty: i.quantity || i.qty || 1,
        }));
      }
    } catch {}
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#04020a",
        color: "#f0eeff",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "2rem 1rem",
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.7;} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:translateY(0);} }
        .fade { animation: fadeUp 0.4s ease both; }
      `}</style>

      {/* Header */}
      <div className="fade" style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#b8ff00",
            margin: 0,
          }}
        >
          QR Code Retrait
        </h1>
        <p
          style={{
            color: "#94a3b8",
            fontSize: 13,
            marginTop: 6,
          }}
        >
          Présentez ce code au relais pour récupérer votre commande
        </p>
      </div>

      {loading && (
        <div style={{ color: "#94a3b8", textAlign: "center", padding: "3rem" }}>
          Chargement du QR code...
        </div>
      )}

      {!loading && error && (
        <div
          className="fade"
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 16,
            padding: "2rem",
            textAlign: "center",
            maxWidth: 360,
            width: "100%",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <p style={{ color: "#fca5a5", fontWeight: 600 }}>{error}</p>
          <Link href="/">
            <button
              style={{
                marginTop: "1rem",
                background: "transparent",
                border: "1px solid #94a3b8",
                borderRadius: 8,
                padding: "10px 20px",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Retour à l&apos;accueil
            </button>
          </Link>
        </div>
      )}

      {!loading && !error && order && (
        <>
          {/* Order info */}
          <div
            className="fade"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: "1rem 1.25rem",
              marginBottom: "1.5rem",
              maxWidth: 360,
              width: "100%",
              fontSize: 13,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <div>
                <div style={{ color: "#94a3b8" }}>Commande</div>
                <div style={{ fontWeight: 700 }}>
                  #{order.orderNumber || order.id.slice(-6)}
                </div>
              </div>
              <div>
                <div style={{ color: "#94a3b8" }}>Total</div>
                <div style={{ fontWeight: 700, color: "#b8ff00" }}>
                  {order.total?.toFixed(2)} €
                </div>
              </div>
              <div>
                <div style={{ color: "#94a3b8" }}>Mode</div>
                <div style={{ fontWeight: 600 }}>
                  {order.fulfillmentMode === "DELIVERY"
                    ? "🚚 Livraison"
                    : "🏪 Click & Collect"}
                </div>
              </div>
              <div>
                <div style={{ color: "#94a3b8" }}>Expire dans</div>
                <div
                  style={{
                    fontWeight: 700,
                    color: expired ? "#ef4444" : "#10b981",
                  }}
                >
                  {timeLeft || "—"}
                </div>
              </div>
            </div>

            {parsedItems.length > 0 && (
              <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ color: "#94a3b8", marginBottom: 4 }}>Produits</div>
                {parsedItems.map((item, i) => (
                  <div
                    key={i}
                    style={{ fontSize: 12, color: "#cbd5e1" }}
                  >
                    • {item.name} × {item.qty}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* QR Code */}
          <div
            className="fade"
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "1.5rem",
              marginBottom: "1.5rem",
              boxShadow: "0 0 40px rgba(184,255,0,0.15)",
              opacity: expired ? 0.4 : 1,
              position: "relative",
            }}
          >
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR Code de retrait"
                style={{
                  display: "block",
                  width: 260,
                  height: 260,
                  imageRendering: "pixelated",
                }}
              />
            )}
            {expired && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.6)",
                  borderRadius: 20,
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 36 }}>⏰</span>
                <span
                  style={{
                    color: "#fca5a5",
                    fontWeight: 700,
                    fontSize: 18,
                    background: "rgba(0,0,0,0.8)",
                    padding: "4px 12px",
                    borderRadius: 8,
                  }}
                >
                  QR expiré
                </span>
              </div>
            )}
          </div>

          {expired && (
            <div
              className="fade"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 10,
                padding: "0.75rem 1rem",
                maxWidth: 360,
                width: "100%",
                textAlign: "center",
                color: "#fca5a5",
                fontSize: 13,
                marginBottom: "1rem",
              }}
            >
              Ce QR code a expiré. Contactez le support Yassala.
            </div>
          )}

          {!expired && (
            <div
              className="fade"
              style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 10,
                padding: "0.75rem 1rem",
                maxWidth: 360,
                width: "100%",
                textAlign: "center",
                color: "#6ee7b7",
                fontSize: 13,
                marginBottom: "1.5rem",
              }}
            >
              ✓ QR code valide · Utilisable 1 seule fois
            </div>
          )}

          <div className="fade" style={{ maxWidth: 360, width: "100%" }}>
            <Link href="/">
              <button
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 10,
                  padding: "12px",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Retour à l&apos;accueil
              </button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function QrCodePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#04020a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
          }}
        >
          Chargement...
        </div>
      }
    >
      <QrCodeContent />
    </Suspense>
  );
}
