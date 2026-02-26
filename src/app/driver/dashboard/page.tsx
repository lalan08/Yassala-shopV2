"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where, getDocs,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig, type DriverProfile, type Delivery } from "@/lib/firebase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');`;
const fmt  = (n: number) => n.toFixed(2).replace(".", ",") + " €";

export default function DriverDashboard() {
  const router = useRouter();
  const [driver,  setDriver]  = useState<DriverProfile | null>(null);
  const [stats,   setStats]   = useState({ today: 0, week: 0, weekEarnings: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  /* ── auth ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("yassala_driver");
      if (!raw) { router.replace("/livreur"); return; }
      setDriver(JSON.parse(raw) as DriverProfile);
    } catch {
      router.replace("/livreur");
    }
  }, []);

  /* ── quick stats ── */
  useEffect(() => {
    if (!driver?.uid) return;
    (async () => {
      try {
        const now   = new Date();
        const today = now.toISOString().slice(0, 10);
        const wkMon = new Date(now);
        wkMon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        wkMon.setHours(0, 0, 0, 0);

        const snap = await getDocs(
          query(collection(db, "deliveries"), where("driverId", "==", driver.uid)),
        );
        const all = snap.docs.map(d => d.data() as Delivery);

        const todayD   = all.filter(d => d.createdAt?.slice(0, 10) === today);
        const weekD    = all.filter(d => d.createdAt >= wkMon.toISOString());
        const pendingD = all.filter(d => d.status === "pending");

        setStats({
          today:        todayD.length,
          week:         weekD.length,
          weekEarnings: weekD.reduce((s, d) => s + d.totalPay, 0),
          pending:      pendingD.length,
        });
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [driver?.uid]);

  if (!driver) return null;

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        .nav-card{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.03);
          border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:18px 20px;
          cursor:pointer;text-decoration:none;color:inherit;transition:background .15s;margin-bottom:12px;}
        .nav-card:hover{background:rgba(255,255,255,.06);}
        .stat-chip{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
          border-radius:10px;padding:14px 18px;flex:1;min-width:120px;}
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse 80% 60% at 80% 10%,rgba(255,45,120,.05) 0%,transparent 60%)",
        padding: "0 0 60px",
      }}>
        {/* top bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          background: "rgba(0,0,0,.3)", backdropFilter: "blur(8px)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#ff2d78", letterSpacing: ".06em" }}>
            YASSALA
          </div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, fontSize: ".85rem", color: "#5a5470" }}>
            DRIVER ZONE
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("yassala_driver");
              router.replace("/livreur");
            }}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#5a5470", cursor: "pointer", fontSize: ".78rem" }}>
            Déconnexion
          </button>
        </div>

        <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto", animation: "fadeUp .3s both" }}>

          {/* greeting */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".8rem", color: "#5a5470", marginBottom: 4 }}>
              {greet},
            </div>
            <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem", color: "#f0eeff" }}>
              {driver.name}
            </div>
          </div>

          {/* quick stats */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            {[
              { label: "Aujourd'hui", value: loading ? "…" : String(stats.today),  unit: "livr.", color: "#00f5ff" },
              { label: "Cette semaine", value: loading ? "…" : String(stats.week), unit: "livr.", color: "#b8ff00" },
              { label: "Gains semaine", value: loading ? "…" : fmt(stats.weekEarnings), unit: "", color: "#a855f7" },
              { label: "En attente", value: loading ? "…" : String(stats.pending), unit: "livr.", color: stats.pending > 0 ? "#ff9500" : "#5a5470" },
            ].map(s => (
              <div key={s.label} className="stat-chip">
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: "1.3rem", color: s.color }}>
                  {s.value} <span style={{ fontSize: ".7rem", color: "#5a5470" }}>{s.unit}</span>
                </div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".68rem", color: "#5a5470", marginTop: 2 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* navigation cards */}
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: ".72rem", color: "#5a5470", letterSpacing: ".1em", marginBottom: 12 }}>
            NAVIGATION
          </div>

          <a onClick={() => router.push("/livreur")} className="nav-card">
            <div style={{ fontSize: "1.6rem" }}>🏍️</div>
            <div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "#f0eeff" }}>
                Portail livreur
              </div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470" }}>
                GPS · commandes · dispatch
              </div>
            </div>
            <div style={{ marginLeft: "auto", color: "#5a5470" }}>→</div>
          </a>

          <a onClick={() => router.push("/driver/wallet")} className="nav-card"
            style={{ borderColor: "rgba(0,245,255,.2)" }}>
            <div style={{ fontSize: "1.6rem" }}>💰</div>
            <div>
              <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "#00f5ff" }}>
                Mon Wallet
              </div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470" }}>
                gains · cash · paiements
              </div>
            </div>
            <div style={{ marginLeft: "auto", color: "#00f5ff" }}>→</div>
          </a>

          {/* info block */}
          <div style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 10, padding: "14px 18px", marginTop: 8,
          }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470", marginBottom: 8 }}>
              ℹ️  INFOS COMPTE
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              {[
                ["Téléphone", driver.phone],
                ["UID", driver.uid?.slice(0, 8) + "…"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".65rem", color: "#5a5470" }}>{k}</div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#f0eeff" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
