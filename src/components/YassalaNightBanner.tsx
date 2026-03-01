"use client";
import { useEffect, useState } from "react";
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

const DEFAULT_NIGHT = "LIVRAISON NOCTURNE DE 21H À 00H00 · CLICK & COLLECT JUSQU'À 6H · MATOURY UNIQUEMENT";
const DEFAULT_DAY   = "LIVRAISON JOURNÉE DE 8H À 21H · MATOURY UNIQUEMENT";

function isDayAuto(): boolean {
  const h = new Date().getHours();
  return h >= 7 && h < 21;
}

export default function YassalaNightBanner() {
  const [nightText, setNightText] = useState(DEFAULT_NIGHT);
  const [dayText, setDayText]     = useState(DEFAULT_DAY);
  const [override, setOverride]   = useState<"auto" | "day" | "night">("auto");
  const [dayAuto, setDayAuto]     = useState(isDayAuto);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "main"), snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.nightBannerText) setNightText(d.nightBannerText);
        if (d.dayBannerText)   setDayText(d.dayBannerText);
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

  return (
    <div
      style={{
        background: "#ff2d78",
        width: "100%",
        padding: "8px 12px",
        textAlign: "center",
        zIndex: 60,
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          fontFamily: "'Share Tech Mono', monospace, sans-serif",
          fontSize: ".72rem",
          color: "#fff",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        {isDay ? dayText : nightText}
      </span>
    </div>
  );
}
