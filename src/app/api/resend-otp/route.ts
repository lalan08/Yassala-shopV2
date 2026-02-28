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

  // Notifier l'admin via Telegram avec le nouveau code
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (token && chatId) {
    const name  = order.name  || '';
    const phone = order.phone || '';
    const orderNumber = order.orderNumber || orderId.slice(-6).toUpperCase();
    const waLink = `wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(
      `🔐 *Yassala Night Shop*\n\nBonjour ${name} !\n\nVoici votre nouveau code de confirmation pour la commande #${orderNumber} :\n\n*${newOtp}*\n\nSaisissez ce code sur la page de confirmation pour valider votre commande.\n\nMerci 🙏`
    )}`;
    const text = [
      `🔄 *NOUVEAU CODE OTP — COMMANDE #${orderNumber}*`,
      '',
      `👤 ${name}`,
      `📞 ${phone}`,
      '',
      `🔐 *Nouveau code : ${newOtp}*`,
      `📲 Envoie ce code via WhatsApp :`,
      waLink,
    ].join('\n');

    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
