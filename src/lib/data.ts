// YASSALA NIGHT - Boissons de nuit en Guyane

export interface Category {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  inStock: boolean;
  unit: string;
  volume?: string;
  isPromo?: boolean;
  oldPrice?: number;
  isNew?: boolean;
  isPopular?: boolean;
}

export const categories: Category[] = [
  { id: 'bieres', name: 'Bières', icon: '🍺', description: 'Bières locales et internationales' },
  { id: 'cocktails', name: 'Cocktails', icon: '🍹', description: 'Cocktails frais maison' },
  { id: 'spiritueux', name: 'Spiritueux', icon: '🥃', description: 'Rhum, whisky, vodka' },
  { id: 'soft', name: 'Soft', icon: '🥤', description: 'Sodas et jus' },
];

export const products: Product[] = [
  // BIÈRES
  { id: 'b1', name: 'Heineken', description: 'Bière premium', price: 3.00, image: '🍺', category: 'bieres', inStock: true, unit: 'bouteille', volume: '33cl', isPopular: true },
  { id: 'b2', name: 'Corona', description: 'Mexicaine rafraîchissante', price: 3.50, image: '🍺', category: 'bieres', inStock: true, unit: 'bouteille', volume: '33cl', isPopular: true },
  { id: 'b3', name: 'Desperados', description: 'À la tequila', price: 3.00, image: '🌵', category: 'bieres', inStock: true, unit: 'bouteille', volume: '33cl' },
  { id: 'b4', name: 'Prestige', description: 'Bière haïtienne', price: 3.00, image: '🍺', category: 'bieres', inStock: true, unit: 'bouteille', volume: '33cl' },
  { id: 'b5', name: 'Pack Heineken 6x', description: 'Pack entre amis', price: 15.00, image: '🍺', category: 'bieres', inStock: true, unit: 'pack', volume: '6x33cl', isPromo: true, oldPrice: 18.00 },

  // COCKTAILS
  { id: 'c1', name: 'Mojito', description: 'Rhum, menthe, citron', price: 6.00, image: '🍹', category: 'cocktails', inStock: true, unit: 'verre', volume: '40cl', isNew: true },
  { id: 'c2', name: 'Piña Colada', description: 'Rhum, coco, ananas', price: 7.00, image: '🍹', category: 'cocktails', inStock: true, unit: 'verre', volume: '40cl', isPopular: true },
  { id: 'c3', name: 'Sex on the Beach', description: 'Vodka, pêche, cranberry', price: 6.50, image: '🏖️', category: 'cocktails', inStock: true, unit: 'verre', volume: '40cl' },
  { id: 'c4', name: 'Margarita', description: 'Tequila, triple sec, citron', price: 6.50, image: '🍹', category: 'cocktails', inStock: true, unit: 'verre', volume: '35cl' },

  // SPIRITUEUX
  { id: 's1', name: 'Rhum Clément', description: 'Rhum agricole Martinique', price: 28.00, image: '🥃', category: 'spiritueux', inStock: true, unit: 'bouteille', volume: '70cl', isPopular: true },
  { id: 's2', name: 'Rhum Old Nick', description: 'Rhum de Guyane', price: 22.00, image: '🥃', category: 'spiritueux', inStock: true, unit: 'bouteille', volume: '70cl', isNew: true },
  { id: 's3', name: 'Jack Daniel\'s', description: 'Tennessee Whiskey', price: 32.00, image: '🥃', category: 'spiritueux', inStock: true, unit: 'bouteille', volume: '70cl' },
  { id: 's4', name: 'Vodka Smirnoff', description: 'Vodka classique', price: 22.00, image: '🍸', category: 'spiritueux', inStock: true, unit: 'bouteille', volume: '70cl' },
  { id: 's5', name: 'Malibu', description: 'Rhum coco', price: 20.00, image: '🌴', category: 'spiritueux', inStock: true, unit: 'bouteille', volume: '70cl' },

  // SOFT
  { id: 'd1', name: 'Coca-Cola', description: 'Le classique', price: 2.50, image: '🥤', category: 'soft', inStock: true, unit: 'canette', volume: '33cl', isPopular: true },
  { id: 'd2', name: 'Coca 1.5L', description: 'Format familial', price: 4.50, image: '🥤', category: 'soft', inStock: true, unit: 'bouteille', volume: '1.5L', isPromo: true, oldPrice: 5.00 },
  { id: 'd3', name: 'Red Bull', description: 'Donne des ailes', price: 3.50, image: '⚡', category: 'soft', inStock: true, unit: 'canette', volume: '25cl', isPopular: true },
  { id: 'd4', name: 'Jus de Maracudja', description: 'Fruit de la passion', price: 5.00, image: '🥭', category: 'soft', inStock: true, unit: 'verre', volume: '30cl' },
];

export const getProductsByCategory = (categoryId: string): Product[] => {
  return products.filter(p => p.category === categoryId);
};

export const getPopularProducts = (): Product[] => {
  return products.filter(p => p.isPopular);
};

export const getProductById = (id: string): Product | undefined => {
  return products.find(p => p.id === id);
};

export const popularProducts = products.filter(p => p.isPopular);

export const merchants = [
  {
    id: 'yassala-night',
    name: 'YASSALA Night Shop',
    description: 'Livraison nocturne de boissons et snacks à Cayenne',
    image: '🌙',
    coverImage: '',
    category: 'boissons',
    rating: 4.8,
    reviewCount: 124,
    address: 'Cayenne, Guyane',
    zone: 'cayenne',
    phone: '+594 XXX XXX',
    horaires: '22:00 - 06:00',
    deliveryTime: '15-30 min',
    minOrder: 15,
    deliveryFee: 3.00,
    products: [],
  },
];

export const deliverySlots = [
  { type: 'express', label: 'Express ⚡ (15-20 min)', estimatedMinutes: 15, price: 3.00 },
  { type: 'fast',    label: 'Rapide (25-30 min)',      estimatedMinutes: 25, price: 1.50 },
  { type: 'standard', label: 'Standard (35-45 min)',   estimatedMinutes: 40, price: 0.00 },
  { type: 'scheduled', label: 'Programmé',             estimatedMinutes: 0,  price: 0.00 },
];

export const deliveryZones = [
  { id: 'cayenne', name: 'Cayenne',         deliveryFee: 3.00, estimatedMinutes: 20 },
  { id: 'remire',  name: 'Remire-Montjoly', deliveryFee: 3.50, estimatedMinutes: 25 },
  { id: 'matoury', name: 'Matoury',         deliveryFee: 4.00, estimatedMinutes: 30 },
];

export const getMerchantById = (id: string) => merchants.find(m => m.id === id);
export const getMerchantsByCategory = (categoryId: string) => merchants.filter(m => m.category === categoryId);
