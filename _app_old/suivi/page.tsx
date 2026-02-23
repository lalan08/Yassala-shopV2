"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

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

type Order = {
  id?: string; items: string; total: number; status: string;
  createdAt: string; phone: string; name?: string; address?: string;
  discount?: number; coupon?: string; deliveryFee?: number;
};

const STEPS = [
  { key: "nouveau",   label: "Commande reçue",        icon: "📥", desc: "Votre commande a bien été enregistrée." },
  { key: "en_cours",  label: "En préparation",         icon: "🔥", desc: "Votre commande est en cours de préparation." },
  { key: "livre",     label: "Livré",                  icon: "🛵", desc: "Votre commande a été livrée. Bonne soirée !" },
];

function SuiviContent() {
  const params = useSearchParams();
  const id = params.get("id");
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); return; }
    const unsub = onSnapshot(doc(db, "orders", id), snap => {
      if (!snap.exists()) { setNotFound(true); return; }
      setOrder({ id: snap.id, ...snap.data() } as Order);
    });
    return () => unsub();
  }, [id]);

  const stepIdx = order ? STEPS.findIndex(s => s.key === order.status) : -1;
  const isCancelled = order?.status === "annule";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#04020a;color:#f0eeff;font-family:'Rajdhani',sans-serif;min-height:100vh;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
        .spin{animation:pulse 1.2s infinite;}
      `}</style>

      <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 24px",
        borderBottom:"1px solid rgba(255,45,120,.2)",background:"rgba(4,2,10,.9)",backdropFilter:"blur(20px)",
        position:"sticky",top:0,zIndex:100}}>
        <a href="/" style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",color:"#ff2d78",
          textShadow:"0 0 16px rgba(255,45,120,.5)",textDecoration:"none",letterSpacing:".06em"}}>
          YASSALA
        </a>
        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470",
          letterSpacing:".1em"}}>SUIVI DE COMMANDE</span>
      </nav>

      <main style={{maxWidth:560,margin:"0 auto",padding:"40px 20px",animation:"fadeUp .4s both"}}>
        {!id && (
          <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",padding:"60px 0"}}>
            // Aucun identifiant de commande fourni.
          </div>
        )}

        {id && !order && !notFound && (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div className="spin" style={{fontSize:"2rem",marginBottom:12}}>⏳</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",color:"#5a5470"}}>// chargement...</div>
          </div>
        )}

        {notFound && (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:"2.5rem",marginBottom:16}}>❌</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",color:"#ff2d78",marginBottom:8}}>
              COMMANDE INTROUVABLE
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",color:"#5a5470",marginBottom:24}}>
              Vérifiez le lien ou contactez-nous via WhatsApp.
            </div>
            <a href="/" style={{background:"#ff2d78",color:"#000",borderRadius:4,padding:"12px 24px",
              fontFamily:"'Rajdhani',sans-serif",fontWeight:700,textDecoration:"none",fontSize:".9rem",
              letterSpacing:".1em",textTransform:"uppercase"}}>
              RETOUR AU SHOP
            </a>
          </div>
        )}

        {order && (
          <div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.6rem",letterSpacing:".04em",marginBottom:6}}>
              {isCancelled ? "❌" : "📦"} <span style={{color: isCancelled ? "#ff2d78" : "#f0eeff"}}>
                {isCancelled ? "COMMANDE ANNULÉE" : "SUIVI DE COMMANDE"}
              </span>
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470",marginBottom:28,letterSpacing:".1em"}}>
              #{(order.id || "").slice(-8).toUpperCase()} · {new Date(order.createdAt).toLocaleString("fr-FR")}
            </div>

            {/* Progress bar */}
            {!isCancelled && (
              <div style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,padding:"24px",marginBottom:24}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:0}}>
                  {STEPS.map((step, i) => {
                    const done = i <= stepIdx;
                    const active = i === stepIdx;
                    return (
                      <div key={step.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative"}}>
                        {/* Connector line */}
                        {i < STEPS.length - 1 && (
                          <div style={{position:"absolute",top:20,left:"50%",width:"100%",height:2,
                            background: i < stepIdx ? "#b8ff00" : "rgba(255,255,255,.08)",
                            transition:"background .5s"}} />
                        )}
                        {/* Circle */}
                        <div style={{width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",
                          justifyContent:"center",fontSize:"1.2rem",position:"relative",zIndex:1,marginBottom:8,
                          border:`2px solid ${active ? "#ff2d78" : done ? "#b8ff00" : "rgba(255,255,255,.1)"}`,
                          background: active ? "rgba(255,45,120,.15)" : done ? "rgba(184,255,0,.1)" : "#080514",
                          boxShadow: active ? "0 0 12px rgba(255,45,120,.4)" : done ? "0 0 8px rgba(184,255,0,.3)" : "none",
                          transition:"all .4s"}}>
                          {step.icon}
                        </div>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",letterSpacing:".06em",
                          color: active ? "#ff2d78" : done ? "#b8ff00" : "#5a5470",textAlign:"center",lineHeight:1.3}}>
                          {step.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {stepIdx >= 0 && (
                  <div style={{marginTop:20,padding:"14px",background:"rgba(255,45,120,.06)",borderRadius:6,
                    fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#f0eeff",textAlign:"center",
                    borderLeft:"3px solid #ff2d78"}}>
                    {STEPS[stepIdx]?.desc}
                  </div>
                )}
              </div>
            )}

            {/* Order detail */}
            <div style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,padding:"20px 24px",marginBottom:16}}>
              <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".85rem",letterSpacing:".08em",
                color:"#5a5470",marginBottom:14}}>DÉTAIL DE LA COMMANDE</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#f0eeff",lineHeight:1.9,
                borderLeft:"2px solid rgba(255,45,120,.3)",paddingLeft:12,marginBottom:16}}>
                {order.items.split("\n").map((line, i) => <div key={i}>{line}</div>)}
              </div>
              {(order.discount ?? 0) > 0 && (
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,
                  fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem"}}>
                  <span style={{color:"#b8ff00"}}>Réduction ({order.coupon})</span>
                  <span style={{color:"#b8ff00"}}>-{Number(order.discount).toFixed(2)}€</span>
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",
                fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12}}>
                <span style={{color:"#ff2d78"}}>TOTAL</span>
                <span style={{color:"#b8ff00",textShadow:"0 0 12px rgba(184,255,0,.4)"}}>
                  {Number(order.total).toFixed(2)}€
                </span>
              </div>
            </div>

            <div style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,padding:"16px 20px",marginBottom:24}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470",marginBottom:8}}>LIVRAISON</div>
              <div style={{fontWeight:700,marginBottom:2}}>{order.name}</div>
              {order.address && <div style={{fontSize:".82rem",color:"#5a5470"}}>📍 {order.address}</div>}
            </div>

            <a href="/" style={{display:"block",textAlign:"center",background:"transparent",
              border:"1px solid rgba(255,45,120,.3)",color:"#ff2d78",borderRadius:4,padding:"12px",
              fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",letterSpacing:".08em",
              textDecoration:"none",textTransform:"uppercase"}}>
              ← RETOUR AU SHOP
            </a>
          </div>
        )}
      </main>
    </>
  );
}

export default function SuiviPage() {
  return (
    <Suspense fallback={
      <div style={{background:"#04020a",minHeight:"100vh",display:"flex",alignItems:"center",
        justifyContent:"center",color:"#5a5470",fontFamily:"monospace"}}>
        Chargement...
      </div>
    }>
      <SuiviContent />
    </Suspense>
  );
}
