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
    const { items, customerName, customerPhone, customerAddress, deliveryFee, orderNum, orderId } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Panier vide' }, { status: 400 });
    }

    // Build line items for Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item: any) => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: String(item.product?.name || item.name || 'Article'),
        },
        unit_amount: Math.round(Number(item.product?.price || item.price || 0) * 100),
      },
      quantity: Number(item.quantity || item.qty || 1),
    }));

    // Add delivery fee as a separate line item
    if (Number(deliveryFee) > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Frais de livraison' },
          unit_amount: Math.round(Number(deliveryFee) * 100),
        },
        quantity: 1,
      });
    }

    // Compute origin: prefer x-forwarded-host (proxy/tunnel), fallback to req.url
    const forwardedHost = req.headers.get('x-forwarded-host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    let origin: string;
    if (forwardedHost) {
      origin = `${forwardedProto}://${forwardedHost}`;
    } else {
      try {
        origin = new URL(req.url).origin;
      } catch {
        const host = req.headers.get('host') || 'localhost:3000';
        const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
        origin = `${isLocal ? 'http' : 'https'}://${host}`;
      }
    }

    console.log('Stripe checkout origin:', origin);

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: 'payment',
      success_url: `${origin}/succes`,
      cancel_url: `${origin}/`,
      metadata: {
        orderNumber: String(orderNum || ''),
        orderId:     String(orderId  || ''),
        customerName:    String(customerName    || ''),
        customerPhone:   String(customerPhone   || ''),
        customerAddress: String(customerAddress || ''),
        deliveryFee:     String(deliveryFee     || 0),
        total:           String(lineItems.reduce((s: number, l: any) =>
          s + (l.price_data.unit_amount * l.quantity) / 100, 0)),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    const detail = [
      error?.message,
      error?.param ? `param: ${error.param}` : null,
      error?.code ? `code: ${error.code}` : null,
      error?.type ? `type: ${error.type}` : null,
    ].filter(Boolean).join(' | ');
    console.error('Stripe error:', detail, error);
    return NextResponse.json(
      { error: detail || 'Erreur lors de la création du paiement' },
      { status: 500 }
    );
  }
}
