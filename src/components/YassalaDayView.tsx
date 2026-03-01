"use client";

import { useEffect, useState, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

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

// ── Design tokens jour ───────────────────────────────────────────────────────
const D = {
  bg: "#fffbf2",
  card: "#ffffff",
  cardBorder: "#f0e8d0",
  accent: "#f97316",
  accentDark: "#ea6a00",
  text: "#1a1200",
  muted: "#7a6a4f",
  green: "#16a34a",
  night: "#4f46e5",
};

type Relay = {
  id: string;
  name: string;
  address: string;
  status: "active" | "inactive";
};

// ── Countdown vers 21h ───────────────────────────────────────────────────────
function useCountdownToNight() {
  const getSecondsLeft = () => {
    const now = new Date();
    const target = new Date();
    target.setHours(21, 0, 0, 0);
    if (now >= target) return 0;
    return Math.floor((target.getTime() - now.getTime()) / 1000);
  };

  const [seconds, setSeconds] = useState(getSecondsLeft);

  useEffect(() => {
    const interval = setInterval(() => setSeconds(getSecondsLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export default function YassalaDayView() {
  const [relays, setRelays] = useState<Relay[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState("");
  const countdown = useCountdownToNight();

  // Horloge en temps réel
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Chargement des relais actifs
  const loadRelays = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "relays"), where("status", "==", "active"));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Relay));
      setRelays(data);
    } catch {
      setRelays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRelays();
  }, [loadRelays]);

  return (
    <div style={{
      minHeight: "100vh",
      background: D.bg,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)",
        padding: "0 16px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 12px rgba(249,115,22,0.25)",
      }}>
        <div style={{
          maxWidth: 480,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 0",
        }}>
          <div>
            <div style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.02em",
            }}>
              ☀️ YASSALA DAY
            </div>
            <div style={{
              fontSize: ".72rem",
              color: "rgba(255,255,255,0.85)",
              fontWeight: 500,
            }}>
              Points Relais actifs — 7h à 21h
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "#fff",
              fontVariantNumeric: "tabular-nums",
            }}>
              {clock}
            </div>
          </div>
        </div>
      </div>

      {/* ── BANDEAU BASCULE NIGHT ── */}
      <div style={{
        background: "linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)",
        padding: "10px 16px",
        textAlign: "center",
      }}>
        <div style={{
          maxWidth: 480,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}>
          <span style={{ fontSize: ".8rem", color: "rgba(255,255,255,0.75)" }}>
            🌙 Yassala Night dans
          </span>
          <span style={{
            fontSize: ".85rem",
            fontWeight: 700,
            color: "#c4b5fd",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: ".03em",
          }}>
            {countdown}
          </span>
        </div>
      </div>

      {/* ── CONTENU ── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* Titre section */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            color: D.text,
            margin: "0 0 4px",
          }}>
            📍 Points Relais disponibles
          </h2>
          <p style={{
            fontSize: ".82rem",
            color: D.muted,
            margin: 0,
          }}>
            Commandez et récupérez votre colis près de chez vous
          </p>
        </div>

        {/* ── LISTE RELAIS ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: D.muted }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: ".85rem" }}>Chargement des relais...</div>
          </div>
        ) : relays.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
            background: D.card,
            borderRadius: 16,
            border: `1px solid ${D.cardBorder}`,
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>😴</div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: D.text, marginBottom: 6 }}>
              Aucun relais actif pour l&apos;instant
            </div>
            <div style={{ fontSize: ".82rem", color: D.muted }}>
              Les commerçants partenaires seront disponibles bientôt
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {relays.map((relay) => (
              <RelayCard key={relay.id} relay={relay} />
            ))}
          </div>
        )}

        {/* ── FOOTER INFO ── */}
        <div style={{
          marginTop: 32,
          padding: "16px",
          background: "linear-gradient(135deg, rgba(249,115,22,0.08) 0%, rgba(251,191,36,0.08) 100%)",
          borderRadius: 12,
          border: "1px solid rgba(249,115,22,0.15)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "1.1rem", marginBottom: 6 }}>🛍️</div>
          <div style={{ fontSize: ".82rem", fontWeight: 600, color: D.accent, marginBottom: 4 }}>
            Comment ça marche ?
          </div>
          <div style={{ fontSize: ".78rem", color: D.muted, lineHeight: 1.6 }}>
            Choisissez un relais → passez commande → récupérez votre colis directement chez le commerçant.
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Carte relais ─────────────────────────────────────────────────────────────
function RelayCard({ relay }: { relay: Relay }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: D.card,
        borderRadius: 16,
        border: `1.5px solid ${D.cardBorder}`,
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        transition: "box-shadow .2s",
      }}
    >
      {/* Bande couleur haut */}
      <div style={{
        height: 4,
        background: "linear-gradient(90deg, #f97316, #fbbf24)",
      }} />

      <div style={{ padding: "16px" }}>
        {/* Header carte */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            {/* Badge actif */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(22,163,74,0.1)",
              border: "1px solid rgba(22,163,74,0.25)",
              borderRadius: 20,
              padding: "2px 10px",
              marginBottom: 8,
            }}>
              <div style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: D.green,
                animation: "pulse 2s infinite",
              }} />
              <span style={{ fontSize: ".7rem", fontWeight: 600, color: D.green }}>
                OUVERT
              </span>
            </div>

            <div style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: D.text,
              marginBottom: 4,
            }}>
              {relay.name}
            </div>
            <div style={{
              fontSize: ".8rem",
              color: D.muted,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              📍 {relay.address}
            </div>
          </div>

          {/* Icône commerçant */}
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            flexShrink: 0,
          }}>
            🏪
          </div>
        </div>

        {/* ── Horaires ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          padding: "8px 12px",
          background: "#fffbf0",
          borderRadius: 8,
          border: "1px solid #f0e8d0",
        }}>
          <span style={{ fontSize: ".75rem", color: D.muted }}>⏰ Horaires :</span>
          <span style={{ fontSize: ".78rem", fontWeight: 600, color: D.accent }}>7h00 → 21h00</span>
        </div>

        {/* ── Boutons ── */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 10,
              border: `1.5px solid ${D.accent}`,
              background: "transparent",
              color: D.accent,
              fontWeight: 600,
              fontSize: ".82rem",
              cursor: "pointer",
            }}
          >
            {expanded ? "▲ Masquer" : "▼ Voir les infos"}
          </button>
          <button
            style={{
              flex: 2,
              padding: "10px",
              borderRadius: 10,
              border: "none",
              background: `linear-gradient(135deg, ${D.accent}, #fbbf24)`,
              color: "#fff",
              fontWeight: 700,
              fontSize: ".88rem",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(249,115,22,0.35)",
            }}
          >
            🛒 Commander ici
          </button>
        </div>

        {/* ── Détails dépliables ── */}
        {expanded && (
          <div style={{
            marginTop: 14,
            padding: "14px",
            background: "#fffbf0",
            borderRadius: 10,
            border: "1px solid #f0e8d0",
          }}>
            <div style={{ fontSize: ".78rem", color: D.muted, marginBottom: 8, fontWeight: 600 }}>
              ℹ️ Informations
            </div>
            <div style={{ fontSize: ".8rem", color: D.text, lineHeight: 1.7 }}>
              <div>📦 Retrait sur place disponible</div>
              <div>🕐 Ferme à 21h00</div>
              <div>📍 {relay.address}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
