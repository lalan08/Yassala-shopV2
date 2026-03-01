import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (svc) {
    return initializeApp({ credential: cert(JSON.parse(svc)) });
  }
  return initializeApp();
}

async function sha256(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// POST /api/relay/auth
// Body: { relayId: string; pin: string }
export async function POST(req: NextRequest) {
  try {
    const { relayId, pin } = await req.json();

    if (!relayId || !pin) {
      return NextResponse.json(
        { error: "relayId et PIN requis" },
        { status: 400 }
      );
    }

    initAdmin();
    const db = getFirestore();

    const relayDoc = await db.collection("relays").doc(relayId).get();

    if (!relayDoc.exists) {
      return NextResponse.json(
        { error: "Relais introuvable" },
        { status: 404 }
      );
    }

    const relay = relayDoc.data()!;

    if (relay.status === "inactive") {
      return NextResponse.json(
        { error: "Ce relais est désactivé" },
        { status: 403 }
      );
    }

    const hashedPin = await sha256(pin);

    if (hashedPin !== relay.pin) {
      return NextResponse.json({ error: "PIN incorrect" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      relay: {
        id: relayDoc.id,
        name: relay.name,
        address: relay.address,
        status: relay.status,
      },
    });
  } catch (err) {
    console.error("[relay/auth] error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
