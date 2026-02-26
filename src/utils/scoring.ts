/**
 * Calcul du score de performance livreur.
 *
 * Formule (inputs normalisés 0-100) :
 *   score = (tempsLivraisonMoyen * -0.5) + (tauxAcceptation * 0.3) + (noteClient * 0.2)
 *
 * Implémentation :
 *   - tempsLivraisonMoyen → converti en tempsScore 0-100 (100 = ultra-rapide, 0 = très lent)
 *     tempsScore = max(0, 100 - avgMinutes * 1.25)   [0 min=100, 80 min=0]
 *   - tauxAcceptation     → 0-100 (pourcentage)
 *   - noteClient          → 0-100 (étoiles × 20)
 *
 * Seuils : >80 vert · 60-80 orange · <60 rouge
 */

export interface PerformanceInput {
  /** Temps moyen de livraison en minutes (basé sur createdAt → deliveredAt) */
  avgDeliveryMinutes: number;
  /** Taux d'acceptation 0-100 (commandes livrées / commandes assignées × 100) */
  acceptanceRate: number;
  /** Note client 0-5 étoiles */
  clientRating: number;
}

export function computePerformanceScore(input: PerformanceInput): number {
  const { avgDeliveryMinutes, acceptanceRate, clientRating } = input;

  // Normalisation du temps : plus vite = score plus haut
  const tempsScore = Math.max(0, Math.min(100, 100 - avgDeliveryMinutes * 1.25));
  const acceptScore = Math.max(0, Math.min(100, acceptanceRate));
  const ratingScore = Math.max(0, Math.min(100, clientRating * 20)); // 5★ = 100

  // score = tempsScore × 0.5 + tauxAcceptation × 0.3 + noteClient × 0.2
  const score = tempsScore * 0.5 + acceptScore * 0.3 + ratingScore * 0.2;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Couleur hex selon le score */
export function scoreColor(score: number): string {
  if (score > 80) return '#22c55e';  // vert
  if (score >= 60) return '#f97316'; // orange
  return '#ef4444';                  // rouge
}

/** Label court selon le score */
export function scoreLabel(score: number): string {
  if (score > 80) return 'EXCELLENT';
  if (score >= 60) return 'BON';
  return 'FAIBLE';
}
