"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, updateDoc, setDoc, query, where, getDocs, deleteDoc, serverTimestamp } from "firebase/firestore";

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
  lat?: number; lng?: number; email?: string;
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
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [etaData, setEtaData] = useState<Record<string, {duration: string; distance: string}>>({});
  const mapRefs = useRef<Record<string, boolean>>({});
  const [gpsActive, setGpsActive] = useState(false);
  const [transportType, setTransportType] = useState<"scooter"|"velo"|"voiture">("scooter");
  const watchIdRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showContract, setShowContract] = useState(false);
  const [contractScrolled, setContractScrolled] = useState(false);
  const contractRef = useRef<HTMLDivElement>(null);

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
    const driver = { id: driverDoc.id, ...data };
    setDriverData(driver);
    if (data.transport) setTransportType(data.transport);
    if (!data.contractAccepted) {
      setShowContract(true);
    }
    setLoggedIn(true);
    try { localStorage.setItem("yassala_driver", JSON.stringify({ phone: phone.trim() })); } catch {}

    // ── Marquer EN LIGNE dans la collection "drivers" ──
    const goOnline = () => setDoc(doc(db, "drivers", driverDoc.id), {
      uid: driverDoc.id,
      name: data.name || phone.trim(),
      status: "online",
      isOnline: true,
      lastSeen: serverTimestamp(),
    }, { merge: true });
    goOnline();
    // Heartbeat toutes les 20 secondes pour rester visible dans l'admin
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(goOnline, 20000);
  };

  const acceptContract = async () => {
    if (!driverData?.id) return;
    const now = new Date().toISOString();
    await updateDoc(doc(db, "driver_applications", driverData.id), {
      contractAccepted: true,
      contractAcceptedAt: now,
    });
    setDriverData((d: any) => ({ ...d, contractAccepted: true, contractAcceptedAt: now }));
    setShowContract(false);
    showToast("Contrat accepté ! Bienvenue chez Yassala");
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
    if (!driverData || showContract) return () => {};
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
    // Passer en "busy" dans la collection drivers
    setDoc(doc(db, "drivers", driverData.id), { status: "busy", lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    const order = orders.find(o => o.id === orderId);
    if (order?.email) {
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'en_route',
          email: order.email,
          orderNumber: order.orderNumber || orderId.slice(-8).toUpperCase(),
          driverName: driverData.name,
          trackingUrl: `${window.location.origin}/suivi?id=${orderId}`,
        }),
      }).catch(() => {});
    }
    showToast("Commande prise en charge !");
    setConfirmAction(null);
  };

  const markDelivered = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), {
      status: "livre",
      deliveredAt: new Date().toISOString(),
    });
    // Repasser "online" si plus aucune commande active après livraison
    setDoc(doc(db, "drivers", driverData.id), { status: "online", lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    const order = orders.find(o => o.id === orderId);
    if (order?.email) {
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'delivered',
          email: order.email,
          orderNumber: order.orderNumber || orderId.slice(-8).toUpperCase(),
          shopUrl: window.location.origin,
        }),
      }).catch(() => {});
    }
    showToast("Commande marquée comme livrée !");
    setConfirmAction(null);
  };

  const startGPS = useCallback(() => {
    if (!driverData || !navigator.geolocation) return;
    if (watchIdRef.current !== null) return;
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        setDoc(doc(db, "driver_locations", driverData.id), {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading || 0,
          speed: pos.coords.speed || 0,
          transport: transportType,
          driverName: driverData.name,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    watchIdRef.current = wid;
    setGpsActive(true);
    showToast("Position GPS partagée en temps réel");
  }, [driverData, transportType]);

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsActive(false);
    if (driverData) {
      deleteDoc(doc(db, "driver_locations", driverData.id)).catch(() => {});
    }
  }, [driverData]);

  useEffect(() => {
    if (!driverData) return;
    const activeOrders = orders.filter(o => o.assignedDriver === driverData.id && o.status === "en_cours");
    if (activeOrders.length > 0 && !gpsActive) {
      startGPS();
    } else if (activeOrders.length === 0 && gpsActive) {
      stopGPS();
    }
  }, [orders, driverData, gpsActive, startGPS, stopGPS]);

  useEffect(() => {
    return () => {
      stopGPS();
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  }, []);

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

  const fetchETA = useCallback(async (orderId: string, lat: number, lng: number) => {
    if (etaData[orderId]) return;
    try {
      const shopLat = 4.9372;
      const shopLng = -52.3260;
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${shopLng},${shopLat};${lng},${lat}?overview=false`
      );
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const mins = Math.ceil(route.duration / 60);
        const km = (route.distance / 1000).toFixed(1);
        setEtaData(prev => ({ ...prev, [orderId]: {
          duration: mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h${mins%60 > 0 ? mins%60 + "min" : ""}`,
          distance: `${km} km`
        }}));
      }
    } catch {}
  }, [etaData]);

  const mapInstancesRef = useRef<Record<string, any>>({});

  const initMap = useCallback((containerId: string, lat: number, lng: number) => {
    if (mapRefs.current[containerId]) return;
    mapRefs.current[containerId] = true;
    import("leaflet").then(L => {
      const container = document.getElementById(containerId);
      if (!container) { mapRefs.current[containerId] = false; return; }
      if ((container as any)._leaflet_id) return;
      const map = L.map(container, { zoomControl: false, attributionControl: false }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      const icon = L.divIcon({
        html: '<div style="font-size:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">📍</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        className: ''
      });
      L.marker([lat, lng], { icon }).addTo(map);
      mapInstancesRef.current[containerId] = map;
      setTimeout(() => map.invalidateSize(), 100);
    });
  }, []);

  const cleanupMap = useCallback((containerId: string) => {
    const map = mapInstancesRef.current[containerId];
    if (map) {
      map.remove();
      delete mapInstancesRef.current[containerId];
    }
    delete mapRefs.current[containerId];
  }, []);

  useEffect(() => {
    if (expandedMap) {
      const order = orders.find(o => o.id === expandedMap);
      if (order?.lat && order?.lng) {
        setTimeout(() => {
          initMap(`map-${order.id}`, order.lat!, order.lng!);
          fetchETA(order.id, order.lat!, order.lng!);
        }, 100);
      }
    }
  }, [expandedMap, orders, initMap, fetchETA]);

  useEffect(() => {
    const ordersWithCoords = displayOrders.filter(o => o.lat && o.lng && !etaData[o.id]);
    ordersWithCoords.forEach((o, i) => {
      setTimeout(() => fetchETA(o.id, o.lat!, o.lng!), i * 300);
    });
  }, [displayOrders.map(o => o.id).join(",")]); // eslint-disable-line

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

  if (showContract) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;min-height:100vh;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:"24px 16px"}}>
        <div style={{maxWidth:560,width:"100%",animation:"fadeUp .4s both"}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:"2.5rem",marginBottom:8}}>📋</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",
              background:"linear-gradient(135deg,#00f5ff,#ff2d78)",WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",marginBottom:4}}>
              CONTRAT DE PRESTATION
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
              letterSpacing:".1em"}}>
              YASSALA NIGHT DELIVERY
            </div>
          </div>

          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(0,245,255,.15)",
            borderRadius:14,overflow:"hidden",marginBottom:20}}>
            <div ref={(el) => {
                (contractRef as any).current = el;
                if (el && el.scrollHeight <= el.clientHeight + 30) setContractScrolled(true);
              }}
              onScroll={() => {
                const el = contractRef.current;
                if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 30) setContractScrolled(true);
              }}
              style={{maxHeight:400,overflowY:"auto",padding:"24px 22px",
                fontFamily:"'Rajdhani',sans-serif",fontSize:".88rem",lineHeight:1.7,color:"#d0d0e0"}}>

              <div style={{fontWeight:700,fontSize:"1rem",color:"#00f5ff",marginBottom:12}}>
                CONDITIONS GÉNÉRALES DE PRESTATION DE LIVRAISON
              </div>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 1 – OBJET</div>
              <p>Le présent contrat définit les conditions dans lesquelles le Prestataire (ci-après « le Livreur ») effectue des prestations de livraison pour le compte de YASSALA (ci-après « la Plateforme »). Le Livreur intervient en qualité de prestataire indépendant.</p>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 2 – STATUT DU LIVREUR</div>
              <p>Le Livreur exerce son activité en tant que travailleur indépendant (auto-entrepreneur ou autre statut légal). Il n&apos;existe aucun lien de subordination entre le Livreur et la Plateforme. Le Livreur est libre d&apos;accepter ou de refuser les courses proposées.</p>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 3 – OBLIGATIONS DU LIVREUR</div>
              <p>Le Livreur s&apos;engage à :</p>
              <ul style={{paddingLeft:20,marginTop:4}}>
                <li>Livrer les commandes dans les meilleurs délais et en bon état</li>
                <li>Respecter le code de la route et les règles de sécurité</li>
                <li>Disposer d&apos;un véhicule en bon état (vélo, scooter ou voiture)</li>
                <li>Disposer d&apos;une assurance responsabilité civile professionnelle</li>
                <li>Maintenir une présentation correcte et un comportement professionnel</li>
                <li>Activer la géolocalisation pendant les livraisons pour le suivi client</li>
                <li>Ne pas consommer d&apos;alcool ou de substances illicites pendant le service</li>
                <li>Signaler tout incident ou problème lors d&apos;une livraison</li>
              </ul>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 4 – RÉMUNÉRATION</div>
              <p>Le Livreur est rémunéré par course effectuée selon les tarifs en vigueur communiqués par la Plateforme. Le paiement est effectué selon les modalités convenues (hebdomadaire ou mensuel). Le Livreur est responsable de ses propres charges fiscales et sociales.</p>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 5 – DONNÉES PERSONNELLES &amp; GÉOLOCALISATION</div>
              <p>Le Livreur consent à la collecte de sa position GPS pendant les livraisons. Ces données sont utilisées uniquement pour :</p>
              <ul style={{paddingLeft:20,marginTop:4}}>
                <li>Permettre au client de suivre sa commande en temps réel</li>
                <li>Calculer les distances et temps de trajet</li>
                <li>Optimiser les courses</li>
              </ul>
              <p style={{marginTop:8}}>Les données de géolocalisation sont supprimées dès la livraison terminée. Les données personnelles sont traitées conformément au RGPD.</p>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 6 – RESPONSABILITÉ</div>
              <p>Le Livreur est responsable de tout dommage causé aux marchandises pendant le transport. La Plateforme ne pourra être tenue responsable des accidents ou incidents survenant pendant les livraisons. Le Livreur déclare disposer d&apos;une assurance couvrant son activité.</p>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 7 – DURÉE ET RÉSILIATION</div>
              <p>Le présent contrat est conclu pour une durée indéterminée. Chaque partie peut y mettre fin à tout moment, sans préavis ni indemnité. La Plateforme se réserve le droit de suspendre ou résilier l&apos;accès du Livreur en cas de manquement aux présentes conditions.</p>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 8 – CONFIDENTIALITÉ</div>
              <p>Le Livreur s&apos;engage à ne pas divulguer les informations confidentielles auxquelles il pourrait avoir accès dans le cadre de son activité (données clients, informations commerciales, etc.).</p>

              <div style={{fontWeight:700,color:"#ff2d78",marginTop:16,marginBottom:6}}>ARTICLE 9 – DROIT APPLICABLE</div>
              <p>Le présent contrat est soumis au droit français. Tout litige sera soumis aux tribunaux compétents de Cayenne, Guyane française.</p>

              <div style={{marginTop:24,padding:"14px 16px",background:"rgba(0,245,255,.06)",
                border:"1px solid rgba(0,245,255,.15)",borderRadius:8,
                fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#00f5ff"}}>
                En cliquant sur « J&apos;accepte », vous reconnaissez avoir lu et compris l&apos;ensemble des conditions ci-dessus et vous vous engagez à les respecter.
              </div>
            </div>
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={() => { setShowContract(false); setLoggedIn(false); setDriverData(null); }}
              style={{flex:1,padding:"14px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",
                background:"transparent",color:"#5a5470",fontFamily:"'Rajdhani',sans-serif",
                fontWeight:700,fontSize:".95rem",cursor:"pointer"}}>
              REFUSER
            </button>
            <button onClick={acceptContract}
              disabled={!contractScrolled}
              style={{flex:2,padding:"14px",borderRadius:10,border:"none",
                background: contractScrolled
                  ? "linear-gradient(135deg,#b8ff00,#7acc00)"
                  : "rgba(255,255,255,.06)",
                color: contractScrolled ? "#000" : "#5a5470",
                fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".95rem",
                cursor: contractScrolled ? "pointer" : "not-allowed",
                boxShadow: contractScrolled ? "0 4px 16px rgba(184,255,0,.3)" : "none",
                transition:"all .3s"}}>
              {contractScrolled ? "✓ J'ACCEPTE LE CONTRAT" : "↓ Lis le contrat jusqu'en bas"}
            </button>
          </div>

          <div style={{textAlign:"center",marginTop:14,fontFamily:"'Share Tech Mono',monospace",
            fontSize:".68rem",color:"#5a5470"}}>
            {driverData?.name} · {new Date().toLocaleDateString("fr-FR")}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
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
        .leaflet-container{background:#0a0a12 !important;border-radius:10px;}
        .leaflet-tile-pane{filter:brightness(.8) contrast(1.1) saturate(.8);}
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
          <button onClick={() => {
            stopGPS();
            if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
            if (driverData?.id) {
              setDoc(doc(db, "drivers", driverData.id), { isOnline: false, status: "offline", lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
            }
            setLoggedIn(false); setDriverData(null); setPhone(""); setPassword(""); localStorage.removeItem("yassala_driver");
          }}
            style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
              color:"#5a5470",padding:"6px 12px",borderRadius:6,
              fontFamily:"'Inter',sans-serif",fontSize:".78rem",cursor:"pointer"}}>
            ✕
          </button>
        </div>
      </header>

      <div style={{maxWidth:600,margin:"0 auto",padding:"20px 14px",animation:"fadeUp .3s both"}}>

        {/* GPS & Transport */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,
          padding:"10px 14px",background: gpsActive ? "rgba(184,255,0,.06)" : "rgba(255,255,255,.02)",
          border:`1px solid ${gpsActive ? "rgba(184,255,0,.2)" : "rgba(255,255,255,.06)"}`,
          borderRadius:10}}>
          <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,
            background: gpsActive ? "#b8ff00" : "#5a5470",
            boxShadow: gpsActive ? "0 0 8px #b8ff00" : "none",
            animation: gpsActive ? "pulseGlow 2s infinite" : "none"}} />
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
            color: gpsActive ? "#b8ff00" : "#5a5470",letterSpacing:".08em",flex:1}}>
            {gpsActive ? "GPS ACTIF" : "GPS INACTIF"}
          </span>
          <div style={{display:"flex",gap:4}}>
            {(["scooter","velo","voiture"] as const).map(t => (
              <button key={t} onClick={() => {
                setTransportType(t);
                if (driverData?.id) {
                  updateDoc(doc(db, "driver_applications", driverData.id), { transport: t }).catch(() => {});
                }
              }}
                style={{padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",
                  fontSize:".85rem",
                  background: transportType === t ? "rgba(0,245,255,.15)" : "rgba(255,255,255,.03)",
                  color: transportType === t ? "#00f5ff" : "#5a5470",
                  transition:"all .2s"}}>
                {t === "scooter" ? "🏍️" : t === "velo" ? "🚲" : "🚗"}
              </button>
            ))}
          </div>
        </div>

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

                  {/* Address + Map + ETA */}
                  {o.address && (
                    <div style={{marginBottom:10}}>
                      <div style={{background:"rgba(0,245,255,.05)",border:"1px solid rgba(0,245,255,.12)",
                        borderRadius: expandedMap === o.id ? "8px 8px 0 0" : 8,
                        padding:"10px 12px",fontSize:".88rem",
                        display:"flex",alignItems:"center",gap:8,cursor: o.lat ? "pointer" : "default"}}
                        onClick={() => {
                          if (o.lat && o.lng) {
                            if (expandedMap === o.id) {
                              cleanupMap(`map-${o.id}`);
                              setExpandedMap(null);
                            } else {
                              if (expandedMap) cleanupMap(`map-${expandedMap}`);
                              setExpandedMap(o.id);
                            }
                          }
                        }}>
                        <span style={{flexShrink:0}}>📍</span>
                        <span style={{color:"#00f5ff",lineHeight:1.4,flex:1}}>{o.address}</span>
                        {o.lat && o.lng && (
                          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",
                            color:"#5a5470",flexShrink:0}}>
                            {expandedMap === o.id ? "▲" : "🗺️"}
                          </span>
                        )}
                      </div>

                      {/* ETA Banner */}
                      {o.lat && o.lng && etaData[o.id] && (
                        <div style={{display:"flex",gap:8,padding:"8px 12px",
                          background:"rgba(184,255,0,.06)",borderLeft:"3px solid #b8ff00",
                          borderRight:"1px solid rgba(184,255,0,.1)",
                          borderBottom: expandedMap === o.id ? "none" : "1px solid rgba(184,255,0,.1)",
                          borderRadius: expandedMap === o.id ? 0 : "0 0 8px 8px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                            <span style={{fontSize:".9rem"}}>🕐</span>
                            <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".95rem",
                              color:"#b8ff00"}}>{etaData[o.id].duration}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:".9rem"}}>📏</span>
                            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",
                              color:"#5a5470"}}>{etaData[o.id].distance}</span>
                          </div>
                        </div>
                      )}

                      {o.lat && o.lng && !etaData[o.id] && (
                        <div style={{padding:"6px 12px",background:"rgba(255,255,255,.02)",
                          borderRadius:"0 0 8px 8px",borderTop:"none",
                          display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:".8rem",animation:"pulseGlow 2s infinite"}}>⏳</span>
                          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                            color:"#5a5470",letterSpacing:".06em"}}>
                            Calcul du trajet...
                          </span>
                        </div>
                      )}

                      {/* Map */}
                      {expandedMap === o.id && o.lat && o.lng && (
                        <div style={{border:"1px solid rgba(0,245,255,.12)",borderTop:"none",
                          borderRadius:"0 0 8px 8px",overflow:"hidden"}}>
                          <div id={`map-${o.id}`} style={{height:200,width:"100%"}} />
                          <div style={{padding:"8px 12px",background:"rgba(0,0,0,.3)",
                            display:"flex",gap:8}}>
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}&travelmode=driving`}
                              target="_blank" rel="noopener"
                              style={{flex:1,padding:"8px",borderRadius:6,textAlign:"center",
                                background:"rgba(0,245,255,.1)",border:"1px solid rgba(0,245,255,.2)",
                                color:"#00f5ff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                                fontSize:".82rem",textDecoration:"none",letterSpacing:".04em"}}>
                              🧭 OUVRIR DANS GOOGLE MAPS
                            </a>
                            <a href={`https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`}
                              target="_blank" rel="noopener"
                              style={{padding:"8px 14px",borderRadius:6,textAlign:"center",
                                background:"rgba(51,122,255,.1)",border:"1px solid rgba(51,122,255,.2)",
                                color:"#337aff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                                fontSize:".82rem",textDecoration:"none"}}>
                              WAZE
                            </a>
                          </div>
                        </div>
                      )}
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
