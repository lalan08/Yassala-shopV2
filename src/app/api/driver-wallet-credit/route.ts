/**
 * POST /api/driver-wallet-credit
 *
 * Crédite le portefeuille du livreur après une livraison.
 * Crée un document wallet_transactions ET un document deliveries dans Firestore.
 *
 * Body : { driverId: string, orderId: string, orderNumber?: number, paidOnline?: boolean, orderTotal?: number }
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';
import { DEFAULT_DELIVERY_CONFIG } from '@/types/delivery';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { driverId, orderId, orderNumber, paidOnline, orderTotal } = body as {
      driverId?: string;
      orderId?: string;
      orderNumber?: number;
      paidOnline?: boolean;
      orderTotal?: number;
    };

    if (!driverId || !orderId) {
      return NextResponse.json({ error: 'driverId et orderId requis' }, { status: 400 });
    }

    const db = getAdminDb();

    // ID déterministe pour éviter les doublons
    const txId = `${driverId}_${orderId}`;
    const existingTx = await db.collection('wallet_transactions').doc(txId).get();

    if (existingTx.exists) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'already_exists' });
    }

    // Lire la config de livraison pour obtenir la rémunération de base
    let basePay = DEFAULT_DELIVERY_CONFIG.driver_base_pay;
    let isRush = false;
    let rushBonus = 0;
    try {
      const configSnap = await db.collection('settings').doc('delivery').get();
      if (configSnap.exists && typeof configSnap.data()?.driver_base_pay === 'number') {
        basePay = configSnap.data()!.driver_base_pay;
      }
      // Vérifier si la commande est rush
      const orderSnap = await db.collection('orders').doc(orderId).get();
      if (orderSnap.exists && orderSnap.data()?.isRush === true) {
        isRush = true;
        const rushBonusConfig = configSnap.exists
          ? (configSnap.data()?.driver_rush_bonus ?? DEFAULT_DELIVERY_CONFIG.driver_rush_bonus)
          : DEFAULT_DELIVERY_CONFIG.driver_rush_bonus;
        rushBonus = rushBonusConfig;
      }
    } catch {
      // fallback sur les valeurs par défaut
    }

    const totalAmount = parseFloat((basePay + rushBonus).toFixed(2));
    const label = orderNumber ? `Livraison #${orderNumber}` : `Livraison ${orderId.slice(-6).toUpperCase()}`;
    const now = new Date().toISOString();
    const hour = new Date().getHours();
    const isNight = hour >= 22 || hour < 6;
    const paymentType = paidOnline === false ? 'CASH' : 'ONLINE';
    const cashAmount = paymentType === 'CASH' ? (orderTotal ?? 0) : 0;

    // 1. Créer la transaction wallet
    await db.collection('wallet_transactions').doc(txId).set({
      driverId,
      orderId,
      orderNumber: orderNumber ?? null,
      type: 'delivery',
      paymentType,          // 'ONLINE' | 'CASH' — nécessaire pour filtrer gainsDuJour
      amount: totalAmount,
      basePay,
      rushBonus,
      description: label,
      createdAt: now,
    });

    // 2. Créer le document deliveries pour le suivi admin (si pas déjà existant)
    const deliveryId = `del_${driverId}_${orderId}`;
    const existingDelivery = await db.collection('deliveries').doc(deliveryId).get();
    if (!existingDelivery.exists) {
      await db.collection('deliveries').doc(deliveryId).set({
        driverId,
        orderId,
        orderNumber: orderNumber ?? null,
        createdAt: now,
        isNight,
        isRush,
        paymentType,
        cashCollectedAmount: cashAmount,
        cashStatus: paymentType === 'CASH' ? 'unsettled' : 'settled',
        basePay,
        bonusPay: rushBonus,
        totalPay: totalAmount,
        status: 'pending',
      });
    }

    console.log(`[driver-wallet-credit] +${totalAmount}€ → driver=${driverId} order=${orderId} delivery=${deliveryId}`);

    return NextResponse.json({ ok: true, amount: totalAmount });
  } catch (error: any) {
    console.error('[driver-wallet-credit]', error?.message ?? error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
