/**
 * POST /api/assign-driver
 *
 * Assigns the best available driver to a delivery order.
 *
 * Criteria (in order of priority):
 *  1. Driver must be online (isOnline === true, status === "online", lastSeen < 5 min ago)
 *  2. Driver must not be on an active delivery (status !== "busy")
 *  3. Lowest composite score:  score = distance_km - rating * RATING_WEIGHT
 *     → closer driver wins; higher rating breaks ties
 *
 * Firestore collections used:
 *  - orders/{orderId}          : read lat/lng, write assignedDriver
 *  - drivers/{id}              : read online/status/rating
 *  - driver_locations/{id}     : read lat/lng
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON env var in production.
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';
import { FieldValue } from 'firebase-admin/firestore';

/** Haversine distance in km between two GPS coordinates */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1 rating point = 0.5 km advantage (tune as needed)
const RATING_WEIGHT = 0.5;

// Driver considered offline if lastSeen > 5 minutes ago
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = body?.orderId as string | undefined;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId manquant' }, { status: 400 });
    }

    const db = getAdminDb();

    // ── 1. Fetch the order ──────────────────────────────────────────────────
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    const order = orderSnap.data()!;

    // Skip non-delivery orders (click & collect, pickup)
    if (order.fulfillmentType !== 'delivery') {
      return NextResponse.json({ skipped: true, reason: 'not_delivery' });
    }

    // Skip orders without GPS coordinates
    if (!order.lat || !order.lng) {
      return NextResponse.json({ skipped: true, reason: 'no_coordinates' });
    }

    // Skip already-assigned orders
    if (order.assignedDriver) {
      return NextResponse.json({ skipped: true, reason: 'already_assigned', driverId: order.assignedDriver });
    }

    const orderLat = order.lat as number;
    const orderLng = order.lng as number;

    // ── 2. Fetch online, available drivers ─────────────────────────────────
    const driversSnap = await db.collection('drivers').get();
    const now = Date.now();

    const availableDrivers = driversSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((d: any) => {
        // Must be explicitly online
        if (!d.isOnline) return false;
        // Must not be on an active delivery
        if (d.status === 'busy' || d.status === 'offline') return false;
        // Must have pinged recently
        if (!d.lastSeen) return false;
        const lastSeenMs: number = d.lastSeen?.toMillis
          ? d.lastSeen.toMillis()
          : typeof d.lastSeen === 'number'
          ? d.lastSeen
          : Date.parse(d.lastSeen);
        return now - lastSeenMs < ONLINE_THRESHOLD_MS;
      });

    if (availableDrivers.length === 0) {
      return NextResponse.json({ assigned: false, reason: 'no_available_drivers' });
    }

    // ── 3. Fetch driver GPS locations ───────────────────────────────────────
    const locationsSnap = await db.collection('driver_locations').get();
    const locationMap: Record<string, { lat: number; lng: number }> = {};
    locationsSnap.docs.forEach(d => {
      const data = d.data();
      if (typeof data.lat === 'number' && typeof data.lng === 'number') {
        locationMap[d.id] = { lat: data.lat, lng: data.lng };
      }
    });

    // ── 4. Score each driver ────────────────────────────────────────────────
    type ScoredDriver = { id: string; name: string; distance: number; score: number };
    const scored: ScoredDriver[] = (availableDrivers as any[])
      .filter(d => locationMap[d.id])
      .map(d => {
        const { lat, lng } = locationMap[d.id];
        const distance = haversineKm(orderLat, orderLng, lat, lng);
        const rating = typeof d.rating === 'number' ? Math.min(d.rating, 5) : 5;
        // Lower score = better candidate
        const score = distance - rating * RATING_WEIGHT;
        return { id: d.id, name: d.name || 'Livreur', distance, score };
      })
      .sort((a, b) => a.score - b.score);

    if (scored.length === 0) {
      return NextResponse.json({ assigned: false, reason: 'no_drivers_with_location' });
    }

    const best = scored[0];

    // ── 5. Assign driver to the order ───────────────────────────────────────
    await db.collection('orders').doc(orderId).update({
      assignedDriver: best.id,
      assignedDriverName: best.name,
      autoAssignedAt: new Date().toISOString(),
      autoAssignDistanceKm: parseFloat(best.distance.toFixed(2)),
    });

    console.log(
      `[assign-driver] Order ${orderId} → driver ${best.id} (${best.name}),` +
      ` ${best.distance.toFixed(2)} km, score ${best.score.toFixed(3)}`,
    );

    return NextResponse.json({
      assigned: true,
      driverId: best.id,
      driverName: best.name,
      distanceKm: parseFloat(best.distance.toFixed(2)),
      candidates: scored.length,
    });
  } catch (error: any) {
    console.error('[assign-driver] error:', error?.message || error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
