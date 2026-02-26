"use client";
/**
 * PAGE DE SEED — /dev/seed
 * Insère des données de test pour le module rémunération.
 * ⚠️  À utiliser uniquement en développement.
 */
import { useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, doc, setDoc, addDoc,
  collection, serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig } from "@/lib/firebase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');`;

// ── données test ─────────────────────────────────────────────
const DRIVERS = [
  {
    uid:           "driver_test_001",
    name:          "Jean Dallou",
    phone:         "0694111222",
    status:        "offline",
    isOnline:      false,
    iban:          "FR76 3000 1234 5678 9012 3456 789",
    paymentMethod: "bank",
    role:          "driver",
    createdAt:     new Date().toISOString(),
  },
  {
    uid:           "driver_test_002",
    name:          "Marie Contard",
    phone:         "0694333444",
    status:        "offline",
    isOnline:      false,
    iban:          "",
    paymentMethod: "cash",
    role:          "driver",
    createdAt:     new Date().toISOString(),
  },
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeDeliveries() {
  const rows = [
    // Jean — validées + à payer
    { driverId: "driver_test_001", orderId: "ORD_A1B2", paymentType: "ONLINE", cashCollectedAmount: 0,     basePay: 4.50, bonusPay: 1.00, totalPay: 5.50, status: "validated", cashStatus: "unsettled", createdAt: daysAgo(1) },
    { driverId: "driver_test_001", orderId: "ORD_C3D4", paymentType: "CASH",   cashCollectedAmount: 18.90, basePay: 4.50, bonusPay: 0,    totalPay: 4.50, status: "validated", cashStatus: "unsettled", createdAt: daysAgo(2) },
    { driverId: "driver_test_001", orderId: "ORD_E5F6", paymentType: "ONLINE", cashCollectedAmount: 0,     basePay: 5.00, bonusPay: 2.00, totalPay: 7.00, status: "validated", cashStatus: "unsettled", createdAt: daysAgo(2) },
    { driverId: "driver_test_001", orderId: "ORD_G7H8", paymentType: "CASH",   cashCollectedAmount: 24.50, basePay: 4.50, bonusPay: 0,    totalPay: 4.50, status: "validated", cashStatus: "unsettled", createdAt: daysAgo(3) },
    // Jean — en attente de validation
    { driverId: "driver_test_001", orderId: "ORD_I9J0", paymentType: "ONLINE", cashCollectedAmount: 0,     basePay: 4.00, bonusPay: 0,    totalPay: 4.00, status: "pending",   cashStatus: "unsettled", createdAt: daysAgo(0) },
    // Jean — déjà payée
    { driverId: "driver_test_001", orderId: "ORD_K1L2", paymentType: "ONLINE", cashCollectedAmount: 0,     basePay: 5.00, bonusPay: 1.50, totalPay: 6.50, status: "paid",      cashStatus: "unsettled", createdAt: daysAgo(8) },

    // Marie — validées
    { driverId: "driver_test_002", orderId: "ORD_M3N4", paymentType: "CASH",   cashCollectedAmount: 15.00, basePay: 4.50, bonusPay: 0,    totalPay: 4.50, status: "validated", cashStatus: "unsettled", createdAt: daysAgo(1) },
    { driverId: "driver_test_002", orderId: "ORD_O5P6", paymentType: "ONLINE", cashCollectedAmount: 0,     basePay: 4.00, bonusPay: 1.00, totalPay: 5.00, status: "validated", cashStatus: "unsettled", createdAt: daysAgo(2) },
    { driverId: "driver_test_002", orderId: "ORD_Q7R8", paymentType: "CASH",   cashCollectedAmount: 32.00, basePay: 5.00, bonusPay: 0,    totalPay: 5.00, status: "validated", cashStatus: "settled",   createdAt: daysAgo(3) },
    // Marie — en attente
    { driverId: "driver_test_002", orderId: "ORD_S9T0", paymentType: "ONLINE", cashCollectedAmount: 0,     basePay: 4.00, bonusPay: 0,    totalPay: 4.00, status: "pending",   cashStatus: "unsettled", createdAt: daysAgo(0) },
  ];
  return rows;
}

const PAYOUT_EXAMPLE = {
  driverId:      "driver_test_001",
  weekStart:     daysAgo(14).slice(0, 10),
  weekEnd:       daysAgo(8).slice(0, 10),
  deliveriesIds: ["ORD_K1L2"],
  totalEarnings: 6.50,
  cashToReturn:  0,
  netPaid:       6.50,
  status:        "paid",
  paidAt:        daysAgo(8),
  paidMethod:    "bank",
  paidReference: "VIRT-2026-001",
  createdAt:     daysAgo(8),
  createdBy:     "admin",
};

// ── component ────────────────────────────────────────────────
export default function SeedPage() {
  const [log,     setLog]     = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done,    setDone]    = useState(false);

  const push = (msg: string) => setLog(l => [...l, msg]);

  const runSeed = async () => {
    setRunning(true);
    setLog([]);
    setDone(false);

    try {
      // 1. drivers
      push("📝 Création des livreurs…");
      for (const d of DRIVERS) {
        await setDoc(doc(db, "drivers", d.uid), d, { merge: true });
        push(`   ✓ driver: ${d.name} (${d.uid})`);
      }

      // 2. deliveries
      push("📦 Création des livraisons…");
      const deliveries = makeDeliveries();
      for (const d of deliveries) {
        const ref = await addDoc(collection(db, "deliveries"), d);
        push(`   ✓ delivery ${d.orderId} → ${d.driverId.slice(-3)} [${d.status}]`);
      }

      // 3. payout example
      push("💰 Création du payout exemple…");
      const payRef = await addDoc(collection(db, "payouts"), PAYOUT_EXAMPLE);
      push(`   ✓ payout: ${payRef.id}`);

      push("");
      push("✅ SEED TERMINÉ — 2 drivers, 10 livraisons, 1 payout");
      setDone(true);
    } catch (e: any) {
      push("❌ ERREUR : " + e.message);
    }

    setRunning(false);
  };

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
      `}</style>

      <div style={{
        minHeight: "100vh", background: "#0a0a12",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "flex-start", padding: "40px 20px",
      }}>
        <div style={{ width: "100%", maxWidth: 560, animation: "fadeUp .3s both" }}>

          {/* header */}
          <div style={{
            fontFamily: "'Black Ops One',cursive", fontSize: "1.6rem",
            color: "#ff2d78", marginBottom: 4,
          }}>SEED DATA</div>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem",
            color: "#5a5470", marginBottom: 28,
          }}>
            /dev/seed — insère des données de test Firestore<br />
            ⚠️ Dev uniquement — ne pas utiliser en production
          </div>

          {/* what will be inserted */}
          <div style={{
            background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 10, padding: "16px 20px", marginBottom: 24,
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", lineHeight: 1.8,
          }}>
            <div style={{ color: "#00f5ff", marginBottom: 8 }}>// Ce qui sera inséré :</div>
            <div style={{ color: "#b8ff00" }}>drivers/driver_test_001</div>
            <div style={{ color: "#5a5470", marginLeft: 16 }}>Jean Dallou · IBAN · 6 livraisons</div>
            <div style={{ color: "#b8ff00" }}>drivers/driver_test_002</div>
            <div style={{ color: "#5a5470", marginLeft: 16 }}>Marie Contard · cash · 4 livraisons</div>
            <div style={{ color: "#a855f7", marginTop: 6 }}>10 deliveries (ONLINE + CASH, pending + validated + paid)</div>
            <div style={{ color: "#a855f7" }}>1 payout exemple (payé semaine précédente)</div>
          </div>

          {/* URLs */}
          <div style={{
            background: "rgba(0,245,255,.04)", border: "1px solid rgba(0,245,255,.15)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 24,
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", lineHeight: 1.9,
          }}>
            <div style={{ color: "#00f5ff", marginBottom: 6 }}>// URLs à tester après seed :</div>
            {[
              ["/driver/dashboard",          "Driver dashboard (auth via /livreur)"],
              ["/driver/wallet",             "Wallet du livreur connecté"],
              ["/admin/payouts",             "Table rémunération admin"],
              ["/admin/payouts/driver_test_001", "Détail Jean Dallou"],
              ["/admin/payouts/driver_test_002", "Détail Marie Contard"],
            ].map(([url, desc]) => (
              <div key={url}>
                <span style={{ color: "#b8ff00" }}>{url}</span>
                <span style={{ color: "#5a5470" }}> — {desc}</span>
              </div>
            ))}
          </div>

          {/* button */}
          <button
            onClick={runSeed}
            disabled={running}
            style={{
              width: "100%", padding: "14px",
              background: done ? "#b8ff00" : running ? "rgba(255,45,120,.4)" : "#ff2d78",
              color: "#000", border: "none", borderRadius: 10, cursor: running ? "wait" : "pointer",
              fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: "1rem",
              marginBottom: 20, transition: "background .2s",
            }}
          >
            {running ? "Insertion en cours…" : done ? "✓ Seed terminé — relancer ?" : "🌱 Lancer le seed"}
          </button>

          {/* log */}
          {log.length > 0 && (
            <div style={{
              background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 10, padding: "16px 18px",
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem",
              lineHeight: 1.8, maxHeight: 300, overflowY: "auto",
            }}>
              {log.map((l, i) => (
                <div key={i} style={{
                  color: l.startsWith("✅") ? "#b8ff00"
                       : l.startsWith("❌") ? "#ff2d78"
                       : l.startsWith("   ✓") ? "#00f5ff"
                       : "#5a5470",
                }}>{l || "\u00a0"}</div>
              ))}
            </div>
          )}

          {done && (
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {[
                ["/admin/payouts",    "→ Admin payouts"],
                ["/driver/dashboard", "→ Driver dashboard"],
              ].map(([href, label]) => (
                <a key={href} href={href} style={{
                  flex: 1, textAlign: "center",
                  background: "rgba(255,255,255,.06)", color: "#f0eeff",
                  border: "1px solid rgba(255,255,255,.1)", borderRadius: 8,
                  padding: "10px", fontFamily: "'Inter',sans-serif",
                  fontWeight: 600, fontSize: ".82rem", textDecoration: "none",
                }}>{label}</a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
