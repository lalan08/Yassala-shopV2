"use client";

import { useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const PINK = "#ff2d78";
const BG = "#08050f";
const CARD = "#0e0a1a";
const MONO = { fontFamily: "'Share Tech Mono',monospace" } as const;

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function EtablissementLoginPage() {
  const [slug, setSlug] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !code.trim()) {
      setError("Identifiant et code requis.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const hashed = await sha256(code.trim());
      const q = query(
        collection(db, "day_etablissements"),
        where("slug", "==", slug.trim().toLowerCase())
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError("Établissement introuvable. Vérifiez votre identifiant.");
        setLoading(false);
        return;
      }
      const etabDoc = snap.docs[0];
      const data = etabDoc.data();
      if (!data.accessCode) {
        setError("Aucun code d'accès configuré. Contactez l'administrateur.");
        setLoading(false);
        return;
      }
      if (data.accessCode !== hashed) {
        setError("Code incorrect. Réessayez.");
        setLoading(false);
        return;
      }
      // Auth success
      localStorage.setItem(
        "yassala_etab_auth",
        JSON.stringify({ id: etabDoc.id, name: data.name, slug: data.slug })
      );
      window.location.href = `/etablissement/${etabDoc.id}`;
    } catch {
      setError("Erreur de connexion. Réessayez.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: BG, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter',sans-serif", padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo / header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: "2.8rem", marginBottom: 10 }}>☀️</div>
          <div style={{ ...MONO, fontSize: "1rem", color: PINK, letterSpacing: ".15em", fontWeight: 700 }}>
            YASSALA DAY
          </div>
          <div style={{ ...MONO, fontSize: ".72rem", color: "#4a4060", marginTop: 6, letterSpacing: ".1em" }}>
            PORTAIL ÉTABLISSEMENT
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: CARD,
          border: `1px solid rgba(255,45,120,.2)`,
          borderRadius: 14, padding: "32px 28px",
        }}>
          <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 22 }}>
            // CONNEXION
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                IDENTIFIANT (SLUG)
              </label>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="ex: boulangerie-soleil"
                autoComplete="username"
                style={{
                  width: "100%", background: "#08050f",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 8, padding: "11px 14px",
                  color: "#f0eeff", fontSize: ".9rem",
                  fontFamily: "'Inter',sans-serif",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                CODE D'ACCÈS
              </label>
              <input
                type="password"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: "100%", background: "#08050f",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 8, padding: "11px 14px",
                  color: "#f0eeff", fontSize: ".9rem",
                  fontFamily: "'Inter',sans-serif",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {error && (
              <div style={{
                background: "rgba(255,45,120,.08)",
                border: "1px solid rgba(255,45,120,.25)",
                borderRadius: 8, padding: "10px 14px",
                ...MONO, fontSize: ".75rem", color: PINK,
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? "rgba(255,45,120,.4)" : PINK,
                color: "#fff", border: "none", borderRadius: 8,
                padding: "13px", ...MONO, fontSize: ".82rem",
                cursor: loading ? "default" : "pointer",
                fontWeight: 700, letterSpacing: ".08em",
                marginTop: 4, transition: "background .2s",
              }}
            >
              {loading ? "⏳ CONNEXION..." : "→ ACCÉDER À MON ESPACE"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ ...MONO, fontSize: ".65rem", color: "#3a2850" }}>
            Code oublié ? Contactez l'administrateur Yassala.
          </span>
        </div>
      </div>
    </div>
  );
}
