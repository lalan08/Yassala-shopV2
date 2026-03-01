import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

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

// GET /api/relay/activity?relayId=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const relayId = searchParams.get("relayId");

    if (!relayId) {
      return NextResponse.json({ error: "relayId requis" }, { status: 400 });
    }

    const db = getDb();

    const logsSnap = await getDocs(
      query(
        collection(db, "relayLogs"),
        where("relayId", "==", relayId),
        orderBy("timestamp", "desc"),
        limit(200)
      )
    );

    const logs = logsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // Aggregate counts
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    let todayCount = 0;
    let weekCount = 0;

    for (const log of logs as any[]) {
      const ts = new Date(log.timestamp);
      const itemTotal = (log.items || []).reduce(
        (sum: number, i: any) => sum + (i.qty || 1),
        0
      );
      if (ts >= todayStart) todayCount += itemTotal;
      if (ts >= weekStart) weekCount += itemTotal;
    }

    return NextResponse.json({ logs, todayCount, weekCount });
  } catch (err) {
    console.error("[relay/activity] error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
