/**
 * POST /api/validate-delivery
 *
 * Valide une livraison "pending" :
 *   1. Vérifie la météo actuelle (cache 5 min)
 *   2. Calcule le rainBonus (0 / 1.50 / 3.00 €)
 *   3. Met à jour deliveries/{id} :
 *        status              → "validated"
 *        rainBonus           → 0 | 1.50 | 3.00
 *        weatherCondition    → "clear" | "rain" | "heavy_rain" | "unknown"
 *        precipitationLevel  → float (mm)
 *        boostPay            → 0 | 1.50 | 3.00 | 5.00 (depuis boost_state/current)
 *        boostApplied        → bool
 *        totalPay            → basePay + bonusPay + rainBonus + boostPay
 *   4. Si rainBonus > 0 → incrémente drivers/{driverId}.rainDeliveriesCount
 *
 * Body : { deliveryId: string }
 * Sécurité : vérification admin via header X-Admin-Secret
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-server';
import { getWeather, computeRainBonus } from '@/utils/weather';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'yassala2025';

export async function POST(request: Request) {
  // ── auth basique ──────────────────────────────────────────────────────────
  const secret = request.headers.get('x-admin-secret');
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const body       = await request.json();
    const deliveryId = body?.deliveryId as string | undefined;
    if (!deliveryId) {
      return NextResponse.json({ error: 'deliveryId manquant' }, { status: 400 });
    }

    const db = getAdminDb();

    // ── lecture de la livraison ───────────────────────────────────────────
    const delSnap = await db.collection('deliveries').doc(deliveryId).get();
    if (!delSnap.exists) {
      return NextResponse.json({ error: 'Livraison introuvable' }, { status: 404 });
    }

    const delData = delSnap.data()!;
    if (delData.status !== 'pending') {
      return NextResponse.json(
        { error: `Statut invalide : ${delData.status} (attendu: pending)` },
        { status: 409 },
      );
    }

    // ── météo + bonus pluie ───────────────────────────────────────────────
    const weather   = await getWeather();
    const rainBonus = computeRainBonus(weather);

    // ── boost automatique ─────────────────────────────────────────────────
    const boostSnap = await db.collection('boost_state').doc('current').get();
    const boostData = boostSnap.data() ?? {};
    const boostPay: number =
      boostData.isActive === true && typeof boostData.boostAmount === 'number'
        ? boostData.boostAmount
        : 0;

    const basePay  = delData.basePay  ?? 0;
    const bonusPay = delData.bonusPay ?? 0;
    const totalPay = parseFloat((basePay + bonusPay + rainBonus + boostPay).toFixed(2));

    // ── écriture Firestore ────────────────────────────────────────────────
    const updates: Record<string, unknown> = {
      status:             'validated',
      rainBonus,
      weatherCondition:   weather.condition,
      precipitationLevel: parseFloat(weather.precipitation.toFixed(2)),
      boostPay,
      boostApplied:       boostPay > 0,
      boostAmount:        boostPay,
      totalPay,
    };

    await db.collection('deliveries').doc(deliveryId).update(updates);

    // ── incrément rainDeliveriesCount si bonus actif ──────────────────────
    if (rainBonus > 0) {
      const driverId = delData.driverId as string;
      if (driverId) {
        const driverRef  = db.collection('drivers').doc(driverId);
        const driverSnap = await driverRef.get();
        const current    = (driverSnap.data()?.rainDeliveriesCount as number) ?? 0;
        await driverRef.set({ rainDeliveriesCount: current + 1 }, { merge: true });
      }
    }

    console.log(
      `[validate-delivery] id=${deliveryId} status=validated` +
      ` rain=${rainBonus} boost=${boostPay}` +
      ` weather=${weather.condition} total=${totalPay}`,
    );

    return NextResponse.json({
      deliveryId,
      status:   'validated',
      rainBonus,
      boostPay,
      weather:  { condition: weather.condition, precipitation: weather.precipitation },
      totalPay,
    });
  } catch (error: any) {
    console.error('[validate-delivery]', error?.message ?? error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
