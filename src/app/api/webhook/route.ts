import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) return NextResponse.json({ ok: true });

  const stripe = new Stripe(stripeKey);
  const body   = await req.text();
  const sig    = req.headers.get('stripe-signature') || '';

  let event: Stripe.Event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(body, sig, webhookSecret)
      : JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const m = session.metadata || {};

    // Update order status in Firestore
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI',
      authDomain: 'yassala-shop.firebaseapp.com',
      projectId: 'yassala-shop',
    };
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const db  = getFirestore(app);
    if (m.orderId) {
      try {
        await updateDoc(doc(db, 'orders', m.orderId), { status: 'en_cours', paidOnline: true });
      } catch {}
    }

    // Envoyer notification Telegram avec "Paiement validé"
    const origin = req.headers.get('x-forwarded-host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
      : new URL(req.url).origin;

    const amountTotal = session.amount_total ? session.amount_total / 100 : Number(m.total || 0);
    const deliveryFee = Number(m.deliveryFee || 0);
    const subtotal    = amountTotal - deliveryFee;

    fetch(`${origin}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: m.orderNumber ? Number(m.orderNumber) : undefined,
        name:        m.customerName    || 'Inconnu',
        phone:       m.customerPhone   || '—',
        address:     m.customerAddress || '—',
        items:       [],
        subtotal,
        deliveryFee,
        total:       amountTotal,
        method:      'online',
        paid:        true,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ received: true });
}
