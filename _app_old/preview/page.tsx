"use client";

import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

type Product = { id: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; };

const cats = [
  { key: "all",        label: "TOUT" },
  { key: "biere",      label: "🍺 BIÈRES" },
  { key: "cocktail",   label: "🍹 COCKTAILS" },
  { key: "spiritueux", label: "🥃 SPIRITUEUX" },
  { key: "snack",      label: "🍟 SNACKS" },
  { key: "snack_peyi", label: "🍖 PÉYI" },
];

export default function Preview() {
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [cart, setCart] = useState<{id:string;name:string;price:number;qty:number}[]>([]);
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    return () => unsub();
  }, []);

  const filtered = products.filter(p => activeCat === "all" || p.cat === activeCat);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const addToCart = (p: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  };

  const toggleLike = (id: string) => {
    setLikes(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const badgeColor = (badge: string) => {
    if (badge === "HOT") return { bg: "#ff2d78", label: "🔥 HOT" };
    if (badge === "NEW") return { bg: "#00f5ff", label: "✦ NEW" };
    if (badge === "COOL") return { bg: "#b8ff00", label: "❄ COOL" };
    return null;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{background:#04020a;color:#f0eeff;font-family:'Rajdhani',sans-serif;font-weight:500;min-height:100vh;overflow-x:hidden;}
        body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.07) 2px,rgba(0,0,0,.07) 4px);}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.4);}}
        .card-in{animation:fadeUp .35s both;}
        ::-webkit-scrollbar{width:0;}
        /* nav pills scroll */
        .cats-scroll{display:flex;gap:8px;overflow-x:auto;padding:0 14px 10px;scroll-snap-type:x mandatory;}
        .cats-scroll::-webkit-scrollbar{display:none;}
        .cat-pill{scroll-snap-align:start;white-space:nowrap;flex-shrink:0;padding:7px 16px;
          border-radius:20px;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:.75rem;
          letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border:none;transition:all .2s;}
        /* product card */
        .pcard{background:#0c0918;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.07);
          transition:border-color .25s,box-shadow .25s;margin-bottom:14px;}
        .pcard:active{transform:scale(.985);}
        /* heart btn */
        .heart-btn{background:rgba(4,2,10,.65);backdrop-filter:blur(6px);
          border:1px solid rgba(255,255,255,.15);border-radius:50%;width:34px;height:34px;
          display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1rem;transition:all .2s;}
        /* bottom nav */
        .bottom-nav{position:fixed;bottom:0;left:0;right:0;
          background:rgba(8,5,20,.95);backdrop-filter:blur(20px);
          border-top:1px solid rgba(255,45,120,.25);
          display:flex;align-items:stretch;z-index:100;
          padding-bottom:env(safe-area-inset-bottom);}
        .bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:3px;padding:10px 0;background:transparent;border:none;cursor:pointer;
          font-family:'Share Tech Mono',monospace;font-size:.55rem;letter-spacing:.08em;
          text-transform:uppercase;transition:color .2s;}
        /* add to cart btn */
        .add-btn{border:none;border-radius:8px;padding:11px 0;font-family:'Rajdhani',sans-serif;
          font-weight:700;font-size:.85rem;letter-spacing:.1em;text-transform:uppercase;
          cursor:pointer;transition:all .2s;width:100%;}
        .add-btn:active{transform:scale(.97);}
        /* top bar */
        .topbar{position:sticky;top:0;z-index:50;background:rgba(4,2,10,.92);backdrop-filter:blur(18px);
          border-bottom:1px solid rgba(255,45,120,.2);padding:12px 16px 0;}
      `}</style>

      {/* ── TOP BAR ── */}
      <div className="topbar">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.5rem",
              color:"#ff2d78",textShadow:"0 0 16px rgba(255,45,120,.55)",lineHeight:1}}>
              YASSALA
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".58rem",
              color:"#00f5ff",letterSpacing:".2em",marginTop:1}}>Night Shop</div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {/* Badge OPEN */}
            <div style={{display:"flex",alignItems:"center",gap:6,
              border:"1px solid #b8ff00",borderRadius:20,padding:"5px 12px",
              fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
              letterSpacing:".1em",color:"#b8ff00"}}>
              <div style={{width:5,height:5,background:"#b8ff00",borderRadius:"50%",
                animation:"pulse 1.5s infinite"}} />
              OPEN
            </div>

            {/* Cart icon */}
            <div style={{position:"relative",cursor:"pointer"}}>
              <div style={{width:38,height:38,background:"rgba(255,45,120,.1)",
                border:"1px solid rgba(255,45,120,.4)",borderRadius:10,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem"}}>
                🛒
              </div>
              {cartCount > 0 && (
                <span style={{position:"absolute",top:-4,right:-4,
                  background:"#ff2d78",color:"#000",borderRadius:"50%",
                  width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:".58rem",fontWeight:900}}>
                  {cartCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Catégories scrollables */}
        <div className="cats-scroll">
          {cats.map(c => (
            <button key={c.key} className="cat-pill"
              onClick={() => setActiveCat(c.key)}
              style={{
                background: activeCat===c.key ? "#ff2d78" : "rgba(255,255,255,.05)",
                color: activeCat===c.key ? "#000" : "#5a5470",
                border: activeCat===c.key ? "1px solid #ff2d78" : "1px solid rgba(255,255,255,.08)",
                boxShadow: activeCat===c.key ? "0 0 12px rgba(255,45,120,.35)" : "none",
              }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PRODUCT LIST ── */}
      <div style={{padding:"16px 14px 100px",maxWidth:480,margin:"0 auto"}}>

        {/* Titre section */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",letterSpacing:".06em"}}>
            {activeCat==="all"
              ? <><span style={{color:"#ff2d78"}}>TOUS</span> LES PRODUITS</>
              : <><span style={{color:"#ff2d78"}}>{cats.find(c=>c.key===activeCat)?.label.toUpperCase()}</span></>
            }
          </div>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
            color:"#5a5470",letterSpacing:".1em"}}>
            {filtered.length} ARTICLES
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
            padding:"60px 20px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.08)",borderRadius:12}}>
            // chargement...
          </div>
        ) : filtered.map((p, idx) => {
          const badge = badgeColor(p.badge);
          const inCart = cart.find(i => i.id === p.id);
          const liked = likes.has(p.id);
          return (
            <div key={p.id} className="pcard card-in"
              style={{animationDelay:`${idx * 0.04}s`,
                border: p.stock===0 ? "1px solid rgba(255,255,255,.04)" : "1px solid rgba(255,255,255,.07)",
                opacity: p.stock===0 ? 0.55 : 1}}>

              {/* Image */}
              <div style={{position:"relative",aspectRatio:"16/9",background:"#080514",overflow:"hidden"}}>
                {p.image ? (
                  <img src={p.image} alt={p.name}
                    style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
                ) : (
                  <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:"3rem",opacity:.3}}>
                    {p.cat==="biere"?"🍺":p.cat==="cocktail"?"🍹":p.cat==="spiritueux"?"🥃":p.cat==="snack"?"🍟":"🍖"}
                  </div>
                )}

                {/* Gradient overlay bottom */}
                <div style={{position:"absolute",bottom:0,left:0,right:0,height:"45%",
                  background:"linear-gradient(to top,rgba(12,9,24,.95),transparent)",pointerEvents:"none"}} />

                {/* Badge */}
                {badge && (
                  <div style={{position:"absolute",top:10,left:10,
                    background:badge.bg,color:"#000",
                    fontFamily:"'Share Tech Mono',monospace",fontSize:".58rem",
                    fontWeight:700,letterSpacing:".12em",padding:"3px 8px",borderRadius:4}}>
                    {badge.label}
                  </div>
                )}

                {/* Rupture */}
                {p.stock===0 && (
                  <div style={{position:"absolute",top:10,left:10,
                    background:"rgba(90,84,112,.85)",color:"#f0eeff",
                    fontFamily:"'Share Tech Mono',monospace",fontSize:".58rem",
                    letterSpacing:".1em",padding:"3px 8px",borderRadius:4}}>
                    ÉPUISÉ
                  </div>
                )}

                {/* Heart */}
                <button className="heart-btn" onClick={() => toggleLike(p.id)}
                  style={{position:"absolute",top:10,right:10,
                    borderColor: liked ? "rgba(255,45,120,.5)" : "rgba(255,255,255,.15)"}}>
                  <span style={{color: liked ? "#ff2d78" : "#5a5470",
                    filter: liked ? "drop-shadow(0 0 6px rgba(255,45,120,.7))" : "none",
                    fontSize:"1rem",lineHeight:1}}>
                    {liked ? "♥" : "♡"}
                  </span>
                </button>

                {/* Prix en overlay bas */}
                <div style={{position:"absolute",bottom:10,left:14,
                  fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",
                  color:"#f0eeff",textShadow:"0 0 14px rgba(0,0,0,.9)",lineHeight:1}}>
                  {p.price.toFixed(2)}€
                </div>
              </div>

              {/* Infos */}
              <div style={{padding:"12px 14px 14px"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:4}}>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:".95rem",
                    letterSpacing:".04em",lineHeight:1.25,color:"#f0eeff"}}>
                    {p.name}
                  </div>
                  {inCart && (
                    <div style={{flexShrink:0,fontFamily:"'Share Tech Mono',monospace",
                      fontSize:".6rem",color:"#b8ff00",border:"1px solid rgba(184,255,0,.35)",
                      borderRadius:4,padding:"2px 7px",letterSpacing:".08em"}}>
                      ×{inCart.qty}
                    </div>
                  )}
                </div>

                {p.desc ? (
                  <p style={{fontSize:".78rem",color:"#5a5470",lineHeight:1.5,marginBottom:12,
                    display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                    {p.desc}
                  </p>
                ) : <div style={{marginBottom:12}} />}

                <button className="add-btn"
                  disabled={p.stock===0}
                  onClick={() => addToCart(p)}
                  style={{
                    background: p.stock===0 ? "rgba(90,84,112,.2)" : inCart ? "rgba(184,255,0,.1)" : "#ff2d78",
                    color: p.stock===0 ? "#5a5470" : inCart ? "#b8ff00" : "#000",
                    border: p.stock===0 ? "1px solid rgba(90,84,112,.3)" : inCart ? "1px solid rgba(184,255,0,.4)" : "none",
                    cursor: p.stock===0 ? "not-allowed" : "pointer",
                    boxShadow: inCart ? "0 0 12px rgba(184,255,0,.2)" : p.stock===0 ? "none" : "0 0 14px rgba(255,45,120,.3)",
                  }}>
                  {p.stock===0 ? "ÉPUISÉ" : inCart ? `✓ DANS LE PANIER (${inCart.qty})` : "AJOUTER AU PANIER →"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="bottom-nav">
        {[
          { key:"home",  icon:"⊞", label:"ACCUEIL" },
          { key:"fire",  icon:"🔥", label:"TENDANCE" },
          { key:"cart",  icon:"🛒", label:"PANIER",  badge: cartCount },
          { key:"user",  icon:"◎", label:"COMPTE" },
        ].map(tab => (
          <button key={tab.key} className="bnav-btn"
            onClick={() => setActiveTab(tab.key)}
            style={{color: activeTab===tab.key ? "#ff2d78" : "#5a5470",
              borderTop: activeTab===tab.key ? "2px solid #ff2d78" : "2px solid transparent"}}>
            <div style={{position:"relative",display:"inline-block"}}>
              <span style={{fontSize:"1.25rem",lineHeight:1,
                filter: activeTab===tab.key ? "drop-shadow(0 0 6px rgba(255,45,120,.7))" : "none"}}>
                {tab.icon}
              </span>
              {"badge" in tab && tab.badge && tab.badge > 0 ? (
                <span style={{position:"absolute",top:-4,right:-8,
                  background:"#ff2d78",color:"#000",borderRadius:"50%",
                  width:14,height:14,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:".48rem",fontWeight:900}}>
                  {tab.badge}
                </span>
              ) : null}
            </div>
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}
