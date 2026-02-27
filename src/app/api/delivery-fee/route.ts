/**
 * POST /api/delivery-fee
 *
 * Calcul serveur des frais de livraison à partir de la config Firestore.
 * Aucun prix hardcodé — tout vient de settings/delivery.
 *
 * Body : { distanceKm: number, cartTotal: number, fulfillmentType: string }
 * Response : DeliveryFeeResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';
import { DEFAULT_DELIVERY_CONFIG, computeDeliveryFee, type DeliveryConfig } from '@/types/delivery';

export async function POST(req: NextRequest) {
  try {
    const { distanceKm = 0, cartTotal = 0, fulfillmentType = 'delivery' } = await req.json();

    if (fulfillmentType !== 'delivery') {
      return NextResponse.json({
        total: 0, isFree: true,
        breakdown: { base: 0, distance: 0, night: 0, rain: 0, rush: 0 },
        supplements: [], isNight: false, isRain: false, isRush: false,
        driverPay: 0, margin: 0,
      });
    }

    // Lecture config depuis Firestore (avec fallback defaults)
    let config: DeliveryConfig = DEFAULT_DELIVERY_CONFIG;
    try {
      const db = getAdminDb();
      const snap = await db.collection('settings').doc('delivery').get();
      if (snap.exists) config = { ...DEFAULT_DELIVERY_CONFIG, ...snap.data() } as DeliveryConfig;
    } catch {
      // Fallback silencieux — on utilise les defaults
    }

    const result = computeDeliveryFee(distanceKm, cartTotal, config);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[delivery-fee]', err);
    return NextResponse.json({ error: 'Erreur calcul frais' }, { status: 500 });
  }
}
