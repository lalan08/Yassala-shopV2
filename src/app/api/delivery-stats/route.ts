/**
 * GET /api/delivery-stats
 *
 * Renvoie le nombre de commandes actives et de livreurs disponibles.
 * Utilisé par le client pour calculer le prix de livraison dynamique.
 *
 * Requiert FIREBASE_SERVICE_ACCOUNT_JSON (Firebase Admin SDK).
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';

// Livreur considéré offline si lastSeen > 5 minutes
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    const db = getAdminDb();
    const now = Date.now();

    // Commandes actives = créées dans les 2 dernières heures et pas encore livrées
    const cutoff = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const ordersSnap = await db
      .collection('orders')
      .where('createdAt', '>=', cutoff)
      .get();

    const INACTIVE_STATUSES = new Set(['livré', 'delivered', 'annulé', 'cancelled']);
    const activeOrders = ordersSnap.docs.filter(
      d => !INACTIVE_STATUSES.has(d.data().status ?? ''),
    ).length;

    // Livreurs disponibles = online, pas busy, lastSeen récent
    const driversSnap = await db.collection('drivers').get();
    const availableDrivers = driversSnap.docs.filter(d => {
      const data = d.data();
      if (!data.isOnline) return false;
      if (data.status === 'busy' || data.status === 'offline') return false;
      if (!data.lastSeen) return false;
      const ms: number = data.lastSeen?.toMillis
        ? data.lastSeen.toMillis()
        : typeof data.lastSeen === 'number'
        ? data.lastSeen
        : Date.parse(data.lastSeen);
      return now - ms < ONLINE_THRESHOLD_MS;
    }).length;

    return NextResponse.json(
      { activeOrders, availableDrivers },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[delivery-stats]', error);
    // Fallback conservateur : conditions normales
    return NextResponse.json({ activeOrders: 1, availableDrivers: 1 });
  }
}
