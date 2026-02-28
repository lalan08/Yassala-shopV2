/**
 * Configuration livraison — stockée dans Firestore : settings/delivery
 * Modifiable depuis /admin/settings/delivery sans modifier le code.
 */

export interface DeliveryConfig {
  // Base
  delivery_base_fee: number;       // Frais de base (€)
  minimum_order_amount: number;    // Commande minimum pour la livraison (€)
  free_delivery_threshold: number; // Seuil livraison offerte (€)

  // Nuit
  night_fee: number;   // Supplément nuit (€)
  night_start: number; // Heure début nuit (ex: 22)
  night_end: number;   // Heure fin nuit (ex: 5)

  // Pluie
  rain_mode_enabled: boolean; // Mode pluie actif
  rain_fee: number;           // Supplément pluie (€)

  // Rush
  rush_mode_enabled: boolean; // Mode rush actif
  rush_fee: number;           // Supplément rush (€)

  // Distance
  distance_fee_enabled: boolean; // Frais de distance activés
  base_radius_km: number;    // Rayon inclus dans le prix de base (km)
  extra_fee_per_km: number;  // Tarif par km au-delà du rayon (€/km)

  // Livreur
  driver_base_pay: number;    // Rémunération de base livreur (€)
  driver_night_bonus: number; // Bonus nuit livreur (€)
  driver_rain_bonus: number;  // Bonus pluie livreur (€)
  driver_rush_bonus: number;  // Bonus rush livreur (€)
}

export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  delivery_base_fee: 3,
  minimum_order_amount: 15,
  free_delivery_threshold: 30,
  night_fee: 1,
  night_start: 22,
  night_end: 5,
  rain_mode_enabled: false,
  rain_fee: 1,
  rush_mode_enabled: false,
  rush_fee: 1,
  distance_fee_enabled: true,
  base_radius_km: 3,
  extra_fee_per_km: 1,
  driver_base_pay: 2.5,
  driver_night_bonus: 0.5,
  driver_rain_bonus: 0.5,
  driver_rush_bonus: 0.5,
};

export interface DeliveryFeeResult {
  total: number;
  isFree: boolean;
  breakdown: {
    base: number;
    distance: number;
    night: number;
    rain: number;
    rush: number;
  };
  supplements: string[];
  isNight: boolean;
  isRain: boolean;
  isRush: boolean;
  driverPay: number;
  margin: number;
}

/**
 * Calcule les frais de livraison à partir de la configuration.
 * Utilisable côté client ET serveur (aucune dépendance externe).
 */
export function computeDeliveryFee(
  distanceKm: number,
  cartTotal: number,
  config: DeliveryConfig,
  hourOverride?: number,
): DeliveryFeeResult {
  const hour = hourOverride ?? new Date().getHours();

  // Livraison offerte
  if (cartTotal >= config.free_delivery_threshold) {
    return {
      total: 0, isFree: true,
      breakdown: { base: 0, distance: 0, night: 0, rain: 0, rush: 0 },
      supplements: [], isNight: false, isRain: false, isRush: false,
      driverPay: 0, margin: 0,
    };
  }

  const base = config.delivery_base_fee;

  // Distance au-delà du rayon inclus
  const extraKm = config.distance_fee_enabled
    ? Math.max(0, distanceKm - config.base_radius_km)
    : 0;
  const distance = parseFloat((extraKm * config.extra_fee_per_km).toFixed(2));

  // Nuit : ex. >= 22h OU < 5h
  const isNight = hour >= config.night_start || hour < config.night_end;
  const night = isNight ? config.night_fee : 0;

  // Pluie
  const isRain = config.rain_mode_enabled;
  const rain = isRain ? config.rain_fee : 0;

  // Rush
  const isRush = config.rush_mode_enabled;
  const rush = isRush ? config.rush_fee : 0;

  const total = parseFloat((base + distance + night + rain + rush).toFixed(2));

  const supplements: string[] = [];
  if (isNight) supplements.push('Nuit 🌙');
  if (isRain) supplements.push('Pluie 🌧️');
  if (isRush) supplements.push('Rush 🚀');
  if (distance > 0) supplements.push(`Distance +${extraKm.toFixed(1)} km`);

  const driverPay = parseFloat((
    config.driver_base_pay
    + (isNight ? config.driver_night_bonus : 0)
    + (isRain  ? config.driver_rain_bonus  : 0)
    + (isRush  ? config.driver_rush_bonus  : 0)
  ).toFixed(2));

  const margin = parseFloat((total - driverPay).toFixed(2));

  return {
    total, isFree: false,
    breakdown: { base, distance, night, rain, rush },
    supplements, isNight, isRain, isRush,
    driverPay, margin,
  };
}
