"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  assignedDriverName?: string; deliveredAt?: string;
};

export default function LivreurPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [driverData, setDriverData] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"available"|"mine"|"delivered">("available");
  const [toast, setToast] = useState({ msg: "", show: false });
  const [stats, setStats] = useState({ today: 0, total: 0, todayRevenue: 0 });
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const prevOrderCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [confirmAction, setConfirmAction] = useState<{id: string; type: "take"|"deliver"} | null>(null);

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  const playAlert = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("yassala_driver");
      if (saved) {
        const { phone: savedPhone } = JSON.parse(saved);
        if (savedPhone) setPhone(savedPhone);
      }
    } catch {}
  }, []);

  const loadOrders = useCallback(() => {
    if (!driverData) return () => {};
    const unsub = onSnapshot(collection(db, "orders"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const available = all.filter(o =>
        (o.status === "nouveau" || o.status === "en_cours") && !o.assignedDriver
      );
      const mine = all.filter(o => o.assignedDriver === driverData.id && o.status !== "livre");
      const delivered = all.filter(o => o.assignedDriver === driverData.id && o.status === "livre");

      const relevantOrders = [...available, ...mine, ...delivered];
      const uniqueOrders = relevantOrders.filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i);
      setOrders(uniqueOrders);

      if (available.length > prevOrderCountRef.current && prevOrderCountRef.current > 0) {
        playAlert();
        setNewOrderAlert(true);
        setTimeout(() => setNewOrderAlert(false), 5000);
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
      }
      prevOrderCountRef.current = available.length;

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayDelivered = delivered.filter(o => (o.deliveredAt || o.createdAt).slice(0, 10) === todayStr);
      setStats({
        today: todayDelivered.length,
        total: delivered.length,
        todayRevenue: todayDelivered.reduce((s, o) => s + Number(o.total), 0),
      });
    });
    return unsub;
  }, [driverData]);

  useEffect(() => {
    const unsub = loadOrders();
    return () => { if (unsub) unsub(); };
  }, [loadOrders]);

  const takeOrder = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), {
      assignedDriver: driverData.id,
      assignedDriverName: driverData.name,
      status: "en_cours",
    });
    showToast("Commande prise en charge !");
    setConfirmAction(null);
  };

  const markDelivered = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), {
      status: "livre",
      deliveredAt: new Date().toISOString(),
    });
    showToast("Commande marquée comme livrée !");
    setConfirmAction(null);
  };

  const availableOrders = orders.filter(o => (o.status === "nouveau" || o.status === "en_cours") && !o.assignedDriver);
  const myOrders = orders.filter(o => o.assignedDriver === driverData?.id && o.status !== "livre");
  const deliveredOrders = orders.filter(o => o.assignedDriver === driverData?.id && o.status === "livre");

  const displayOrders = filter === "available" ? availableOrders
    : filter === "mine" ? myOrders
    : deliveredOrders;

  const statusLabel = (s: string) =>
    s === "nouveau" ? "NOUVELLE" : s === "en_cours" ? "EN COURS" : s === "livre" ? "LIVRÉE" : s.toUpperCase();
  const statusColor = (s: string) =>
    s === "nouveau" ? "#ff2d78" : s === "en_cours" ? "#ff9500" : s === "livre" ? "#b8ff00" : "#5a5470";

  const timeSince = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    return `il y a ${hrs}h${mins % 60 > 0 ? (mins % 60) + "min" : ""}`;
  };

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
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 8px rgba(255,45,120,.3)}50%{box-shadow:0 0 20px rgba(255,45,120,.6)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:#0a0a12;}
        ::-webkit-scrollbar-thumb{background:#00f5ff;border-radius:2px;}
      `}</style>

      {/* Toast */}
      <div style={{position:"fixed",top:18,right:18,zIndex:10000,
        background:"rgba(184,255,0,.12)",border:"1px solid #b8ff00",
        borderRadius:10,padding:"12px 18px",fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
        color:"#b8ff00",maxWidth:280,boxShadow:"0 8px 32px rgba(0,0,0,.4)",
        transform: toast.show ? "translateX(0)" : "translateX(130%)",
        transition:"transform .4s cubic-bezier(.34,1.56,.64,1)"}}>
        {toast.msg}
      </div>

      {/* New Order Alert Banner */}
      {newOrderAlert && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,
          background:"linear-gradient(135deg,#ff2d78,#ff6b35)",
          padding:"14px 20px",textAlign:"center",
          fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",
          color:"#fff",letterSpacing:".08em",
          animation:"slideIn .3s both",
          boxShadow:"0 4px 30px rgba(255,45,120,.5)"}}>
          🔔 NOUVELLE COMMANDE DISPONIBLE !
        </div>
      )}

      {/* Confirm Modal */}
      {confirmAction && (
        <div style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,.75)",
          backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={() => setConfirmAction(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{background:"#0c0918",border:"1px solid rgba(0,245,255,.2)",borderRadius:16,
              padding:"30px 28px",maxWidth:380,width:"100%",textAlign:"center",
              animation:"slideIn .2s both"}}>
            <div style={{fontSize:"2.5rem",marginBottom:14}}>
              {confirmAction.type === "take" ? "🏍️" : "✅"}
            </div>
            <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.2rem",
              marginBottom:8,color:"#f0eeff"}}>
              {confirmAction.type === "take" ? "Prendre cette commande ?" : "Confirmer la livraison ?"}
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              marginBottom:24}}>
              {confirmAction.type === "take"
                ? "Tu seras responsable de cette livraison."
                : "Cette commande sera marquée comme livrée."}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={() => setConfirmAction(null)}
                style={{flex:1,padding:"13px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",
                  background:"transparent",color:"#5a5470",fontFamily:"'Rajdhani',sans-serif",
                  fontWeight:700,fontSize:".95rem",cursor:"pointer"}}>
                ANNULER
              </button>
              <button onClick={() => confirmAction.type === "take" ? takeOrder(confirmAction.id) : markDelivered(confirmAction.id)}
                style={{flex:1,padding:"13px",borderRadius:10,border:"none",
                  background: confirmAction.type === "take"
                    ? "linear-gradient(135deg,#00f5ff,#0090ff)"
                    : "linear-gradient(135deg,#b8ff00,#7acc00)",
                  color:"#000",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".95rem",
                  cursor:"pointer",boxShadow: confirmAction.type === "take"
                    ? "0 4px 16px rgba(0,245,255,.3)"
                    : "0 4px 16px rgba(184,255,0,.3)"}}>
                CONFIRMER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{background:"rgba(10,10,18,.95)",borderBottom:"1px solid rgba(0,245,255,.1)",
        padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100,backdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:"1.4rem"}}>🏍️</span>
          <div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",
              background:"linear-gradient(135deg,#00f5ff,#ff2d78)",WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",letterSpacing:".04em"}}>YASSALA</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",color:"#5a5470",
              letterSpacing:".12em"}}>ESPACE LIVREUR</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:600,fontSize:".85rem"}}>{driverData?.name}</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470"}}>{driverData?.zone || driverData?.phone}</div>
          </div>
          <button onClick={() => { setLoggedIn(false); setDriverData(null); setPhone(""); setPassword(""); localStorage.removeItem("yassala_driver"); }}
            style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
              color:"#5a5470",padding:"6px 12px",borderRadius:6,
              fontFamily:"'Inter',sans-serif",fontSize:".78rem",cursor:"pointer"}}>
            ✕
          </button>
        </div>
      </header>

      <div style={{maxWidth:600,margin:"0 auto",padding:"20px 14px",animation:"fadeUp .3s both"}}>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:22}}>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(0,245,255,.1)",
            borderRadius:12,padding:"14px 16px",borderLeft:"3px solid #00f5ff"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
              letterSpacing:".08em",marginBottom:2}}>AUJOURD&apos;HUI</div>
            <div style={{fontWeight:700,fontSize:"1.5rem",color:"#00f5ff"}}>{stats.today}</div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(184,255,0,.1)",
            borderRadius:12,padding:"14px 16px",borderLeft:"3px solid #b8ff00"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
              letterSpacing:".08em",marginBottom:2}}>TOTAL</div>
            <div style={{fontWeight:700,fontSize:"1.5rem",color:"#b8ff00"}}>{stats.total}</div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,45,120,.1)",
            borderRadius:12,padding:"14px 16px",borderLeft:"3px solid #ff2d78"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
              letterSpacing:".08em",marginBottom:2}}>CA JOUR</div>
            <div style={{fontWeight:700,fontSize:"1.5rem",color:"#ff2d78"}}>{stats.todayRevenue.toFixed(0)}€</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:6,marginBottom:18}}>
          {([
            { key: "available" as const, label: "DISPONIBLES", count: availableOrders.length, color: "#ff2d78" },
            { key: "mine" as const, label: "MES COURSES", count: myOrders.length, color: "#00f5ff" },
            { key: "delivered" as const, label: "LIVRÉES", count: deliveredOrders.length, color: "#b8ff00" },
          ]).map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              style={{flex:1,padding:"10px 6px",borderRadius:10,cursor:"pointer",fontWeight:600,
                fontSize:".78rem",letterSpacing:".04em",border:"none",transition:"all .2s",
                background: filter===t.key ? `${t.color}18` : "rgba(255,255,255,.02)",
                color: filter===t.key ? t.color : "#5a5470",
                boxShadow: filter===t.key ? `0 0 12px ${t.color}22` : "none",
                position:"relative"}}>
              {t.label}
              {t.count > 0 && (
                <span style={{marginLeft:5,background: filter===t.key ? t.color : "rgba(255,255,255,.1)",
                  color: filter===t.key ? "#000" : "#5a5470",
                  borderRadius:10,padding:"1px 7px",fontSize:".72rem",fontWeight:700,
                  animation: t.key === "available" && t.count > 0 ? "pulseGlow 2s infinite" : "none"}}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Orders */}
        {displayOrders.length === 0 ? (
          <div style={{textAlign:"center",color:"#5a5470",padding:"50px 20px",
            border:"1px dashed rgba(255,255,255,.08)",borderRadius:12}}>
            <div style={{fontSize:"2.5rem",marginBottom:10}}>
              {filter === "available" ? "📭" : filter === "mine" ? "🏍️" : "📦"}
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",letterSpacing:".1em"}}>
              {filter === "available" ? "Aucune commande disponible" :
               filter === "mine" ? "Aucune course en cours" :
               "Aucune livraison effectuée"}
            </div>
          </div>
        ) : (
          <div style={{display:"grid",gap:10}}>
            {displayOrders.map(o => {
              const isMine = o.assignedDriver === driverData?.id;
              return (
                <div key={o.id} style={{background:"rgba(255,255,255,.02)",
                  border:`1px solid ${o.status === "nouveau" && !o.assignedDriver ? "rgba(255,45,120,.3)" : isMine ? "rgba(0,245,255,.2)" : "rgba(255,255,255,.06)"}`,
                  borderRadius:12,padding:"16px 18px",transition:"all .15s",
                  animation: o.status === "nouveau" && !o.assignedDriver ? "pulseGlow 3s infinite" : "none"}}>

                  {/* Header */}
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                        <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.05rem",color:"#ff2d78"}}>
                          #{o.orderNumber ?? o.id.slice(-6).toUpperCase()}
                        </span>
                        <span style={{fontSize:".7rem",
                          background:`${statusColor(o.status)}18`,
                          color:statusColor(o.status),
                          borderRadius:4,padding:"2px 8px",
                          fontFamily:"'Share Tech Mono',monospace",fontWeight:600,
                          border:`1px solid ${statusColor(o.status)}33`}}>
                          {statusLabel(o.status)}
                        </span>
                        {o.paidOnline && (
                          <span style={{fontSize:".7rem",background:"rgba(184,255,0,.12)",color:"#b8ff00",
                            borderRadius:4,padding:"2px 8px",fontFamily:"'Share Tech Mono',monospace"}}>💳 PAYÉ</span>
                        )}
                      </div>
                      <div style={{fontSize:".72rem",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace"}}>
                        {timeSince(o.createdAt)}
                      </div>
                    </div>
                    <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",
                      color:"#b8ff00",textShadow:"0 0 10px rgba(184,255,0,.3)",flexShrink:0}}>
                      {Number(o.total).toFixed(2)}€
                    </div>
                  </div>

                  {/* Client info */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,
                    padding:"10px 12px",background:"rgba(255,255,255,.02)",borderRadius:8,
                    border:"1px solid rgba(255,255,255,.04)"}}>
                    <div style={{width:36,height:36,borderRadius:"50%",
                      background:"rgba(0,245,255,.08)",border:"1px solid rgba(0,245,255,.15)",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0}}>
                      👤
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:".92rem"}}>{o.name || "Client"}</div>
                      <div style={{fontSize:".78rem",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace"}}>{o.phone}</div>
                    </div>
                    <a href={`tel:${o.phone}`}
                      style={{width:36,height:36,borderRadius:"50%",
                        background:"rgba(0,245,255,.1)",border:"1px solid rgba(0,245,255,.2)",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        textDecoration:"none",fontSize:".95rem",flexShrink:0}}>
                      📞
                    </a>
                  </div>

                  {/* Address */}
                  {o.address && (
                    <div style={{background:"rgba(0,245,255,.05)",border:"1px solid rgba(0,245,255,.12)",
                      borderRadius:8,padding:"10px 12px",marginBottom:10,
                      fontSize:".88rem",display:"flex",alignItems:"flex-start",gap:8}}>
                      <span style={{flexShrink:0}}>📍</span>
                      <span style={{color:"#00f5ff",lineHeight:1.4}}>{o.address}</span>
                    </div>
                  )}

                  {/* Items */}
                  <div style={{background:"rgba(255,255,255,.02)",borderRadius:8,padding:"10px 12px",
                    marginBottom:12,border:"1px solid rgba(255,255,255,.04)"}}>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
                      letterSpacing:".1em",marginBottom:5}}>ARTICLES</div>
                    {o.items.split("\n").map((line, i) => (
                      <div key={i} style={{fontSize:".85rem",padding:"2px 0",color:"#d0d0e0"}}>{line}</div>
                    ))}
                  </div>

                  {/* Actions */}
                  {filter === "available" && !o.assignedDriver && (
                    <button onClick={() => setConfirmAction({id: o.id, type: "take"})}
                      style={{width:"100%",padding:"14px",borderRadius:10,border:"none",
                        background:"linear-gradient(135deg,#00f5ff,#0090ff)",
                        color:"#000",fontWeight:700,fontSize:".95rem",cursor:"pointer",
                        letterSpacing:".06em",boxShadow:"0 4px 20px rgba(0,245,255,.3)",
                        fontFamily:"'Rajdhani',sans-serif"}}>
                      🏍️ JE PRENDS CETTE COMMANDE
                    </button>
                  )}

                  {filter === "mine" && isMine && (
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={() => setConfirmAction({id: o.id, type: "deliver"})}
                        style={{flex:1,padding:"14px",borderRadius:10,border:"none",
                          background:"linear-gradient(135deg,#b8ff00,#7acc00)",
                          color:"#000",fontWeight:700,fontSize:".95rem",cursor:"pointer",
                          letterSpacing:".06em",boxShadow:"0 4px 16px rgba(184,255,0,.3)",
                          fontFamily:"'Rajdhani',sans-serif"}}>
                        ✓ LIVRÉ
                      </button>
                      <a href={`https://wa.me/${o.phone.replace(/[^0-9+]/g,"")}?text=${encodeURIComponent(`Bonjour ${o.name || ""}, votre livreur Yassala est en route ! 🏍️`)}`}
                        target="_blank" rel="noopener"
                        style={{padding:"14px 16px",borderRadius:10,
                          background:"rgba(37,211,102,.12)",border:"1px solid rgba(37,211,102,.3)",
                          color:"#25d366",display:"flex",alignItems:"center",justifyContent:"center",
                          textDecoration:"none",fontSize:"1.1rem",flexShrink:0}}>
                        💬
                      </a>
                    </div>
                  )}

                  {filter === "delivered" && (
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"8px 12px",background:"rgba(184,255,0,.06)",borderRadius:8,
                      border:"1px solid rgba(184,255,0,.12)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{color:"#b8ff00"}}>✓</span>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",color:"#b8ff00"}}>
                          LIVRÉ
                        </span>
                      </div>
                      {o.deliveredAt && (
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>
                          {new Date(o.deliveredAt).toLocaleString("fr-FR")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{height:40}} />
      </div>
    </>
  );
}
