"use client";

/**
 * SmartThresholdSuggestions
 *
 * Shows a progress bar + smart product suggestions to help the customer reach
 * the free-delivery threshold (settings.freeDelivery).
 *
 * • Zero extra Firestore reads — works entirely from props (useMemo)
 * • Tracks upsell_threshold_events: impression | add_to_cart
 * • Dark neon Yassala theme — mobile-first
 * • Fade-in animation when suggestions appear
 */

import { useEffect, useMemo, useRef } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getSmartThresholdSuggestions,
  type CartItemLike,
  type ProductLike,
} from "@/utils/smartUpsell";

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

function trackThresholdEvent(
  eventType:       "impression" | "add_to_cart",
  productId:       string,
  cartTotal:       number,
  threshold:       number,
  remainingAmount: number,
) {
  addDoc(collection(db, "upsell_threshold_events"), {
    eventType,
    productId,
    cartTotal,
    threshold,
    remainingAmount,
    sessionId:  getSessionId(),
    createdAt:  new Date().toISOString(),
  }).catch(() => {});
}

// ── emoji fallback (same palette as UpsellCarousel) ───────────────────────────

const CAT_EMOJI: Record<string, string> = {
  biere: "🍺", bière: "🍺", spiritueux: "🥃", cocktail: "🍹",
  snack: "🍟", grignotage: "🍟", soft: "🥤", boisson: "🥤", soda: "🥤", glace: "🍦",
};

function productEmoji(cat: string, name: string): string {
  const n = name.toLowerCase();
  if (n.includes("glaçon") || n.includes("glacon"))          return "🧊";
  if (n.includes("citron") || n.includes("lime"))            return "🍋";
  if (n.includes("chips") || n.includes("pringles"))         return "🥔";
  if (n.includes("redbull") || n.includes("red bull"))       return "🔴";
  if (n.includes("coca") || n.includes("cola"))              return "🥤";
  if (n.includes("cacahuète") || n.includes("nuts"))         return "🥜";
  return CAT_EMOJI[cat.toLowerCase()] ?? "🛒";
}

// ── component ─────────────────────────────────────────────────────────────────

interface SmartThresholdSuggestionsProps {
  cartItems:    CartItemLike[];
  allProducts:  ProductLike[];
  cartTotal:    number;
  threshold:    number;           // settings.freeDelivery
  onAddToCart:  (p: ProductLike) => void;
}

export default function SmartThresholdSuggestions({
  cartItems,
  allProducts,
  cartTotal,
  threshold,
  onAddToCart,
}: SmartThresholdSuggestionsProps) {
  // ── compute state (zero Firestore reads) ──────────────────────────────────
  const state = useMemo(
    () => getSmartThresholdSuggestions(cartItems, cartTotal, threshold, allProducts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartTotal, threshold, cartItems.map(i => i.id).join(","), allProducts.length],
  );

  // ── impression tracking (once per visible suggestion set) ─────────────────
  const firedRef        = useRef(false);
  const prevTotalRef    = useRef(cartTotal);

  useEffect(() => {
    if (Math.abs(cartTotal - prevTotalRef.current) >= 0.5) {
      firedRef.current     = false;
      prevTotalRef.current = cartTotal;
    }
  }, [cartTotal]);

  useEffect(() => {
    if (state.unlocked || firedRef.current || state.suggestions.length === 0) return;
    firedRef.current = true;
    state.suggestions.forEach(p =>
      trackThresholdEvent("impression", p.id, cartTotal, threshold, state.remaining),
    );
  }, [state, cartTotal, threshold]);

  // ── nothing to show ───────────────────────────────────────────────────────
  if (threshold <= 0) return null;

  const pct = Math.min((cartTotal / threshold) * 100, 100);

  // ── unlocked banner ───────────────────────────────────────────────────────
  if (state.unlocked) {
    return (
      <div style={{
        borderTop:    "1px solid rgba(184,255,0,.2)",
        paddingTop:   14,
        marginBottom: 16,
        animation:    "threshFadeUp .4s ease both",
      }}>
        <style>{`
          @keyframes threshFadeUp {
            from { opacity:0; transform:translateY(8px); }
            to   { opacity:1; transform:translateY(0);   }
          }
          @keyframes threshGlow {
            0%,100% { box-shadow:0 0 6px rgba(184,255,0,.3); }
            50%      { box-shadow:0 0 14px rgba(184,255,0,.7); }
          }
        `}</style>
        <div style={{
          display:        "flex",
          alignItems:     "center",
          gap:            10,
          background:     "linear-gradient(135deg,rgba(184,255,0,.08),rgba(0,245,255,.04))",
          border:         "1px solid rgba(184,255,0,.3)",
          borderRadius:   10,
          padding:        "12px 16px",
          animation:      "threshGlow 2.5s ease infinite",
        }}>
          <span style={{ fontSize:"1.3rem" }}>🎉</span>
          <div>
            <div style={{
              fontFamily:    "'Black Ops One',cursive",
              fontSize:      ".95rem",
              color:         "#b8ff00",
              letterSpacing: ".04em",
            }}>
              Livraison gratuite débloquée !
            </div>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize:   ".68rem",
              color:      "#5a5470",
              marginTop:  2,
            }}>
              // commande ≥ {threshold.toFixed(2)} €
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── suggestions block ─────────────────────────────────────────────────────
  const { remaining, suggestions } = state;

  return (
    <div style={{
      borderTop:    "1px solid rgba(0,245,255,.12)",
      paddingTop:   14,
      marginBottom: 16,
      animation:    "threshFadeUp .35s ease both",
    }}>
      <style>{`
        @keyframes threshFadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0);   }
        }
      `}</style>

      {/* Progress bar header */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        justifyContent:"space-between",
        marginBottom:  8,
      }}>
        <div style={{
          fontFamily: "'Share Tech Mono',monospace",
          fontSize:   ".68rem",
          color:      "#00f5ff",
          letterSpacing: ".06em",
          display:    "flex",
          alignItems: "center",
          gap:        5,
        }}>
          <span style={{ color:"#00f5ff", fontSize:".75rem" }}>▸</span>
          ENCORE{" "}
          <span style={{
            fontFamily: "'Black Ops One',cursive",
            fontSize:   ".82rem",
            color:      "#fff",
          }}>
            {remaining.toFixed(2)} €
          </span>
          {" "}POUR LA LIVRAISON GRATUITE 🚀
        </div>
        <span style={{
          fontFamily: "'Share Tech Mono',monospace",
          fontSize:   ".65rem",
          color:      "#5a5470",
        }}>
          {pct.toFixed(0)} %
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height:       6,
        background:   "rgba(255,255,255,.06)",
        borderRadius: 3,
        overflow:     "hidden",
        marginBottom: 12,
      }}>
        <div style={{
          width:        `${pct}%`,
          height:       "100%",
          borderRadius: 3,
          background:   pct >= 80
            ? "linear-gradient(90deg,#b8ff00,#00f5ff)"
            : pct >= 50
            ? "linear-gradient(90deg,#00f5ff,#a855f7)"
            : "linear-gradient(90deg,#a855f7,#ff2d78)",
          transition:   "width .5s cubic-bezier(.4,0,.2,1)",
          boxShadow:    "0 0 8px rgba(0,245,255,.35)",
        }} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <>
          <div style={{
            fontFamily:    "'Share Tech Mono',monospace",
            fontSize:      ".65rem",
            letterSpacing: ".1em",
            color:         "#5a5470",
            marginBottom:  10,
          }}>
            // AJOUTE L'UN DE CES PRODUITS
          </div>

          <div style={{
            display:                 "flex",
            gap:                     8,
            overflowX:               "auto",
            paddingBottom:           4,
            scrollbarWidth:          "none",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}>
            {suggestions.map(p => {
              const afterAdd    = cartTotal + p.price;
              const willUnlock  = afterAdd >= threshold;
              const newRemaining = Math.max(0, threshold - afterAdd);

              return (
                <div
                  key={p.id}
                  style={{
                    flexShrink:   0,
                    width:        118,
                    background:   willUnlock
                      ? "rgba(184,255,0,.04)"
                      : "rgba(255,255,255,.025)",
                    border:       willUnlock
                      ? "1px solid rgba(184,255,0,.25)"
                      : "1px solid rgba(0,245,255,.1)",
                    borderRadius: 10,
                    overflow:     "hidden",
                    transition:   "border-color .18s, transform .18s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform   = "translateY(-1px)";
                    e.currentTarget.style.borderColor = willUnlock
                      ? "rgba(184,255,0,.5)"
                      : "rgba(0,245,255,.4)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform   = "translateY(0)";
                    e.currentTarget.style.borderColor = willUnlock
                      ? "rgba(184,255,0,.25)"
                      : "rgba(0,245,255,.1)";
                  }}
                >
                  {/* Image or emoji */}
                  <div style={{
                    height:         58,
                    background:     willUnlock
                      ? "linear-gradient(135deg,rgba(184,255,0,.06),rgba(0,245,255,.03))"
                      : "linear-gradient(135deg,rgba(0,245,255,.05),rgba(168,85,247,.03))",
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    fontSize:       "1.55rem",
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
                  <div style={{ padding:"7px 8px 8px" }}>
                    <div style={{
                      fontFamily:      "'Inter',sans-serif",
                      fontSize:        ".7rem",
                      fontWeight:      600,
                      color:           "#e0dff4",
                      lineHeight:      1.3,
                      marginBottom:    4,
                      display:         "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow:        "hidden",
                    } as React.CSSProperties}>
                      {p.name}
                    </div>

                    {/* Price row */}
                    <div style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "space-between",
                      gap:            4,
                      marginBottom:   willUnlock ? 5 : 0,
                    }}>
                      <span style={{
                        fontFamily: "'Black Ops One',cursive",
                        fontSize:   ".8rem",
                        color:      willUnlock ? "#b8ff00" : "#00f5ff",
                        lineHeight: 1,
                      }}>
                        {p.price.toFixed(2)} €
                      </span>

                      <button
                        onClick={() => {
                          trackThresholdEvent(
                            "add_to_cart", p.id, cartTotal, threshold, remaining,
                          );
                          onAddToCart(p);
                        }}
                        style={{
                          background:  willUnlock
                            ? "linear-gradient(135deg,#b8ff00,#78cc00)"
                            : "linear-gradient(135deg,#00f5ff44,#00f5ff22)",
                          border:      willUnlock
                            ? "none"
                            : "1px solid rgba(0,245,255,.4)",
                          borderRadius: 5,
                          width:        24,
                          height:       24,
                          cursor:       "pointer",
                          display:      "flex",
                          alignItems:   "center",
                          justifyContent: "center",
                          fontSize:     ".92rem",
                          color:        willUnlock ? "#000" : "#00f5ff",
                          fontWeight:   700,
                          flexShrink:   0,
                          transition:   "transform .15s, box-shadow .15s",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform  = "scale(1.15)";
                          e.currentTarget.style.boxShadow  = willUnlock
                            ? "0 0 8px rgba(184,255,0,.5)"
                            : "0 0 8px rgba(0,245,255,.4)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                        aria-label={`Ajouter ${p.name}`}
                      >
                        +
                      </button>
                    </div>

                    {/* "Débloque livraison gratuite" badge */}
                    {willUnlock && (
                      <div style={{
                        fontFamily:    "'Share Tech Mono',monospace",
                        fontSize:      ".6rem",
                        color:         "#b8ff00",
                        letterSpacing: ".04em",
                        lineHeight:    1.2,
                      }}>
                        🎉 débloque livraison gratuite
                      </div>
                    )}

                    {/* "encore X€" hint */}
                    {!willUnlock && (
                      <div style={{
                        fontFamily: "'Share Tech Mono',monospace",
                        fontSize:   ".6rem",
                        color:      "#3a3450",
                        marginTop:  2,
                        lineHeight: 1.2,
                      }}>
                        encore {newRemaining.toFixed(2)} €
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
