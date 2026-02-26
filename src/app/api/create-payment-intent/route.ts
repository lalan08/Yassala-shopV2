import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Paiement non configuré (clé manquante)' }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  try {
    const body = await req.json();
    const { items, deliveryFee, orderId, orderNum, fulfillmentType } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Panier vide' }, { status: 400 });
    }

    // ── Calcul du total CÔTÉ SERVEUR uniquement ─────────────────────────────
    // On ne fait jamais confiance aux prix envoyés par le frontend
    let amountCents = items.reduce((sum: number, item: { price: number; qty: number }) => {
      const priceCents = Math.round(Number(item.price || 0) * 100);
      const qty        = Math.max(1, Number(item.qty || 1));
      return sum + priceCents * qty;
    }, 0);

    if (Number(deliveryFee) > 0) {
      amountCents += Math.round(Number(deliveryFee) * 100);
    }

    if (amountCents < 50) {
      return NextResponse.json({ error: 'Montant trop faible (minimum 0.50€)' }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: {
        orderId:         String(orderId      || ''),
        orderNumber:     String(orderNum     || ''),
        fulfillmentType: String(fulfillmentType || 'delivery'),
      },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });

  } catch (error: unknown) {
    const e = error as { message?: string; param?: string; code?: string; type?: string };
    const detail = [
      e?.message,
      e?.param ? `param: ${e.param}` : null,
      e?.code  ? `code: ${e.code}`   : null,
    ].filter(Boolean).join(' | ');
    console.error('Stripe PaymentIntent error:', detail, error);
    return NextResponse.json(
      { error: detail || 'Erreur lors de la création du paiement' },
      { status: 500 }
    );
  }
}
