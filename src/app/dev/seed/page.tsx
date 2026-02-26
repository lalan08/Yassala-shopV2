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
  collection, serverTimestamp, Timestamp,
  getDocs, limit as limitQ, query as fbQuery,
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

// ── boost test scenario ───────────────────────────────────────
// 2 online drivers + 10 pending orders → ratio 5 → boost +5.00€
const BOOST_DRIVERS = [
  {
    uid:       "boost_driver_001",
    name:      "Alex Dural",
    phone:     "0694555001",
    status:    "online",
    isOnline:  true,
    lastSeen:  Timestamp.now(),
    role:      "driver",
    createdAt: new Date().toISOString(),
  },
  {
    uid:       "boost_driver_002",
    name:      "Cécile Numa",
    phone:     "0694555002",
    status:    "online",
    isOnline:  true,
    lastSeen:  Timestamp.now(),
    role:      "driver",
    createdAt: new Date().toISOString(),
  },
];

function makeBoostOrders() {
  return Array.from({ length: 10 }, (_, i) => ({
    status:    "nouveau",
    createdAt: new Date().toISOString(),
    total:     Math.round((12 + i * 1.5) * 100) / 100,
    address:   `${10 + i} rue de Cayenne, Matoury`,
    customerName: `Client Test ${i + 1}`,
  }));
}

// ── fraud test scenario ───────────────────────────────────────
// 2 drivers + 10 livraisons dont 3 frauduleuses pré-calculées
const FRAUD_DRIVERS = [
  {
    uid:                    "fraud_driver_001",
    name:                   "Paulo Droz",
    phone:                  "0694777001",
    status:                 "offline",
    isOnline:               false,
    role:                   "driver",
    createdAt:              new Date().toISOString(),
    riskScore:              40,
    strikesCount:           1,
    isBlocked:              false,
    suspiciousEventsCount:  1,
    paymentMethod:          "bank",
    iban:                   "FR76 3000 9999 0000",
  },
  {
    uid:                    "fraud_driver_002",
    name:                   "Sandra Félix",
    phone:                  "0694777002",
    status:                 "offline",
    isOnline:               false,
    role:                   "driver",
    createdAt:              new Date().toISOString(),
    riskScore:              85,
    strikesCount:           4,
    isBlocked:              true,
    suspiciousEventsCount:  4,
    paymentMethod:          "cash",
    iban:                   "",
  },
];

function makeFraudDeliveries() {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
  const oneHourAgo = new Date(Date.now() -      3600_000).toISOString();
  const twoHAgo    = new Date(Date.now() -  2 * 3600_000).toISOString();

  return [
    // 1. DROP_NOT_AT_CUSTOMER : driver était à 350m du client
    {
      driverId: "fraud_driver_001", orderId: "ORD_FRAUD_001",
      paymentType: "ONLINE", cashCollectedAmount: 0,
      basePay: 4.50, bonusPay: 0, totalPay: 4.50,
      status: "validated", cashStatus: "unsettled", createdAt: oneHourAgo,
      acceptedAt: oneHourAgo,
      deliveredAt: new Date(Date.parse(oneHourAgo) + 30 * 60_000).toISOString(),
      distanceKmEstimated: 2.5,
      pickupLocation:         { lat: 4.850, lng: -52.330 },
      dropoffLocation:        { lat: 4.852, lng: -52.335 },
      driverLocationAtPickup: { lat: 4.850, lng: -52.330, accuracy: 15 },
      driverLocationAtDropoff:{ lat: 4.8547, lng: -52.335, accuracy: 20 }, // 350m north
      fraudFlags:   ["DROP_NOT_AT_CUSTOMER"],
      fraudScore:   40,
      reviewStatus: "ok",
      reviewedByAdmin: false,
    },
    // 2. IMPOSSIBLE_SPEED : 5km en 1 min = 300km/h
    {
      driverId: "fraud_driver_002", orderId: "ORD_FRAUD_002",
      paymentType: "ONLINE", cashCollectedAmount: 0,
      basePay: 5.00, bonusPay: 2.00, totalPay: 7.00,
      status: "validated", cashStatus: "unsettled", createdAt: twoHAgo,
      acceptedAt: twoHAgo,
      deliveredAt: new Date(Date.parse(twoHAgo) + 60_000).toISOString(), // 1 min
      distanceKmEstimated: 5.0,
      fraudFlags:   ["IMPOSSIBLE_SPEED", "TOO_FAST_FOR_DISTANCE"],
      fraudScore:   65,
      reviewStatus: "warning",
      reviewedByAdmin: false,
    },
    // 3. CASH_NOT_SETTLED_24H : cash non reversé depuis 2 jours
    {
      driverId: "fraud_driver_002", orderId: "ORD_FRAUD_003",
      paymentType: "CASH", cashCollectedAmount: 28.50,
      basePay: 4.50, bonusPay: 0, totalPay: 4.50,
      status: "validated", cashStatus: "unsettled", createdAt: twoDaysAgo,
      acceptedAt: twoDaysAgo,
      deliveredAt: new Date(Date.parse(twoDaysAgo) + 45 * 60_000).toISOString(),
      distanceKmEstimated: 3.0,
      fraudFlags:   ["CASH_NOT_SETTLED_24H"],
      fraudScore:   40,
      reviewStatus: "ok",
      reviewedByAdmin: false,
    },
    // 4-7. Livraisons normales pour compléter l'historique
    ...Array.from({ length: 4 }, (_, i) => ({
      driverId: i < 2 ? "fraud_driver_001" : "fraud_driver_002",
      orderId: `ORD_FRAUD_00${i + 4}`,
      paymentType: "ONLINE" as const, cashCollectedAmount: 0,
      basePay: 4.00 + i * 0.5, bonusPay: 0, totalPay: 4.00 + i * 0.5,
      status: "validated", cashStatus: "unsettled",
      createdAt: new Date(Date.now() - (i + 3) * 3600_000).toISOString(),
      distanceKmEstimated: 1.5 + i,
      fraudFlags: [] as string[], fraudScore: 0, reviewStatus: "ok", reviewedByAdmin: false,
    })),
  ];
}

const FRAUD_EVENTS_SEED = [
  { driverId: "fraud_driver_001", orderId: "ORD_FRAUD_001", type: "DROP_NOT_AT_CUSTOMER", severity: "high",   scoreImpact: 40, details: { distanceM: 348, accuracyM: 20 },                          createdAt: new Date(Date.now() -     3600_000).toISOString(), resolved: false, resolvedAt: null, resolvedBy: null },
  { driverId: "fraud_driver_002", orderId: "ORD_FRAUD_002", type: "IMPOSSIBLE_SPEED",     severity: "high",   scoreImpact: 35, details: { speedKmh: 300, distanceKm: 5, durationMin: 1 },            createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(), resolved: false, resolvedAt: null, resolvedBy: null },
  { driverId: "fraud_driver_002", orderId: "ORD_FRAUD_002", type: "TOO_FAST_FOR_DISTANCE",severity: "high",   scoreImpact: 30, details: { durationMin: 1, distanceKm: 5 },                          createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(), resolved: false, resolvedAt: null, resolvedBy: null },
  { driverId: "fraud_driver_002", orderId: "ORD_FRAUD_003", type: "CASH_NOT_SETTLED_24H", severity: "high",   scoreImpact: 40, details: { ageHours: 48, cashAmount: 28.50 },                        createdAt: new Date(Date.now() -     3600_000).toISOString(), resolved: false, resolvedAt: null, resolvedBy: null },
];

// ── upsell test products ──────────────────────────────────────
// Scenario: panier vodka → must suggest glaçons + redbull + citron
const UPSELL_PRODUCTS = [
  { id: "upsell_vodka_001",   name: "Vodka Absolut 70cl",     cat: "spiritueux", price: 18.50, stock: 20, badge: "🥃", isActive: true, tags: ["alcool","vodka"],          soldCount: 42 },
  { id: "upsell_glacons_001", name: "Glaçons 1kg",            cat: "glace",      price: 2.50,  stock: 30, badge: "🧊", isActive: true, tags: ["glace","ice","glaçon"],    soldCount: 87 },
  { id: "upsell_redbull_001", name: "Red Bull 25cl x4",       cat: "soft",       price: 7.90,  stock: 15, badge: "⚡", isActive: true, tags: ["soft","redbull","energy"], soldCount: 65 },
  { id: "upsell_citron_001",  name: "Citrons verts x4",       cat: "soft",       price: 2.00,  stock: 25, badge: "🍋", isActive: true, tags: ["citron","lime","fruit"],   soldCount: 38 },
  { id: "upsell_coca_001",    name: "Coca-Cola 1.5L",         cat: "soft",       price: 3.20,  stock: 40, badge: "🥤", isActive: true, tags: ["soft","coca","soda"],      soldCount: 93 },
  { id: "upsell_chips_001",   name: "Chips Lays 200g",        cat: "snack",      price: 3.50,  stock: 18, badge: "🥔", isActive: true, tags: ["snack","chips"],           soldCount: 55 },
  { id: "upsell_biere_001",   name: "Pack Hinano 6×25cl",     cat: "biere",      price: 9.90,  stock: 12, badge: "🍺", isActive: true, tags: ["biere","beer","pack"],     soldCount: 71 },
  { id: "upsell_cacah_001",   name: "Cacahuètes salées 150g", cat: "snack",      price: 2.80,  stock: 22, badge: "🥜", isActive: true, tags: ["snack","cacahuete","nuts"],soldCount: 44 },
];

// ── component ────────────────────────────────────────────────
export default function SeedPage() {
  const [log,           setLog]           = useState<string[]>([]);
  const [running,       setRunning]       = useState(false);
  const [done,          setDone]          = useState(false);
  const [fraudLog,      setFraudLog]      = useState<string[]>([]);
  const [fraudRunning,  setFraudRunning]  = useState(false);
  const [fraudDone,     setFraudDone]     = useState(false);
  const [upsellLog,     setUpsellLog]     = useState<string[]>([]);
  const [upsellRunning, setUpsellRunning] = useState(false);
  const [upsellDone,    setUpsellDone]    = useState(false);

  const [promoLog,     setPromoLog]     = useState<string[]>([]);
  const [promoRunning, setPromoRunning] = useState(false);
  const [promoDone,    setPromoDone]    = useState(false);

  const push       = (msg: string) => setLog(l => [...l, msg]);
  const pushFraud  = (msg: string) => setFraudLog(l => [...l, msg]);
  const pushUpsell = (msg: string) => setUpsellLog(l => [...l, msg]);
  const pushPromo  = (msg: string) => setPromoLog(l => [...l, msg]);

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

      // 4. boost test scenario
      push("");
      push("🚀 Scenario boost (2 livreurs online + 10 commandes nouveau)…");
      for (const d of BOOST_DRIVERS) {
        await setDoc(doc(db, "drivers", d.uid), d, { merge: true });
        push(`   ✓ boost driver: ${d.name} [online]`);
      }
      const boostOrders = makeBoostOrders();
      for (const o of boostOrders) {
        await addDoc(collection(db, "orders"), o);
      }
      push(`   ✓ ${boostOrders.length} commandes "nouveau" créées`);
      push(`   → ratio = ${boostOrders.length}/2 = ${boostOrders.length / 2} → boost +5.00€`);
      push(`   → Déclencher via POST /api/boost (x-admin-secret: yassala2025)`);

      push("");
      push("✅ SEED TERMINÉ — 2 drivers, 10 livraisons, 1 payout, 2 boost drivers, 10 orders");
      setDone(true);
    } catch (e: any) {
      push("❌ ERREUR : " + e.message);
    }

    setRunning(false);
  };

  const runFraudSeed = async () => {
    setFraudRunning(true);
    setFraudLog([]);
    setFraudDone(false);
    try {
      // 1. Fraud drivers
      pushFraud("🚨 Création des drivers frauduleux…");
      for (const d of FRAUD_DRIVERS) {
        await setDoc(doc(db, "drivers", d.uid), d, { merge: true });
        pushFraud(`   ✓ driver: ${d.name} · riskScore=${d.riskScore} · blocked=${d.isBlocked}`);
      }
      // 2. Fraud deliveries
      pushFraud("📦 Création des livraisons (3 frauduleuses + 4 normales)…");
      const fDels = makeFraudDeliveries();
      for (const d of fDels) {
        await addDoc(collection(db, "deliveries"), d);
        const flagLabel = (d.fraudFlags as string[]).length > 0 ? `⚠ [${(d.fraudFlags as string[]).join(",")}]` : "✓ OK";
        pushFraud(`   ✓ ${d.orderId} → ${d.driverId.slice(-3)} ${flagLabel}`);
      }
      // 3. Fraud events
      pushFraud("⚡ Création des fraud_events pré-calculés…");
      for (const ev of FRAUD_EVENTS_SEED) {
        await addDoc(collection(db, "fraud_events"), ev);
        pushFraud(`   ✓ ${ev.type} → ${ev.driverId.slice(-3)} [${ev.severity} +${ev.scoreImpact}pts]`);
      }
      pushFraud("");
      pushFraud("✅ SEED FRAUDE TERMINÉ");
      pushFraud("   → /admin/fraud pour voir le tableau de bord");
      pushFraud("   → fraud_driver_002 (Sandra Félix) doit être bloquée (riskScore=85)");
      setFraudDone(true);
    } catch (e: any) {
      pushFraud("❌ ERREUR : " + e.message);
    }
    setFraudRunning(false);
  };

  const runUpsellSeed = async () => {
    setUpsellRunning(true);
    setUpsellLog([]);
    try {
      pushUpsell("🍹 Seed Upsell Test — produits complémentaires…");
      for (const p of UPSELL_PRODUCTS) {
        await setDoc(doc(db, "products", p.id), p, { merge: true });
        pushUpsell(`   ✓ ${p.name} (${p.cat}) — ${p.price}€ · tags: [${p.tags?.join(", ")}]`);
      }
      pushUpsell("");
      pushUpsell("✅ SEED UPSELL TERMINÉ");
      pushUpsell("   → Ouvre le shop, ajoute la vodka au panier");
      pushUpsell("   → Dans le panier : doit proposer Glaçons + Red Bull + Citron");
      setUpsellDone(true);
    } catch (e: any) {
      pushUpsell("❌ ERREUR : " + e.message);
    }
    setUpsellRunning(false);
  };

  const runPromoSeed = async () => {
    setPromoRunning(true);
    setPromoLog([]);
    setPromoDone(false);
    try {
      pushPromo("🔍 Récupération du premier produit actif…");
      const prodSnap = await getDocs(fbQuery(collection(db, "products"), limitQ(3)));
      if (prodSnap.empty) { pushPromo("❌ Aucun produit trouvé — seed les produits d'abord"); setPromoRunning(false); return; }

      const firstProd = prodSnap.docs[0];
      const prodData  = firstProd.data() as { name?: string; price?: number };
      pushPromo(`   ✓ Produit sélectionné : ${prodData.name ?? firstProd.id} (${prodData.price?.toFixed(2) ?? "?"}€)`);

      const now   = new Date();
      const endAt = new Date(now.getTime() + 15 * 60 * 1000);

      pushPromo("📝 Création de la promo Flash Deal 15min…");
      const promoRef = await addDoc(collection(db, "promotions"), {
        title:         "Flash Deal 🔥",
        description:   "Offre de test — 15 minutes seulement !",
        isActive:      true,
        startAt:       now.toISOString(),
        endAt:         endAt.toISOString(),
        discountType:  "percent",
        discountValue: 10,
        productIds:    [firstProd.id],
        maxUses:       10,
        usesCount:     0,
        createdAt:     now.toISOString(),
        updatedAt:     now.toISOString(),
      });
      pushPromo(`   ✓ promotions/${promoRef.id}`);
      pushPromo(`   ✓ Durée : 15 min · remise : -10% · max 10 uses`);
      pushPromo(`   ✓ Expire à : ${endAt.toLocaleTimeString("fr-FR")}`);
      pushPromo("");
      pushPromo("✅ SEED PROMO TERMINÉ");
      pushPromo("   → Ouvre le shop → bannière Flash Deal visible");
      pushPromo("   → /admin/promotions pour gérer");
      setPromoDone(true);
    } catch (e: any) {
      pushPromo("❌ ERREUR : " + e.message);
    }
    setPromoRunning(false);
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
            <div style={{ color: "#a855f7", marginTop: 6 }}>🚀 Boost scenario : 2 livreurs online + 10 orders "nouveau"</div>
            <div style={{ color: "#5a5470", marginLeft: 16 }}>ratio 5 → boost +5.00€ (déclencher via POST /api/boost)</div>
            <div style={{ color: "#ff2d78", marginTop: 6 }}>🚨 Fraud scenario (bouton séparé ci-dessous)</div>
            <div style={{ color: "#5a5470", marginLeft: 16 }}>2 drivers · 7 livraisons · 3 frauduleuses · 4 fraud_events</div>
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
              ["/admin/analytics",                    "Analytics — carte Boost"],
              ["/admin/fraud",                        "Anti-Abus ULTRA — tableau de bord"],
              ["/admin/fraud/fraud_driver_001",       "Profil risque Paulo Droz"],
              ["/admin/fraud/fraud_driver_002",       "Sandra Félix (bloquée, riskScore=85)"],
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

          {/* ── Fraud seed section ── */}
          <div style={{ marginTop: 32, borderTop: "1px solid rgba(255,45,120,.2)", paddingTop: 24 }}>
            <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#ff2d78", marginBottom: 6 }}>
              🚨 SEED ANTI-FRAUDE
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470", marginBottom: 16, lineHeight: 1.8 }}>
              Insère 2 livreurs frauduleux + 7 livraisons + 4 fraud_events.<br />
              Paulo Droz → riskScore 40 (1 flag) · Sandra Félix → bloquée riskScore 85 (3 flags)
            </div>
            <button
              onClick={runFraudSeed}
              disabled={fraudRunning}
              style={{
                width: "100%", padding: "12px",
                background: fraudDone ? "#b8ff00" : fraudRunning ? "rgba(255,45,120,.3)" : "rgba(255,45,120,.8)",
                color: "#000", border: "none", borderRadius: 10, cursor: fraudRunning ? "wait" : "pointer",
                fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: ".9rem",
                marginBottom: 16, transition: "background .2s",
              }}
            >
              {fraudRunning ? "Insertion fraude…" : fraudDone ? "✓ Fraud seed terminé — relancer ?" : "🚨 Lancer le seed fraude"}
            </button>

            {fraudLog.length > 0 && (
              <div style={{
                background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,45,120,.15)",
                borderRadius: 10, padding: "16px 18px",
                fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem",
                lineHeight: 1.8, maxHeight: 250, overflowY: "auto",
              }}>
                {fraudLog.map((l, i) => (
                  <div key={i} style={{
                    color: l.startsWith("✅") ? "#b8ff00"
                         : l.startsWith("❌") ? "#ff2d78"
                         : l.startsWith("   ✓") ? "#00f5ff"
                         : l.startsWith("   →") ? "#ff9500"
                         : "#5a5470",
                  }}>{l || "\u00a0"}</div>
                ))}
              </div>
            )}

            {fraudDone && (
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                {[
                  ["/admin/fraud",                  "→ Dashboard fraude"],
                  ["/admin/fraud/fraud_driver_002",  "→ Sandra Félix (bloquée)"],
                ].map(([href, label]) => (
                  <a key={href} href={href} style={{
                    flex: 1, textAlign: "center",
                    background: "rgba(255,45,120,.1)", color: "#ff2d78",
                    border: "1px solid rgba(255,45,120,.3)", borderRadius: 8,
                    padding: "10px", fontFamily: "'Inter',sans-serif",
                    fontWeight: 600, fontSize: ".78rem", textDecoration: "none",
                  }}>{label}</a>
                ))}
              </div>
            )}
          </div>

          {/* ── UPSELL SEED ── */}
          <div style={{
            background:"rgba(184,255,0,.04)", border:"1px solid rgba(184,255,0,.2)",
            borderRadius:12, padding:"22px 24px", marginTop:24,
          }}>
            <div style={{
              fontFamily:"'Black Ops One',cursive", fontSize:"1.1rem",
              color:"#b8ff00", marginBottom:8, letterSpacing:".04em",
            }}>
              🍹 SEED UPSELL TEST
            </div>
            <div style={{
              fontFamily:"'Share Tech Mono',monospace", fontSize:".75rem",
              color:"#5a5470", lineHeight:1.7, marginBottom:14,
            }}>
              Crée 8 produits de test (vodka, glaçons, redbull, citron, coca, chips, bière, cacahuètes).<br/>
              Scenario : ajouter <strong style={{color:"#b8ff00"}}>Vodka Absolut</strong> au panier → le carousel doit proposer Glaçons + Red Bull + Citron.
            </div>
            <button
              onClick={runUpsellSeed}
              disabled={upsellRunning}
              style={{
                background: upsellRunning ? "#3a3450" : "linear-gradient(135deg,#b8ff00,#78cc00)",
                color:"#000", border:"none", borderRadius:8,
                padding:"12px 24px", cursor: upsellRunning ? "not-allowed" : "pointer",
                fontFamily:"'Rajdhani',sans-serif", fontWeight:700,
                fontSize:"1rem", letterSpacing:".08em",
              }}>
              {upsellRunning ? "Insertion en cours…" : upsellDone ? "✓ Upsell seed terminé — relancer ?" : "🍹 Lancer le seed upsell"}
            </button>

            {upsellLog.length > 0 && (
              <div style={{
                marginTop:14, background:"rgba(0,0,0,.4)", borderRadius:8,
                padding:"14px", fontFamily:"'Share Tech Mono',monospace",
                fontSize:".72rem", lineHeight:1.8, maxHeight:200, overflowY:"auto",
              }}>
                {upsellLog.map((l, i) => (
                  <div key={i} style={{
                    color: l.startsWith("✅") ? "#b8ff00"
                         : l.startsWith("❌") ? "#ff2d78"
                         : l.startsWith("   ✓") ? "#00f5ff"
                         : l.startsWith("   →") ? "#ff9500"
                         : "#5a5470",
                  }}>{l || "\u00a0"}</div>
                ))}
              </div>
            )}

            {upsellDone && (
              <div style={{ display:"flex", gap:10, marginTop:14 }}>
                {[
                  ["/",                       "→ Shop (tester le carousel)"],
                  ["/admin/analytics",        "→ Stats upsell"],
                ].map(([href, label]) => (
                  <a key={href} href={href} style={{
                    flex:1, textAlign:"center",
                    background:"rgba(184,255,0,.1)", color:"#b8ff00",
                    border:"1px solid rgba(184,255,0,.3)", borderRadius:8,
                    padding:"10px", fontFamily:"'Inter',sans-serif",
                    fontWeight:600, fontSize:".78rem", textDecoration:"none",
                  }}>{label}</a>
                ))}
              </div>
            )}
          </div>


          {/* ── FLASH DEAL SEED ── */}
          <div style={{
            background:"rgba(255,45,120,.05)", border:"1px solid rgba(255,45,120,.25)",
            borderRadius:12, padding:"22px 24px", marginTop:24,
          }}>
            <div style={{
              fontFamily:"'Black Ops One',cursive", fontSize:"1.1rem",
              color:"#ff2d78", marginBottom:6,
            }}>🔥 FLASH DEAL — TEST 15 MIN</div>
            <div style={{
              fontFamily:"'Share Tech Mono',monospace", fontSize:".72rem",
              color:"#5a5470", lineHeight:1.8, marginBottom:14,
            }}>
              Crée une promo <span style={{color:"#ff6b35"}}>-10%</span> active 15 min sur le premier produit.<br />
              Timer réel basé sur Firestore · max 10 utilisations.
            </div>

            <button
              onClick={runPromoSeed}
              disabled={promoRunning}
              style={{
                width:"100%", padding:"13px",
                background: promoDone ? "#b8ff00" : promoRunning ? "rgba(255,45,120,.4)" : "#ff2d78",
                color:"#000", border:"none", borderRadius:8,
                cursor: promoRunning ? "wait" : "pointer",
                fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:".9rem",
                marginBottom:14, transition:"background .2s",
              }}
            >
              {promoRunning ? "Création…" : promoDone ? "✓ Promo créée — relancer ?" : "🚀 Seed Flash Deal 15min"}
            </button>

            {promoLog.length > 0 && (
              <div style={{
                background:"rgba(0,0,0,.4)", borderRadius:8,
                padding:"14px", fontFamily:"'Share Tech Mono',monospace",
                fontSize:".72rem", lineHeight:1.8, maxHeight:200, overflowY:"auto",
              }}>
                {promoLog.map((l, i) => (
                  <div key={i} style={{
                    color: l.startsWith("✅") ? "#b8ff00"
                         : l.startsWith("❌") ? "#ff2d78"
                         : l.startsWith("   ✓") ? "#00f5ff"
                         : l.startsWith("   →") ? "#ff9500"
                         : "#5a5470",
                  }}>{l || "\u00a0"}</div>
                ))}
              </div>
            )}

            {promoDone && (
              <div style={{ display:"flex", gap:10, marginTop:14 }}>
                {[
                  ["/",                    "→ Shop (voir bannière)"],
                  ["/admin/promotions",    "→ Admin promotions"],
                ].map(([href, label]) => (
                  <a key={href} href={href} style={{
                    flex:1, textAlign:"center",
                    background:"rgba(255,45,120,.1)", color:"#ff2d78",
                    border:"1px solid rgba(255,45,120,.3)", borderRadius:8,
                    padding:"10px", fontFamily:"'Inter',sans-serif",
                    fontWeight:600, fontSize:".78rem", textDecoration:"none",
                  }}>{label}</a>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
