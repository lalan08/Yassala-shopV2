/**
 * POST /api/driver-timeout
 *
 * Cron job that detects stale driver assignments and reassigns them.
 *
 * An assignment is "stale" when ALL of these hold:
 *  - order.status === 'nouveau'      (driver has not accepted the order yet)
 *  - order.assignedDriver is set     (an auto-assignment was made)
 *  - order.autoAssignedAt < now - TIMEOUT_MS
 *
 * For each stale order:
 *  1. The timed-out driver ID is appended to order.timedOutDriverIds
 *  2. Assignment fields are cleared (assignedDriver, assignedDriverName, autoAssignedAt, autoAssignDistanceKm)
 *  3. order.lastTimeoutAt is set to now
 *  4. assignDriver() is called again, skipping all previously timed-out drivers
 *
 * Auth: X-Admin-Secret header  OR  Vercel Cron (Authorization: Bearer CRON_SECRET)
 *
 * Vercel Cron schedule: every 2 minutes  →  "* /2 * * * *"
 */

import { NextResponse }   from 'next/server';
import { FieldValue }     from 'firebase-admin/firestore';
import { getAdminDb }     from '@/lib/firebase-server';
import { assignDriver }   from '@/lib/assignDriverLogic';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'yassala2025';

/** How long (ms) a driver has to accept an assigned order before it is reassigned */
const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
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
    const cutoffISO = new Date(now - TIMEOUT_MS).toISOString();

    // ── 1. Find assigned-but-not-accepted orders past the timeout ──────────
    const snap = await db.collection('orders')
      .where('status', '==', 'nouveau')
      .get();

    const staleOrders = snap.docs.filter(d => {
      const data = d.data();
      return (
        data.assignedDriver &&
        data.autoAssignedAt &&
        data.autoAssignedAt < cutoffISO
      );
    });

    if (staleOrders.length === 0) {
      return NextResponse.json({ processed: 0, reassigned: 0, results: [] });
    }

    // ── 2. Process each stale order ────────────────────────────────────────
    type TimeoutResult = {
      orderId: string;
      timedOutDriver: string;
      reassigned: boolean;
      newDriver?: string;
      reason?: string;
    };

    const results: TimeoutResult[] = [];

    for (const orderDoc of staleOrders) {
      const orderId       = orderDoc.id;
      const data          = orderDoc.data();
      const timedOutDriver = data.assignedDriver as string;

      // Build the cumulative list of timed-out drivers for this order
      const existing: string[] = Array.isArray(data.timedOutDriverIds) ? data.timedOutDriverIds : [];
      const updatedTimedOut   = [...new Set([...existing, timedOutDriver])];

      console.log(
        `[driver-timeout] Order ${orderId} — driver ${timedOutDriver} timed out` +
        ` (assigned ${data.autoAssignedAt}, cutoff ${cutoffISO})`,
      );

      // Clear the stale assignment
      await db.collection('orders').doc(orderId).update({
        assignedDriver:        FieldValue.delete(),
        assignedDriverName:    FieldValue.delete(),
        autoAssignedAt:        FieldValue.delete(),
        autoAssignDistanceKm:  FieldValue.delete(),
        timedOutDriverIds:     updatedTimedOut,
        lastTimeoutAt:         new Date().toISOString(),
      });

      // Attempt reassignment, skipping all timed-out drivers
      const result = await assignDriver(orderId, updatedTimedOut);

      const reassigned = 'assigned' in result && result.assigned === true;

      results.push({
        orderId,
        timedOutDriver,
        reassigned,
        newDriver: reassigned ? (result as any).driverId   : undefined,
        reason:    !reassigned ? (result as any).reason     : undefined,
      });

      if (reassigned) {
        console.log(`[driver-timeout] Order ${orderId} → reassigned to ${(result as any).driverId}`);
      } else {
        console.log(`[driver-timeout] Order ${orderId} → no driver available (${(result as any).reason})`);
      }
    }

    return NextResponse.json({
      processed:  results.length,
      reassigned: results.filter(r => r.reassigned).length,
      results,
    });
  } catch (error: any) {
    console.error('[driver-timeout] error:', error?.message ?? error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
