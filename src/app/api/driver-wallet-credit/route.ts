/**
 * POST /api/driver-wallet-credit
 *
 * Crédite le portefeuille du livreur après une livraison.
 * Crée un document wallet_transactions dans Firestore.
 *
 * Body : { driverId: string, orderId: string, orderNumber?: number }
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';
import { DEFAULT_DELIVERY_CONFIG } from '@/types/delivery';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { driverId, orderId, orderNumber } = body as {
      driverId?: string;
      orderId?: string;
      orderNumber?: number;
    };

    if (!driverId || !orderId) {
      return NextResponse.json({ error: 'driverId et orderId requis' }, { status: 400 });
    }

    const db = getAdminDb();

    // Vérifier que la transaction n'existe pas déjà pour cette commande
    const existing = await db
      .collection('wallet_transactions')
      .where('orderId', '==', orderId)
      .where('driverId', '==', driverId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'already_exists' });
    }

    // Lire la config de livraison pour obtenir la rémunération de base
    let basePay = DEFAULT_DELIVERY_CONFIG.driver_base_pay;
    try {
      const configSnap = await db.collection('settings').doc('delivery').get();
      if (configSnap.exists && typeof configSnap.data()?.driver_base_pay === 'number') {
        basePay = configSnap.data()!.driver_base_pay;
      }
    } catch {
      // fallback sur la valeur par défaut
    }

    // Vérifier si la commande est une commande rush pour ajouter le bonus
    let rushBonus = 0;
    try {
      const orderSnap = await db.collection('orders').doc(orderId).get();
      if (orderSnap.exists && orderSnap.data()?.isRush === true) {
        const configSnap = await db.collection('settings').doc('delivery').get();
        const rushBonusConfig = configSnap.exists
          ? (configSnap.data()?.driver_rush_bonus ?? DEFAULT_DELIVERY_CONFIG.driver_rush_bonus)
          : DEFAULT_DELIVERY_CONFIG.driver_rush_bonus;
        rushBonus = rushBonusConfig;
      }
    } catch {
      // ignore
    }

    const totalAmount = parseFloat((basePay + rushBonus).toFixed(2));
    const label = orderNumber ? `Livraison #${orderNumber}` : `Livraison ${orderId.slice(-6).toUpperCase()}`;

    await db.collection('wallet_transactions').add({
      driverId,
      orderId,
      orderNumber: orderNumber ?? null,
      type: 'delivery',
      amount: totalAmount,
      basePay,
      rushBonus,
      description: label,
      createdAt: new Date().toISOString(),
    });

    console.log(`[driver-wallet-credit] +${totalAmount}€ → driver=${driverId} order=${orderId}`);

    return NextResponse.json({ ok: true, amount: totalAmount });
  } catch (error: any) {
    console.error('[driver-wallet-credit]', error?.message ?? error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
