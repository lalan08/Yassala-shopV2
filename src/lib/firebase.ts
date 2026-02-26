import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db  = getFirestore(app);
export const storage = getStorage(app);

// --- Shared types ---

export type Delivery = {
  id: string;
  driverId: string;
  orderId: string;
  createdAt: string;          // ISO string
  distanceKm?: number;
  isNight?: boolean;
  paymentType: "ONLINE" | "CASH";
  cashCollectedAmount: number;
  basePay: number;
  bonusPay: number;
  totalPay: number;
  status: "pending" | "validated" | "paid";
  cashStatus: "unsettled" | "settled";
  cashSettledAt?: string;
  cashSettledBy?: string;
  // ── bonus pluie ──────────────────────────────────────────────
  rainBonus?: number;                                       // 0 | 1.50 | 3.00 €
  weatherCondition?: "clear" | "rain" | "heavy_rain" | "unknown";
  precipitationLevel?: number;                             // mm
  // ── boost automatique ────────────────────────────────────────
  boostPay?: number;       // 0 | 1.50 | 3.00 | 5.00 €
  boostApplied?: boolean;
  boostAmount?: number;    // montant boost au moment de la validation
};

export type DriverProfile = {
  uid: string;
  name: string;
  phone: string;
  status?: string;
  iban?: string;
  paymentMethod?: "bank" | "cash" | "other";
  role?: "driver" | "admin";
  createdAt?: string;
  // ── bonus pluie & performance ─────────────────────────────────
  rainDeliveriesCount?: number;  // nb de livraisons avec bonus pluie
  performanceScore?: number;     // 0-100
};

export type Payout = {
  id: string;
  driverId: string;
  weekStart: string;
  weekEnd: string;
  deliveriesIds: string[];
  totalEarnings: number;
  cashToReturn: number;
  netPaid: number;
  status: "unpaid" | "paid";
  paidAt?: string;
  paidMethod?: "bank" | "cash" | "other";
  paidReference?: string;
  createdAt: string;
  createdBy: string;
};

// SHA-256 helper (same as admin page)
export async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export const ADMIN_PASS = "yassala2025";
export const ADMIN_STORAGE_KEY = "yassala_admin_auth";
export const DRIVER_STORAGE_KEY = "yassala_driver";

/** Returns the next Friday date formatted in French */
export function nextFridayLabel(): string {
  const d = new Date();
  const daysUntil = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntil);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
