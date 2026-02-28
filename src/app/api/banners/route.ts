/**
 * GET  /api/banners       → liste toutes les bannières
 * POST /api/banners       → crée ou met à jour une bannière
 * DELETE /api/banners?id= → supprime une bannière
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection('banners').orderBy('order').get();
    const banners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json(banners, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[banners GET]', err);
    return NextResponse.json({ error: 'Erreur lecture' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getAdminDb();
    const { id, ...data } = body;
    if (id) {
      await db.collection('banners').doc(id).set(data, { merge: true });
      return NextResponse.json({ ok: true, id });
    } else {
      const ref = await db.collection('banners').add(data);
      return NextResponse.json({ ok: true, id: ref.id });
    }
  } catch (err) {
    console.error('[banners POST]', err);
    return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 });
    const db = getAdminDb();
    await db.collection('banners').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[banners DELETE]', err);
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 });
  }
}
