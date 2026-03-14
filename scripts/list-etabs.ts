import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const app = initializeApp({ apiKey:'AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI', authDomain:'yassala-shop.firebaseapp.com', projectId:'yassala-shop', storageBucket:'yassala-shop.firebasestorage.app', messagingSenderId:'871772438691', appId:'1:871772438691:web:403d6672c34e9529eaff16' });
const db = getFirestore(app);

async function main() {
  console.log('=== night_etablissements ===');
  const snap = await getDocs(collection(db, 'night_etablissements'));
  snap.docs.forEach(d => console.log(d.id, '|', d.data().name));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
