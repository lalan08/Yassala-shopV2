import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};

function getDb() {
  const apps = getApps();
  const app = apps.length > 0 ? apps[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
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

    const db = getDb();
    const relaySnap = await getDoc(doc(db, "relays", relayId));

    if (!relaySnap.exists()) {
      return NextResponse.json(
        { error: "Relais introuvable" },
        { status: 404 }
      );
    }

    const relay = relaySnap.data()!;

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
        id: relaySnap.id,
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
