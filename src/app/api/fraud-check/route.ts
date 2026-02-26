/**
 * POST /api/fraud-check
 *
 * Déclenche l'analyse anti-fraude pour une livraison donnée.
 * Wrapper HTTP autour de src/lib/runFraudCheck.ts.
 *
 * Body : { deliveryId: string }
 * Auth : header x-admin-secret
 */

import { NextResponse } from 'next/server';
import { runFraudCheck } from '@/lib/runFraudCheck';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'yassala2025';

export async function POST(request: Request) {
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

    const result = await runFraudCheck(deliveryId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[fraud-check]', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'Erreur serveur' }, { status: 500 });
  }
}
