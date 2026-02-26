/**
 * getLastOrderStatus
 *
 * Requête Firestore côté client pour trouver la dernière commande d'un numéro
 * de téléphone et retourner son statut enrichi.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type OrderStatus = {
  orderId: string;
  status: string;
  statusLabel: string;
  statusIcon: string;
  statusColor: string;
  orderNumber?: number;
  createdAt: string;
  items: string;
  total: number;
};

export function parseOrderStatus(status: string): { label: string; icon: string; color: string } {
  switch (status) {
    case 'nouveau':
      return { label: 'Commande reçue', icon: '📥', color: '#00f5ff' };
    case 'en_cours':
      return { label: 'En route 🏍️', icon: '🏍️', color: '#b8ff00' };
    case 'livre':
    case 'delivered':
      return { label: 'Livrée ✅', icon: '✅', color: '#b8ff00' };
    case 'annule':
      return { label: 'Annulée', icon: '❌', color: '#ff2d78' };
    case 'assigned':
      return { label: 'Livreur assigné', icon: '🏍️', color: '#b8ff00' };
    case 'picked_up':
      return { label: 'En chemin vers vous', icon: '🏍️', color: '#b8ff00' };
    default:
      return { label: status, icon: '📦', color: '#5a5470' };
  }
}

export async function getLastOrderStatus(phone: string): Promise<OrderStatus | null> {
  try {
    const q = query(collection(db, 'orders'), where('phone', '==', phone));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    // Sort client-side by createdAt descending (avoid composite index)
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

    const order = docs[0];
    const parsed = parseOrderStatus(order.status);

    return {
      orderId: order.id,
      status:       order.status,
      statusLabel:  parsed.label,
      statusIcon:   parsed.icon,
      statusColor:  parsed.color,
      orderNumber:  order.orderNumber,
      createdAt:    order.createdAt,
      items:        order.items ?? '',
      total:        order.total ?? 0,
    };
  } catch {
    return null;
  }
}
