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

  // ── Helpers partagés ──────────────────────────────────────────────────────
  const origin = req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host')}`
    : new URL(req.url).origin;

  const getFirebaseDb = async () => {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore }           = await import('firebase/firestore');
    const firebaseConfig = {
      apiKey:    process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI',
      authDomain: 'yassala-shop.firebaseapp.com',
      projectId:  'yassala-shop',
    };
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    return getFirestore(app);
  };

  // ── checkout.session.completed (ancien flow redirect Stripe) ─────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const m = session.metadata || {};

    const { doc, updateDoc, getDoc } = await import('firebase/firestore');
    const db = await getFirebaseDb();

    let orderEmail: string | null = null;
    let orderItems = '';
    let cartItems:  { name: string; qty: number; price: number }[] = [];

    if (m.orderId) {
      try {
        const orderSnap = await getDoc(doc(db, 'orders', m.orderId));
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();
          orderEmail = orderData.email    || null;
          orderItems = orderData.items    || '';
          cartItems  = orderData.cartItems || [];
        }
        await updateDoc(doc(db, 'orders', m.orderId), { status: 'en_cours', paidOnline: true });
      } catch {}
    }

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
        items:       cartItems,
        subtotal,
        deliveryFee,
        total:       amountTotal,
        method:      'online',
        paid:        true,
      }),
    }).catch(() => {});

    if (orderEmail) {
      fetch(`${origin}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:        'confirmation',
          email:       orderEmail,
          orderNumber: m.orderNumber || '',
          items:       orderItems,
          total:       amountTotal,
          address:     m.customerAddress || '',
          method:      'online',
          trackingUrl: m.orderId ? `${origin}/suivi?id=${m.orderId}` : '',
        }),
      }).catch(() => {});
    }
  }

  // ── payment_intent.succeeded (nouveau flow Payment Element inline) ────────
  if (event.type === 'payment_intent.succeeded') {
    const intent  = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata?.orderId;
    if (!orderId) return NextResponse.json({ received: true });

    const { doc, updateDoc, getDoc } = await import('firebase/firestore');
    const db = await getFirebaseDb();

    let orderEmail: string | null = null;
    let orderItems = '';
    let cartItems:  { name: string; qty: number; price: number }[] = [];
    let orderData:  Record<string, unknown> = {};

    try {
      const orderSnap = await getDoc(doc(db, 'orders', orderId));
      if (orderSnap.exists()) {
        orderData  = orderSnap.data() as Record<string, unknown>;
        orderEmail = (orderData.email  as string) || null;
        orderItems = (orderData.items  as string) || '';
        cartItems  = (orderData.cartItems as { name: string; qty: number; price: number }[]) || [];
      }
      // Mise à jour du statut (si pas déjà fait côté client)
      await updateDoc(doc(db, 'orders', orderId), { status: 'en_cours', paidOnline: true });
    } catch {}

    const amountTotal = intent.amount / 100;
    const deliveryFee = Number((orderData.deliveryFee as number) || 0);
    const subtotal    = amountTotal - deliveryFee;

    // Notification Telegram
    fetch(`${origin}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: intent.metadata?.orderNumber ? Number(intent.metadata.orderNumber) : undefined,
        name:    (orderData.name    as string) || 'Inconnu',
        phone:   (orderData.phone   as string) || '—',
        address: (orderData.address as string) || '—',
        items:   cartItems,
        subtotal,
        deliveryFee,
        total:   amountTotal,
        method:  'online',
        paid:    true,
        fulfillmentType:      (orderData.fulfillmentType      as string) || 'delivery',
        pickupSnapshot:       (orderData.pickupLocationSnapshot as unknown) || null,
        pickupTime:           (orderData.pickupTime           as string) || null,
      }),
    }).catch(() => {});

    // Email de confirmation client
    if (orderEmail) {
      fetch(`${origin}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:        'confirmation',
          email:       orderEmail,
          orderNumber: intent.metadata?.orderNumber || '',
          items:       orderItems,
          total:       amountTotal,
          address:     (orderData.address as string) || '',
          method:      'online',
          trackingUrl: `${origin}/suivi?id=${orderId}`,
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ received: true });
}
