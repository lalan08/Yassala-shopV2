/**
 * Estimation du délai de livraison (ETA)
 *
 * Paramètres fixes :
 *   baseTime          = 10 min
 *   distanceFactor    = 4 min / km
 *   capacityPerDriver = 3 livraisons / heure (non utilisé dans la formule mais
 *                       documente l'hypothèse derrière le coeff loadTime)
 *
 * Formule :
 *   loadFactor    = pendingOrders / max(activeDrivers, 1)
 *   loadTime      = loadFactor × 3  (min)
 *   raw           = baseTime + (distanceKm × 4) + loadTime
 *   estimatedTime = arrondi au multiple de 5 supérieur, min 10 min
 */

const BASE_TIME       = 10;  // minutes
const DISTANCE_FACTOR = 4;   // min par km
const LOAD_COEFF      = 3;   // min par unité de loadFactor

export interface ETAInput {
  /** Distance haversine client → stock (km). 0 si adresse non saisie. */
  distanceKm: number;
  /** Nombre de commandes en attente / en cours (statuts nouveau, en_cours, assigned). */
  pendingOrders: number;
  /** Nombre de livreurs actifs (isOnline = true, lastSeen < 5 min). */
  activeDrivers: number;
}

export interface ETAResult {
  /** ETA arrondi au multiple de 5 min le plus proche (min 10). */
  minutes: number;
  /** loadFactor brut. */
  loadFactor: number;
  /** Contribution du load (min). */
  loadTime: number;
  /** Contribution de la distance (min). */
  distanceTime: number;
  /** true si load élevé (loadFactor > 2). */
  isBusy: boolean;
}

/** Arrondit n au multiple de 5 le plus proche (≥ 10). */
function roundToFive(n: number): number {
  return Math.max(10, Math.round(n / 5) * 5);
}

export function computeETA(input: ETAInput): ETAResult {
  const { distanceKm, pendingOrders, activeDrivers } = input;

  const distanceTime = distanceKm * DISTANCE_FACTOR;
  const loadFactor   = pendingOrders / Math.max(activeDrivers, 1);
  const loadTime     = loadFactor * LOAD_COEFF;
  const raw          = BASE_TIME + distanceTime + loadTime;
  const minutes      = roundToFive(raw);
  const isBusy       = loadFactor > 2;

  return { minutes, loadFactor, loadTime, distanceTime, isBusy };
}

/** Formate un nombre de minutes en chaîne lisible ("25 min", "1h05"). */
export function formatETA(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }
  return `${minutes} min`;
}
