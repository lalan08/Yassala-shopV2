/**
 * Firebase Admin SDK — server-side only (API routes, never imported in client components).
 *
 * Setup in production (Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  →  paste the full content of your serviceAccountKey.json
 *
 * To generate the key:
 *   Firebase Console → Project Settings → Service accounts → Generate new private key
 */

import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let _app: App | null = null;
let _db: Firestore | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    _app = initializeApp({ credential: cert(serviceAccount) });
  } else {
    // Fallback: init with project ID only (works with Application Default Credentials)
    // In production always set FIREBASE_SERVICE_ACCOUNT_JSON
    _app = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'yassala-shop',
    });
  }

  return _app;
}

export function getAdminDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getAdminApp());
  return _db;
}
