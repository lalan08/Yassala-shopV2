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

// GET /api/relay/activity?relayId=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const relayId = searchParams.get("relayId");

    if (!relayId) {
      return NextResponse.json({ error: "relayId requis" }, { status: 400 });
    }

    initAdmin();
    const db = getFirestore();

    const logsSnap = await db
      .collection("relayLogs")
      .where("relayId", "==", relayId)
      .orderBy("timestamp", "desc")
      .limit(200)
      .get();

    const logs = logsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
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
