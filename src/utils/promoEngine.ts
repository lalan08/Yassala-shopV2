// ─── Flash Deal / Promo Engine ────────────────────────────────
// Source de vérité : collection Firestore `promotions`

export type Promotion = {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  /** ISO string */
  startAt: string;
  /** ISO string */
  endAt: string;
  discountType: "percent" | "fixed";
  /** percent → 10 = 10%  /  fixed → 1.50 = 1.50€ */
  discountValue: number;
  /** 1 à 3 produits concernés */
  productIds: string[];
  /** Optionnel : nombre max d'utilisations */
  maxUses?: number;
  usesCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PromoCartItem = { id: string; name: string; price: number; qty: number };

/** Vérifie si une promo est actuellement valide */
export function isPromoActive(promo: Promotion): boolean {
  if (!promo.isActive) return false;
  const now = Date.now();
  const start = new Date(promo.startAt).getTime();
  const end   = new Date(promo.endAt).getTime();
  if (now < start || now > end) return false;
  if (promo.maxUses !== undefined && promo.usesCount >= promo.maxUses) return false;
  return true;
}

/** Calcule le montant de la remise sur le panier */
export function computePromoDiscount(
  promo: Promotion | null,
  cart: PromoCartItem[]
): number {
  if (!promo) return 0;

  if (promo.discountType === "percent") {
    const base = cart
      .filter(i => promo.productIds.includes(i.id))
      .reduce((s, i) => s + i.price * i.qty, 0);
    return Math.round(base * promo.discountValue) / 100;
  }

  // fixed : remise forfaitaire sur le total du panier, plafonnée au total
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return Math.min(promo.discountValue, cartTotal);
}

/**
 * Retourne le prix promo d'un produit (percent uniquement).
 * Pour "fixed", la remise s'applique au total — retourne null.
 */
export function getProductPromoPrice(
  productId: string,
  originalPrice: number,
  promo: Promotion | null
): number | null {
  if (!promo || !promo.productIds.includes(productId)) return null;
  if (promo.discountType !== "percent") return null;
  return Math.max(0, originalPrice * (1 - promo.discountValue / 100));
}

/** Millisecondes restantes avant la fin de la promo */
export function promoMsRemaining(promo: Promotion): number {
  return Math.max(0, new Date(promo.endAt).getTime() - Date.now());
}
