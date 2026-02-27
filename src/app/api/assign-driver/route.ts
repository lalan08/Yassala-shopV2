/**
 * POST /api/assign-driver
 *
 * Assigns the best available driver to a delivery order.
 *
 * Criteria (in order of priority):
 *  1. Driver must be online (isOnline === true, status === "online"|"busy", lastSeen < 5 min ago)
 *  2. Driver must have fewer than MAX_ORDERS_PER_DRIVER active orders (multi-order support)
 *  3. Lowest composite score:  score = distance_km - rating * RATING_WEIGHT
 *     → closer driver wins; higher rating breaks ties
 *  4. For RUSH orders: performanceScore also weighted (faster drivers prioritised)
 *
 * Body parameters:
 *  - orderId       {string}    Required. Firestore order document ID.
 *  - skipDriverIds {string[]}  Optional. Driver IDs to exclude (e.g. previously timed-out).
 *
 * Firestore collections used:
 *  - orders/{orderId}          : read lat/lng/isRush, write assignedDriver
 *  - drivers/{id}              : read online/status/rating/activeOrderIds
 *  - driver_locations/{id}     : read lat/lng
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON env var in production.
 */

import { NextResponse } from 'next/server';
import { assignDriver } from '@/lib/assignDriverLogic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = body?.orderId as string | undefined;
    const skipDriverIds: string[] = Array.isArray(body?.skipDriverIds) ? body.skipDriverIds : [];

    if (!orderId) {
      return NextResponse.json({ error: 'orderId manquant' }, { status: 400 });
    }

    const result = await assignDriver(orderId, skipDriverIds);

    if ('assigned' in result && result.assigned) {
      console.log(
        `[assign-driver] Order ${orderId} → driver ${result.driverId} (${result.driverName}),` +
        ` ${result.distanceKm.toFixed(2)} km, ${result.candidates} candidates, rush=${result.isRush}`,
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[assign-driver] error:', error?.message || error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
