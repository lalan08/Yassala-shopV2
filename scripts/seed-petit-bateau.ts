/**
 * Seed script — Pizzerias Au Petit Bateau
 * Ajoute l'établissement + catégories + produits dans night_etablissements
 * Usage : npx tsx scripts/seed-petit-bateau.ts
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI',
  authDomain: 'yassala-shop.firebaseapp.com',
  projectId: 'yassala-shop',
  storageBucket: 'yassala-shop.firebasestorage.app',
  messagingSenderId: '871772438691',
  appId: '1:871772438691:web:403d6672c34e9529eaff16',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

async function seed() {
  console.log('🍕 Création de Pizzerias Au Petit Bateau...');

  // ── 1. Établissement ──────────────────────────────────────────────
  const etabRef = await addDoc(collection(db, 'night_etablissements'), {
    name: 'Pizzerias Au Petit Bateau',
    category: 'Pizzeria',
    emoji: '🍕',
    description: 'Pizzeria ouverte 7j/7. Toutes nos pizzas contiennent également de l\'emmental, de la crème fraîche et de l\'origan.',
    address: 'Cayenne, Guyane (plusieurs adresses)',
    phone: '05 94 30 17 38',
    openHours: '7/7',
    isActive: true,
    isOpen: true,
    deliveryMin: 25,
    deliveryMax: 45,
    deliveryFee: 0,
    rating: 4.5,
    reviewCount: 0,
    bgColor: '#1a0a2e',
    createdAt: new Date().toISOString(),
  });

  const etabId = etabRef.id;
  console.log(`✅ Établissement créé : ${etabId}`);

  // ── 2. Catégories ─────────────────────────────────────────────────
  const cats = [
    { key: 'traditionnelles', label: 'Les traditionnelles', emoji: '🍕', order: 1 },
    { key: 'peyi',            label: 'Les pizzas Péyi',      emoji: '🌴', order: 2 },
    { key: 'creme',           label: 'Base crème fraîche',   emoji: '🥛', order: 3 },
    { key: 'sucrees',         label: 'Les sucrées-salées',   emoji: '🍍', order: 4 },
    { key: 'mer',             label: 'Les pizzas de la mer', emoji: '🐟', order: 5 },
    { key: 'family',          label: 'Family Plaza exclusif',emoji: '⭐', order: 6 },
    { key: 'boissons',        label: 'Les boissons',         emoji: '🥤', order: 7 },
  ];

  const catIds: Record<string, string> = {};
  for (const cat of cats) {
    const ref = await addDoc(collection(db, 'night_categories'), {
      ...cat,
      etablissementId: etabId,
    });
    catIds[cat.key] = ref.id;
    console.log(`  📂 Catégorie "${cat.label}" : ${ref.id}`);
  }

  // ── 3. Produits ───────────────────────────────────────────────────
  // Prix = taille Grande (prix intermédiaire), description avec les 3 tailles
  type Product = {
    name: string;
    desc: string;
    price: number; // Grande
    cat: string;
    badge?: string;
    stock: number;
    isActive: boolean;
    etablissementId: string;
    sizes?: string;
  };

  const products: Product[] = [
    // ── Les traditionnelles ──────────────────────────────────────────
    { name: 'Margarita',    desc: 'Tomate, Mozzarella, olives',                                          price: 12, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 9€ · Grande 12€ · Familiale 17€' },
    { name: 'Caprice',      desc: 'Tomate, Mozzarella, jambon blanc, olives',                            price: 14, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 11€ · Grande 14€ · Familiale 20€' },
    { name: 'Régina',       desc: 'Tomate, Mozzarella, jambon blanc, champignons',                       price: 15, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 21€' },
    { name: 'Angela',       desc: 'Tomate, Mozzarella, jambon blanc, œuf',                               price: 15, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 21€' },
    { name: 'Roma',         desc: 'Tomate, Mozzarella, jambon blanc, champignons, œuf',                  price: 16, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Marco Polo',   desc: 'Tomate, Mozzarella, chorizo, poivrons',                               price: 15, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 21€' },
    { name: 'Bolognaise',   desc: 'Tomate, Mozzarella, viande hachée, champignons, poivrons',            price: 15, cat: catIds['traditionnelles'], badge: 'BEST', stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 21€' },
    { name: 'Marocaine',    desc: 'Tomate, Mozzarella, viande hachée, merguez',                          price: 16, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 23€' },
    { name: 'Orientale',    desc: 'Tomate, Mozzarella, merguez, oignons, poivrons, olives',              price: 16, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 23€' },
    { name: 'Végétarienne', desc: 'Tomate, Mozzarella, poêlée de légumes',                               price: 15, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 21€' },
    { name: 'Fromagère',    desc: 'Tomate, Mozzarella, emmental, chèvre, roquefort',                     price: 16, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Campagnarde',  desc: 'Tomate, Mozzarella, saucisses fumées, oignons, champignons',          price: 16, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Paysanne',     desc: 'Tomate, Mozzarella, lardons, champignons, oignons',                   price: 15, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 21€' },
    { name: 'Montagnarde',  desc: 'Tomate, Mozzarella, lardons, pommes de terre, oignons',               price: 16, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Macapa',       desc: 'Tomate, Mozzarella, viande, merguez, saucisses, chorizo',             price: 18, cat: catIds['traditionnelles'], badge: 'HOT', stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 15€ · Grande 18€ · Familiale 24€' },
    { name: 'Mixte',        desc: '2 moitiés de pizzas au choix sur toute la carte',                     price: 18, cat: catIds['traditionnelles'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 15€ · Grande 18€ · Familiale 24€' },

    // ── Les pizzas Péyi ──────────────────────────────────────────────
    { name: 'Créole',       desc: 'Tomate, Mozzarella, poulet fumé, oignons',                            price: 16, cat: catIds['peyi'], badge: 'HOT', stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Guyanaise',    desc: 'Tomate, Mozzarella, crevettes 40/60, poivrons, olives',               price: 16, cat: catIds['peyi'], badge: 'BEST', stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Acoupa',       desc: 'Tomate, Mozzarella, filets d\'acoupa, oignons rouges',                price: 15, cat: catIds['peyi'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 20€' },

    // ── Base crème fraîche ───────────────────────────────────────────
    { name: 'Landaise',     desc: 'Crème fraîche, Mozzarella, lardons, jambon blanc, oignons',           price: 15, cat: catIds['creme'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 12€ · Grande 15€ · Familiale 21€' },
    { name: 'Vénézia',      desc: 'Crème fraîche, Mozzarella, viande hachée, chèvre',                    price: 16, cat: catIds['creme'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Kebab',        desc: 'Crème fraîche, Mozzarella, Kebab de poulet, oignons rouges, sauce blanche', price: 17, cat: catIds['creme'], badge: 'HOT', stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 14€ · Grande 17€ · Familiale 23€' },

    // ── Sucrées-salées ───────────────────────────────────────────────
    { name: 'Hawaïenne',    desc: 'Tomate, Mozzarella, lardons, ananas, oignons',                        price: 16, cat: catIds['sucrees'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Stella',       desc: 'Tomate, Mozzarella, chèvre, miel',                                    price: 16, cat: catIds['sucrees'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },

    // ── Pizzas de la mer ─────────────────────────────────────────────
    { name: 'Napolitaine',  desc: 'Tomate, Mozzarella, anchois, oignons, câpres, olives',                price: 13, cat: catIds['mer'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 10€ · Grande 13€ · Familiale 18€' },
    { name: 'Santana',      desc: 'Tomate, Mozzarella, thon, câpres',                                    price: 14, cat: catIds['mer'], stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 11€ · Grande 14€ · Familiale 19€' },
    { name: 'Titanic',      desc: 'Tomate, Mozzarella, saumon fumé, oignons, olives',                    price: 16, cat: catIds['mer'], badge: 'BEST', stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 13€ · Grande 16€ · Familiale 22€' },
    { name: 'Kaline',       desc: 'Tomate, Mozzarella, saumon fumé, crevettes 40/60, olives',            price: 18, cat: catIds['mer'], badge: 'HOT', stock: 99, isActive: true, etablissementId: etabId, sizes: 'Petite 15€ · Grande 18€ · Familiale 24€' },

    // ── Family Plaza exclusif ────────────────────────────────────────
    { name: 'La Part de pizza',         desc: '1/6ème d\'une Familiale (saveurs du jour)',                price: 4,  cat: catIds['family'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Jus de fruit local 33cl',  desc: 'Jus de fruit local frais',                                price: 3,  cat: catIds['family'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Portion de Pâtes (Carbonara / Bolognaise)', desc: 'Poids moyen 480g',                       price: 10, cat: catIds['family'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Portion de Pâtes (Saumon mariné / Poulet boucané)', desc: 'Poids moyen 480g',              price: 12, cat: catIds['family'], badge: 'BEST', stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Dessert',                  desc: 'Dessert du jour',                                          price: 4,  cat: catIds['family'], stock: 99, isActive: true, etablissementId: etabId },

    // ── Boissons ─────────────────────────────────────────────────────
    { name: 'Soda 33cl',                desc: 'Canette de soda',                                          price: 2,    cat: catIds['boissons'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Guinness / Despérados',    desc: 'Bière 33cl',                                               price: 3,    cat: catIds['boissons'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Coca / Fanta',             desc: 'Bouteille',                                                price: 6,    cat: catIds['boissons'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Bouteille d\'eau 1,5 L',   desc: 'Eau plate',                                                price: 2,    cat: catIds['boissons'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Heineken',                 desc: 'Bière 33cl',                                               price: 2.50, cat: catIds['boissons'], stock: 99, isActive: true, etablissementId: etabId },
    { name: 'Piment / Miel',            desc: 'Supplément sauce',                                         price: 0.50, cat: catIds['boissons'], stock: 99, isActive: true, etablissementId: etabId },
  ];

  // Ajouter sizes dans la description si disponible
  const prodsColl = collection(db, 'night_products');
  for (let i = 0; i < products.length; i++) {
    const { sizes, ...rest } = products[i];
    const finalDesc = sizes ? `${rest.desc} • ${sizes}` : rest.desc;
    await addDoc(prodsColl, { ...rest, desc: finalDesc, order: i, image: '' });
    process.stdout.write(`\r  🍕 Produits ajoutés : ${i + 1}/${products.length}`);
  }

  console.log(`\n\n✅ DONE — Établissement ID : ${etabId}`);
  console.log(`   ${cats.length} catégories | ${products.length} produits`);
  process.exit(0);
}

seed().catch(err => { console.error('❌ Erreur :', err); process.exit(1); });
