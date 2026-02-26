/**
 * Upsell recommendation engine — Yassala Night
 *
 * Works purely with the existing Product shape:
 *   {id, name, cat, price, stock, isActive?, tags?, marginScore?, soldCount?}
 * No extra Firestore reads — call once, cache via useMemo.
 *
 * Detection uses `cat` + `name` keywords.
 * Optional fields (tags, marginScore, soldCount) improve ranking if present.
 */

// ── shared types (intentionally minimal to avoid coupling) ───────────────────

export type ProductLike = {
  id:           string;
  name:         string;
  cat:          string;
  price:        number;
  stock:        number;
  image?:       string;
  isActive?:    boolean;
  tags?:        string[];
  marginScore?: number;
  soldCount?:   number;
};

export type CartItemLike = {
  id:    string;
  name:  string;
  price: number;
  qty:   number;
};

export type CartSignals = {
  hasAlcohol:         boolean;  // spiritueux/cocktail: vodka, rhum, whisky…
  hasBeer:            boolean;  // cat biere
  hasSoft:            boolean;  // soda / soft
  hasSnack:           boolean;  // snack / grignotage
  hasOnlyNonAlcohol:  boolean;  // soft/snack but no alcohol/beer
  needsMinOrder:      boolean;  // total < deliveryMin
  cartTotal:          number;
};

// ── keyword banks ─────────────────────────────────────────────────────────────

const ALCOHOL_CATS  = ['spiritueux', 'spirit', 'cocktail', 'alcool'];
const ALCOHOL_WORDS = [
  'vodka','rhum','rum','whisky','whiskey','gin','tequila',
  'cognac','calvados','armagnac','pastis','punch','sirop alcool',
];
const BEER_CATS     = ['biere', 'bière', 'beer'];
const SOFT_CATS     = ['soft', 'boisson', 'soda', 'jus', 'eau'];
const SOFT_WORDS    = [
  'coca','cola','sprite','fanta','schweppes',
  'redbull','red bull','7up','seven up','perrier',
  'limonade','ice tea','icetea','tonic',
];
const SNACK_CATS    = ['snack', 'grignotage', 'snacks', 'munchies'];
const SNACK_WORDS   = ['chips','cacahuète','cacahuete','noix','nuts','biscuit','popcorn','pringles'];
const ICE_WORDS     = ['glaçon','glacon','glace','ice','cube'];
const CITRUS_WORDS  = ['citron','lime','limon','lemon'];

// ── helpers ───────────────────────────────────────────────────────────────────

function matchesCat(p: ProductLike, cats: string[]): boolean {
  const c = p.cat.toLowerCase();
  return cats.some(cat => c.includes(cat));
}

function matchesName(p: ProductLike, words: string[]): boolean {
  const n = p.name.toLowerCase();
  return words.some(w => n.includes(w));
}

function matchesTags(p: ProductLike, words: string[]): boolean {
  if (!p.tags?.length) return false;
  return words.some(w => p.tags!.some(t => t.toLowerCase().includes(w)));
}

function productMatches(p: ProductLike, cats: string[], words: string[]): boolean {
  return matchesCat(p, cats)
    || matchesName(p, words)
    || matchesTags(p, [...cats, ...words]);
}

// ── signal detection ──────────────────────────────────────────────────────────

export function detectCartSignals(
  cartItems:   CartItemLike[],
  allProducts: ProductLike[],
  deliveryMin  = 15,
): CartSignals {
  const byId = new Map(allProducts.map(p => [p.id, p]));
  const inCart = cartItems
    .map(ci => byId.get(ci.id))
    .filter(Boolean) as ProductLike[];
  const cartTotal = cartItems.reduce((s, ci) => s + ci.price * ci.qty, 0);

  const hasAlcohol = inCart.some(p => productMatches(p, ALCOHOL_CATS, ALCOHOL_WORDS));
  const hasBeer    = inCart.some(p => productMatches(p, BEER_CATS,    []));
  const hasSoft    = inCart.some(p => productMatches(p, SOFT_CATS,    SOFT_WORDS));
  const hasSnack   = inCart.some(p => productMatches(p, SNACK_CATS,   SNACK_WORDS));

  return {
    hasAlcohol,
    hasBeer,
    hasSoft,
    hasSnack,
    hasOnlyNonAlcohol: !hasAlcohol && !hasBeer && (hasSoft || hasSnack),
    needsMinOrder:     cartTotal < deliveryMin,
    cartTotal,
  };
}

// ── product scoring ───────────────────────────────────────────────────────────

function scoreProduct(
  p:           ProductLike,
  targetCats:  string[],
  targetWords: string[],
  cartIds:     Set<string>,
): number {
  if (p.stock      <= 0)    return -Infinity;
  if (p.isActive   === false) return -Infinity;
  if (cartIds.has(p.id))    return -Infinity;

  let score = 0;

  // Category / name / tag match → big bonus
  if (productMatches(p, targetCats, targetWords)) score += 200;

  // Optional enrichment fields
  if (p.soldCount)   score += Math.min(p.soldCount,   150);
  if (p.marginScore) score += p.marginScore * 5;

  // Price as proxy for perceived value / margin
  score += p.price * 2;

  return score;
}

function topN(
  pool:        ProductLike[],
  targetCats:  string[],
  targetWords: string[],
  cartIds:     Set<string>,
  n:           number,
): ProductLike[] {
  return pool
    .map(p => ({ p, score: scoreProduct(p, targetCats, targetWords, cartIds) }))
    .filter(x => isFinite(x.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.p);
}

// ── main recommendation function ──────────────────────────────────────────────

/**
 * Returns 2–4 complementary products.
 *
 * Rules (evaluated in order, first match wins for primary list):
 *   1. Alcohol → soft/ice/citrus/snack
 *   2. Beer    → snack + more beer
 *   3. Soft only (no alcohol) → snack + ice cream
 *   4. Fallback → top-scored available products
 *
 * needsMinOrder nudge: re-sort to favour products that bring total closest
 * to deliveryMin without jumping too far over.
 */
export function getUpsellRecommendations(
  cartItems:   CartItemLike[],
  allProducts: ProductLike[],
  deliveryMin  = 15,
): ProductLike[] {
  if (!allProducts.length || !cartItems.length) return [];

  const signals = detectCartSignals(cartItems, allProducts, deliveryMin);
  const cartIds = new Set(cartItems.map(ci => ci.id));
  const pool    = allProducts.filter(
    p => p.stock > 0 && p.isActive !== false && !cartIds.has(p.id),
  );

  if (!pool.length) return [];

  let recs: ProductLike[] = [];

  // ── Rule 1: alcool → soft + glaçons + citron + snack ────────────────────
  if (signals.hasAlcohol) {
    recs = topN(
      pool,
      [...SOFT_CATS, ...SNACK_CATS],
      [...SOFT_WORDS, ...ICE_WORDS, ...CITRUS_WORDS],
      cartIds,
      4,
    );
  }

  // ── Rule 2: bière → snack + 2e pack bière ───────────────────────────────
  else if (signals.hasBeer) {
    const snacks   = topN(pool, SNACK_CATS, SNACK_WORDS, cartIds, 2);
    const moreBeer = topN(pool, BEER_CATS,  [],           cartIds, 2);
    const seen     = new Set(snacks.map(p => p.id));
    recs = [...snacks, ...moreBeer.filter(p => !seen.has(p.id))];
  }

  // ── Rule 3: soft seul → snack + glace ───────────────────────────────────
  else if (signals.hasOnlyNonAlcohol) {
    recs = topN(
      pool,
      [...SNACK_CATS, ...SOFT_CATS],
      [...SNACK_WORDS, ...ICE_WORDS, 'glace', 'dessert'],
      cartIds,
      4,
    );
  }

  // ── Rule 4 / Fallback : top produits ────────────────────────────────────
  if (recs.length < 2) {
    const existing = new Set(recs.map(r => r.id));
    const fallback = topN(pool, [], [], cartIds, 4 - recs.length)
      .filter(p => !existing.has(p.id));
    recs = [...recs, ...fallback];
  }

  // ── needsMinOrder nudge ──────────────────────────────────────────────────
  if (signals.needsMinOrder) {
    recs.sort((a, b) => {
      const distA = Math.abs(signals.cartTotal + a.price - deliveryMin);
      const distB = Math.abs(signals.cartTotal + b.price - deliveryMin);
      return distA - distB;
    });
  }

  return recs.slice(0, 4);
}
