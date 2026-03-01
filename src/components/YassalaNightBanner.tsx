"use client";

import { useEffect, useState } from "react";

export default function YassalaNightBanner() {
  const [isNight, setIsNight] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const h = now.getHours();
      setIsNight(h >= 22 || h < 6);
      setCurrentTime(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        background: "linear-gradient(90deg, #0c0918 0%, #1a0a2e 30%, #0d0520 60%, #0c0918 100%)",
        borderBottom: "1px solid rgba(255,45,120,.35)",
        overflow: "hidden",
        position: "relative",
        zIndex: 60,
      }}
    >
      {/* Ligne lumineuse top */}
      <div
        style={{
          height: 2,
          background: "linear-gradient(90deg, #ff2d78, #ff6b35, #b8ff00, #00f5ff, #ff2d78)",
          backgroundSize: "400% 100%",
          animation: "nightBannerGrad 3s linear infinite",
        }}
      />

      {/* Contenu défilant */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          height: 36,
          position: "relative",
        }}
      >
        {/* Badge fixe gauche */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            height: "100%",
            background: "linear-gradient(135deg, rgba(255,45,120,.2), rgba(184,255,0,.1))",
            borderRight: "1px solid rgba(255,45,120,.3)",
          }}
        >
          <span style={{ fontSize: "1rem" }}>🌙</span>
          <span
            style={{
              fontFamily: "'Black Ops One', cursive, sans-serif",
              fontSize: ".72rem",
              color: "#ff2d78",
              textShadow: "0 0 12px rgba(255,45,120,.8)",
              letterSpacing: ".08em",
              whiteSpace: "nowrap",
            }}
          >
            YASSALA NIGHT
          </span>
        </div>

        {/* Texte défilant */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            maskImage: "linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 4%, black 96%, transparent 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              whiteSpace: "nowrap",
              animation: "nightBannerScroll 28s linear infinite",
              gap: 0,
            }}
          >
            {[0, 1].map((i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 24, paddingRight: 40 }}>
                <NightItem icon="🍺" text="Livraison de boissons de nuit" color="#00f5ff" />
                <Sep />
                <NightItem icon="🕙" text="Ouvert 22h → 6h du matin" color="#b8ff00" />
                <Sep />
                <NightItem icon="📍" text="Cayenne · Kourou · Rémire-Montjoly" color="#ff6b35" />
                <Sep />
                <NightItem icon="⚡" text="Livraison express en Guyane" color="#ff2d78" />
                <Sep />
                <NightItem icon="🎉" text="Cocktails · Bières · Spiritueux · Rhum" color="#c084fc" />
                <Sep />
                {isNight ? (
                  <NightItem icon="✅" text={`Ouvert maintenant · ${currentTime}`} color="#b8ff00" glow />
                ) : (
                  <NightItem icon="🌅" text={`Ouvre à 22h · Il est ${currentTime}`} color="#ff6b35" />
                )}
                <Sep />
              </span>
            ))}
          </div>
        </div>

        {/* Badge fixe droit */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 14px",
            height: "100%",
            background: "linear-gradient(135deg, rgba(0,245,255,.08), rgba(255,45,120,.12))",
            borderLeft: "1px solid rgba(255,45,120,.3)",
          }}
        >
          <span
            style={{
              fontFamily: "'Share Tech Mono', monospace, sans-serif",
              fontSize: ".6rem",
              color: "#7a6f94",
              letterSpacing: ".1em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            🇬🇫 Guyane
          </span>
        </div>
      </div>

      <style>{`
        @keyframes nightBannerGrad {
          0%   { background-position: 0% 50%; }
          100% { background-position: 400% 50%; }
        }
        @keyframes nightBannerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function NightItem({
  icon,
  text,
  color,
  glow,
}: {
  icon: string;
  text: string;
  color: string;
  glow?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "'Rajdhani', sans-serif, system-ui",
        fontWeight: 600,
        fontSize: ".78rem",
        color,
        letterSpacing: ".04em",
        textShadow: glow ? `0 0 10px ${color}` : undefined,
      }}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </span>
  );
}

function Sep() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: "rgba(255,45,120,.5)",
        flexShrink: 0,
        marginTop: 1,
      }}
    />
  );
}
