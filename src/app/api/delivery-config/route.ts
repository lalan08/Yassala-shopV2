/**
 * GET  /api/delivery-config  → lit la config depuis Firestore (settings/delivery)
 * POST /api/delivery-config  → sauvegarde la config dans Firestore
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';
import { DEFAULT_DELIVERY_CONFIG } from '@/types/delivery';

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection('settings').doc('delivery').get();
    const data = snap.exists
      ? { ...DEFAULT_DELIVERY_CONFIG, ...snap.data() }
      : DEFAULT_DELIVERY_CONFIG;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(DEFAULT_DELIVERY_CONFIG);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getAdminDb();
    // Merge avec les defaults pour éviter les champs manquants
    const safe = { ...DEFAULT_DELIVERY_CONFIG, ...body };
    await db.collection('settings').doc('delivery').set(safe);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delivery-config POST]', err);
    return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });
  }
}
