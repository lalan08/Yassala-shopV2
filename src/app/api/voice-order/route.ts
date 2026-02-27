/**
 * POST /api/voice-order
 *
 * Analyse une transcription vocale + catalogue produits via Claude,
 * retourne la liste des produits à ajouter au panier.
 *
 * Body: {
 *   transcript: string          — phrase dictée par le client
 *   products: { id: string; name: string; price: number; stock: number }[]
 * }
 * Response: {
 *   items: { id: string; name: string; price: number; qty: number }[]
 *   message: string   — réponse conviviale à afficher
 * }
 */

import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_URL =
  (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com') + '/v1/messages';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 });
  }

  let body: {
    transcript: string;
    products: { id: string; name: string; price: number; stock: number }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const { transcript, products } = body;
  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'transcript vide' }, { status: 400 });
  }
  if (!products?.length) {
    return NextResponse.json({ error: 'catalogue vide' }, { status: 400 });
  }

  const catalogue = products
    .filter(p => p.stock > 0)
    .map(p => `${p.id}|${p.name}|${p.price.toFixed(2)}€`)
    .join('\n');

  const systemPrompt = `Tu es un assistant de commande vocale pour Yassala Night Shop.
Le client a dicté une commande. Identifie les produits demandés dans le catalogue et retourne un JSON strict.

CATALOGUE (format: id|nom|prix):
${catalogue}

RÈGLES:
- Retourne UNIQUEMENT un JSON valide, sans markdown, sans explication.
- Format exact: {"items":[{"id":"...","name":"...","price":0.00,"qty":1}],"message":"..."}
- "message": phrase courte et sympa confirmant ce que tu ajoutes (ex: "2 Coca et 1 chips ajoutés ! 🛒")
- Si aucun produit ne correspond: {"items":[],"message":"Je n'ai pas trouvé ces produits dans notre catalogue."}
- Quantité par défaut: 1. Si le client dit "2 coca", qty=2.
- Fais du matching approximatif (ex: "coca" → "Coca-Cola", "chips" → premier produit chips).
- Ne dépasse pas qty=10 par article.`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `Commande vocale: "${transcript.slice(0, 500)}"` }],
    }),
  });

  if (!res.ok) {
    console.error('[voice-order] Claude error:', await res.text());
    return NextResponse.json({ error: 'Erreur IA' }, { status: 502 });
  }

  const ai = await res.json();
  const raw = ai.content?.[0]?.text ?? '';

  try {
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch {
    console.error('[voice-order] JSON parse error:', raw);
    return NextResponse.json(
      { items: [], message: "Je n'ai pas réussi à analyser la commande, réessaie." },
      { status: 200 }
    );
  }
}
