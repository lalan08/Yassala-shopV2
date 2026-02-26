/**
 * Système BOOST automatique — Yassala
 *
 * Logique :
 *   ratio = pendingOrders / max(activeDrivers, 1)
 *
 *   ratio >= 2 → +1.50 €
 *   ratio >= 3 → +3.00 €
 *   ratio >= 4 → +5.00 €
 *   sinon      →  0.00 €
 *
 * Zone : Matoury · Timezone : America/Cayenne (UTC−3)
 * Fenêtre focus : 20h → 06h (mais le boost est actif 24/7 si ratio atteint)
 *
 * Pour modifier les montants / seuils → éditer BOOST_CONFIG ci-dessous.
 */

// ── Configuration plug & play ────────────────────────────────────────────────
export const BOOST_CONFIG = {
  /** Nb de livraisons/heure qu'un livreur peut traiter (utilisé en analytics) */
  capacityPerDriver: 3,

  /** Seuils et montants — modifier ici pour ajuster le boost */
  tiers: [
    { minRatio: 4, amount: 5.00 },
    { minRatio: 3, amount: 3.00 },
    { minRatio: 2, amount: 1.50 },
  ] as { minRatio: number; amount: number }[],

  /** Fenêtre horaire "focus" (heures locales UTC-3) */
  focusHoursStart: 20,
  focusHoursEnd:   6,    // borne exclue (= minuit + 6h)

  /** Timezone offset en minutes (UTC-3 = -180) */
  tzOffsetMin: -180,
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface BoostState {
  isActive:      boolean;
  boostAmount:   number;        // 0 | 1.50 | 3.00 | 5.00
  ratio:         number;
  pendingOrders: number;
  activeDrivers: number;
  updatedAt:     string;        // ISO
  reason:        string;
}

// ── Core function ────────────────────────────────────────────────────────────

/**
 * Calcule le montant du boost selon le ratio commandes/livreurs.
 *
 * @param ratio  pendingOrders / max(activeDrivers, 1)
 * @returns  montant en euros (0.00 si pas de boost)
 */
export function calculBoost(ratio: number): number {
  for (const tier of BOOST_CONFIG.tiers) {
    if (ratio >= tier.minRatio) return tier.amount;
  }
  return 0;
}

/**
 * Construit la raison textuelle pour le champ `reason` de boost_state/current.
 */
export function boostReason(pendingOrders: number, activeDrivers: number, ratio: number, amount: number): string {
  if (amount === 0) return `Pas de boost — ratio ${ratio.toFixed(2)} (${pendingOrders} cmd / ${activeDrivers} livreur${activeDrivers !== 1 ? 's' : ''})`;
  return `Boost +${amount.toFixed(2)} € — ratio ${ratio.toFixed(2)} (${pendingOrders} cmd / ${activeDrivers} livreur${activeDrivers !== 1 ? 's' : ''})`;
}

/**
 * Label d'affichage selon le montant boost.
 */
export function boostLabel(amount: number): string {
  if (amount >= 5) return '🔥 BOOST MAX';
  if (amount >= 3) return '⚡ BOOST FORT';
  if (amount >= 1.5) return '🚀 BOOST ACTIF';
  return '—';
}

/** Couleur du badge selon le montant. */
export function boostColor(amount: number): string {
  if (amount >= 5)   return '#ff2d78';
  if (amount >= 3)   return '#ff9500';
  if (amount >= 1.5) return '#a855f7';
  return '#5a5470';
}
