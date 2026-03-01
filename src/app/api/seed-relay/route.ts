import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";

function initAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (svc) {
    return initializeApp({ credential: cert(JSON.parse(svc)) });
  }
  return initializeApp();
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// POST /api/seed-relay (admin only)
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== process.env.ADMIN_SECRET && secret !== "yassala2025") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  initAdmin();
  const db = getFirestore();

  // ── 1. Create relay ────────────────────────────────────────────────────────
  const relayId = "relay-cayenne-01";
  const hashedPin = await sha256("1234");

  await db.collection("relays").doc(relayId).set({
    name: "Relais Cayenne Centre",
    address: "12 rue du Commerce, Cayenne, Guyane",
    status: "active",
    pin: hashedPin,
    createdAt: new Date().toISOString(),
  });

  // ── 2. Sample products ────────────────────────────────────────────────────
  const sampleProducts = [
    { id: "prod-001", name: "Poulet rôti 1kg", price: 12.5 },
    { id: "prod-002", name: "Riz créole 500g", price: 3.2 },
    { id: "prod-003", name: "Jus de fruit tropical 1L", price: 4.5 },
    { id: "prod-004", name: "Pain doux antillais", price: 2.8 },
    { id: "prod-005", name: "Salade de fruits frais", price: 5.0 },
  ];

  // ── 3. Create 5 test orders ───────────────────────────────────────────────
  const orderIds: string[] = [];
  const baseTime = new Date();

  const orders = [
    {
      name: "Marie Dupont",
      phone: "0694112233",
      status: "READY_FOR_PICKUP",
      fulfillmentMode: "PICKUP",
      items: [
        { ...sampleProducts[0], quantity: 1 },
        { ...sampleProducts[1], quantity: 2 },
      ],
      total: 18.9,
    },
    {
      name: "Jean-Pierre Martin",
      phone: "0694445566",
      status: "READY_FOR_PICKUP",
      fulfillmentMode: "DELIVERY",
      items: [
        { ...sampleProducts[2], quantity: 2 },
        { ...sampleProducts[3], quantity: 1 },
      ],
      total: 11.7,
    },
    {
      name: "Sophie Leblanc",
      phone: "0694778899",
      status: "COLLECTED",
      fulfillmentMode: "PICKUP",
      items: [{ ...sampleProducts[4], quantity: 3 }],
      total: 15.0,
      collectedAt: new Date(baseTime.getTime() - 3600000).toISOString(),
    },
    {
      name: "Thomas Durand",
      phone: "0694001122",
      status: "READY_FOR_PICKUP",
      fulfillmentMode: "PICKUP",
      items: [
        { ...sampleProducts[0], quantity: 2 },
        { ...sampleProducts[2], quantity: 1 },
      ],
      total: 29.5,
    },
    {
      name: "Emma Fontaine",
      phone: "phone: 0694334455",
      status: "CLOSED",
      fulfillmentMode: "DELIVERY",
      items: [{ ...sampleProducts[1], quantity: 4 }],
      total: 12.8,
      collectedAt: new Date(baseTime.getTime() - 86400000).toISOString(),
    },
  ];

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const qrToken = uuidv4();
    const qrExpiresAt = new Date(baseTime.getTime() + 7200000).toISOString(); // +2h

    const createdAt = new Date(
      baseTime.getTime() - i * 3600000 * 2
    ).toISOString();

    const orderRef = await db.collection("orders").add({
      name: order.name,
      phone: order.phone,
      items: JSON.stringify(order.items),
      total: order.total,
      status: order.status,
      fulfillmentMode: order.fulfillmentMode,
      relayId,
      qrToken,
      qrExpiresAt,
      paidOnline: true,
      createdAt,
      updatedAt: createdAt,
      orderNumber: 1000 + i,
      ...(order.collectedAt ? { collectedAt: order.collectedAt } : {}),
    });

    orderIds.push(orderRef.id);
  }

  // ── 4. Create relay logs for collected orders ─────────────────────────────
  const collectedOrders = [
    { idx: 2, collectedBy: "customer" as const },
    { idx: 4, collectedBy: "driver" as const },
  ];

  for (const { idx, collectedBy } of collectedOrders) {
    const orderData = orders[idx];
    const items = orderData.items.map((item: any) => ({
      productId: item.id,
      name: item.name,
      qty: item.quantity,
    }));

    const logTime = new Date(
      baseTime.getTime() - (idx === 4 ? 86400000 : 3600000)
    ).toISOString();

    await db.collection("relayLogs").add({
      relayId,
      orderId: orderIds[idx],
      items,
      timestamp: logTime,
      collectedBy,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({
    success: true,
    message: "Seed terminé",
    relayId,
    relayPin: "1234",
    orderIds,
    instructions: `Connectez-vous sur /relais avec ID: ${relayId} et PIN: 1234`,
  });
}
