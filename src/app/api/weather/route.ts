/**
 * GET /api/weather
 *
 * Retourne la météo en cache pour Matoury.
 * Le cache est rafraîchi côté serveur toutes les 5 minutes.
 * Utilisé par le client (admin dashboard, driver wallet) pour afficher
 * l'état météo sans appeler directement Open-Meteo.
 *
 * Réponse : WeatherSnapshot (sans le champ `updatedAt` pour simplifier le client)
 */

import { NextResponse } from 'next/server';
import { getWeather } from '@/utils/weather';

export async function GET() {
  try {
    const w = await getWeather();
    return NextResponse.json(w, {
      headers: {
        // Autoriser le navigateur à mettre en cache 60 s
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erreur météo', detail: error?.message },
      { status: 500 },
    );
  }
}
