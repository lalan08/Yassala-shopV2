import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';

export async function POST(req: NextRequest) {
  const { orderId } = await req.json();

  if (!orderId) {
    return NextResponse.json({ error: 'orderId manquant' }, { status: 400 });
  }

  const db = getAdminDb();
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }

  const order = orderSnap.data()!;

  if (order.status !== 'pending_confirmation') {
    return NextResponse.json({ error: 'Commande non en attente de confirmation' }, { status: 400 });
  }

  const newOtp = String(Math.floor(1000 + Math.random() * 9000));
  const newExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await orderRef.update({ otpCode: newOtp, otpExpiry: newExpiry });

  return NextResponse.json({ ok: true });
}
