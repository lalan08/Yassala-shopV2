"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

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

function isDayAuto(): boolean {
  const h = new Date().getHours();
  return h >= 7 && h < 21;
}

function getSecondsUntilSwitch(isDay: boolean): number {
  const now = new Date();
  const target = new Date(now);
  if (isDay) {
    target.setHours(21, 0, 0, 0);
  } else {
    target.setHours(7, 0, 0, 0);
    if (now.getHours() >= 21) target.setDate(target.getDate() + 1);
  }
  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function ModeCountdownBanner() {
  const pathname = usePathname();
  const [override, setOverride] = useState<"auto" | "day" | "night">("auto");
  const [dayAuto, setDayAuto] = useState(isDayAuto);
  const [seconds, setSeconds] = useState(0);
  const [tick, setTick] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "main"), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setOverride((d.themeOverride ?? "auto") as "auto" | "day" | "night");
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setDayAuto(isDayAuto()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isDay = override === "day" ? true : override === "night" ? false : dayAuto;

  useEffect(() => {
    setSeconds(getSecondsUntilSwitch(isDay));
    const id = setInterval(() => {
      setSeconds(getSecondsUntilSwitch(isDay));
      setTick(t => !t);
    }, 1000);
    return () => clearInterval(id);
  }, [isDay]);

  if (pathname?.startsWith("/admin")) return null;
  if (pathname?.startsWith("/livreur")) return null;
  if (pathname?.startsWith("/relais")) return null;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const dayGrad = "linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #ec4899 100%)";
  const nightGrad = "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #db2777 100%)";
  const activeGrad = isDay ? dayGrad : nightGrad;

  const dayGlow = "0 0 20px rgba(245,158,11,.5), 0 0 40px rgba(239,68,68,.3)";
  const nightGlow = "0 0 20px rgba(124,58,237,.6), 0 0 40px rgba(219,39,119,.4)";
  const activeGlow = isDay ? dayGlow : nightGlow;

  const segBg = isDay
    ? "rgba(0,0,0,.25)"
    : "rgba(0,0,0,.35)";
  const segBorder = isDay
    ? "1px solid rgba(255,255,255,.18)"
    : "1px solid rgba(255,255,255,.12)";

  return (
    <>
      <style>{`
        @keyframes countPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes dotBlink {
          0%,45% { opacity: 1; }
          55%,100% { opacity: .15; }
        }
        .countdown-digit {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .countdown-num {
          font-family: 'Share Tech Mono', 'Courier New', monospace;
          font-weight: 900;
          line-height: 1;
          letter-spacing: .02em;
          color: #fff;
          text-shadow: 0 0 12px rgba(255,255,255,.7), 0 2px 4px rgba(0,0,0,.4);
        }
        .countdown-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: .45rem;
          letter-spacing: .15em;
          text-transform: uppercase;
          color: rgba(255,255,255,.55);
          margin-top: 2px;
        }
        .countdown-sep {
          font-family: 'Share Tech Mono', monospace;
          font-weight: 900;
          color: rgba(255,255,255,.6);
          animation: dotBlink 1s infinite;
          padding: 0 1px;
          line-height: 1;
          align-self: flex-start;
          margin-top: 2px;
        }
        .mode-badge {
          font-family: 'Share Tech Mono', monospace;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          white-space: nowrap;
        }
      `}</style>

      <div style={{ width: "100%", padding: "4px 8px", boxSizing: "border-box" }}>
        <div
          style={{
            background: activeGrad,
            borderRadius: 12,
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            boxShadow: activeGlow + ", inset 0 1px 0 rgba(255,255,255,.15)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Shimmer overlay */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,.08) 50%, transparent 60%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 3s linear infinite",
          }} />

          {/* Mode badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: "1rem", lineHeight: 1 }}>
              {isDay ? "☀️" : "🌙"}
            </span>
            <div>
              <div className="mode-badge" style={{ fontSize: ".58rem", color: "rgba(255,255,255,.95)" }}>
                {isDay ? "Mode Jour" : "Mode Nuit"}
              </div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: ".46rem",
                color: "rgba(255,255,255,.55)",
                letterSpacing: ".1em",
              }}>
                {isDay ? "→ NUIT dans" : "→ JOUR dans"}
              </div>
            </div>
          </div>

          {/* Countdown digits */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: segBg,
            border: segBorder,
            borderRadius: 10,
            padding: "5px 10px",
            backdropFilter: "blur(4px)",
            flexShrink: 0,
            animation: tick ? "countPulse .15s ease-out" : "none",
          }}>
            {/* Heures */}
            <div className="countdown-digit">
              <span className="countdown-num" style={{ fontSize: ".95rem" }}>{pad(h)}</span>
              <span className="countdown-label">h</span>
            </div>

            <span className="countdown-sep" style={{ fontSize: "1rem", marginBottom: 8 }}>:</span>

            {/* Minutes */}
            <div className="countdown-digit">
              <span className="countdown-num" style={{ fontSize: ".95rem" }}>{pad(m)}</span>
              <span className="countdown-label">min</span>
            </div>

            <span className="countdown-sep" style={{ fontSize: "1rem", marginBottom: 8 }}>:</span>

            {/* Secondes */}
            <div className="countdown-digit">
              <span className="countdown-num" style={{ fontSize: ".95rem" }}>{pad(s)}</span>
              <span className="countdown-label">sec</span>
            </div>
          </div>

          {/* Petite barre de progression */}
          <div style={{
            position: "absolute",
            bottom: 0, left: 0,
            height: 2,
            width: `${Math.min(100, (1 - seconds / (isDay ? 50400 : 43200)) * 100)}%`,
            background: "rgba(255,255,255,.45)",
            borderRadius: "0 2px 0 0",
            transition: "width 1s linear",
          }} />
        </div>
      </div>
    </>
  );
}
