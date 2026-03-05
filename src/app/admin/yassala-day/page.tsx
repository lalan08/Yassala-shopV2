"use client";

import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc } from "firebase/firestore";
import Link from "next/link";

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

type Etablissement = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  isActive: boolean;
  createdAt?: string;
};

type DayProduct = { id?: string; name: string; price: number; isActive?: boolean; etablissementId?: string; };
type DayOrder = { id?: string; total: number; status: string; createdAt?: string; mode?: string; etablissementId?: string; };

const S = {
  page: { minHeight: "100vh", background: "#080514", color: "#f0eeff", fontFamily: "'Inter', sans-serif" },
  topbar: { background: "rgba(12,9,24,.95)", borderBottom: "1px solid rgba(251,191,36,.12)", padding: "0 28px", height: 56, display: "flex" as const, alignItems: "center" as const, gap: 16, position: "sticky" as const, top: 0, zIndex: 40 },
  content: { maxWidth: 1100, margin: "0 auto", padding: "32px 24px" },
  statCard: { background: "#0c0918", border: "1px solid rgba(251,191,36,.15)", borderRadius: 10, padding: "20px 24px" },
  sectionTitle: { fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470", letterSpacing: ".15em", textTransform: "uppercase" as const, marginBottom: 16 },
  badge: (active: boolean) => ({ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4, fontSize: ".72rem", fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".08em", background: active ? "rgba(184,255,0,.12)" : "rgba(255,255,255,.06)", color: active ? "#b8ff00" : "#5a5470" }),
};

export default function YassalaDayDashboard() {
  const [auth, setAuth] = useState(false);
  const [etablissements, setEtablissements] = useState<Etablissement[]>([]);
  const [products, setProducts] = useState<DayProduct[]>([]);
  const [orders, setOrders] = useState<DayOrder[]>([]);
  const [dayActive, setDayActive] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAuth(!!localStorage.getItem("yassala_admin_auth"));
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubEtab = onSnapshot(collection(db, "day_etablissements"), snap => {
      setEtablissements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Etablissement))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    });
    const unsubProds = onSnapshot(collection(db, "day_products"), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as DayProduct)));
    });
    const unsubOrders = onSnapshot(collection(db, "orders"), snap => {
      setOrders(snap.docs
        .map(d => ({ id: d.id, ...d.data() } as DayOrder))
        .filter(o => o.mode === "day" || o.etablissementId));
    });
    const unsubConfig = onSnapshot(doc(db, "yassala_day", "config"), snap => {
      if (snap.exists()) setDayActive(snap.data().active === true);
    });
    return () => { unsubEtab(); unsubProds(); unsubOrders(); unsubConfig(); };
  }, [auth]);

  if (!auth) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>☀️</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", color: "#5a5470", fontSize: ".85rem" }}>
            Accès non autorisé. <a href="/admin" style={{ color: "#fbbf24" }}>→ Admin</a>
          </div>
        </div>
      </div>
    );
  }

  const activeEtab = etablissements.filter(e => e.isActive).length;
  const totalProds = products.length;
  const activeProds = products.filter(p => p.isActive !== false).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter(o => (o.createdAt || "").startsWith(todayStr));
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div style={S.page}>
      {/* Topbar */}
      <div style={S.topbar}>
        <a href="/admin" style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#5a5470", textDecoration: "none", letterSpacing: ".08em" }}>
          ← ADMIN
        </a>
        <span style={{ color: "#3a3450" }}>|</span>
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem", color: "#fbbf24", letterSpacing: ".1em", fontWeight: 700 }}>
          ☀️ YASSALA DAY
        </span>
        <span style={{ marginLeft: "auto", ...S.badge(dayActive) }}>
          {dayActive ? "MODE JOUR ACTIF" : "MODE JOUR INACTIF"}
        </span>
      </div>

      <div style={S.content}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: "1.8rem", letterSpacing: ".02em", margin: 0, marginBottom: 6 }}>
            ☀️ <span style={{ color: "#fbbf24" }}>DASHBOARD YASSALA DAY</span>
          </h1>
          <p style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", margin: 0 }}>
            Vue globale de tous les établissements du mode journée
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 36 }}>
          {[
            { label: "ÉTABLISSEMENTS", value: etablissements.length, sub: `${activeEtab} actifs`, icon: "🏪", color: "#fbbf24" },
            { label: "PRODUITS JOUR", value: totalProds, sub: `${activeProds} actifs`, icon: "🛍️", color: "#b8ff00" },
            { label: "COMMANDES AUJOURD'HUI", value: todayOrders.length, sub: "mode jour", icon: "📦", color: "#ff6b35" },
            { label: "CA AUJOURD'HUI", value: `${todayRevenue.toFixed(2)} €`, sub: "toutes commandes jour", icon: "💰", color: "#a78bfa" },
          ].map(card => (
            <div key={card.label} style={S.statCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem", color: "#5a5470", letterSpacing: ".1em" }}>
                  {card.label}
                </div>
                <span style={{ fontSize: "1.3rem" }}>{card.icon}</span>
              </div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: "1.8rem", color: card.color, lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem", color: "#5a5470", marginTop: 6 }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation rapide */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 36 }}>
          {[
            { href: "/admin/yassala-day/etablissements", icon: "🏪", label: "GÉRER LES ÉTABLISSEMENTS", desc: `${etablissements.length} établissements enregistrés` },
            { href: "/admin?tab=yassala_day_config", icon: "☀️", label: "CONFIG MODE JOUR", desc: "Horaires, message d'accueil, téléphone" },
            { href: "/admin?tab=yassala_day_offres", icon: "🎁", label: "OFFRES GLOBALES", desc: "Offres transversales à tous les établissements" },
          ].map(nav => (
            <a key={nav.href} href={nav.href}
              style={{ background: "rgba(251,191,36,.04)", border: "1px solid rgba(251,191,36,.15)", borderRadius: 10, padding: "18px 20px", textDecoration: "none", display: "block", transition: "border-color .2s" }}>
              <div style={{ fontSize: "1.6rem", marginBottom: 8 }}>{nav.icon}</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".82rem", color: "#fbbf24", letterSpacing: ".1em", fontWeight: 700, marginBottom: 4 }}>
                {nav.label}
              </div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".8rem", color: "#5a5470" }}>{nav.desc}</div>
            </a>
          ))}
        </div>

        {/* Liste rapide des établissements */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={S.sectionTitle}>// ÉTABLISSEMENTS ({etablissements.length})</div>
            <a href="/admin/yassala-day/etablissements"
              style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#fbbf24", letterSpacing: ".08em", textDecoration: "none" }}>
              GÉRER TOUT →
            </a>
          </div>

          {etablissements.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", border: "1px dashed rgba(251,191,36,.15)", borderRadius: 10 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>🏪</div>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".8rem", color: "#5a5470" }}>
                Aucun établissement créé.
              </div>
              <a href="/admin/yassala-day/etablissements"
                style={{ display: "inline-block", marginTop: 14, background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#000", padding: "10px 22px", borderRadius: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: ".82rem", letterSpacing: ".08em", textDecoration: "none", fontWeight: 700 }}>
                + CRÉER UN ÉTABLISSEMENT
              </a>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {etablissements.slice(0, 6).map(etab => {
                const etabProds = products.filter(p => p.etablissementId === etab.id);
                return (
                  <div key={etab.id} style={{ background: "rgba(255,255,255,.02)", border: `1px solid ${etab.isActive ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.05)"}`, borderRadius: 10, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, opacity: etab.isActive ? 1 : 0.6 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0, overflow: "hidden" }}>
                      {etab.logoUrl ? <img src={etab.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: ".95rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                        {etab.name}
                        <span style={S.badge(etab.isActive)}>{etab.isActive ? "ACTIF" : "INACTIF"}</span>
                      </div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470", marginTop: 3 }}>
                        {etab.address || "—"} · {etabProds.length} produit{etabProds.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <a href={`/admin/yassala-day/etablissements/${etab.id}`}
                      style={{ background: "transparent", border: "1px solid rgba(251,191,36,.3)", color: "#fbbf24", padding: "8px 16px", borderRadius: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", letterSpacing: ".08em", textDecoration: "none", flexShrink: 0 }}>
                      GÉRER →
                    </a>
                  </div>
                );
              })}
              {etablissements.length > 6 && (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                  <a href="/admin/yassala-day/etablissements" style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", color: "#5a5470", textDecoration: "none" }}>
                    + {etablissements.length - 6} autres établissements →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
