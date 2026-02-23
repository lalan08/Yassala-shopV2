import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json({ ok: true });
  }

  const { orderNumber, name, phone, address, items, subtotal, deliveryFee, total, method, paid } = await req.json();

  const lines = (items as { name: string; qty: number; price: number }[])
    .map(i => `  • ${i.qty}× ${i.name}  —  ${(i.price * i.qty).toFixed(2)}€`);

  const numLabel = orderNumber ? `*COMMANDE #${orderNumber}*` : '*COMMANDE*';
  const payLine  = paid
    ? '✅ *PAIEMENT VALIDÉ — Stripe*'
    : method === 'online'
    ? '⏳ Paiement en ligne Stripe (en attente)'
    : '💵 Cash à la livraison';

  const now = new Date().toLocaleString('fr-FR', { timeZone: 'America/Cayenne' });

  const text = [
    `🔔 *NOUVELLE COMMANDE — YASSALA*`,
    numLabel,
    '',
    `👤 ${name}`,
    `📞 ${phone}`,
    `📍 ${address}`,
    '',
    '*Articles :*',
    ...lines,
    '',
    `💶 Sous-total : ${Number(subtotal).toFixed(2)}€`,
    `🚴 Livraison : ${Number(deliveryFee).toFixed(2)}€`,
    `💰 *TOTAL : ${Number(total).toFixed(2)}€*`,
    '',
    payLine,
    `🕐 ${now}`,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });

  return NextResponse.json({ ok: true });
}
