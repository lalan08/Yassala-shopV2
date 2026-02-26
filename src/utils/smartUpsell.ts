/**
 * Smart threshold suggestion engine — Yassala Night
 *
 * Suggests the best products to help the customer reach the free-delivery
 * threshold (settings.freeDelivery).
 *
 * Pure functions — zero Firestore reads. Cache via useMemo in the component.
 */

import type { ProductLike, CartItemLike } from "./upsell";

export type { ProductLike, CartItemLike };

export type ThresholdState =
  | { unlocked: true }
  | { unlocked: false; remaining: number; suggestions: ProductLike[] };

/**
 * Returns up to `maxCount` (default 3) products that bring the customer closest
 * to the free-delivery threshold.
 *
 * Selection window:
 *   primary  : price ∈ [remaining − 5 €, remaining + 5 €]
 *   secondary: price ∈ [remaining − 10 €, remaining + 10 €]  (if < 2 results)
 *   fallback : any available product with price ≤ threshold   (if still < 2)
 *
 * Sort order (tiebreak in order):
 *   1. Proximity to remaining amount (ascending |price − remaining|)
 *   2. soldCount descending
 *   3. marginScore descending
 *   4. price descending (higher = closer to margin)
 *
 * Test cases (threshold = 30):
 *   cartTotal = 24 → remaining = 6  → suggest products priced 1 € – 11 €
 *   cartTotal = 28 → remaining = 2  → suggest products priced 0 € – 7 €
 *   cartTotal = 30 → unlocked = true
 */
export function getSmartThresholdSuggestions(
  cartItems:   CartItemLike[],
  cartTotal:   number,
  threshold:   number,
  allProducts: ProductLike[],
  maxCount     = 3,
): ThresholdState {
  if (cartTotal >= threshold) return { unlocked: true };

  const remaining = threshold - cartTotal;
  const cartIds   = new Set(cartItems.map(ci => ci.id));

  const pool = allProducts.filter(
    p => p.stock > 0 && p.isActive !== false && !cartIds.has(p.id),
  );

  if (!pool.length) return { unlocked: false, remaining, suggestions: [] };

  // ── window filtering ─────────────────────────────────────────────────────
  const inWindow = (p: ProductLike, margin: number) =>
    p.price >= remaining - margin && p.price <= remaining + margin;

  let candidates = pool.filter(p => inWindow(p, 5));
  if (candidates.length < 2) candidates = pool.filter(p => inWindow(p, 10));
  if (candidates.length < 2) candidates = pool.filter(p => p.price <= threshold);

  // ── sort ─────────────────────────────────────────────────────────────────
  candidates.sort((a, b) => {
    // 1. Proximity (lower = better)
    const proxA = Math.abs(a.price - remaining);
    const proxB = Math.abs(b.price - remaining);
    if (proxA !== proxB) return proxA - proxB;

    // 2. soldCount (higher = better)
    const soldDiff = (b.soldCount ?? 0) - (a.soldCount ?? 0);
    if (soldDiff !== 0) return soldDiff;

    // 3. marginScore (higher = better)
    const marginDiff = (b.marginScore ?? 0) - (a.marginScore ?? 0);
    if (marginDiff !== 0) return marginDiff;

    // 4. price (higher = better proxy for margin)
    return b.price - a.price;
  });

  return {
    unlocked:    false,
    remaining,
    suggestions: candidates.slice(0, maxCount),
  };
}
