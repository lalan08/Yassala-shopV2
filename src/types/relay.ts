// ── TYPES POINT RELAIS ──────────────────────────────────────────────────────

export type RelayStatus = "active" | "inactive";

export interface Relay {
  id: string;
  name: string;
  address: string;
  status: RelayStatus;
  pin: string; // SHA-256 hashed
  createdAt: string;
}

export interface RelayLogItem {
  productId: string;
  name: string;
  qty: number;
}

export interface RelayLog {
  id: string;
  relayId: string;
  orderId: string;
  items: RelayLogItem[];
  timestamp: string;
  collectedBy: "driver" | "customer";
}

export type RelayOrderStatus =
  | "PAID"
  | "READY_FOR_PICKUP"
  | "COLLECTED"
  | "CLOSED";

export type FulfillmentMode = "DELIVERY" | "PICKUP";

export interface RelayOrder {
  id: string;
  orderNumber?: number;
  name?: string;
  phone?: string;
  items: string; // JSON string of order items
  total: number;
  status: string;
  createdAt: string;
  address?: string;
  // ── Relay fields ──────────────────────────────────────────────
  fulfillmentMode?: FulfillmentMode;
  relayId?: string;
  relayName?: string;
  qrToken?: string;
  qrExpiresAt?: string;
  collectedAt?: string;
  paidOnline?: boolean;
}

// Stored in localStorage
export interface RelaySession {
  relayId: string;
  relayName: string;
  relayAddress: string;
}

export const RELAY_STORAGE_KEY = "yassala_relay";
