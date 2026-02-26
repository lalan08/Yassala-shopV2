/**
 * Module météo — Matoury, Guyane française
 * Cache serveur-side rafraîchi toutes les 5 minutes.
 * Utilise Open-Meteo (pas de clé API requise).
 *
 * Logique bonus pluie :
 *   pluie légère (> 0.3 mm ou code pluie)  → +1.50 €
 *   pluie forte  (> 2 mm)                  → +3.00 €
 */

export const MATOURY_LAT = 4.85;
export const MATOURY_LNG = -52.33;
const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${MATOURY_LAT}&longitude=${MATOURY_LNG}` +
  `&current=precipitation,weathercode`;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface WeatherSnapshot {
  condition: 'clear' | 'rain' | 'heavy_rain' | 'unknown';
  precipitation: number;   // mm
  weathercode: number;     // WMO code
  isRaining: boolean;
  isHeavyRain: boolean;
  updatedAt: number;       // Date.now()
}

// Module-level cache (partagé entre requêtes server-side)
let _cache: WeatherSnapshot | null = null;

/**
 * WMO weather codes correspondant à la pluie :
 *   51-57  = bruine / drizzle
 *   61-67  = pluie modérée / rain
 *   80-82  = averses / rain showers
 */
function isRainingByCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
}

async function fetchFresh(): Promise<WeatherSnapshot> {
  const res  = await fetch(OPEN_METEO_URL, { next: { revalidate: 0 } });
  const data = await res.json();

  const precipitation: number = data.current?.precipitation ?? 0;
  const weathercode:   number = data.current?.weathercode   ?? 0;

  const isHeavyRain = precipitation > 2;
  const isRaining   = isHeavyRain || precipitation > 0.3 || isRainingByCode(weathercode);
  const condition: WeatherSnapshot['condition'] = isHeavyRain
    ? 'heavy_rain'
    : isRaining
      ? 'rain'
      : 'clear';

  return { condition, precipitation, weathercode, isRaining, isHeavyRain, updatedAt: Date.now() };
}

/**
 * Retourne la météo actuelle depuis le cache (rafraîchi si > 5 min).
 * Ne lève jamais d'exception : renvoie le cache périmé ou un snapshot neutre.
 */
export async function getWeather(): Promise<WeatherSnapshot> {
  if (_cache && Date.now() - _cache.updatedAt < CACHE_TTL_MS) {
    return _cache;
  }
  try {
    _cache = await fetchFresh();
  } catch {
    // Conserver le cache périmé si disponible
    if (_cache) return _cache;
    _cache = { condition: 'unknown', precipitation: 0, weathercode: 0, isRaining: false, isHeavyRain: false, updatedAt: Date.now() };
  }
  return _cache;
}

/** Calcule le bonus pluie en euros selon le snapshot météo. */
export function computeRainBonus(w: Pick<WeatherSnapshot, 'isRaining' | 'isHeavyRain' | 'precipitation'>): number {
  if (w.isHeavyRain || w.precipitation > 2) return 3.00;
  if (w.isRaining   || w.precipitation > 0.3) return 1.50;
  return 0.00;
}

/** Emoji + label d'affichage selon la condition. */
export function weatherDisplay(condition: WeatherSnapshot['condition']): { emoji: string; label: string; color: string } {
  switch (condition) {
    case 'heavy_rain': return { emoji: '⛈', label: 'Orage / pluie forte', color: '#60a5fa' };
    case 'rain':       return { emoji: '🌧', label: 'Pluie',              color: '#93c5fd' };
    case 'clear':      return { emoji: '☀️', label: 'Beau temps',         color: '#facc15' };
    default:           return { emoji: '🌡',  label: 'Météo inconnue',    color: '#5a5470' };
  }
}
