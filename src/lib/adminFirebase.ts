import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const storage = getStorage(app);

// ── TYPES ──

export type Mode = "day" | "night" | "both";

export type Establishment = {
  id?: string;
  name: string;
  address: string;
  phone?: string;
  cuisineType?: string;
  imageUrl?: string;
  openingHours?: string;
  deliveryZone?: string;
  prepTime?: number;      // minutes
  deliveryFee?: number;   // euros
  mode: Mode;
  visible: boolean;
  featured: boolean;
  isOpen?: boolean;
  lat?: number;
  lng?: number;
  // Ranking metrics
  orders_7d?: number;
  avg_prep_time?: number;
  cancel_rate?: number;
  ranking_score?: number;
  promo_active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Product = {
  id?: string;
  name: string;
  desc?: string;
  description?: string;
  price: number;
  image?: string;
  imageUrl?: string;
  cat?: string;
  categoryId?: string;
  badge?: string;
  stock?: number;
  available?: boolean;
  isActive?: boolean;
  commerceId?: string;
  vendorId?: string;
  mode: Mode;
  featured?: boolean;
  promotion_active?: boolean;
  orders_24h?: number;
  orders_7d?: number;
  last_order_at?: string;
  order?: number;
  createdAt?: string;
};

export type Category = {
  id?: string;
  key: string;
  label: string;
  emoji: string;
  order: number;
  mode?: Mode;
};

export type Pack = {
  id?: string;
  name: string;
  tag: string;
  emoji: string;
  items: string;
  price: number;
  real: number;
  star: boolean;
  mode?: Mode;
  active?: boolean;
};

export type Banner = {
  id?: string;
  title: string;
  subtitle: string;
  desc: string;
  cta: string;
  link: string;
  gradient: string;
  image: string;
  brightness: number;
  active: boolean;
  order: number;
  mode?: Mode;
};

export type Coupon = {
  id?: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  minOrder?: number;
  active: boolean;
  mode?: Mode;
};

export type HomeSection = {
  id?: string;
  title: string;
  subtitle?: string;
  type: "restaurants" | "products" | "categories" | "banners";
  source: "auto" | "manual";
  query_rule?: {
    filters?: string[];
    sort?: string;
    limit?: number;
    mode?: Mode;
  };
  limit: number;
  active: boolean;
  order: number;
  mode?: Mode;
};

export type OnlineDriver = {
  uid: string;
  name: string;
  phone?: string;
  status: "online" | "offline" | "busy" | "paused";
  isOnline: boolean;
  lastSeen?: any;
  lat?: number;
  lng?: number;
  updatedAt?: string;
  zone?: string;
  currentOrderId?: string;
  performanceScore?: number;
  acceptanceRate?: number;
  minutesAgo?: number;
};

export type Order = {
  id?: string;
  orderNumber?: number;
  name?: string;
  phone?: string;
  items: string;
  total: number;
  status: string;
  createdAt: string;
  address?: string;
  zone?: string;
  paidOnline?: boolean;
  fulfillmentType?: "delivery" | "pickup";
  assignedDriverId?: string;
  cashConfirmed?: boolean;
  isRush?: boolean;
  mode?: Mode;
  commerceId?: string;
};

// ── RANKING FORMULA ──
export function computeRankingScore(
  e: Partial<Establishment>,
  distanceKm = 0
): number {
  const isOpen     = e.isOpen       ?? false;
  const prepTime   = e.avg_prep_time ?? 30;
  const orders7d   = e.orders_7d    ?? 0;
  const promoActive = e.promo_active ?? false;
  const cancelRate = e.cancel_rate  ?? 0;

  return (
    (isOpen ? 50 : -100) +
    Math.max(0, 30 - prepTime) +
    orders7d * 1.5 +
    (promoActive ? 10 : 0) -
    cancelRate * 100 -
    distanceKm * 5
  );
}

// ── HAVERSINE DISTANCE ──
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
