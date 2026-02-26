/**
 * utils/fraudDetection.ts
 *
 * Moteur de détection de fraude — fonctions pures (aucun appel Firestore).
 * Appelé par src/lib/runFraudCheck.ts à chaque transition de statut importante.
 * Timezone de référence : America/Cayenne (UTC-3).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FraudSeverity = 'low' | 'medium' | 'high';

export interface FraudFlagResult {
  flag: string;
  severity: FraudSeverity;
  impact: number;
  details: Record<string, unknown>;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoPointWithAcc extends GeoPoint {
  accuracy?: number; // mètres
}

export interface DeliveryForFraud {
  id: string;
  driverId: string;
  createdAt?: string;
  acceptedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  pickupLocation?: GeoPoint;
  dropoffLocation?: GeoPoint;
  driverLocationAtAccept?: GeoPointWithAcc;
  driverLocationAtPickup?: GeoPointWithAcc;
  driverLocationAtDropoff?: GeoPointWithAcc;
  distanceKmEstimated?: number;
  bonusPay?: number;
  boostPay?: number;
  boostApplied?: boolean;
  paymentType?: string;
  cashStatus?: string;
  cashCollectedAmount?: number;
  status?: string;
  fraudScore?: number;
}

// ── Géographie ────────────────────────────────────────────────────────────────

/** Distance Haversine entre deux coordonnées (résultat en km). */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Règle 1 — Geofence drop ───────────────────────────────────────────────────
// Driver validé trop loin du client (> 150 m)

export function checkGeofenceDrop(d: DeliveryForFraud): FraudFlagResult[] {
  if (!d.driverLocationAtDropoff || !d.dropoffLocation) return [];
  const distM = haversineKm(
    d.driverLocationAtDropoff.lat, d.driverLocationAtDropoff.lng,
    d.dropoffLocation.lat,         d.dropoffLocation.lng,
  ) * 1000;
  if (distM <= 150) return [];
  const acc = d.driverLocationAtDropoff.accuracy ?? 0;
  return [{
    flag:     'DROP_NOT_AT_CUSTOMER',
    severity: acc > 100 ? 'medium' : 'high',
    impact:   acc > 100 ? 20       : 40,
    details:  { distanceM: Math.round(distM), accuracyM: acc },
  }];
}

// ── Règle 2 — Geofence pickup ─────────────────────────────────────────────────
// Driver marqué "pickup" mais loin du restaurant (> 150 m)

export function checkGeofencePickup(d: DeliveryForFraud): FraudFlagResult[] {
  if (!d.driverLocationAtPickup || !d.pickupLocation) return [];
  const distM = haversineKm(
    d.driverLocationAtPickup.lat, d.driverLocationAtPickup.lng,
    d.pickupLocation.lat,         d.pickupLocation.lng,
  ) * 1000;
  if (distM <= 150) return [];
  return [{
    flag:     'PICKUP_NOT_AT_STORE',
    severity: 'high',
    impact:   30,
    details:  { distanceM: Math.round(distM) },
  }];
}

// ── Règle 3 — Temps impossible ────────────────────────────────────────────────
// Vitesse moyenne > 80 km/h OU durée < 5 min pour distance > 2 km

export function checkImpossibleSpeed(d: DeliveryForFraud): FraudFlagResult[] {
  const flags: FraudFlagResult[] = [];
  if (!d.acceptedAt || !d.deliveredAt) return flags;
  const dMs  = Date.parse(d.deliveredAt) - Date.parse(d.acceptedAt);
  if (dMs <= 0) return flags;
  const dMin = dMs / 60_000;
  const dH   = dMs / 3_600_000;
  const dist = d.distanceKmEstimated ?? 0;

  if (dist > 0) {
    const speed = dist / dH;
    if (speed > 80) flags.push({
      flag:     'IMPOSSIBLE_SPEED',
      severity: 'high',
      impact:   35,
      details:  { speedKmh: Math.round(speed), distanceKm: dist, durationMin: Math.round(dMin) },
    });
  }
  if (dMin < 5 && dist > 2) flags.push({
    flag:     'TOO_FAST_FOR_DISTANCE',
    severity: 'high',
    impact:   30,
    details:  { durationMin: Math.round(dMin * 10) / 10, distanceKm: dist },
  });
  return flags;
}

// ── Règle 4 — Bonus vitesse suspect ───────────────────────────────────────────
// bonusPay accordé mais critères incohérents OU 3 fois consécutifs en < 1h

export function checkSpeedBonus(
  d: DeliveryForFraud,
  history: DeliveryForFraud[],
): FraudFlagResult[] {
  const flags: FraudFlagResult[] = [];
  if (!d.bonusPay || d.bonusPay <= 0) return flags;

  if (d.distanceKmEstimated && d.distanceKmEstimated > 3 && d.acceptedAt && d.deliveredAt) {
    const dMin = (Date.parse(d.deliveredAt) - Date.parse(d.acceptedAt)) / 60_000;
    if (dMin < 12) flags.push({
      flag:     'SPEED_BONUS_SUSPECT',
      severity: 'medium',
      impact:   20,
      details:  { durationMin: Math.round(dMin), distanceKm: d.distanceKmEstimated, bonusPay: d.bonusPay },
    });
  }

  if (d.deliveredAt) {
    const ref = Date.parse(d.deliveredAt);
    const bonusLast1h = history.filter(r =>
      r.id !== d.id && (r.bonusPay ?? 0) > 0 && r.deliveredAt &&
      ref - Date.parse(r.deliveredAt) >= 0 &&
      ref - Date.parse(r.deliveredAt) < 3_600_000,
    );
    if (bonusLast1h.length >= 2) flags.push({
      flag:     'SPEED_BONUS_REPEAT',
      severity: 'high',
      impact:   30,
      details:  { bonusCountInLastHour: bonusLast1h.length + 1 },
    });
  }
  return flags;
}

// ── Règle 5a — GPS Spoofing (positions répétées) ──────────────────────────────
// 3 livraisons consécutives avec dropoff à moins de 10 m

export function checkGpsSpoofing(
  d: DeliveryForFraud,
  history: DeliveryForFraud[],
): FraudFlagResult[] {
  if (!d.driverLocationAtDropoff) return [];
  const { lat, lng } = d.driverLocationAtDropoff;
  const samePos = history.filter(r =>
    r.id !== d.id && r.driverLocationAtDropoff &&
    haversineKm(lat, lng, r.driverLocationAtDropoff.lat, r.driverLocationAtDropoff.lng) * 1000 < 10,
  );
  if (samePos.length < 2) return [];
  return [{
    flag:     'REPEATED_GPS_PATTERN',
    severity: 'medium',
    impact:   20,
    details:  { samePositionCount: samePos.length + 1, position: { lat, lng } },
  }];
}

// ── Règle 5b — Location Jump ──────────────────────────────────────────────────
// > 5 km en < 2 min entre deux positions connues

export function checkLocationJump(
  curr?: { lat: number; lng: number; updatedAt: string } | null,
  prev?: { lat: number; lng: number; updatedAt: string } | null,
): FraudFlagResult[] {
  if (!curr || !prev) return [];
  const distKm = haversineKm(curr.lat, curr.lng, prev.lat, prev.lng);
  const diffMin = (Date.parse(curr.updatedAt) - Date.parse(prev.updatedAt)) / 60_000;
  if (distKm > 5 && diffMin >= 0 && diffMin < 2) return [{
    flag:     'LOCATION_JUMP',
    severity: 'high',
    impact:   35,
    details:  { distanceKm: Math.round(distKm * 10) / 10, durationMin: Math.round(diffMin * 10) / 10 },
  }];
  return [];
}

// ── Règle 6 — Abus boost ──────────────────────────────────────────────────────
// > 6 livraisons/heure OU > 4 en 30 min pendant boost actif

export function checkBoostAbuse(
  d: DeliveryForFraud,
  history: DeliveryForFraud[],
  boostIsActive: boolean,
): FraudFlagResult[] {
  const flags: FraudFlagResult[] = [];
  if (!boostIsActive || !d.deliveredAt) return flags;
  const ref = Date.parse(d.deliveredAt);

  const boost1h = history.filter(r =>
    r.id !== d.id && r.boostApplied && r.deliveredAt &&
    ref - Date.parse(r.deliveredAt) >= 0 &&
    ref - Date.parse(r.deliveredAt) < 3_600_000,
  );
  if (boost1h.length >= 6) flags.push({
    flag:     'BOOST_FARMING',
    severity: 'high',
    impact:   40,
    details:  { deliveriesInLastHour: boost1h.length + 1 },
  });

  const boost30min = history.filter(r =>
    r.id !== d.id && r.boostApplied && r.deliveredAt &&
    ref - Date.parse(r.deliveredAt) >= 0 &&
    ref - Date.parse(r.deliveredAt) < 1_800_000,
  );
  if (boost30min.length >= 4) flags.push({
    flag:     'BOOST_PATTERN',
    severity: 'high',
    impact:   35,
    details:  { boostDeliveriesIn30min: boost30min.length + 1 },
  });
  return flags;
}

// ── Règle 7 — Cash risk ───────────────────────────────────────────────────────
// Cash non reversé > 24h OU répété > 3 fois dans la semaine

export function checkCashRisk(
  d: DeliveryForFraud,
  history: DeliveryForFraud[],
): FraudFlagResult[] {
  const flags: FraudFlagResult[] = [];
  if (d.paymentType !== 'CASH') return flags;

  if (d.cashStatus === 'unsettled' && d.createdAt) {
    const ageH = (Date.now() - Date.parse(d.createdAt)) / 3_600_000;
    if (ageH > 24) flags.push({
      flag:     'CASH_NOT_SETTLED_24H',
      severity: 'high',
      impact:   40,
      details:  { ageHours: Math.round(ageH), cashAmount: d.cashCollectedAmount ?? 0 },
    });
  }

  const weekAgo = Date.now() - 7 * 24 * 3_600_000;
  const unsettledRepeat = history.filter(r =>
    r.id !== d.id &&
    r.paymentType === 'CASH' && r.cashStatus === 'unsettled' &&
    r.createdAt && Date.parse(r.createdAt) > weekAgo,
  );
  if (unsettledRepeat.length >= 3) flags.push({
    flag:     'CASH_RISK_REPEAT',
    severity: 'high',
    impact:   50,
    details:  { unsettledInLastWeek: unsettledRepeat.length + 1 },
  });
  return flags;
}

// ── Règle 8 — Annulations suspectes ──────────────────────────────────────────
// > 3 annulations en 1h OU annulation après pickup

export function checkCancellations(
  cancelledHistory: Array<{ createdAt?: string; pickedUpAt?: string }>,
): FraudFlagResult[] {
  const flags: FraudFlagResult[] = [];
  const now = Date.now();
  const last1h = cancelledHistory.filter(r =>
    r.createdAt && now - Date.parse(r.createdAt) < 3_600_000,
  );
  if (last1h.length >= 3) flags.push({
    flag:     'HIGH_CANCEL_RATE',
    severity: 'medium',
    impact:   15,
    details:  { cancellationsInLastHour: last1h.length },
  });
  const afterPickup = cancelledHistory.filter(r => r.pickedUpAt);
  if (afterPickup.length > 0) flags.push({
    flag:     'CANCEL_AFTER_PICKUP',
    severity: 'high',
    impact:   35,
    details:  { count: afterPickup.length },
  });
  return flags;
}

// ── Agrégation ────────────────────────────────────────────────────────────────

/** Somme des impacts (plafonnée à 100). */
export function computeFraudScore(flags: FraudFlagResult[]): number {
  return Math.min(100, flags.reduce((s, f) => s + f.impact, 0));
}

/** reviewStatus selon le fraudScore. */
export function computeReviewStatus(score: number): 'ok' | 'warning' | 'blocked' {
  if (score >= 80) return 'blocked';
  if (score >= 60) return 'warning';
  return 'ok';
}

/**
 * Score de risque driver (0-100) : moyenne pondérée des 20 dernières livraisons.
 * 70% sur les 7 plus récentes, 30% sur les 8-20.
 */
export function computeDriverRiskScore(
  deliveries: Array<{ fraudScore?: number }>,
): number {
  if (!deliveries.length) return 0;
  const recent = deliveries.slice(0, 7).map(d => d.fraudScore ?? 0);
  const older  = deliveries.slice(7, 20).map(d => d.fraudScore ?? 0);
  const avgR   = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgO   = older.length ? older.reduce((a, b) => a + b, 0) / older.length : 0;
  return Math.round(Math.min(100, avgR * 0.7 + avgO * 0.3));
}

/** Label lisible pour un flag. */
export const FLAG_LABELS: Record<string, string> = {
  DROP_NOT_AT_CUSTOMER:   'Dépôt hors zone client',
  PICKUP_NOT_AT_STORE:    'Pickup hors restaurant',
  IMPOSSIBLE_SPEED:       'Vitesse impossible',
  TOO_FAST_FOR_DISTANCE:  'Temps trop court',
  SPEED_BONUS_SUSPECT:    'Bonus vitesse suspect',
  SPEED_BONUS_REPEAT:     'Répétition bonus vitesse',
  REPEATED_GPS_PATTERN:   'GPS spoofing (pattern)',
  LOCATION_JUMP:          'Saut de localisation',
  BOOST_FARMING:          'Farming boost',
  BOOST_PATTERN:          'Pattern boost suspect',
  CASH_NOT_SETTLED_24H:   'Cash non reversé >24h',
  CASH_RISK_REPEAT:       'Cash non reversé répété',
  HIGH_CANCEL_RATE:       'Taux annulation élevé',
  CANCEL_AFTER_PICKUP:    'Annulation après pickup',
};

/** Couleur selon sévérité. */
export function severityColor(s: FraudSeverity): string {
  if (s === 'high')   return '#ff2d78';
  if (s === 'medium') return '#ff9500';
  return '#5a5470';
}

/** Couleur selon riskScore. */
export function riskColor(score: number): string {
  if (score >= 80) return '#ff2d78';
  if (score >= 60) return '#ff9500';
  if (score >= 30) return '#ffd600';
  return '#5a5470';
}
