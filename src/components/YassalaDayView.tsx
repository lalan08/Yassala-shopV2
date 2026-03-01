"use client";

import { useEffect, useState, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, onSnapshot, doc } from "firebase/firestore";

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

type Relay = {
  id: string;
  name: string;
  address: string;
  status: "active" | "inactive";
};

type DayBanner = {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  cta: string;
  link: string;
  gradient: string;
  image: string;
  brightness: number;
  active: boolean;
  order: number;
};

type DayCategory = {
  id: string;
  key: string;
  label: string;
  emoji: string;
  order: number;
};

type DayOffer = {
  id: string;
  title: string;
  desc: string;
  emoji: string;
  discount: string;
  active: boolean;
  order: number;
  cat?: string;
};

type DayProduct = {
  id: string;
  name: string;
  desc: string;
  price: number;
  image: string;
  cat: string;
  badge: string;
  stock: number;
  order?: number;
  isActive?: boolean;
};

type DayPack = {
  id: string;
  name: string;
  tag: string;
  emoji: string;
  items: string;
  price: number;
  real: number;
  star: boolean;
};

type YassalaDayConfig = {
  active: boolean;
  startHour: number;
  endHour: number;
  welcomeMessage: string;
  phone: string;
};

// ── Countdown vers 21h ───────────────────────────────────────────────────────
function useCountdownToNight() {
  const getSecondsLeft = () => {
    const now = new Date();
    const target = new Date();
    target.setHours(21, 0, 0, 0);
    if (now >= target) return 0;
    return Math.floor((target.getTime() - now.getTime()) / 1000);
  };

  const [seconds, setSeconds] = useState(getSecondsLeft);

  useEffect(() => {
    const interval = setInterval(() => setSeconds(getSecondsLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

// ── Carrousel bannières ───────────────────────────────────────────────────────
function BannerCarousel({ banners }: { banners: DayBanner[] }) {
  const active = banners.filter(b => b.active);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (active.length <= 1) return;
    const id = setInterval(() => setIdx(i => (i + 1) % active.length), 5000);
    return () => clearInterval(id);
  }, [active.length]);

  if (active.length === 0) return null;

  const b = active[idx];
  return (
    <div style={{ position: "relative", zIndex: 2, overflow: "hidden" }}>
      <div style={{
        position: "relative",
        minHeight: 140,
        background: b.gradient || "linear-gradient(135deg,rgba(255,45,120,.85) 0%,rgba(245,158,11,.9) 100%)",
        overflow: "hidden",
        transition: "background .6s",
      }}>
        {b.image && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${b.image})`,
            backgroundSize: "cover", backgroundPosition: "center",
            opacity: b.brightness ?? 0.28,
          }} />
        )}
        {/* Overlay gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg,rgba(0,0,0,.45) 0%,transparent 70%)",
        }} />
        <div style={{
          position: "relative", zIndex: 1,
          padding: "22px 24px",
          display: "flex", flexDirection: "column", justifyContent: "center",
          minHeight: 140,
        }}>
          {b.subtitle && (
            <div style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem",
              color: "#fbbf24", letterSpacing: ".18em", textTransform: "uppercase",
              marginBottom: 8,
            }}>
              &gt; {b.subtitle}
            </div>
          )}
          <div style={{
            fontFamily: "'Black Ops One',cursive",
            fontSize: "clamp(1.4rem,5vw,2rem)", lineHeight: 1,
            color: "#fff", letterSpacing: ".04em",
            textShadow: "0 2px 12px rgba(0,0,0,.4)",
            marginBottom: b.desc ? 8 : 16,
          }}>
            {b.title}
          </div>
          {b.desc && (
            <div style={{
              fontFamily: "'Rajdhani',sans-serif", fontSize: ".9rem",
              color: "rgba(255,255,255,.85)", lineHeight: 1.5,
              maxWidth: 420, marginBottom: 16,
            }}>
              {b.desc}
            </div>
          )}
          {b.cta && (
            <div>
              <button
                onClick={() => {
                  if (b.link) {
                    const el = document.getElementById(b.link);
                    if (el) { el.scrollIntoView({ behavior: "smooth" }); return; }
                  }
                  document.getElementById("relais")?.scrollIntoView({ behavior: "smooth" });
                }}
                style={{
                  padding: "10px 22px",
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                  fontSize: ".85rem", letterSpacing: ".12em", textTransform: "uppercase",
                  border: "none", cursor: "pointer", borderRadius: 3,
                  background: "#fbbf24", color: "#000",
                  boxShadow: "0 4px 16px rgba(251,191,36,.4)",
                }}
              >
                {b.cta}
              </button>
            </div>
          )}
        </div>
        {/* Indicateurs de page */}
        {active.length > 1 && (
          <div style={{
            position: "absolute", bottom: 10, right: 16,
            display: "flex", gap: 5,
          }}>
            {active.map((_, i) => (
              <div
                key={i}
                onClick={() => setIdx(i)}
                style={{
                  width: i === idx ? 18 : 6, height: 6,
                  borderRadius: 3, cursor: "pointer",
                  background: i === idx ? "#fbbf24" : "rgba(255,255,255,.4)",
                  transition: "all .3s",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function YassalaDayView() {
  const [relays, setRelays] = useState<Relay[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState("--:--");
  const countdown = useCountdownToNight();
  const [dayConfig, setDayConfig] = useState<YassalaDayConfig>({ active: true, startHour: 7, endHour: 21, welcomeMessage: "", phone: "" });
  const [dayBanners, setDayBanners] = useState<DayBanner[]>([]);
  const [dayCategories, setDayCategories] = useState<DayCategory[]>([]);
  const [dayOffers, setDayOffers] = useState<DayOffer[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [dayProducts, setDayProducts] = useState<DayProduct[]>([]);
  const [dayPacks, setDayPacks] = useState<DayPack[]>([]);
  const [activeProductCat, setActiveProductCat] = useState<string>("all");

  // Horloge en temps réel
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Chargement des relais actifs
  const loadRelays = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "relays"), where("status", "==", "active"));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Relay));
      setRelays(data);
    } catch {
      setRelays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRelays();
  }, [loadRelays]);

  // Chargement bannières pub (collection partagée Night + Day)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "banners"), snap => {
      setDayBanners(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as DayBanner))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
    });
    return () => unsub();
  }, []);

  // Chargement catégories jour en temps réel
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "day_categories"), snap => {
      setDayCategories(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as DayCategory))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
    });
    return () => unsub();
  }, []);

  // Chargement offres du jour en temps réel
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "day_offers"), snap => {
      setDayOffers(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as DayOffer))
          .filter(o => o.active)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
    });
    return () => unsub();
  }, []);

  // Chargement produits jour en temps réel
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "day_products"), snap => {
      setDayProducts(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as DayProduct))
          .filter(p => p.isActive !== false && p.stock > 0)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
    });
    return () => unsub();
  }, []);

  // Chargement packs jour en temps réel
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "day_packs"), snap => {
      setDayPacks(snap.docs.map(d => ({ id: d.id, ...d.data() } as DayPack)));
    });
    return () => unsub();
  }, []);

  // Chargement config jour en temps réel
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "yassala_day", "config"), snap => {
      if (snap.exists()) setDayConfig(snap.data() as YassalaDayConfig);
    });
    return () => unsub();
  }, []);

  const filteredOffers = activeCat === "all"
    ? dayOffers
    : dayOffers.filter(o => o.cat === activeCat);

  const filteredProducts = activeProductCat === "all"
    ? dayProducts
    : dayProducts.filter(p => p.cat === activeProductCat);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700;800&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        :root {
          --bg:#f5f0ff; --card:#ffffff;
          --pink:#ff2d78; --cyan:#0099bb; --lime:#2d8c00;
          --text:#1a0022; --muted:#7a6a9a;
        }
        *{margin:0;padding:0;box-sizing:border-box;}
        html{scroll-behavior:smooth;}
        body{
          background:#f5f0ff !important;
          color:#1a0022 !important;
          font-family:'Rajdhani',sans-serif !important;
          font-weight:500;
          min-height:100vh;
          overflow-x:hidden;
        }
        body::before{
          content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(180,140,255,.04) 2px,rgba(180,140,255,.04) 4px);
        }
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.4);}}
        @keyframes flicker{0%,95%,100%{opacity:1;}96%{opacity:.6;}97%{opacity:1;}98%{opacity:.4;}99%{opacity:1;}}
        @keyframes gridScroll{from{background-position:0 0;}to{background-position:50px 50px;}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
        @keyframes bgShift{from{opacity:.6;}to{opacity:1;}}
        @keyframes floatPulse{0%,100%{box-shadow:0 4px 20px rgba(255,45,120,.2),0 0 40px rgba(255,45,120,.08);}50%{box-shadow:0 4px 28px rgba(255,45,120,.35),0 0 50px rgba(255,45,120,.15);}}
        @keyframes slideCard{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
        .flicker{animation:flicker 6s infinite;}
        .fade1{animation:fadeUp .5s .0s both;}
        .fade2{animation:fadeUp .5s .1s both;}
        .fade3{animation:fadeUp .5s .2s both;}
        .fade4{animation:fadeUp .5s .3s both;}
        .fade5{animation:fadeUp .5s .4s both;}

        @media (max-width:640px){
          .nav-main{padding:10px 14px !important;}
          .nav-logo{font-size:1.4rem !important;}
          .nav-status{display:none !important;}
          .clock-hero{display:none !important;}
          .hero-content{padding:36px 16px 64px !important;max-width:100% !important;}
          .hero-content h1{font-size:clamp(2.6rem,14vw,4.5rem) !important;}
          .cat-filter-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        }
        @media (max-width:400px){
          .nav-logo{font-size:1.2rem !important;}
          .hero-content h1{font-size:clamp(2.2rem,12vw,3.5rem) !important;}
        }
        body{padding-bottom:40px;}
      `}</style>

      {/* ── Fond radial léger ── */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 50% 50% at 15% 20%,rgba(255,45,120,.07) 0%,transparent 60%),radial-gradient(ellipse 40% 60% at 85% 75%,rgba(0,153,187,.06) 0%,transparent 60%)",
        animation: "bgShift 8s ease-in-out infinite alternate",
      }} />

      {/* ── BARRE DE STATUT (style Night) ── */}
      <div style={{
        background: dayConfig.active ? "#ff2d78" : "#5a5470", color: "#000", textAlign: "center", padding: "8px",
        fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", letterSpacing: ".15em",
        position: "relative", zIndex: 10,
      }}>
        {dayConfig.active
          ? `// POINTS RELAIS ACTIFS · CAYENNE & ALENTOURS · ${dayConfig.startHour}H00 → ${dayConfig.endHour}H00 //`
          : "// POINTS RELAIS FERMÉS · REVENEZ PLUS TARD //"
        }
      </div>

      {/* ── NAVIGATION (style Night, fond clair) ── */}
      <nav className="nav-main" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 28px", borderBottom: "1px solid rgba(255,45,120,.2)",
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(245,240,255,.92)", backdropFilter: "blur(20px)",
      }}>
        {/* Logo avec effet flicker — identique Night */}
        <div className="flicker nav-logo" style={{
          fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem",
          letterSpacing: ".08em", color: "#ff2d78",
          textShadow: "0 0 16px rgba(255,45,120,.45)", lineHeight: 1,
        }}>
          YASSALA
          <span style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".6rem",
            color: "#0099bb", letterSpacing: ".2em",
            display: "block", marginTop: "-4px",
          }}>
            Day Shop
          </span>
        </div>

        {/* Statut OPEN */}
        <div className="nav-status" style={{
          display: "flex", alignItems: "center", gap: "8px",
          border: "1px solid #2d8c00", color: "#2d8c00",
          padding: "6px 14px", borderRadius: "3px",
          fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", letterSpacing: ".12em",
        }}>
          <div style={{
            width: 6, height: 6, background: "#2d8c00",
            borderRadius: "50%", animation: "pulse 1.5s infinite",
          }} />
          OPEN · 7H00–21H00
        </div>

        {/* Horloge */}
        <div style={{
          fontFamily: "'Share Tech Mono',monospace", fontSize: "1.2rem",
          color: "#0099bb", letterSpacing: ".08em",
          fontVariantNumeric: "tabular-nums",
        }}>
          {clock}
        </div>
      </nav>

      {/* ── HERO (style Night, fond clair) ── */}
      <section style={{ position: "relative", minHeight: 380, overflow: "hidden", zIndex: 1, display: "flex", alignItems: "center" }}>
        {/* Grille animée — version claire */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(255,45,120,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,45,120,.06) 1px,transparent 1px)",
          backgroundSize: "50px 50px", animation: "gridScroll 20s linear infinite",
        }} />

        {/* Overlay gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg,rgba(255,45,120,.08) 0%,rgba(245,240,255,.6) 60%,rgba(245,240,255,.9) 100%)",
        }} />

        {/* Contenu hero */}
        <div className="hero-content" style={{
          position: "relative", zIndex: 2, maxWidth: 580, padding: "60px 28px 70px",
        }}>
          <div className="fade1" style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem",
            color: "#0099bb", letterSpacing: ".2em", textTransform: "uppercase", marginBottom: 18,
          }}>
            &gt; livraison de jour — guyane
          </div>

          <h1 className="fade2" style={{
            fontFamily: "'Black Ops One',cursive",
            fontSize: "clamp(3.2rem,9vw,6rem)", lineHeight: .9,
            letterSpacing: ".03em", marginBottom: 22,
          }}>
            <span style={{
              color: "#ff2d78",
              textShadow: "0 0 18px rgba(255,45,120,.4),0 0 50px rgba(255,45,120,.12)",
              display: "block",
            }}>YASSALA</span>
            <span style={{
              color: "#0099bb",
              textShadow: "0 0 18px rgba(0,153,187,.35)",
              display: "block",
            }}>DAY</span>
            <span style={{
              WebkitTextStroke: "2px #ff2d78",
              color: "transparent",
              display: "block",
              filter: "drop-shadow(0 0 10px rgba(255,45,120,.3))",
            }}>SHOP</span>
          </h1>

          <p className="fade3" style={{
            fontSize: "1rem", color: "#7a6a9a", lineHeight: 1.65, maxWidth: 400, marginBottom: 32,
          }}>
            Commandez auprès de nos points relais partenaires et récupérez votre colis directement chez le commerçant.
          </p>

          <div className="fade4" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => document.getElementById("relais")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                padding: "13px 26px", fontFamily: "'Rajdhani',sans-serif", fontWeight: 700,
                fontSize: ".9rem", letterSpacing: ".12em", textTransform: "uppercase",
                border: "none", cursor: "pointer", borderRadius: 3,
                background: "#ff2d78", color: "#fff",
                boxShadow: "0 4px 20px rgba(255,45,120,.35)",
              }}
            >
              VOIR LES RELAIS →
            </button>
            {/* Countdown Night */}
            <div style={{
              padding: "13px 18px", fontFamily: "'Share Tech Mono',monospace",
              fontSize: ".78rem", letterSpacing: ".1em",
              background: "rgba(255,45,120,.08)", border: "1px solid rgba(255,45,120,.25)",
              borderRadius: 3, color: "#ff2d78",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              🌙 NIGHT DANS <strong style={{ fontVariantNumeric: "tabular-nums" }}>{countdown}</strong>
            </div>
          </div>
        </div>

        {/* Horloge déco (droite) */}
        <div className="clock-hero fade5" style={{
          position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)",
          zIndex: 3, textAlign: "center",
        }}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: "5rem",
            color: "#0099bb", textShadow: "0 0 16px rgba(0,153,187,.4)",
            letterSpacing: ".05em", lineHeight: 1,
          }}>
            {clock}
          </div>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem",
            color: "#7a6a9a", letterSpacing: ".2em", textTransform: "uppercase", marginTop: 6,
          }}>
            heure locale
          </div>
        </div>
      </section>

      {/* ── INFO BAR (style Night) ── */}
      <div style={{
        borderTop: "1px solid rgba(255,45,120,.15)",
        borderBottom: "1px solid rgba(255,45,120,.15)",
        display: "flex",
        fontFamily: "'Share Tech Mono',monospace",
        fontSize: ".7rem",
        letterSpacing: ".1em",
        background: "rgba(255,255,255,.6)",
        backdropFilter: "blur(10px)",
        position: "relative", zIndex: 5,
      }}>
        {[
          { label: "ZONE", value: "CAYENNE & ALENTOURS" },
          { label: "HORAIRES", value: "7H00 → 21H00" },
          { label: "MODE", value: "POINT RELAIS" },
          { label: "STATUT", value: "OUVERT ✓" },
        ].map((item, i) => (
          <div key={i} style={{
            flex: 1, padding: "14px 12px", textAlign: "center",
            borderRight: i < 3 ? "1px solid rgba(255,45,120,.1)" : undefined,
          }}>
            <div style={{ color: "#7a6a9a", marginBottom: 3 }}>{item.label}</div>
            <div style={{ color: "#ff2d78", fontWeight: 700 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── BANNIÈRES PUB ── */}
      {dayBanners.filter(b => b.active).length > 0 && (
        <div style={{ position: "relative", zIndex: 2 }}>
          <BannerCarousel banners={dayBanners} />
        </div>
      )}

      {/* ── OFFRES DU JOUR avec catégories ── */}
      {(dayOffers.length > 0 || dayCategories.length > 0) && (
        <div id="offres" style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 0", position: "relative", zIndex: 1 }}>

          {/* Titre section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
              color: "#0099bb", letterSpacing: ".15em", textTransform: "uppercase", marginBottom: 8,
            }}>
              // OFFRES & ARTICLES DU JOUR
            </div>
            <h2 style={{
              fontFamily: "'Black Ops One',cursive",
              fontSize: "1.6rem", color: "#1a0022",
              letterSpacing: ".04em", margin: 0,
            }}>
              SÉLECTION DU JOUR
            </h2>
          </div>

          {/* Filtre catégories */}
          {dayCategories.length > 0 && (
            <div className="cat-filter-scroll" style={{
              display: "flex", gap: 8, marginBottom: 20,
              flexWrap: "nowrap", overflowX: "auto",
              paddingBottom: 4,
            }}>
              <button
                onClick={() => setActiveCat("all")}
                style={{
                  padding: "8px 16px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".82rem",
                  letterSpacing: ".08em", textTransform: "uppercase",
                  border: activeCat === "all" ? "none" : "1px solid rgba(255,45,120,.25)",
                  background: activeCat === "all" ? "#ff2d78" : "transparent",
                  color: activeCat === "all" ? "#fff" : "#ff2d78",
                  transition: "all .2s",
                }}
              >
                TOUT VOIR
              </button>
              {dayCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.key)}
                  style={{
                    padding: "8px 16px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
                    fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".82rem",
                    letterSpacing: ".08em", textTransform: "uppercase",
                    border: activeCat === cat.key ? "none" : "1px solid rgba(255,45,120,.25)",
                    background: activeCat === cat.key ? "#ff2d78" : "transparent",
                    color: activeCat === cat.key ? "#fff" : "#ff2d78",
                    transition: "all .2s",
                  }}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          )}

          {/* Liste des offres */}
          {filteredOffers.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "32px 20px",
              background: "#fff",
              borderRadius: 4,
              border: "1px solid rgba(255,45,120,.2)",
              marginBottom: 24,
            }}>
              <div style={{
                fontFamily: "'Share Tech Mono',monospace",
                fontSize: ".78rem", color: "#7a6a9a", letterSpacing: ".05em",
              }}>
                Aucune offre pour cette catégorie
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14, marginBottom: 32 }}>
              {filteredOffers.map((offer, idx) => (
                <div key={offer.id} style={{
                  background: "#fff",
                  borderRadius: 4,
                  border: "1px solid rgba(255,45,120,.2)",
                  overflow: "hidden",
                  boxShadow: "0 2px 16px rgba(255,45,120,.06)",
                  animation: `slideCard .4s ${idx * 0.06}s both`,
                }}>
                  <div style={{ height: 3, background: "linear-gradient(90deg,#fbbf24,#ff2d78)" }} />
                  <div style={{ padding: "16px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: 8 }}>{offer.emoji}</div>
                    <div style={{
                      fontFamily: "'Black Ops One',cursive",
                      fontSize: "1rem", color: "#1a0022",
                      letterSpacing: ".03em", marginBottom: 6,
                    }}>
                      {offer.title}
                    </div>
                    {offer.desc && (
                      <div style={{
                        fontFamily: "'Rajdhani',sans-serif",
                        fontSize: ".85rem", color: "#7a6a9a",
                        lineHeight: 1.5, marginBottom: 10,
                      }}>
                        {offer.desc}
                      </div>
                    )}
                    {offer.discount && (
                      <div style={{
                        display: "inline-block",
                        fontFamily: "'Share Tech Mono',monospace",
                        fontSize: ".72rem", letterSpacing: ".1em",
                        background: "rgba(255,45,120,.1)",
                        border: "1px solid rgba(255,45,120,.25)",
                        color: "#ff2d78",
                        padding: "3px 10px", borderRadius: 2,
                      }}>
                        🔥 {offer.discount}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PRODUITS DU JOUR ── */}
      {dayProducts.length > 0 && (
        <div id="produits" style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 0", position: "relative", zIndex: 1 }}>

          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
              color: "#0099bb", letterSpacing: ".15em", textTransform: "uppercase", marginBottom: 8,
            }}>
              // CATALOGUE
            </div>
            <h2 style={{
              fontFamily: "'Black Ops One',cursive",
              fontSize: "1.6rem", color: "#1a0022",
              letterSpacing: ".04em", margin: 0,
            }}>
              NOS PRODUITS
            </h2>
          </div>

          {/* Filtre catégories produits */}
          {dayCategories.length > 0 && (
            <div style={{
              display: "flex", gap: 8, marginBottom: 20,
              flexWrap: "nowrap", overflowX: "auto",
              paddingBottom: 4,
            }}>
              <button
                onClick={() => setActiveProductCat("all")}
                style={{
                  padding: "8px 16px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".82rem",
                  letterSpacing: ".08em", textTransform: "uppercase" as const,
                  border: activeProductCat === "all" ? "none" : "1px solid rgba(255,45,120,.25)",
                  background: activeProductCat === "all" ? "#ff2d78" : "transparent",
                  color: activeProductCat === "all" ? "#fff" : "#ff2d78",
                }}
              >
                TOUT
              </button>
              {dayCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveProductCat(cat.key)}
                  style={{
                    padding: "8px 16px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
                    fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".82rem",
                    letterSpacing: ".08em", textTransform: "uppercase" as const,
                    border: activeProductCat === cat.key ? "none" : "1px solid rgba(255,45,120,.25)",
                    background: activeProductCat === cat.key ? "#ff2d78" : "transparent",
                    color: activeProductCat === cat.key ? "#fff" : "#ff2d78",
                  }}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          )}

          {/* Grille produits */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 32 }}>
            {filteredProducts.map((prod, idx) => (
              <div key={prod.id} style={{
                background: "#fff",
                borderRadius: 4,
                border: "1px solid rgba(255,45,120,.2)",
                overflow: "hidden",
                boxShadow: "0 2px 16px rgba(255,45,120,.06)",
                animation: `slideCard .4s ${idx * 0.05}s both`,
                display: "flex", flexDirection: "column",
              }}>
                <div style={{ height: 3, background: "linear-gradient(90deg,#fbbf24,#ff2d78)" }} />
                {prod.image ? (
                  <div style={{ position: "relative" }}>
                    <img src={prod.image} alt={prod.name}
                      style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                    {prod.badge && (
                      <div style={{
                        position: "absolute", top: 8, left: 8,
                        fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
                        background: prod.badge === "HOT" ? "#ff2d78" : prod.badge === "NEW" ? "#0099bb" : prod.badge === "PROMO" ? "#fbbf24" : "#ff2d78",
                        color: prod.badge === "PROMO" ? "#000" : "#fff",
                        padding: "3px 8px", borderRadius: 2, letterSpacing: ".08em",
                      }}>
                        {prod.badge === "HOT" ? "🔥" : prod.badge === "NEW" ? "✨" : prod.badge === "PROMO" ? "💛" : "⭐"} {prod.badge}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    height: 160, background: "rgba(255,45,120,.04)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "3rem",
                  }}>
                    🌅
                  </div>
                )}
                <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{
                    fontFamily: "'Black Ops One',cursive",
                    fontSize: ".95rem", color: "#1a0022",
                    letterSpacing: ".03em", marginBottom: 4,
                  }}>
                    {prod.name}
                  </div>
                  {prod.desc && (
                    <div style={{
                      fontFamily: "'Rajdhani',sans-serif",
                      fontSize: ".82rem", color: "#7a6a9a",
                      lineHeight: 1.4, marginBottom: 10, flex: 1,
                    }}>
                      {prod.desc}
                    </div>
                  )}
                  <div style={{
                    fontFamily: "'Share Tech Mono',monospace",
                    fontSize: "1.1rem", color: "#ff2d78",
                    fontWeight: 700, letterSpacing: ".05em",
                    marginTop: "auto",
                  }}>
                    {Number(prod.price).toFixed(2)} €
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PACKS DU JOUR ── */}
      {dayPacks.length > 0 && (
        <div id="packs-jour" style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px 0", position: "relative", zIndex: 1 }}>

          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
              color: "#0099bb", letterSpacing: ".15em", textTransform: "uppercase", marginBottom: 8,
            }}>
              // OFFRES GROUPÉES
            </div>
            <h2 style={{
              fontFamily: "'Black Ops One',cursive",
              fontSize: "1.6rem", color: "#1a0022",
              letterSpacing: ".04em", margin: 0,
            }}>
              NOS PACKS
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14, marginBottom: 32 }}>
            {dayPacks.map((pk, idx) => (
              <div key={pk.id} style={{
                background: "#fff",
                borderRadius: 4,
                border: `1px solid ${pk.star ? "rgba(251,191,36,.5)" : "rgba(255,45,120,.2)"}`,
                overflow: "hidden",
                boxShadow: pk.star ? "0 4px 20px rgba(251,191,36,.15)" : "0 2px 16px rgba(255,45,120,.06)",
                animation: `slideCard .4s ${idx * 0.06}s both`,
              }}>
                <div style={{ height: 3, background: pk.star ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#fbbf24,#ff2d78)" }} />
                <div style={{ padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: "2rem" }}>{pk.emoji}</span>
                    {pk.star && (
                      <span style={{
                        fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
                        background: "#fbbf24", color: "#000",
                        padding: "2px 8px", borderRadius: 2, letterSpacing: ".08em",
                      }}>
                        ★ POPULAIRE
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: "'Black Ops One',cursive",
                    fontSize: "1rem", color: "#1a0022",
                    letterSpacing: ".03em", marginBottom: 4,
                  }}>
                    {pk.name}
                  </div>
                  {pk.tag && (
                    <div style={{
                      fontFamily: "'Share Tech Mono',monospace",
                      fontSize: ".72rem", color: "#7a6a9a",
                      letterSpacing: ".05em", marginBottom: 12,
                    }}>
                      {pk.tag}
                    </div>
                  )}
                  {pk.items && (
                    <div style={{ marginBottom: 12 }}>
                      {pk.items.split("\n").filter(Boolean).map((item, i) => (
                        <div key={i} style={{
                          fontFamily: "'Rajdhani',sans-serif",
                          fontSize: ".85rem", color: "#7a6a9a",
                          display: "flex", alignItems: "center", gap: 6, lineHeight: 1.6,
                        }}>
                          <span style={{ color: "#ff2d78", fontSize: ".7rem" }}>▸</span> {item}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{
                      fontFamily: "'Share Tech Mono',monospace",
                      fontSize: "1.3rem", color: "#ff2d78",
                      fontWeight: 700, letterSpacing: ".05em",
                    }}>
                      {Number(pk.price).toFixed(2)} €
                    </span>
                    {pk.real > pk.price && (
                      <span style={{
                        fontFamily: "'Share Tech Mono',monospace",
                        fontSize: ".82rem", color: "#7a6a9a",
                        textDecoration: "line-through",
                      }}>
                        {Number(pk.real).toFixed(2)} €
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONTENU RELAIS ── */}
      <div id="relais" style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 60px", position: "relative", zIndex: 1 }}>

        {/* Titre section — style Night */}
        <div className="fade1" style={{ marginBottom: 24 }}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
            color: "#0099bb", letterSpacing: ".15em", textTransform: "uppercase", marginBottom: 8,
          }}>
            // POINTS DE RETRAIT DISPONIBLES
          </div>
          <h2 style={{
            fontFamily: "'Black Ops One',cursive",
            fontSize: "1.6rem", color: "#1a0022",
            letterSpacing: ".04em", margin: 0,
          }}>
            NOS RELAIS PARTENAIRES
          </h2>
        </div>

        {/* Liste relais */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem",
              color: "#7a6a9a", letterSpacing: ".1em",
              animation: "pulse 1.5s infinite",
            }}>
              // CHARGEMENT DES RELAIS...
            </div>
          </div>
        ) : relays.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "48px 20px",
            background: "#fff",
            borderRadius: 4,
            border: "1px solid rgba(255,45,120,.2)",
            boxShadow: "0 2px 20px rgba(255,45,120,.06)",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>😴</div>
            <div style={{
              fontFamily: "'Black Ops One',cursive",
              fontSize: "1.1rem", color: "#1a0022", marginBottom: 8,
              letterSpacing: ".04em",
            }}>
              AUCUN RELAIS ACTIF
            </div>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: ".78rem", color: "#7a6a9a", letterSpacing: ".05em",
            }}>
              Les commerçants partenaires seront disponibles bientôt
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {relays.map((relay, idx) => (
              <RelayCard key={relay.id} relay={relay} idx={idx} />
            ))}
          </div>
        )}

        {/* Footer info — style Night */}
        <div style={{
          marginTop: 40,
          padding: "20px",
          background: "rgba(255,45,120,.05)",
          border: "1px solid rgba(255,45,120,.15)",
          borderRadius: 4,
        }}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem",
            color: "#0099bb", letterSpacing: ".15em",
            textTransform: "uppercase", marginBottom: 10,
          }}>
            // COMMENT ÇA MARCHE
          </div>
          <div style={{
            fontFamily: "'Rajdhani',sans-serif", fontSize: ".9rem",
            color: "#7a6a9a", lineHeight: 1.8,
          }}>
            <div>① Choisissez un point relais</div>
            <div>② Passez votre commande</div>
            <div>③ Récupérez votre colis directement chez le commerçant</div>
          </div>
        </div>

      </div>
    </>
  );
}

// ── Carte relais (style Night, fond clair) ───────────────────────────────────
function RelayCard({ relay, idx }: { relay: Relay; idx: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: "#fff",
      borderRadius: 4,
      border: "1px solid rgba(255,45,120,.2)",
      overflow: "hidden",
      boxShadow: "0 2px 16px rgba(255,45,120,.06)",
      animation: `slideCard .4s ${idx * 0.08}s both`,
    }}>
      {/* Bande top — style Night */}
      <div style={{
        height: 3,
        background: "linear-gradient(90deg, #ff2d78, #0099bb)",
      }} />

      <div style={{ padding: "18px 18px 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            {/* Badge OUVERT style Night */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "rgba(45,140,0,.08)",
              border: "1px solid rgba(45,140,0,.25)",
              borderRadius: 2, padding: "2px 10px", marginBottom: 10,
              fontFamily: "'Share Tech Mono',monospace",
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#2d8c00", animation: "pulse 2s infinite",
              }} />
              <span style={{ fontSize: ".68rem", fontWeight: 600, color: "#2d8c00", letterSpacing: ".1em" }}>
                OUVERT
              </span>
            </div>

            <div style={{
              fontFamily: "'Black Ops One',cursive",
              fontSize: "1.1rem", color: "#1a0022",
              letterSpacing: ".03em", marginBottom: 6,
            }}>
              {relay.name}
            </div>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: ".75rem", color: "#7a6a9a",
              display: "flex", alignItems: "center", gap: 4,
              letterSpacing: ".03em",
            }}>
              📍 {relay.address}
            </div>
          </div>

          {/* Icône */}
          <div style={{
            width: 50, height: 50, borderRadius: 4,
            background: "rgba(255,45,120,.08)",
            border: "1px solid rgba(255,45,120,.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.5rem", flexShrink: 0,
          }}>
            🏪
          </div>
        </div>

        {/* Horaires — style Night */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginTop: 14, padding: "8px 12px",
          background: "rgba(0,153,187,.05)",
          border: "1px solid rgba(0,153,187,.15)",
          borderRadius: 3,
        }}>
          <span style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: ".68rem", color: "#7a6a9a", letterSpacing: ".08em",
          }}>HORAIRES</span>
          <span style={{
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: ".75rem", fontWeight: 700, color: "#0099bb", letterSpacing: ".05em",
          }}>7H00 → 21H00</span>
        </div>

        {/* Boutons — style Night */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              flex: 1, padding: "10px",
              borderRadius: 3,
              border: "1px solid rgba(255,45,120,.35)",
              background: "transparent",
              color: "#ff2d78",
              fontFamily: "'Rajdhani',sans-serif",
              fontWeight: 700, fontSize: ".82rem",
              letterSpacing: ".08em", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {expanded ? "▲ MASQUER" : "▼ INFOS"}
          </button>
          <button
            style={{
              flex: 2, padding: "10px",
              borderRadius: 3, border: "none",
              background: "#ff2d78",
              color: "#fff",
              fontFamily: "'Rajdhani',sans-serif",
              fontWeight: 700, fontSize: ".88rem",
              letterSpacing: ".1em", textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(255,45,120,.35)",
            }}
          >
            🛒 COMMANDER ICI
          </button>
        </div>

        {/* Détails dépliables — style Night */}
        {expanded && (
          <div style={{
            marginTop: 14, padding: "14px",
            background: "rgba(0,153,187,.04)",
            border: "1px solid rgba(0,153,187,.15)",
            borderRadius: 3,
            animation: "fadeUp .25s both",
          }}>
            <div style={{
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: ".65rem", color: "#0099bb",
              letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 10,
            }}>
              // INFORMATIONS
            </div>
            <div style={{
              fontFamily: "'Rajdhani',sans-serif",
              fontSize: ".88rem", color: "#1a0022", lineHeight: 1.8,
            }}>
              <div>📦 Retrait sur place disponible</div>
              <div>🕐 Ferme à 21h00</div>
              <div>📍 {relay.address}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
