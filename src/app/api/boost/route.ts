/**
 * /api/boost
 *
 * GET  — lit boost_state/current depuis Firestore (lecture publique)
 * POST — recalcule le ratio et met à jour boost_state/current (admin uniquement)
 *
 * Utilisé par :
 *   - Admin analytics (GET + POST toutes les 60 s)
 *   - Driver wallet   (GET à l'ouverture)
 *   - Vercel Cron     (POST toutes les minutes via vercel.json)
 *
 * Logique POST :
 *   pendingOrders  = commandes status "nouveau" (en attente de livreur)
 *   activeDrivers  = drivers isOnline=true ET lastSeen < 60 s
 *   ratio          = pendingOrders / max(activeDrivers, 1)
 *   boostAmount    = calculBoost(ratio)
 *   → écriture boost_state/current
 *   → si transition OFF→ON : écriture notifications/{id}
 */

import { NextResponse }                            from 'next/server';
import { FieldValue }                              from 'firebase-admin/firestore';
import { getAdminDb }                              from '@/lib/firebase-server';
import { calculBoost, boostReason, type BoostState } from '@/utils/boost';

const ADMIN_SECRET    = process.env.ADMIN_SECRET ?? 'yassala2025';
const ONLINE_TTL_MS   = 60 * 1000;   // driver considered online if lastSeen < 60 s

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const db   = getAdminDb();
    const snap = await db.collection('boost_state').doc('current').get();

    if (!snap.exists) {
      // Pas encore de document → retourner un état neutre
      const neutral: BoostState = {
        isActive: false, boostAmount: 0, ratio: 0,
        pendingOrders: 0, activeDrivers: 0,
        updatedAt: new Date().toISOString(),
        reason: 'Aucun état calculé',
      };
      return NextResponse.json(neutral);
    }

    const data = snap.data()!;
    const state: BoostState = {
      isActive:      Boolean(data.isActive),
      boostAmount:   data.boostAmount  ?? 0,
      ratio:         data.ratio        ?? 0,
      pendingOrders: data.pendingOrders ?? 0,
      activeDrivers: data.activeDrivers ?? 0,
      updatedAt:     data.updatedAt    ?? new Date().toISOString(),
      reason:        data.reason       ?? '',
    };

    return NextResponse.json(state, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error: any) {
    console.error('[boost GET]', error?.message ?? error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Auth — accepte soit X-Admin-Secret soit Vercel Cron (Authorization: Bearer CRON_SECRET)
  const adminHeader = request.headers.get('x-admin-secret');
  const cronHeader  = request.headers.get('authorization');
  const cronSecret  = process.env.CRON_SECRET;

  const isAdmin = adminHeader === ADMIN_SECRET;
  const isCron  = cronSecret ? cronHeader === `Bearer ${cronSecret}` : false;

  if (!isAdmin && !isCron) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const db  = getAdminDb();
    const now = Date.now();

    // ── 1. Commandes en attente (statut "nouveau") ────────────────────────
    const ordersSnap = await db.collection('orders')
      .where('status', '==', 'nouveau')
      .get();
    const pendingOrders = ordersSnap.size;

    // ── 2. Livreurs actifs (isOnline + lastSeen < 60 s) ───────────────────
    const driversSnap = await db.collection('drivers')
      .where('isOnline', '==', true)
      .get();

    const activeDrivers = driversSnap.docs.filter(d => {
      const ls = d.data().lastSeen;
      if (!ls) return false;
      const ms: number = ls.toMillis ? ls.toMillis() : typeof ls === 'number' ? ls : Date.parse(ls);
      return now - ms < ONLINE_TTL_MS;
    }).length;

    // ── 3. Calcul boost ───────────────────────────────────────────────────
    const ratio       = pendingOrders / Math.max(activeDrivers, 1);
    const boostAmount = calculBoost(ratio);
    const isActive    = boostAmount > 0;
    const reason      = boostReason(pendingOrders, activeDrivers, ratio, boostAmount);
    const updatedAt   = new Date().toISOString();

    // ── 4. Lire l'état actuel pour détecter la transition OFF→ON ─────────
    const currentSnap = await db.collection('boost_state').doc('current').get();
    const wasActive   = currentSnap.exists ? Boolean(currentSnap.data()?.isActive) : false;
    const transitionON = !wasActive && isActive;

    // ── 5. Écriture boost_state/current ──────────────────────────────────
    await db.collection('boost_state').doc('current').set({
      isActive,
      boostAmount,
      ratio:          parseFloat(ratio.toFixed(2)),
      pendingOrders,
      activeDrivers,
      updatedAt,
      reason,
    });

    // ── 6. Notification si transition OFF→ON ─────────────────────────────
    if (transitionON) {
      await db.collection('notifications').add({
        type:        'boost_activated',
        boostAmount,
        reason,
        createdAt:   updatedAt,
        targetAll:   true,
        read:        false,
      });
      console.log(`[boost] TRANSITION OFF→ON boostAmount=${boostAmount} ratio=${ratio.toFixed(2)}`);
    }

    console.log(`[boost] refresh — pending=${pendingOrders} drivers=${activeDrivers} ratio=${ratio.toFixed(2)} boost=${boostAmount}`);

    const state: BoostState = { isActive, boostAmount, ratio: parseFloat(ratio.toFixed(2)), pendingOrders, activeDrivers, updatedAt, reason };
    return NextResponse.json(state);
  } catch (error: any) {
    console.error('[boost POST]', error?.message ?? error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
