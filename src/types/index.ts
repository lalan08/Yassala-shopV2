// Types pour YASSALA SHOP - Marketplace Guyane

export interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  merchantId: string;
  inStock: boolean;
  unit: string;
}

export interface Merchant {
  id: string;
  name: string;
  description: string;
  image: string;
  coverImage: string;
  category: string;
  rating: number;
  reviewCount: number;
  address: string;
  zone: string;
  phone: string;
  horaires: string;
  deliveryTime: string;
  minOrder: number;
  deliveryFee: number;
  products: Product[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  merchantId: string;
  merchantName: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryZone: string;
  deliverySlot: DeliverySlot;
  instructions: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  createdAt: Date;
  estimatedDelivery: Date;
}

export type OrderStatus = 
  | 'confirmed' 
  | 'preparing' 
  | 'pickup' 
  | 'on_the_way' 
  | 'arriving' 
  | 'delivered';

export interface DeliverySlot {
  type: 'express' | 'fast' | 'standard' | 'scheduled';
  label: string;
  estimatedMinutes: number;
  price: number;
  scheduledDate?: Date;
}

export interface DeliveryZone {
  id: string;
  name: string;
  deliveryFee: number;
  estimatedMinutes: number;
}
