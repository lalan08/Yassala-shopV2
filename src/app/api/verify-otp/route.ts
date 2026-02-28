import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';

export async function POST(req: NextRequest) {
  const { orderId, code } = await req.json();

  if (!orderId || !code) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
  }

  const db = getAdminDb();
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }

  const order = orderSnap.data()!;

  if (order.status !== 'pending_confirmation') {
    return NextResponse.json({ error: 'Commande déjà confirmée ou statut invalide' }, { status: 400 });
  }

  if (!order.otpCode || !order.otpExpiry) {
    return NextResponse.json({ error: 'Code non disponible' }, { status: 400 });
  }

  if (new Date() > new Date(order.otpExpiry)) {
    return NextResponse.json({ error: 'Code expiré', expired: true }, { status: 400 });
  }

  if (order.otpCode !== code.trim()) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 400 });
  }

  await orderRef.update({
    status: 'nouveau',
    confirmedAt: new Date().toISOString(),
    otpCode: null,
  });

  return NextResponse.json({ ok: true });
}
