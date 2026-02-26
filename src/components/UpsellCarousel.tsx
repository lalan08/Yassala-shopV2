"use client";

/**
 * UpsellCarousel — "Complète ta commande 🔥" / "Recommandé pour toi"
 *
 * - Computes recommendations via getUpsellRecommendations (useMemo, no extra fetch)
 * - Tracks impression / click / add_to_cart in Firestore upsell_events
 * - Compact horizontal scroll cards (mobile-first, 108px wide)
 * - Dark neon Yassala theme
 */

import { useEffect, useMemo, useRef } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getUpsellRecommendations, type CartItemLike, type ProductLike } from "@/utils/upsell";

// ── session tracking ──────────────────────────────────────────────────────────

function getSessionId(): string {
  if (typeof sessionStorage === "undefined") return "ssr";
  let id = sessionStorage.getItem("yassala_session_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("yassala_session_id", id);
  }
  return id;
}

function trackEvent(
  type:               "impression" | "click" | "add_to_cart",
  source:             "cart" | "checkout",
  productId:          string,
  cartSnapshotTotal:  number,
) {
  addDoc(collection(db, "upsell_events"), {
    type,
    source,
    productId,
    cartSnapshotTotal,
    sessionId:  getSessionId(),
    createdAt:  new Date().toISOString(),
  }).catch(() => {});
}

// ── emoji fallback helpers ────────────────────────────────────────────────────

const CAT_EMOJI: Record<string, string> = {
  biere:      "🍺", bière: "🍺",
  spiritueux: "🥃", cocktail: "🍹",
  snack:      "🍟", grignotage: "🍟",
  soft:       "🥤", boisson: "🥤", soda: "🥤",
  glace:      "🍦",
};

function productEmoji(cat: string, name: string): string {
  const n = name.toLowerCase();
  if (n.includes("glaçon") || n.includes("glacon") || n.includes("ice cube")) return "🧊";
  if (n.includes("citron") || n.includes("lime") || n.includes("lemon"))       return "🍋";
  if (n.includes("chips") || n.includes("pringles"))                            return "🥔";
  if (n.includes("redbull") || n.includes("red bull"))                          return "🔴";
  if (n.includes("coca") || n.includes("cola"))                                 return "🥤";
  if (n.includes("cacahuète") || n.includes("nuts") || n.includes("noix"))     return "🥜";
  return CAT_EMOJI[cat.toLowerCase()] ?? "🛒";
}

// ── component ─────────────────────────────────────────────────────────────────

interface UpsellCarouselProps {
  source:       "cart" | "checkout";
  cartItems:    CartItemLike[];
  allProducts:  ProductLike[];
  onAddToCart:  (product: ProductLike) => void;
  cartTotal:    number;
  deliveryMin?: number;
}

export default function UpsellCarousel({
  source,
  cartItems,
  allProducts,
  onAddToCart,
  cartTotal,
  deliveryMin = 15,
}: UpsellCarouselProps) {
  // ── recommendations — zero Firestore reads (pure from props) ─────────────
  const recommendations = useMemo(
    () => getUpsellRecommendations(cartItems, allProducts, deliveryMin),
    // Re-compute only when cart contents change (length + ids as key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartItems.length, cartItems.map(i => i.id).join(","), allProducts.length, deliveryMin],
  );

  // ── impression tracking (once per carousel mount / cart-open) ────────────
  const impressionFiredRef  = useRef(false);
  const prevCartLenRef      = useRef(cartItems.length);

  useEffect(() => {
    // Reset when cart contents change so next open re-fires impressions
    if (cartItems.length !== prevCartLenRef.current) {
      impressionFiredRef.current = false;
      prevCartLenRef.current = cartItems.length;
    }
  }, [cartItems.length]);

  useEffect(() => {
    if (impressionFiredRef.current || recommendations.length === 0) return;
    impressionFiredRef.current = true;
    recommendations.forEach(p => trackEvent("impression", source, p.id, cartTotal));
  }, [recommendations, source, cartTotal]);

  if (recommendations.length === 0) return null;

  const label = source === "cart" ? "Complète ta commande 🔥" : "Recommandé pour toi";

  return (
    <div style={{
      borderTop:    "1px solid rgba(255,45,120,.15)",
      paddingTop:   14,
      marginBottom: 16,
    }}>
      {/* Section label */}
      <div style={{
        fontFamily:    "'Share Tech Mono',monospace",
        fontSize:      ".68rem",
        letterSpacing: ".12em",
        color:         "#5a5470",
        marginBottom:  10,
        display:       "flex",
        alignItems:    "center",
        gap:           6,
      }}>
        <span style={{ color:"#ff2d78", fontSize:".75rem" }}>▸</span>
        {label.toUpperCase()}
      </div>

      {/* Horizontal scroll strip */}
      <div style={{
        display:                  "flex",
        gap:                      8,
        overflowX:                "auto",
        paddingBottom:            4,
        scrollbarWidth:           "none",
        WebkitOverflowScrolling:  "touch",
      } as React.CSSProperties}>
        {recommendations.map(p => (
          <div
            key={p.id}
            onClick={() => trackEvent("click", source, p.id, cartTotal)}
            style={{
              flexShrink:  0,
              width:       108,
              background:  "rgba(255,255,255,.025)",
              border:      "1px solid rgba(255,255,255,.07)",
              borderRadius: 10,
              overflow:    "hidden",
              transition:  "border-color .18s, transform .18s",
              cursor:      "default",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "rgba(255,45,120,.35)";
              e.currentTarget.style.transform   = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,.07)";
              e.currentTarget.style.transform   = "translateY(0)";
            }}
          >
            {/* Image or emoji */}
            <div style={{
              height:         62,
              background:     "linear-gradient(135deg,rgba(255,45,120,.07),rgba(0,245,255,.04))",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       "1.65rem",
              overflow:       "hidden",
              flexShrink:     0,
            }}>
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.name}
                  style={{ width:"100%", height:"100%", objectFit:"cover" }}
                />
              ) : (
                productEmoji(p.cat, p.name)
              )}
            </div>

            {/* Info */}
            <div style={{ padding:"7px 8px 7px" }}>
              <div style={{
                fontFamily:          "'Inter',sans-serif",
                fontSize:            ".72rem",
                fontWeight:          600,
                color:               "#e0dff4",
                lineHeight:          1.3,
                marginBottom:        5,
                display:             "-webkit-box",
                WebkitLineClamp:     2,
                WebkitBoxOrient:     "vertical",
                overflow:            "hidden",
              } as React.CSSProperties}>
                {p.name}
              </div>

              <div style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                gap:            4,
              }}>
                <span style={{
                  fontFamily: "'Black Ops One',cursive",
                  fontSize:   ".82rem",
                  color:      "#b8ff00",
                  lineHeight: 1,
                }}>
                  {p.price.toFixed(2)} €
                </span>

                <button
                  onClick={e => {
                    e.stopPropagation();
                    trackEvent("add_to_cart", source, p.id, cartTotal);
                    onAddToCart(p);
                  }}
                  style={{
                    background:  "linear-gradient(135deg,#ff2d78,#c0145a)",
                    border:      "none",
                    borderRadius: 5,
                    width:       24,
                    height:      24,
                    cursor:      "pointer",
                    display:     "flex",
                    alignItems:  "center",
                    justifyContent: "center",
                    fontSize:    ".95rem",
                    color:       "#fff",
                    fontWeight:  700,
                    flexShrink:  0,
                    transition:  "transform .15s, box-shadow .15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform  = "scale(1.15)";
                    e.currentTarget.style.boxShadow  = "0 0 8px rgba(255,45,120,.5)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform  = "scale(1)";
                    e.currentTarget.style.boxShadow  = "none";
                  }}
                  aria-label={`Ajouter ${p.name}`}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
