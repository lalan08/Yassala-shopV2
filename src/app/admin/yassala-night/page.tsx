"use client";

import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, onSnapshot, doc, updateDoc,
} from "firebase/firestore";

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

type NightEtablissement = {
  id: string;
  name: string;
  logoUrl?: string;
  category?: string;
  isActive?: boolean;
  isOpen?: boolean;
  activeDay?: boolean;
};

const CATEGORY_FILTERS = ["Tous", "Snack", "Burgers", "Pizzas", "Sushis", "Grillade", "Autre"];

export default function ServiceNightPage() {
  const [auth, setAuth] = useState(false);
  const [catCount, setCatCount] = useState(0);
  const [prodCount, setProdCount] = useState(0);
  const [packCount, setPackCount] = useState(0);
  const [offerCount, setOfferCount] = useState(0);
  const [etablissements, setEtablissements] = useState<NightEtablissement[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Tous");
  const [dayCatCount, setDayCatCount] = useState(0);
  const [dayProdCount, setDayProdCount] = useState(0);
  const [dayPackCount, setDayPackCount] = useState(0);
  const [dayOfferCount, setDayOfferCount] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") setAuth(!!localStorage.getItem("yassala_admin_auth"));
  }, []);

  useEffect(() => {
    if (!auth) return;
    const u1 = onSnapshot(collection(db, "night_categories"),     s => setCatCount(s.size));
    const u2 = onSnapshot(collection(db, "night_products"),       s => setProdCount(s.size));
    const u3 = onSnapshot(collection(db, "night_packs"),          s => setPackCount(s.size));
    const u4 = onSnapshot(collection(db, "night_offers"),         s => setOfferCount(s.size));
    const u5 = onSnapshot(collection(db, "night_etablissements"), snap => {
      setEtablissements(snap.docs.map(d => ({ id: d.id, ...d.data() } as NightEtablissement))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    });
    const u6 = onSnapshot(collection(db, "day_categories"), s => setDayCatCount(s.size));
    const u7 = onSnapshot(collection(db, "day_products"),   s => setDayProdCount(s.size));
    const u8 = onSnapshot(collection(db, "day_packs"),      s => setDayPackCount(s.size));
    const u9 = onSnapshot(collection(db, "day_offers"),     s => setDayOfferCount(s.size));
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); };
  }, [auth]);

  if (!auth) {
    return (
      <div style={{ minHeight: "100vh", background: "#080514", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", fontFamily: "'Share Tech Mono',monospace", color: "#5a5470" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>🌙</div>
          <div>Accès refusé — <a href="/admin" style={{ color: "#a78bfa" }}>retour admin</a></div>
        </div>
      </div>
    );
  }

  const filtered = etablissements.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "Tous" || (e.category || "").toLowerCase() === catFilter.toLowerCase();
    return matchSearch && matchCat;
  });

  const nightCards = [
    { label: "Catégories", sublabel: "NIGHT", emoji: "📦", count: catCount,  href: "/admin/yassala-night/etablissements" },
    { label: "Produits",   sublabel: "NIGHT", emoji: "🍔", count: prodCount, href: "/admin/yassala-night/etablissements" },
    { label: "Packs",      sublabel: "NIGHT", emoji: "📦", count: packCount, href: "/admin/yassala-night/etablissements" },
    { label: "Offres",     sublabel: "NIGHT", emoji: "🏷️", count: offerCount, href: "/admin/yassala-night/etablissements" },
  ];

  const dayCards = [
    { label: "Catégories", sublabel: "DAY", emoji: "📦", count: dayCatCount,  href: "/admin/yassala-day" },
    { label: "Produits",   sublabel: "DAY", emoji: "🍔", count: dayProdCount, href: "/admin/yassala-day" },
    { label: "Packs",      sublabel: "DAY", emoji: "📦", count: dayPackCount, href: "/admin/yassala-day" },
    { label: "Offres",     sublabel: "DAY", emoji: "🏷️", count: dayOfferCount, href: "/admin/yassala-day" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f9", fontFamily: "'Inter',sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e8eaf0",
        padding: "0 32px", height: 56, display: "flex", alignItems: "center",
        gap: 16, position: "sticky", top: 0, zIndex: 40,
      }}>
        <a href="/admin" style={{
          fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem",
          color: "#7a7490", textDecoration: "none", letterSpacing: ".08em",
        }}>
          ← Admin
        </a>
        <span style={{ color: "#c8cadc", fontSize: ".9rem" }}>/</span>
        <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: ".9rem", color: "#1a1740" }}>
          Service NIGHT
        </span>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: "1.6rem", color: "#1a1740", margin: 0 }}>
            Service NIGHT 🌙
          </h1>
          <a href="/admin/yassala-night/etablissements" style={{
            background: "linear-gradient(135deg,#7c3aed,#a855f7)",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 20px", fontFamily: "'Inter',sans-serif",
            fontWeight: 600, fontSize: ".9rem", cursor: "pointer",
            textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
          }}>
            + Ajouter Partenaire
          </a>
        </div>

        {/* ── NIGHT quick-access cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
          {nightCards.map(card => (
            <a key={card.label} href={card.href} style={{ textDecoration: "none" }}>
              <div style={{
                background: "#fff", borderRadius: 12, padding: "20px 20px 16px",
                boxShadow: "0 1px 4px rgba(0,0,0,.06)", cursor: "pointer",
                transition: "box-shadow .15s", display: "flex", flexDirection: "column", gap: 6,
                borderTop: "3px solid #a78bfa",
              }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(167,139,250,.2)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,.06)")}
              >
                <div style={{ fontSize: "2rem", marginBottom: 4 }}>{card.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#1a1740" }}>
                  {card.label}{" "}
                  <span style={{ color: "#7c3aed" }}>{card.sublabel}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#9ca3af" }}>
                    {card.count} éléments
                  </span>
                  <span style={{ color: "#9ca3af", fontSize: ".85rem" }}>›</span>
                </div>
              </div>
            </a>
          ))}
        </div>

        {/* ── Établissements actifs en NIGHT ── */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "24px 28px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ fontWeight: 700, fontSize: "1.1rem", color: "#1a1740", margin: 0 }}>
              Établissements actifs en NIGHT
            </h2>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "1rem" }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search"
                style={{
                  background: "#f4f5f9", border: "1px solid #e8eaf0", borderRadius: 8,
                  padding: "8px 14px 8px 36px", fontSize: ".85rem", color: "#1a1740",
                  outline: "none", width: 200,
                }}
              />
            </div>
          </div>

          {/* Category filter tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {CATEGORY_FILTERS.map(cat => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                style={{
                  padding: "6px 16px", borderRadius: 20, border: "1px solid",
                  borderColor: catFilter === cat ? "#7c3aed" : "#e8eaf0",
                  background: catFilter === cat ? "#7c3aed" : "#fff",
                  color: catFilter === cat ? "#fff" : "#6b7280",
                  fontWeight: catFilter === cat ? 600 : 400,
                  fontSize: ".85rem", cursor: "pointer", transition: "all .15s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f0f1f5" }}>
                {["Nom", "Catégories", "Actif DAY ↑", "Statut", "Actions"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 12px",
                    fontSize: ".78rem", fontWeight: 600, color: "#9ca3af", letterSpacing: ".04em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "#9ca3af", fontSize: ".85rem" }}>
                    Aucun établissement partenaire NIGHT trouvé
                  </td>
                </tr>
              ) : filtered.map(etab => (
                <tr key={etab.id} style={{ borderBottom: "1px solid #f4f5f9" }}>
                  {/* Nom + logo */}
                  <td style={{ padding: "14px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {etab.logoUrl ? (
                        <img src={etab.logoUrl} alt={etab.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%",
                          background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: ".85rem", fontWeight: 700, color: "#fff",
                        }}>
                          {etab.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontWeight: 600, color: "#1a1740", fontSize: ".9rem" }}>{etab.name}</span>
                    </div>
                  </td>

                  {/* Catégorie */}
                  <td style={{ padding: "14px 12px" }}>
                    {etab.category ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          background: "#ede9fe", color: "#5b21b6", borderRadius: 6,
                          padding: "4px 10px", fontSize: ".78rem", fontWeight: 600,
                        }}>
                          {etab.category}
                        </span>
                        <span style={{ color: "#9ca3af", fontSize: ".78rem" }}>✎</span>
                      </div>
                    ) : (
                      <span style={{ color: "#d1d5db", fontSize: ".78rem" }}>—</span>
                    )}
                  </td>

                  {/* Actif DAY toggle */}
                  <td style={{ padding: "14px 12px" }}>
                    <div
                      onClick={async () => {
                        const next = !etab.activeDay;
                        await updateDoc(doc(db, "night_etablissements", etab.id), { activeDay: next });
                      }}
                      style={{
                        width: 44, height: 24, borderRadius: 12, position: "relative", cursor: "pointer",
                        background: etab.activeDay ? "#fbbf24" : "#e5e7eb", transition: "background .2s",
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 3,
                        left: etab.activeDay ? 22 : 3,
                        width: 18, height: 18, borderRadius: "50%",
                        background: "#fff", transition: "left .2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                      }} />
                    </div>
                  </td>

                  {/* Statut */}
                  <td style={{ padding: "14px 12px" }}>
                    <span style={{
                      background: etab.isOpen !== false ? "#d1fae5" : "#fee2e2",
                      color: etab.isOpen !== false ? "#065f46" : "#991b1b",
                      borderRadius: 6, padding: "4px 10px", fontSize: ".78rem", fontWeight: 700,
                      letterSpacing: ".04em",
                    }}>
                      {etab.isOpen !== false ? "OUVERT" : "FERMÉ"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "14px 12px" }}>
                    <a href="/admin/yassala-night/etablissements" style={{
                      background: "#f4f5f9", border: "1px solid #e8eaf0", color: "#7c3aed",
                      borderRadius: 6, padding: "6px 14px", fontSize: ".8rem", fontWeight: 600,
                      cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                      ✎ Éditer
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Service DAY preview section ── */}
        <div style={{
          background: "#fff",
          border: "2px solid #fef3c7",
          borderRadius: 16, padding: "28px 32px",
          boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: "1.4rem" }}>☀️</span>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: "1.2rem", color: "#1a1740", margin: 0 }}>
              Service <span style={{ color: "#d97706" }}>DAY</span>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {dayCards.map(card => (
              <a key={card.label} href={card.href} style={{ textDecoration: "none" }}>
                <div style={{
                  background: "#fffbeb", border: "1px solid #fde68a",
                  borderRadius: 12, padding: "18px 16px 14px", cursor: "pointer",
                  transition: "background .15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#fef3c7")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fffbeb")}
                >
                  <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>{card.emoji}</div>
                  <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#1a1740" }}>
                    {card.label}{" "}
                    <span style={{ color: "#d97706" }}>{card.sublabel}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".74rem", color: "#92400e" }}>
                      {card.count} éléments
                    </span>
                    <span style={{ color: "#d97706", fontSize: ".85rem" }}>›</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <a href="/admin/yassala-day" style={{
              color: "#d97706", fontSize: ".82rem", fontFamily: "'Inter',sans-serif",
              textDecoration: "none", fontWeight: 500,
            }}>
              Gérer le Service DAY →
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
