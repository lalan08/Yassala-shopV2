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
    // Jour → bascule à 21h00
    target.setHours(21, 0, 0, 0);
  } else {
    // Nuit → bascule à 7h00 (potentiellement le lendemain)
    target.setHours(7, 0, 0, 0);
    if (now.getHours() >= 21) target.setDate(target.getDate() + 1);
  }
  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
}

function formatHMS(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ModeCountdownBanner() {
  const pathname = usePathname();
  const [override, setOverride] = useState<"auto" | "day" | "night">("auto");
  const [dayAuto, setDayAuto] = useState(isDayAuto);
  const [seconds, setSeconds] = useState(0);

  // Écoute le themeOverride depuis Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "main"), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setOverride((d.themeOverride ?? "auto") as "auto" | "day" | "night");
      }
    });
    return () => unsub();
  }, []);

  // Recheck l'heure locale chaque minute (pour basculement auto)
  useEffect(() => {
    const id = setInterval(() => setDayAuto(isDayAuto()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isDay = override === "day" ? true : override === "night" ? false : dayAuto;

  // Countdown au prochain changement de mode
  useEffect(() => {
    setSeconds(getSecondsUntilSwitch(isDay));
    const id = setInterval(() => setSeconds(getSecondsUntilSwitch(isDay)), 1000);
    return () => clearInterval(id);
  }, [isDay]);

  if (pathname?.startsWith("/admin")) return null;
  if (pathname?.startsWith("/livreur")) return null;
  if (pathname?.startsWith("/relais")) return null;

  const timeStr = formatHMS(seconds);

  return (
    <div
      style={{
        width: "100%",
        padding: "3px 8px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "linear-gradient(90deg, #6d28d9 0%, #9333ea 45%, #db2777 100%)",
          borderRadius: "8px",
          padding: "5px 16px",
          textAlign: "center",
          boxShadow:
            "0 0 12px rgba(147, 51, 234, 0.5), 0 0 24px rgba(219, 39, 119, 0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <span
          style={{
            fontFamily: "'Share Tech Mono', monospace, sans-serif",
            fontSize: "0.68rem",
            color: "rgba(255,255,255,0.88)",
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {isDay ? "☀ MODE JOUR" : "🌙 MODE NUIT"}
          {" • "}
          {isDay ? "Passage en NUIT dans" : "Passage en JOUR dans"}
          {" "}
          <span
            style={{
              fontWeight: 800,
              fontSize: "0.78rem",
              color: "#fff",
              letterSpacing: "0.06em",
              textShadow: "0 0 8px rgba(255,255,255,0.6)",
            }}
          >
            {timeStr}
          </span>
        </span>
      </div>
    </div>
  );
}
