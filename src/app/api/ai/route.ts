import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    let prompt = "";
    let parseJson = false;

    if (action === "predict") {
      const { weekData } = body;
      prompt = `Tu es un analyste business pour YASSALA Night Shop, boutique de livraison nocturne en Guyane française. Données des 7 derniers jours (label=jour, count=nb commandes, ca=chiffre affaires€) : ${JSON.stringify(weekData)}. Analyse et réponds UNIQUEMENT avec ce JSON valide (sans markdown, sans commentaires) : {"peakHour":"heure de pointe probable ex: 23h","bestDay":"meilleur jour semaine","promoSuggestion":"suggestion promo courte en 1 phrase","openRecommendation":"conseil horaire ouverture en 1 phrase","insight":"1 insight business clé en 1 phrase"}`;
      parseJson = true;
    } else if (action === "route") {
      const { orders } = body;
      const list = orders
        .map((o: any, i: number) => `${i + 1}. ${o.name || o.phone} — ${o.address} (${o.total}€)`)
        .join("\n");
      prompt = `Tu optimises les routes de livraison nocturne à Cayenne, Guyane française. Commandes à livrer :\n${list}\nDépart : Shop Yassala, Cayenne centre. Propose l'ordre optimal pour minimiser la distance totale. Réponds UNIQUEMENT avec ce JSON valide (sans markdown) : {"order":[1,2,3,...],"tips":"conseil bref pour le livreur en 1 phrase"}`;
      parseJson = true;
    } else if (action === "summary") {
      const { count, total, topProducts, peakHour, rate, drivers } = body;
      prompt = `Tu es le manager de YASSALA Night Shop (livraison nocturne Guyane). Résumé du jour : ${count} commandes, ${total}€ de CA, taux livraison ${rate}%, pic activité à ${peakHour || "?"}h, top produits : ${topProducts}, ${drivers} livreur(s) actif(s). Rédige un résumé motivant de 3-4 phrases max en français, style direct et chaleureux. Commence par un emoji évaluation (🔥 excellent / ✅ bien / ⚠️ passable). Réponds UNIQUEMENT avec le texte du résumé.`;
    } else if (action === "anomaly") {
      const { orders } = body;
      prompt = `Tu détectes les fraudes pour YASSALA Night Shop (livraison nocturne, paiement cash ou online). Analyse ces commandes et identifie anomalies suspectes (même téléphone commandes multiples rapprochées, montants inhabituels, adresses identiques avec noms différents, patterns suspects) :\n${JSON.stringify(orders)}\nRéponds UNIQUEMENT avec ce JSON valide (sans markdown) : {"suspicious":[{"orderId":"id exact","reason":"raison courte","severity":"low|medium|high"}]}. Si rien de suspect : {"suspicious":[]}.`;
      parseJson = true;
    } else if (action === "stock_predict") {
      const { products } = body;
      prompt = `Tu analyses les stocks pour YASSALA Night Shop (livraison nocturne). Voici les produits avec leur stock actuel et leurs ventes de la semaine : ${JSON.stringify(products)}. Identifie les produits à risque de rupture prochaine. Réponds UNIQUEMENT avec ce JSON valide (sans markdown) : {"at_risk":[{"name":"nom produit","risk":"high|medium|low","estimatedDaysLeft":3,"action":"action recommandée courte"}]}. Ne liste que les produits avec risk high ou medium, max 6 produits. Si tout va bien : {"at_risk":[]}.`;
      parseJson = true;
    } else if (action === "coupon_suggest") {
      const { topProducts, totalOrders, avgBasket, period } = body;
      prompt = `Tu suggères des offres promotionnelles pour YASSALA Night Shop (livraison nocturne Guyane). Données de la période (${period || "7 derniers jours"}) : ${totalOrders} commandes, panier moyen ${avgBasket}€, produits populaires : ${topProducts}. Suggère 1 coupon promotionnel percutant et adapté à la situation actuelle. Réponds UNIQUEMENT avec ce JSON valide (sans markdown) : {"code":"CODE_SANS_ESPACES","type":"percent|fixed","value":10,"minOrder":20,"reason":"pourquoi cette offre est pertinente en 1 phrase"}`;
      parseJson = true;
    } else if (action === "recommend") {
      const { productName, productCat, allProducts } = body;
      const list = (allProducts as any[]).slice(0, 30).map((p: any) => p.name).join(", ");
      prompt = `Tu es conseiller pour YASSALA Night Shop (livraison nocturne festive Guyane). Un client regarde "${productName}" (catégorie: ${productCat}). Produits disponibles : ${list}. Recommande exactement 2 produits parmi cette liste qui se marient parfaitement avec "${productName}" pour une soirée festive. Utilise les noms exacts. Réponds UNIQUEMENT avec ce JSON valide (sans markdown) : {"recs":[{"name":"nom exact du produit de la liste","why":"raison courte festive max 8 mots"},{"name":"nom exact","why":"raison courte max 8 mots"}]}`;
      parseJson = true;
    } else {
      return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const text = ((message.content[0] as any).text ?? "").trim();

    if (parseJson) {
      try {
        const match = text.match(/\{[\s\S]*\}/);
        const result = JSON.parse(match ? match[0] : text);
        return NextResponse.json({ ok: true, result });
      } catch {
        return NextResponse.json({ ok: true, result: text });
      }
    }

    return NextResponse.json({ ok: true, result: text });
  } catch (err: any) {
    console.error("[AI route error]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
