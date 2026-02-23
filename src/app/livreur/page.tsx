"use client";

import { useEffect, useState, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, updateDoc, query, where, getDocs } from "firebase/firestore";

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

type Order = {
  id: string; phone: string; items: string; total: number; status: string;
  createdAt: string; name?: string; address?: string; orderNumber?: number;
  orderType?: string; paidOnline?: boolean; assignedDriver?: string;
};

export default function LivreurPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [driverData, setDriverData] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"pending"|"delivered">("pending");
  const [toast, setToast] = useState({ msg: "", show: false });
  const [stats, setStats] = useState({ today: 0, total: 0, todayRevenue: 0 });

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      setLoginError("Remplis tous les champs.");
      return;
    }
    setLoginError("");
    const snap = await getDocs(query(
      collection(db, "driver_applications"),
      where("phone", "==", phone.trim()),
      where("status", "==", "accepte")
    ));
    if (snap.empty) {
      setLoginError("Aucun compte livreur trouvé avec ce numéro.");
      return;
    }
    const driverDoc = snap.docs[0];
    const data = driverDoc.data();
    if (data.password !== password) {
      setLoginError("Mot de passe incorrect.");
      return;
    }
    setDriverData({ id: driverDoc.id, ...data });
    setLoggedIn(true);
    try { localStorage.setItem("yassala_driver", JSON.stringify({ phone: phone.trim() })); } catch {}
  };

  const loadOrders = useCallback(() => {
    if (!driverData) return () => {};
    const unsub = onSnapshot(collection(db, "orders"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const driverOrders = all.filter(o =>
        o.assignedDriver === driverData.id ||
        (o.status === "en_cours" && !o.assignedDriver)
      );
      setOrders(driverOrders);

      const todayStr = new Date().toISOString().slice(0, 10);
      const myDelivered = all.filter(o => o.assignedDriver === driverData.id && o.status === "livre");
      const todayDelivered = myDelivered.filter(o => o.createdAt.slice(0, 10) === todayStr);
      setStats({
        today: todayDelivered.length,
        total: myDelivered.length,
        todayRevenue: todayDelivered.reduce((s, o) => s + Number(o.total), 0),
      });
    });
    return unsub;
  }, [driverData]);

  useEffect(() => {
    const unsub = loadOrders();
    return () => { if (unsub) unsub(); };
  }, [loadOrders]);

  const acceptOrder = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), { assignedDriver: driverData.id });
    showToast("Commande prise en charge !");
  };

  const markDelivered = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), { status: "livre", deliveredAt: new Date().toISOString() });
    showToast("Commande marquée comme livrée !");
  };

  const pendingOrders = orders.filter(o => o.status === "en_cours");
  const deliveredOrders = orders.filter(o => o.status === "livre" && o.assignedDriver === driverData?.id);
  const displayOrders = filter === "pending" ? pendingOrders : deliveredOrders;

  if (!loggedIn) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        input{outline:none;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
        background:"radial-gradient(ellipse 60% 60% at 50% 40%,rgba(0,245,255,.06) 0%,transparent 70%)"}}>
        <div style={{width:"100%",maxWidth:400,padding:"0 20px",animation:"fadeUp .5s both"}}>
          <div style={{textAlign:"center",marginBottom:36}}>
            <div style={{fontSize:"3rem",marginBottom:8}}>🏍️</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"2rem",
              background:"linear-gradient(135deg,#00f5ff,#ff2d78)",WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",letterSpacing:".04em"}}>
              ESPACE LIVREUR
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginTop:6}}>YASSALA NIGHT DELIVERY</div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(0,245,255,.15)",borderRadius:14,padding:28}}>
            <div style={{marginBottom:16}}>
              <label style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
                letterSpacing:".12em",display:"block",marginBottom:6}}>TÉLÉPHONE</label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+594 6XX XXX XXX" type="tel"
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid rgba(0,245,255,.15)",
                  borderRadius:8,padding:"12px 14px",color:"#f0eeff",fontFamily:"'Rajdhani',sans-serif",fontSize:".95rem"}} />
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
                letterSpacing:".12em",display:"block",marginBottom:6}}>MOT DE PASSE</label>
              <input value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••" type="password"
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid rgba(0,245,255,.15)",
                  borderRadius:8,padding:"12px 14px",color:"#f0eeff",fontFamily:"'Rajdhani',sans-serif",fontSize:".95rem"}} />
            </div>
            {loginError && <div style={{color:"#ff2d78",fontSize:".82rem",fontFamily:"'Share Tech Mono',monospace",
              marginBottom:12}}>{loginError}</div>}
            <button onClick={handleLogin}
              style={{width:"100%",padding:"13px",borderRadius:10,border:"none",
                background:"linear-gradient(135deg,#00f5ff,#0090ff)",
                color:"#000",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                fontSize:"1rem",cursor:"pointer",letterSpacing:".08em",
                boxShadow:"0 4px 20px rgba(0,245,255,.3)"}}>
              CONNEXION →
            </button>
          </div>
          <div style={{textAlign:"center",marginTop:20}}>
            <a href="/" style={{color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
              fontSize:".78rem",textDecoration:"none",letterSpacing:".1em"}}>
              ← RETOUR AU SHOP
            </a>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:#0a0a12;}
        ::-webkit-scrollbar-thumb{background:#00f5ff;border-radius:2px;}
      `}</style>

      <div style={{position:"fixed",top:18,right:18,zIndex:10000,
        background:"rgba(184,255,0,.12)",border:"1px solid #b8ff00",
        borderRadius:10,padding:"12px 18px",fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
        color:"#b8ff00",maxWidth:260,boxShadow:"0 8px 32px rgba(0,0,0,.4)",
        transform: toast.show ? "translateX(0)" : "translateX(130%)",
        transition:"transform .4s cubic-bezier(.34,1.56,.64,1)"}}>
        {toast.msg}
      </div>

      <header style={{background:"rgba(10,10,18,.9)",borderBottom:"1px solid rgba(0,245,255,.1)",
        padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100,backdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:"1.4rem"}}>🏍️</span>
          <div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",
              background:"linear-gradient(135deg,#00f5ff,#ff2d78)",WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",letterSpacing:".04em"}}>YASSALA</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
              letterSpacing:".12em"}}>ESPACE LIVREUR</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:600,fontSize:".9rem"}}>{driverData?.name}</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>{driverData?.phone}</div>
          </div>
          <button onClick={() => { setLoggedIn(false); setDriverData(null); setPhone(""); setPassword(""); }}
            style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
              color:"#5a5470",padding:"6px 14px",borderRadius:6,
              fontFamily:"'Inter',sans-serif",fontSize:".82rem",cursor:"pointer"}}>
            Déconnexion
          </button>
        </div>
      </header>

      <div style={{maxWidth:800,margin:"0 auto",padding:"24px 16px",animation:"fadeUp .3s both"}}>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:28}}>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(0,245,255,.1)",
            borderRadius:12,padding:"18px 20px",borderLeft:"3px solid #00f5ff"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
              letterSpacing:".1em",marginBottom:4}}>AUJOURD&apos;HUI</div>
            <div style={{fontWeight:700,fontSize:"1.6rem",color:"#00f5ff"}}>{stats.today}</div>
            <div style={{fontSize:".78rem",color:"#5a5470"}}>livraison(s)</div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(184,255,0,.1)",
            borderRadius:12,padding:"18px 20px",borderLeft:"3px solid #b8ff00"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
              letterSpacing:".1em",marginBottom:4}}>TOTAL</div>
            <div style={{fontWeight:700,fontSize:"1.6rem",color:"#b8ff00"}}>{stats.total}</div>
            <div style={{fontSize:".78rem",color:"#5a5470"}}>livraison(s)</div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,45,120,.1)",
            borderRadius:12,padding:"18px 20px",borderLeft:"3px solid #ff2d78"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
              letterSpacing:".1em",marginBottom:4}}>CA DU JOUR</div>
            <div style={{fontWeight:700,fontSize:"1.6rem",color:"#ff2d78"}}>{stats.todayRevenue.toFixed(0)}€</div>
            <div style={{fontSize:".78rem",color:"#5a5470"}}>livré</div>
          </div>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:20}}>
          <button onClick={() => setFilter("pending")}
            style={{flex:1,padding:"12px",borderRadius:10,cursor:"pointer",fontWeight:600,fontSize:".9rem",
              letterSpacing:".04em",border:"none",transition:"all .2s",
              background: filter==="pending" ? "rgba(0,245,255,.12)" : "rgba(255,255,255,.03)",
              color: filter==="pending" ? "#00f5ff" : "#5a5470",
              boxShadow: filter==="pending" ? "0 0 12px rgba(0,245,255,.15)" : "none"}}>
            EN ATTENTE ({pendingOrders.length})
          </button>
          <button onClick={() => setFilter("delivered")}
            style={{flex:1,padding:"12px",borderRadius:10,cursor:"pointer",fontWeight:600,fontSize:".9rem",
              letterSpacing:".04em",border:"none",transition:"all .2s",
              background: filter==="delivered" ? "rgba(184,255,0,.12)" : "rgba(255,255,255,.03)",
              color: filter==="delivered" ? "#b8ff00" : "#5a5470",
              boxShadow: filter==="delivered" ? "0 0 12px rgba(184,255,0,.15)" : "none"}}>
            LIVRÉES ({deliveredOrders.length})
          </button>
        </div>

        {displayOrders.length === 0 ? (
          <div style={{textAlign:"center",color:"#5a5470",padding:"60px 20px",
            border:"1px dashed rgba(255,255,255,.08)",borderRadius:12}}>
            <div style={{fontSize:"2.5rem",marginBottom:12}}>{filter === "pending" ? "📭" : "📦"}</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",letterSpacing:".1em"}}>
              {filter === "pending" ? "Aucune commande en attente" : "Aucune livraison effectuée"}
            </div>
          </div>
        ) : (
          <div style={{display:"grid",gap:12}}>
            {displayOrders.map(o => (
              <div key={o.id} style={{background:"rgba(255,255,255,.02)",
                border:`1px solid ${o.assignedDriver === driverData?.id ? "rgba(0,245,255,.2)" : "rgba(255,255,255,.06)"}`,
                borderRadius:12,padding:"18px 20px",transition:"all .15s"}}>

                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:12}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",color:"#ff2d78"}}>
                        #{o.orderNumber ?? o.id.slice(-6).toUpperCase()}
                      </span>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#5a5470"}}>
                        {new Date(o.createdAt).toLocaleString("fr-FR")}
                      </span>
                      {o.paidOnline && (
                        <span style={{fontSize:".72rem",background:"rgba(184,255,0,.15)",color:"#b8ff00",
                          borderRadius:4,padding:"2px 8px",fontFamily:"'Share Tech Mono',monospace"}}>PAYÉ</span>
                      )}
                    </div>
                    <div style={{fontWeight:700,fontSize:"1rem"}}>{o.name || o.phone}</div>
                    {o.name && <div style={{fontSize:".82rem",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace"}}>{o.phone}</div>}
                  </div>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",
                    color:"#b8ff00",textShadow:"0 0 10px rgba(184,255,0,.3)",flexShrink:0}}>
                    {Number(o.total).toFixed(2)}€
                  </div>
                </div>

                {o.address && (
                  <div style={{background:"rgba(0,245,255,.06)",border:"1px solid rgba(0,245,255,.12)",
                    borderRadius:8,padding:"10px 14px",marginBottom:12,
                    fontSize:".9rem",display:"flex",alignItems:"center",gap:8}}>
                    <span>📍</span>
                    <span style={{color:"#00f5ff"}}>{o.address}</span>
                  </div>
                )}

                <div style={{background:"rgba(255,255,255,.02)",borderRadius:8,padding:"10px 14px",
                  marginBottom:14,border:"1px solid rgba(255,255,255,.04)"}}>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
                    letterSpacing:".1em",marginBottom:6}}>ARTICLES</div>
                  {o.items.split("\n").map((line, i) => (
                    <div key={i} style={{fontSize:".88rem",padding:"2px 0",color:"#d0d0e0"}}>{line}</div>
                  ))}
                </div>

                {filter === "pending" && (
                  <div style={{display:"flex",gap:8}}>
                    {!o.assignedDriver ? (
                      <button onClick={() => acceptOrder(o.id)}
                        style={{flex:1,padding:"12px",borderRadius:10,border:"none",
                          background:"linear-gradient(135deg,#00f5ff,#0090ff)",
                          color:"#000",fontWeight:700,fontSize:".9rem",cursor:"pointer",
                          letterSpacing:".06em",boxShadow:"0 4px 16px rgba(0,245,255,.25)"}}>
                        🏍️ PRENDRE EN CHARGE
                      </button>
                    ) : (
                      <button onClick={() => markDelivered(o.id)}
                        style={{flex:1,padding:"12px",borderRadius:10,border:"none",
                          background:"linear-gradient(135deg,#b8ff00,#7acc00)",
                          color:"#000",fontWeight:700,fontSize:".9rem",cursor:"pointer",
                          letterSpacing:".06em",boxShadow:"0 4px 16px rgba(184,255,0,.25)"}}>
                        ✓ MARQUER COMME LIVRÉ
                      </button>
                    )}
                    <a href={`tel:${o.phone}`}
                      style={{padding:"12px 16px",borderRadius:10,
                        background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
                        color:"#00f5ff",display:"flex",alignItems:"center",justifyContent:"center",
                        textDecoration:"none",fontSize:"1.1rem",flexShrink:0}}>
                      📞
                    </a>
                  </div>
                )}

                {filter === "delivered" && (
                  <div style={{display:"flex",alignItems:"center",gap:8,
                    padding:"8px 12px",background:"rgba(184,255,0,.06)",borderRadius:8,
                    border:"1px solid rgba(184,255,0,.12)"}}>
                    <span style={{color:"#b8ff00"}}>✓</span>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#b8ff00"}}>
                      LIVRÉ
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
