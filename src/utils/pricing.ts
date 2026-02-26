/**
 * Calcul dynamique du prix de livraison.
 *
 * Formule :
 *   base        = 2.50 €
 *   distanceFee = distanceKm × 0.50 €
 *   surgeFee    = +1.50 € si demandFactor > 2  (demandFactor = activeOrders / max(availableDrivers,1))
 *   nightFee    = +1.00 € si heure >= 22
 *   total       = base + distanceFee + surgeFee + nightFee
 *
 * Coordonnées du shop (Cayenne, Guyane)
 */

export const SHOP_LAT = 4.9372;
export const SHOP_LNG = -52.326;

export interface PricingInput {
  distanceKm: number;
  activeOrders: number;
  availableDrivers: number;
  /** Heure locale 0-23 */
  hour: number;
}

export interface PricingResult {
  base: number;
  distanceFee: number;
  surgeFee: number;
  nightFee: number;
  total: number;
  isSurge: boolean;
  isNight: boolean;
}

export function computeDeliveryPrice(input: PricingInput): PricingResult {
  const { distanceKm, activeOrders, availableDrivers, hour } = input;

  const base = 2.5;
  const distanceFee = parseFloat((distanceKm * 0.5).toFixed(2));

  const demandFactor = activeOrders / Math.max(availableDrivers, 1);
  const isSurge = demandFactor > 2;
  const surgeFee = isSurge ? 1.5 : 0;

  const isNight = hour >= 22;
  const nightFee = isNight ? 1 : 0;

  const total = parseFloat((base + distanceFee + surgeFee + nightFee).toFixed(2));

  return { base, distanceFee, surgeFee, nightFee, total, isSurge, isNight };
}

/** Distance Haversine en km entre deux coordonnées GPS */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}
