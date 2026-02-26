/**
 * POST /api/chat
 *
 * Chatbot Yassala propulsé par Claude (claude-haiku-4-5-20251001).
 * Streaming SSE côté serveur → client.
 *
 * Body: {
 *   messages: { role: "user"|"assistant"; content: string }[]
 *   context: {
 *     shopOpen: boolean
 *     hours: string
 *     zone: string
 *     deliveryMin: number
 *     freeDelivery: number
 *     products: { name: string; price: number; stock: number; cat: string }[]
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL =
  (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com") +
  "/v1/messages";

function buildSystemPrompt(ctx: {
  shopOpen: boolean;
  hours: string;
  zone: string;
  deliveryMin: number;
  freeDelivery: number;
  products: { name: string; price: number; stock: number; cat: string }[];
}): string {
  const status = ctx.shopOpen ? "OUVERT ✅" : "FERMÉ ❌";
  const available = ctx.products
    .filter(p => p.stock > 0)
    .slice(0, 30)
    .map(p => `  • ${p.name} — ${p.price.toFixed(2)}€ (${p.stock} en stock, catégorie: ${p.cat})`)
    .join("\n");

  return `Tu es l'assistant virtuel du **Yassala Night Shop**, service de livraison nocturne à **${ctx.zone}**, Guyane 🌙.

## Statut du shop
- Statut : ${status}
- Horaires : ${ctx.hours}
- Zone de livraison : ${ctx.zone}
- Commande minimum : ${ctx.deliveryMin.toFixed(2)}€
- Livraison gratuite à partir de : ${ctx.freeDelivery.toFixed(2)}€

## Produits disponibles (${ctx.products.filter(p => p.stock > 0).length} en stock)
${available || "  (aucun produit en stock actuellement)"}

## Tes règles
- Réponds **uniquement en français**, de façon concise et amicale.
- Tu peux aider sur : disponibilité produits, prix, délais, zone de livraison, paiements, promotions.
- Ne prends **jamais** de commande toi-même — invite le client à utiliser le shop directement.
- Si tu ne sais pas, dis-le honnêtement. Ne t'invente pas d'infos.
- Garde tes réponses courtes (2-4 phrases max sauf si une explication détaillée est vraiment utile).
- Utilise des emojis avec parcimonie pour rester professionnel.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY non configurée — ajoute-la dans .env.local" },
      { status: 500 }
    );
  }

  let body: {
    messages: { role: string; content: string }[];
    context: {
      shopOpen: boolean;
      hours: string;
      zone: string;
      deliveryMin: number;
      freeDelivery: number;
      products: { name: string; price: number; stock: number; cat: string }[];
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const { messages, context } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages requis" }, { status: 400 });
  }

  // Garder les 12 derniers messages pour éviter un contexte trop long
  const trimmedMessages = messages.slice(-12).map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.content).slice(0, 2000), // sécurité
  }));

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 512,
      stream:     true,
      system:     buildSystemPrompt(context),
      messages:   trimmedMessages,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error("[chat] Anthropic error:", errText);
    return NextResponse.json({ error: "Erreur API Claude" }, { status: 502 });
  }

  // On pipe le stream SSE directement au client
  return new Response(anthropicRes.body, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
