"use client";
import { useEffect, useState } from "react";
import { Promotion } from "@/utils/promoEngine";

type BannerProduct = {
  id: string;
  name: string;
  price: number;
  image?: string;
  stock: number;
};

interface FlashDealBannerProps {
  promo: Promotion;
  products: BannerProduct[];
  /** "home" = bannière complète  /  "cart" = version compacte */
  source: "home" | "cart";
  onAddToCart?: (id: string, name: string, price: number) => void;
}

function useCountdown(endAt: string) {
  const calc = () => {
    const diff = Math.max(0, new Date(endAt).getTime() - Date.now());
    return {
      mm:      String(Math.floor(diff / 60000)).padStart(2, "0"),
      ss:      String(Math.floor((diff % 60000) / 1000)).padStart(2, "0"),
      expired: diff === 0,
    };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const interval = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);
  return t;
}

export default function FlashDealBanner({
  promo,
  products,
  source,
  onAddToCart,
}: FlashDealBannerProps) {
  const { mm, ss, expired } = useCountdown(promo.endAt);
  if (expired) return null;

  const promoProducts = products.filter(
    p => promo.productIds.includes(p.id) && p.stock > 0
  );

  const discountLabel =
    promo.discountType === "percent"
      ? `-${promo.discountValue}%`
      : `-${promo.discountValue.toFixed(2)}€`;

  // ── VERSION COMPACTE (panier) ────────────────────────────────
  if (source === "cart") {
    return (
      <div style={{
        background: "linear-gradient(135deg,rgba(255,45,120,.12),rgba(255,100,0,.07))",
        border: "1px solid rgba(255,45,120,.4)",
        borderRadius: 8,
        padding: "10px 14px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: ".62rem",
            color: "#ff6b35",
            letterSpacing: ".12em",
            textTransform: "uppercase",
          }}>
            🔥 {promo.title}
          </div>
          <div style={{
            fontFamily: "'Rajdhani',sans-serif",
            fontSize: ".82rem",
            color: "#f0eeff",
            marginTop: 2,
          }}>
            {discountLabel} appliqué automatiquement
          </div>
        </div>
        <div style={{
          fontFamily: "'Black Ops One',cursive",
          fontSize: "1.1rem",
          color: "#ff2d78",
          textShadow: "0 0 12px rgba(255,45,120,.6)",
          minWidth: 58,
          textAlign: "right",
          letterSpacing: ".04em",
        }}>
          {mm}:{ss}
        </div>
      </div>
    );
  }

  // ── VERSION COMPLÈTE (home) ──────────────────────────────────
  return (
    <div style={{
      margin: "0 0 20px",
      background: "linear-gradient(135deg,rgba(255,45,120,.14) 0%,rgba(255,100,0,.08) 100%)",
      border: "1px solid rgba(255,45,120,.45)",
      borderRadius: 10,
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Barre animée du haut */}
      <div style={{
        height: 3,
        background: "linear-gradient(90deg,#ff2d78,#ff6b35,#b8ff00,#ff2d78)",
        backgroundSize: "300% 100%",
        animation: "flashGrad 2.4s linear infinite",
      }} />

      <div style={{ padding: "16px 18px" }}>
        {/* Ligne titre + timer */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}>
          <div>
            <div style={{
              fontFamily: "'Black Ops One',cursive",
              fontSize: "1.25rem",
              color: "#ff2d78",
              textShadow: "0 0 18px rgba(255,45,120,.6)",
              letterSpacing: ".04em",
            }}>
              {promo.title}
            </div>
            {promo.description && (
              <div style={{
                fontFamily: "'Rajdhani',sans-serif",
                fontSize: ".85rem",
                color: "#c0b8d8",
                marginTop: 3,
              }}>
                {promo.description}
              </div>
            )}
          </div>

          {/* Timer bloc */}
          <div style={{
            background: "rgba(255,45,120,.1)",
            border: "1px solid rgba(255,45,120,.4)",
            borderRadius: 8,
            padding: "6px 14px",
            textAlign: "center",
            flexShrink: 0,
          }}>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: ".5rem",
              color: "#ff6b35",
              letterSpacing: ".14em",
              marginBottom: 2,
              textTransform: "uppercase",
            }}>
              Se termine dans
            </div>
            <div style={{
              fontFamily: "'Black Ops One',cursive",
              fontSize: "1.7rem",
              color: "#ff2d78",
              textShadow: "0 0 22px rgba(255,45,120,.8)",
              lineHeight: 1,
              letterSpacing: ".06em",
            }}>
              {mm}:{ss}
            </div>
          </div>
        </div>

        {/* Badge remise + stock */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: promoProducts.length ? 14 : 0 }}>
          <span style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: ".68rem",
            letterSpacing: ".1em",
            background: "rgba(255,45,120,.18)",
            border: "1px solid rgba(255,45,120,.5)",
            borderRadius: 4,
            padding: "3px 10px",
            color: "#ff2d78",
          }}>
            🔥 {discountLabel}{" "}
            {promo.discountType === "percent" ? "SUR SÉLECTION" : "SUR LA COMMANDE"}
          </span>
          {promo.maxUses !== undefined && (
            <span style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: ".6rem",
              color: "#5a5470",
              letterSpacing: ".06em",
            }}>
              {Math.max(0, promo.maxUses - promo.usesCount)} restante{promo.maxUses - promo.usesCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Chips produits avec CTA */}
        {promoProducts.length > 0 && onAddToCart && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {promoProducts.map(p => {
              const promoPrice =
                promo.discountType === "percent"
                  ? p.price * (1 - promo.discountValue / 100)
                  : p.price;
              return (
                <button
                  key={p.id}
                  onClick={() => onAddToCart(p.id, p.name, p.price)}
                  style={{
                    background: "rgba(255,45,120,.08)",
                    border: "1px solid rgba(255,45,120,.32)",
                    borderRadius: 7,
                    padding: "7px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    transition: "all .2s",
                  }}
                >
                  {p.image && (
                    <img
                      src={p.image}
                      alt={p.name}
                      style={{ width: 34, height: 34, borderRadius: 5, objectFit: "cover", flexShrink: 0 }}
                    />
                  )}
                  <div style={{ textAlign: "left" }}>
                    <div style={{
                      fontFamily: "'Rajdhani',sans-serif",
                      fontWeight: 700,
                      fontSize: ".82rem",
                      color: "#f0eeff",
                    }}>
                      {p.name}
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {promo.discountType === "percent" && (
                        <span style={{
                          fontFamily: "'Share Tech Mono',monospace",
                          fontSize: ".6rem",
                          color: "#5a5470",
                          textDecoration: "line-through",
                        }}>
                          {p.price.toFixed(2)}€
                        </span>
                      )}
                      <span style={{
                        fontFamily: "'Black Ops One',cursive",
                        fontSize: ".82rem",
                        color: "#b8ff00",
                        textShadow: "0 0 8px rgba(184,255,0,.4)",
                      }}>
                        {promoPrice.toFixed(2)}€
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes flashGrad {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
      `}</style>
    </div>
  );
}
