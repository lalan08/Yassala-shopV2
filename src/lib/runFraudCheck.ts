/**
 * lib/runFraudCheck.ts — SERVER ONLY
 *
 * Orchestration complète de la détection de fraude pour une livraison :
 *  1. Lit la livraison + historique driver + boost state + annulations
 *  2. Applique toutes les règles (via fraudDetection.ts)
 *  3. Écrit les résultats dans deliveries/{id}
 *  4. Crée des fraud_events pour chaque flag medium/high
 *  5. Recalcule et met à jour drivers/{id}.riskScore / strikesCount / isBlocked
 *
 * Appelé par :
 *  - /api/fraud-check (route publique sécurisée)
 *  - /api/validate-delivery (fire-and-forget après validation)
 */

import { getAdminDb } from '@/lib/firebase-server';
import {
  checkGeofenceDrop, checkGeofencePickup, checkImpossibleSpeed,
  checkSpeedBonus, checkGpsSpoofing, checkLocationJump,
  checkBoostAbuse, checkCashRisk, checkCancellations,
  computeFraudScore, computeReviewStatus, computeDriverRiskScore,
  type DeliveryForFraud,
} from '@/utils/fraudDetection';

export interface FraudCheckResult {
  deliveryId:     string;
  driverId:       string;
  fraudFlagKeys:  string[];
  fraudScore:     number;
  reviewStatus:   'ok' | 'warning' | 'blocked';
  driverRiskScore: number;
  isBlocked:      boolean;
  newEventsCount: number;
}

export async function runFraudCheck(deliveryId: string): Promise<FraudCheckResult> {
  const db = getAdminDb();

  // ── lecture livraison ────────────────────────────────────────────────────
  const delSnap = await db.collection('deliveries').doc(deliveryId).get();
  if (!delSnap.exists) throw new Error(`Livraison ${deliveryId} introuvable`);

  const delRaw   = delSnap.data()!;
  const driverId = delRaw.driverId as string;
  const delivery: DeliveryForFraud = { id: deliveryId, driverId, ...delRaw };

  // ── historique driver (20 dernières livraisons hors celle-ci) ─────────────
  const histSnap = await db.collection('deliveries')
    .where('driverId', '==', driverId)
    .orderBy('createdAt', 'desc')
    .limit(21)
    .get();
  const history: DeliveryForFraud[] = histSnap.docs
    .map(d => ({ id: d.id, driverId, ...d.data() } as DeliveryForFraud))
    .filter(d => d.id !== deliveryId);

  // ── boost state ───────────────────────────────────────────────────────────
  const boostSnap   = await db.collection('boost_state').doc('current').get();
  const boostIsActive = boostSnap.data()?.isActive === true;

  // ── driver (pour location jump) ───────────────────────────────────────────
  const driverSnap = await db.collection('drivers').doc(driverId).get();
  const driverData = driverSnap.data() ?? {};
  const prevLoc    = driverData.lastKnownLocation ?? null;
  const currLoc    = delivery.driverLocationAtDropoff
    ? {
        lat:       delivery.driverLocationAtDropoff.lat,
        lng:       delivery.driverLocationAtDropoff.lng,
        updatedAt: delivery.deliveredAt ?? new Date().toISOString(),
      }
    : null;

  // ── annulations récentes du driver ────────────────────────────────────────
  let cancelledHistory: Array<{ createdAt?: string; pickedUpAt?: string }> = [];
  try {
    const cancelSnap = await db.collection('orders')
      .where('assignedDriver', '==', driverId)
      .where('status', '==', 'annule')
      .get();
    cancelledHistory = cancelSnap.docs.map(d => ({
      createdAt:  d.data().createdAt,
      pickedUpAt: d.data().pickedUpAt,
    }));
  } catch {
    // index absent → on ignore les annulations pour ce check
  }

  // ── application des règles ────────────────────────────────────────────────
  const allFlags = [
    ...checkGeofenceDrop(delivery),
    ...checkGeofencePickup(delivery),
    ...checkImpossibleSpeed(delivery),
    ...checkSpeedBonus(delivery, history),
    ...checkGpsSpoofing(delivery, history),
    ...checkLocationJump(currLoc, prevLoc),
    ...checkBoostAbuse(delivery, history, boostIsActive),
    ...checkCashRisk(delivery, history),
    ...checkCancellations(cancelledHistory),
  ];

  const fraudScore    = computeFraudScore(allFlags);
  const reviewStatus  = computeReviewStatus(fraudScore);
  const fraudFlagKeys = [...new Set(allFlags.map(f => f.flag))];
  const highFlags     = allFlags.filter(f => f.severity === 'high');
  const logFlags      = allFlags.filter(f => f.severity !== 'low');

  // ── mise à jour livraison ─────────────────────────────────────────────────
  await db.collection('deliveries').doc(deliveryId).update({
    fraudFlags:      fraudFlagKeys,
    fraudScore,
    reviewStatus,
    reviewedByAdmin: false,
    updatedAt:       new Date().toISOString(),
  });

  // ── écriture fraud_events (medium + high) ─────────────────────────────────
  const now = new Date().toISOString();
  if (logFlags.length > 0) {
    const batch = db.batch();
    for (const flag of logFlags) {
      const ref = db.collection('fraud_events').doc();
      batch.set(ref, {
        driverId,
        deliveryId,
        orderId:     delRaw.orderId ?? null,
        type:        flag.flag,
        severity:    flag.severity,
        scoreImpact: flag.impact,
        details:     flag.details,
        createdAt:   now,
        resolved:    false,
        resolvedAt:  null,
        resolvedBy:  null,
      });
    }
    await batch.commit();
  }

  // ── recalcul riskScore driver ─────────────────────────────────────────────
  const allDelSnap = await db.collection('deliveries')
    .where('driverId', '==', driverId)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  const driverRiskScore = computeDriverRiskScore(allDelSnap.docs.map(d => d.data()));

  const prevStrikes  = (driverData.strikesCount ?? 0) as number;
  const newStrikes   = prevStrikes + highFlags.length;
  const isBlocked    = driverRiskScore >= 80;
  const prevSusp     = (driverData.suspiciousEventsCount ?? 0) as number;

  const driverUpdate: Record<string, unknown> = {
    riskScore:             driverRiskScore,
    strikesCount:          newStrikes,
    isBlocked,
    suspiciousEventsCount: prevSusp + allFlags.length,
  };
  if (currLoc) driverUpdate.lastKnownLocation = currLoc;

  await db.collection('drivers').doc(driverId).set(driverUpdate, { merge: true });

  // Notification admin si le driver vient d'être bloqué
  if (isBlocked && !driverData.isBlocked) {
    await db.collection('notifications').add({
      type:      'DRIVER_AUTO_BLOCKED',
      driverId,
      driverName: driverData.name ?? driverId,
      riskScore:  driverRiskScore,
      createdAt:  now,
      read:       false,
    });
  }

  console.log(
    `[fraud-check] delivery=${deliveryId} driver=${driverId}` +
    ` flags=[${fraudFlagKeys.join(',')}] score=${fraudScore}` +
    ` risk=${driverRiskScore} blocked=${isBlocked}`,
  );

  return {
    deliveryId, driverId,
    fraudFlagKeys, fraudScore, reviewStatus,
    driverRiskScore, isBlocked,
    newEventsCount: logFlags.length,
  };
}
