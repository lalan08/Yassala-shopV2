/**
 * POST /api/update-driver-score
 *
 * Recalcule et persiste le performanceScore d'un livreur après chaque livraison.
 *
 * Body : { driverId: string }
 *
 * Métriques calculées depuis Firestore (Admin SDK) :
 *   - avgDeliveryMinutes : moyenne (deliveredAt - createdAt) sur les commandes livrées
 *   - acceptanceRate     : commandes livrées / commandes assignées × 100
 *   - clientRating       : drivers/{id}.rating (0-5), défaut 4.0 si absent
 *
 * Écrit : drivers/{driverId}.performanceScore  (0-100)
 *         drivers/{driverId}.performanceMeta   (détail des métriques)
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';
import { computePerformanceScore } from '@/utils/scoring';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const driverId = body?.driverId as string | undefined;
    if (!driverId) {
      return NextResponse.json({ error: 'driverId manquant' }, { status: 400 });
    }

    const db = getAdminDb();

    // ── 1. Commandes assignées à ce livreur ────────────────────────────────
    const ordersSnap = await db
      .collection('orders')
      .where('assignedDriver', '==', driverId)
      .get();

    const assignedOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    const deliveredOrders = assignedOrders.filter(o => o.status === 'livre' && o.deliveredAt && o.createdAt);

    // ── 2. Temps moyen de livraison ────────────────────────────────────────
    let avgDeliveryMinutes = 35; // valeur par défaut si pas encore de livraisons
    if (deliveredOrders.length > 0) {
      const times = deliveredOrders.map(o => {
        const start = new Date(o.createdAt).getTime();
        const end   = new Date(o.deliveredAt).getTime();
        return Math.max(0, (end - start) / 60000); // minutes
      });
      avgDeliveryMinutes = times.reduce((s, t) => s + t, 0) / times.length;
    }

    // ── 3. Taux d'acceptation ──────────────────────────────────────────────
    const acceptanceRate =
      assignedOrders.length > 0
        ? Math.round((deliveredOrders.length / assignedOrders.length) * 100)
        : 100; // si aucune commande encore assignée → on suppose 100%

    // ── 4. Note client ─────────────────────────────────────────────────────
    const driverSnap = await db.collection('drivers').doc(driverId).get();
    const driverData = driverSnap.data() ?? {};
    const clientRating: number =
      typeof driverData.rating === 'number' ? driverData.rating : 4.0;

    // ── 5. Calcul du score ─────────────────────────────────────────────────
    const score = computePerformanceScore({ avgDeliveryMinutes, acceptanceRate, clientRating });

    // ── 6. Persistance ─────────────────────────────────────────────────────
    await db.collection('drivers').doc(driverId).set(
      {
        performanceScore: score,
        performanceMeta: {
          avgDeliveryMinutes: parseFloat(avgDeliveryMinutes.toFixed(1)),
          acceptanceRate,
          clientRating,
          deliveriesCount: deliveredOrders.length,
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true },
    );

    console.log(
      `[update-driver-score] driver=${driverId} score=${score}` +
      ` (temps=${avgDeliveryMinutes.toFixed(0)}min, accept=${acceptanceRate}%, note=${clientRating})`,
    );

    return NextResponse.json({ score, avgDeliveryMinutes, acceptanceRate, clientRating });
  } catch (error: any) {
    console.error('[update-driver-score]', error?.message ?? error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
