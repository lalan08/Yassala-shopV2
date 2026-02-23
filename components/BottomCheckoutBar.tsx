"use client";

import { useCart } from "../src/context/CartContext";
import { useRouter } from "next/navigation";

export default function BottomCheckoutBar() {
  const { getItemCount, getTotal } = useCart();
  const router = useRouter();

  const count = getItemCount();
  const total = getTotal();

  if (count === 0) return null;

  const handleCheckout = async () => {
    try {
      const res = await fetch("/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: Math.round(total * 100) // Stripe = centimes
        })
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Erreur paiement");
      }
    } catch (err) {
      console.error(err);
      alert("Erreur connexion serveur");
    }
  };

  return (
    <button
      onClick={handleCheckout}
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#000",
        color: "#fff",
        padding: "14px 20px",
        borderRadius: 12,
        border: "none",
        display: "flex",
        alignItems: "center",
        gap: 16,
        cursor: "pointer",
        zIndex: 9999
      }}
    >
      <span
        style={{
          background: "#222",
          padding: "4px 10px",
          borderRadius: 6,
          fontSize: ".9rem"
        }}
      >
        {count} article{count > 1 ? "s" : ""}
      </span>

      🛒 PAYER

      <span style={{ fontFamily: "'Share Tech Mono', monospace" }}>
        {total.toFixed(2)}€
      </span>
    </button>
  );
}
