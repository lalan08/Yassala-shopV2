/**
 * POST /api/seed-wallet
 *
 * Crée 5 livraisons de test dans Firestore pour tester l'animation
 * récompense du wallet livreur.
 *
 * Body : { driverId: string }
 *
 * ⚠️  DEV/TEST uniquement — ne pas exposer en production sécurisée.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-server";

const SEEDS = [
  {
    orderId: "ord_test_001",
    paymentType: "ONLINE" as const,
    cashCollectedAmount: 0,
    basePay: 2.50,
    bonusPay: 1.00,
    totalPay: 3.50,
    status: "validated" as const,
    cashStatus: "settled" as const,
    isNight: true,
    distanceKm: 2.1,
  },
  {
    orderId: "ord_test_002",
    paymentType: "CASH" as const,
    cashCollectedAmount: 28.00,
    basePay: 2.50,
    bonusPay: 0,
    totalPay: 2.50,
    status: "pending" as const,
    cashStatus: "unsettled" as const,
    isNight: false,
    distanceKm: 1.4,
  },
  {
    orderId: "ord_test_003",
    paymentType: "ONLINE" as const,
    cashCollectedAmount: 0,
    basePay: 2.50,
    bonusPay: 1.50,
    totalPay: 4.00,
    status: "validated" as const,
    cashStatus: "settled" as const,
    isNight: true,
    rainBonus: 1.50,
    weatherCondition: "rain" as const,
    distanceKm: 3.8,
  },
  {
    orderId: "ord_test_004",
    paymentType: "ONLINE" as const,
    cashCollectedAmount: 0,
    basePay: 2.50,
    bonusPay: 2.50,
    totalPay: 5.00,
    status: "paid" as const,
    cashStatus: "settled" as const,
    isNight: false,
    boostPay: 2.50,
    boostApplied: true,
    boostAmount: 2.50,
    distanceKm: 4.2,
  },
  {
    orderId: "ord_test_005",
    paymentType: "CASH" as const,
    cashCollectedAmount: 35.50,
    basePay: 2.50,
    bonusPay: 0,
    totalPay: 2.50,
    status: "validated" as const,
    cashStatus: "unsettled" as const,
    isNight: false,
    distanceKm: 0.9,
  },
];

export async function POST(req: NextRequest) {
  try {
    const { driverId } = await req.json();

    if (!driverId || typeof driverId !== "string") {
      return NextResponse.json({ error: "driverId manquant" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = Date.now();
    const created: string[] = [];

    for (let i = 0; i < SEEDS.length; i++) {
      const seed = SEEDS[i];
      // On échelonne dans le passé : -1h, -2h, -3h, -4h, -5h
      const createdAt = new Date(now - (i + 1) * 60 * 60 * 1000).toISOString();

      const ref = db.collection("deliveries").doc();
      await ref.set({
        ...seed,
        driverId,
        createdAt,
        updatedAt: createdAt,
        acceptedAt: createdAt,
        deliveredAt: createdAt,
      });
      created.push(ref.id);
    }

    return NextResponse.json({
      ok: true,
      message: `${created.length} livraisons de test créées pour le livreur "${driverId}"`,
      ids: created,
      tip: "Rafraîchissez la page /driver/wallet pour voir les entrées. Ajoutez-en une supplémentaire via Firestore Console pour tester l'animation en temps réel.",
    });
  } catch (err) {
    console.error("[seed-wallet]", err);
    return NextResponse.json({ error: "Erreur seed" }, { status: 500 });
  }
}
