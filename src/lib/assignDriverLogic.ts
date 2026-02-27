/**
 * Shared driver-assignment logic used by:
 *  - /api/assign-driver   (on-demand assignment)
 *  - /api/driver-timeout  (cron reassignment after driver inactivity)
 */

import { getAdminDb } from '@/lib/firebase-server';

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

// 1 rating point = 0.5 km advantage
const RATING_WEIGHT = 0.5;

// Driver considered offline if lastSeen > 5 minutes ago
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

// Maximum simultaneous active orders per driver
const MAX_ORDERS_PER_DRIVER = 2;

export type AssignResult =
  | { assigned: true; driverId: string; driverName: string; distanceKm: number; candidates: number; isRush: boolean }
  | { assigned: false; reason: string }
  | { skipped: true; reason: string; driverId?: string };

/**
 * Assigns the best available driver to an order.
 *
 * @param orderId       - Firestore order document ID
 * @param skipDriverIds - Driver IDs to exclude (e.g. previously timed-out drivers)
 */
export async function assignDriver(
  orderId: string,
  skipDriverIds: string[] = [],
): Promise<AssignResult> {
  const db = getAdminDb();

  // ── 1. Fetch the order ──────────────────────────────────────────────────
  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) {
    return { assigned: false, reason: 'order_not_found' };
  }

  const order = orderSnap.data()!;
  const isRush = order.isRush === true;

  if (order.fulfillmentType !== 'delivery') {
    return { skipped: true, reason: 'not_delivery' };
  }
  if (!order.lat || !order.lng) {
    return { skipped: true, reason: 'no_coordinates' };
  }
  if (order.assignedDriver) {
    return { skipped: true, reason: 'already_assigned', driverId: order.assignedDriver };
  }

  const orderLat = order.lat as number;
  const orderLng = order.lng as number;

  // ── 2. Fetch online, available drivers ─────────────────────────────────
  const driversSnap = await db.collection('drivers').get();
  const now = Date.now();
  const skipSet = new Set(skipDriverIds);

  const availableDrivers = driversSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((d: any) => {
      if (skipSet.has(d.id)) return false;
      if (!d.isOnline) return false;
      if (d.status === 'offline') return false;
      if (d.status === 'busy') {
        const activeCount = Array.isArray(d.activeOrderIds) ? d.activeOrderIds.length : 0;
        if (activeCount >= MAX_ORDERS_PER_DRIVER) return false;
      }
      if (!d.lastSeen) return false;
      const lastSeenMs: number = d.lastSeen?.toMillis
        ? d.lastSeen.toMillis()
        : typeof d.lastSeen === 'number'
        ? d.lastSeen
        : Date.parse(d.lastSeen);
      return now - lastSeenMs < ONLINE_THRESHOLD_MS;
    });

  if (availableDrivers.length === 0) {
    return { assigned: false, reason: 'no_available_drivers' };
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
      const perfScore = typeof d.performanceScore === 'number' ? Math.min(d.performanceScore, 100) : 50;
      const score = isRush
        ? distance - rating * RATING_WEIGHT - perfScore * 0.05
        : distance - rating * RATING_WEIGHT;
      return { id: d.id, name: d.name || 'Livreur', distance, score };
    })
    .sort((a, b) => a.score - b.score);

  if (scored.length === 0) {
    return { assigned: false, reason: 'no_drivers_with_location' };
  }

  const best = scored[0];

  // ── 5. Assign driver to the order ───────────────────────────────────────
  await db.collection('orders').doc(orderId).update({
    assignedDriver: best.id,
    assignedDriverName: best.name,
    autoAssignedAt: new Date().toISOString(),
    autoAssignDistanceKm: parseFloat(best.distance.toFixed(2)),
  });

  return {
    assigned: true,
    driverId: best.id,
    driverName: best.name,
    distanceKm: parseFloat(best.distance.toFixed(2)),
    candidates: scored.length,
    isRush,
  };
}
