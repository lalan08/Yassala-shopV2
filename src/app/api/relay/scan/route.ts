import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (svc) {
    return initializeApp({ credential: cert(JSON.parse(svc)) });
  }
  return initializeApp();
}

/**
 * POST /api/relay/scan
 *
 * Step 1 – validate QR (no confirm param or confirm=false):
 *   Body: { qrData: string; relayId: string }
 *   Returns order info for display.
 *
 * Step 2 – confirm pickup (confirm=true):
 *   Body: { orderId: string; qrToken: string; relayId: string; collectedBy: "driver" | "customer" }
 *   Marks order as COLLECTED, creates relayLog.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    initAdmin();
    const db = getFirestore();

    // ── STEP 2: Confirm pickup ─────────────────────────────────────────────
    if (body.confirm === true) {
      const { orderId, qrToken, relayId, collectedBy } = body;

      if (!orderId || !qrToken || !relayId) {
        return NextResponse.json(
          { error: "Données manquantes pour la confirmation" },
          { status: 400 }
        );
      }

      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return NextResponse.json(
          { error: "Commande introuvable" },
          { status: 404 }
        );
      }

      const order = orderSnap.data()!;

      // Security checks
      if (order.qrToken !== qrToken) {
        return NextResponse.json({ error: "Token QR invalide" }, { status: 403 });
      }

      if (order.status === "COLLECTED" || order.status === "CLOSED") {
        return NextResponse.json(
          { error: "Cette commande a déjà été récupérée" },
          { status: 409 }
        );
      }

      if (order.relayId && order.relayId !== relayId) {
        return NextResponse.json(
          { error: "Cette commande n'appartient pas à votre relais" },
          { status: 403 }
        );
      }

      const now = new Date();
      if (order.qrExpiresAt) {
        const expiresAt = new Date(order.qrExpiresAt);
        if (now > expiresAt) {
          return NextResponse.json(
            { error: "QR code expiré. Contactez le support." },
            { status: 410 }
          );
        }
      }

      // Parse items
      let items: { productId: string; name: string; qty: number }[] = [];
      try {
        const parsed =
          typeof order.items === "string" ? JSON.parse(order.items) : order.items;
        if (Array.isArray(parsed)) {
          items = parsed.map((item: any) => ({
            productId: item.productId || item.id || "",
            name: item.name || item.productName || "Produit",
            qty: item.quantity || item.qty || 1,
          }));
        }
      } catch {}

      // Update order status
      await orderRef.update({
        status: "COLLECTED",
        collectedAt: now.toISOString(),
        collectedBy: collectedBy || "customer",
        updatedAt: now.toISOString(),
      });

      // Create relay log
      await db.collection("relayLogs").add({
        relayId,
        orderId,
        items,
        timestamp: now.toISOString(),
        collectedBy: collectedBy || "customer",
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, message: "Commande validée avec succès" });
    }

    // ── STEP 1: Validate QR ────────────────────────────────────────────────
    const { qrData, relayId } = body;

    if (!qrData || !relayId) {
      return NextResponse.json(
        { error: "Données QR et relayId requis" },
        { status: 400 }
      );
    }

    let parsed: { orderId: string; qrToken: string };
    try {
      parsed = JSON.parse(qrData);
    } catch {
      return NextResponse.json({ error: "QR code invalide" }, { status: 400 });
    }

    const { orderId, qrToken } = parsed;
    if (!orderId || !qrToken) {
      return NextResponse.json({ error: "QR code malformé" }, { status: 400 });
    }

    const orderSnap = await db.collection("orders").doc(orderId).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }

    const order = orderSnap.data()!;

    // Validate token
    if (order.qrToken !== qrToken) {
      return NextResponse.json({ error: "Token QR invalide" }, { status: 403 });
    }

    // Check already collected
    if (order.status === "COLLECTED" || order.status === "CLOSED") {
      return NextResponse.json(
        { error: "Cette commande a déjà été récupérée", alreadyCollected: true },
        { status: 409 }
      );
    }

    // Check expiry
    const now = new Date();
    if (order.qrExpiresAt) {
      const expiresAt = new Date(order.qrExpiresAt);
      if (now > expiresAt) {
        return NextResponse.json(
          { error: "QR code expiré. Contactez le support.", expired: true },
          { status: 410 }
        );
      }
    }

    // Check relay ownership
    if (order.relayId && order.relayId !== relayId) {
      return NextResponse.json(
        { error: "Cette commande n'appartient pas à votre relais", wrongRelay: true },
        { status: 403 }
      );
    }

    // Parse items for display
    let items: { productId: string; name: string; qty: number }[] = [];
    try {
      const raw =
        typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      if (Array.isArray(raw)) {
        items = raw.map((item: any) => ({
          productId: item.productId || item.id || "",
          name: item.name || item.productName || "Produit",
          qty: item.quantity || item.qty || 1,
        }));
      }
    } catch {}

    return NextResponse.json({
      valid: true,
      order: {
        id: orderId,
        qrToken,
        orderNumber: order.orderNumber,
        name: order.name || order.customerName,
        phone: order.phone || order.customerPhone,
        total: order.total,
        status: order.status,
        fulfillmentMode: order.fulfillmentMode,
        createdAt: order.createdAt,
        items,
      },
    });
  } catch (err) {
    console.error("[relay/scan] error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
