/**
 * 1. Supprime le doublon Y1uk3t8lBD3UUfZIpGVM (+ ses cats/prods)
 * 2. Réassigne les catégories et produits vers DcnUhEOzjuXcOx3ukJiG
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';

const cfg = { apiKey:'AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI', authDomain:'yassala-shop.firebaseapp.com', projectId:'yassala-shop', storageBucket:'yassala-shop.firebasestorage.app', messagingSenderId:'871772438691', appId:'1:871772438691:web:403d6672c34e9529eaff16' };
const app = initializeApp(cfg);
const db  = getFirestore(app);

const DUPLICATE_ID = 'Y1uk3t8lBD3UUfZIpGVM';
const ORIGINAL_ID  = 'DcnUhEOzjuXcOx3ukJiG';

async function main() {
  // ── Étape 1 : récupérer les cats du doublon ───────────────────────
  console.log('📂 Récupération des catégories du doublon...');
  const catsSnap = await getDocs(query(collection(db, 'night_categories'), where('etablissementId', '==', DUPLICATE_ID)));
  const catIdMap: Record<string, string> = {}; // ancienId -> nouvelId

  for (const catDoc of catsSnap.docs) {
    const data = { ...catDoc.data(), etablissementId: ORIGINAL_ID };
    const newRef = await addDoc(collection(db, 'night_categories'), data);
    catIdMap[catDoc.id] = newRef.id;
    console.log(`  ✅ Cat "${catDoc.data().label}" → ${newRef.id}`);
  }

  // ── Étape 2 : récupérer les produits du doublon ───────────────────
  console.log('🍕 Récupération des produits du doublon...');
  const prodsSnap = await getDocs(query(collection(db, 'night_products'), where('etablissementId', '==', DUPLICATE_ID)));

  let count = 0;
  for (const prodDoc of prodsSnap.docs) {
    const d = prodDoc.data();
    // Remapper la catégorie vers le nouvel ID
    const newCatId = catIdMap[d.cat] ?? d.cat;
    await addDoc(collection(db, 'night_products'), {
      ...d,
      cat: newCatId,
      etablissementId: ORIGINAL_ID,
    });
    count++;
    process.stdout.write(`\r  ✅ Produits migrés : ${count}/${prodsSnap.size}`);
  }
  console.log('');

  // ── Étape 3 : supprimer les produits du doublon ───────────────────
  console.log('🗑  Suppression des produits du doublon...');
  for (const prodDoc of prodsSnap.docs) {
    await deleteDoc(doc(db, 'night_products', prodDoc.id));
  }

  // ── Étape 4 : supprimer les catégories du doublon ─────────────────
  console.log('🗑  Suppression des catégories du doublon...');
  for (const catDoc of catsSnap.docs) {
    await deleteDoc(doc(db, 'night_categories', catDoc.id));
  }

  // ── Étape 5 : supprimer l'établissement doublon ───────────────────
  await deleteDoc(doc(db, 'night_etablissements', DUPLICATE_ID));
  console.log('🗑  Établissement doublon supprimé.');

  console.log(`\n✅ DONE — ${count} produits + ${catsSnap.size} catégories migrés vers ${ORIGINAL_ID}`);
  process.exit(0);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
