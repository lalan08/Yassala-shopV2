"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, updateDoc, setDoc, getDoc, query, where, orderBy, getDocs, deleteDoc, serverTimestamp, arrayUnion, arrayRemove } from "firebase/firestore";

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
  isRush?: boolean; rushFee?: number;
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
  const [walletTxns, setWalletTxns] = useState<any[]>([]);
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
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [newDriverPwd, setNewDriverPwd] = useState("");
  const [newDriverPwd2, setNewDriverPwd2] = useState("");
  const [pwdSetupError, setPwdSetupError] = useState("");
  const [problemModal, setProblemModal] = useState<{orderId: string} | null>(null);

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

  const playRushAlert = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const play = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.45, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      play(1200, 0, 0.15);
      play(1500, 0.18, 0.15);
      play(1200, 0.36, 0.15);
      play(1500, 0.54, 0.15);
      play(1200, 0.72, 0.25);
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
    // Premier login → demander au livreur de créer son propre mot de passe
    if (!data.passwordSet) {
      setShowPasswordSetup(true);
    }
    setLoggedIn(true);
    try { localStorage.setItem("yassala_driver", JSON.stringify({ phone: phone.trim(), driverId: driverDoc.id })); } catch {}

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

  // ── Auto-login depuis la session sauvegardée ─────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem("yassala_driver");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      // Pré-remplit le champ téléphone dans tous les cas
      if (saved.phone) setPhone(saved.phone);

      // Auto-login si on a l'ID du livreur
      if (!saved.driverId) return;
      getDoc(doc(db, "driver_applications", saved.driverId)).then(snap => {
        if (!snap.exists() || snap.data().status !== "accepte") {
          // Compte supprimé ou suspendu → on efface la session
          localStorage.removeItem("yassala_driver");
          return;
        }
        const data = snap.data();
        const driver = { id: snap.id, ...data };
        setDriverData(driver);
        if (data.transport) setTransportType(data.transport);
        // Contrat : re-afficher seulement si pas encore accepté
        if (!data.contractAccepted) setShowContract(true);
        setLoggedIn(true);

        // Remettre le heartbeat en ligne
        const goOnline = () => setDoc(doc(db, "drivers", snap.id), {
          uid: snap.id,
          name: data.name || saved.phone,
          status: "online",
          isOnline: true,
          lastSeen: serverTimestamp(),
        }, { merge: true });
        goOnline();
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(goOnline, 20000);
      }).catch(() => {
        // Erreur réseau : on reste sur le formulaire de connexion
      });
    } catch {
      localStorage.removeItem("yassala_driver");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOrders = useCallback(() => {
    if (!driverData || showContract) return () => {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    const unsub = onSnapshot(
      query(collection(db, "orders"), where("createdAt", ">=", cutoff.toISOString())),
      snap => {
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
        const hasRush = available.some(o => o.isRush);
        if (hasRush) {
          playRushAlert();
          if ("vibrate" in navigator) navigator.vibrate([300, 100, 300, 100, 300]);
        } else {
          playAlert();
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
        }
        setNewOrderAlert(true);
        setTimeout(() => setNewOrderAlert(false), 5000);
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
    // Passer en "busy" et ajouter à activeOrderIds (multi-commandes)
    setDoc(doc(db, "drivers", driverData.id), {
      status: "busy",
      lastSeen: serverTimestamp(),
      activeOrderIds: arrayUnion(orderId),
    }, { merge: true }).catch(() => {});
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
    setFilter("mine");
  };

  const markDelivered = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), {
      status: "livre",
      deliveredAt: new Date().toISOString(),
    });
    // Retirer de activeOrderIds; repasser "online" seulement si plus aucune commande active
    const remainingActive = myOrders.filter(o => o.id !== orderId);
    setDoc(doc(db, "drivers", driverData.id), {
      status: remainingActive.length === 0 ? "online" : "busy",
      lastSeen: serverTimestamp(),
      activeOrderIds: arrayRemove(orderId),
    }, { merge: true }).catch(() => {});
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
    // Recalcul du score de performance (fire-and-forget)
    fetch('/api/update-driver-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driverData.id }),
    }).catch(() => {});

    showToast("Commande marquée comme livrée !");
    setConfirmAction(null);
    setFilter("available");
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

  // Listener wallet_transactions temps réel
  useEffect(() => {
    if (!driverData?.id || !loggedIn) return;
    const unsub = onSnapshot(
      query(
        collection(db, "wallet_transactions"),
        where("driverId", "==", driverData.id),
        orderBy("createdAt", "desc")
      ),
      snap => setWalletTxns(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [driverData?.id, loggedIn]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const availableOrders = orders
    .filter(o => (o.status === "nouveau" || o.status === "en_cours") && !o.assignedDriver)
    .sort((a, b) => (b.isRush ? 1 : 0) - (a.isRush ? 1 : 0));
  const myOrders = orders.filter(o => o.assignedDriver === driverData?.id && o.status !== "livre");
  // Seulement aujourd'hui — les jours précédents sont archivés automatiquement
  const deliveredOrders = orders.filter(o =>
    o.assignedDriver === driverData?.id &&
    o.status === "livre" &&
    (o.deliveredAt || o.createdAt).slice(0, 10) === todayStr
  );

  // ── Calculs wallet depuis wallet_transactions ──────────────────────────
  // Début de semaine = vendredi dernier (ou aujourd'hui si vendredi)
  const weekStartStr = (() => {
    const d = new Date();
    const offset = (d.getDay() - 5 + 7) % 7; // 0 si vendredi
    d.setDate(d.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  })();

  // Gains du jour (hors virements)
  const gainsJour = walletTxns
    .filter(t => t.type !== "payment" && (t.createdAt || "").slice(0, 10) === todayStr)
    .reduce((s, t) => s + (t.amount || 0), 0);

  // Portefeuille cette semaine (depuis dernier vendredi, hors virements)
  const portefeuilleWeek = walletTxns
    .filter(t => t.type !== "payment" && (t.createdAt || "") >= weekStartStr)
    .reduce((s, t) => s + (t.amount || 0), 0);

  // Dernière transaction de livraison
  const derniereTransaction = walletTxns.find(t => t.type !== "payment");

  // Vendredi prochain (affichage)
  const nextFriday = (() => {
    const d = new Date();
    const days = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  })();

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

  // ── Écran de création de mot de passe (premier login) ──
  if (showPasswordSetup) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;min-height:100vh;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:"24px 16px",background:"#0a0a12"}}>
        <div style={{maxWidth:420,width:"100%",animation:"fadeUp .3s both"}}>

          {/* Header */}
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"2rem",letterSpacing:".04em",
              background:"linear-gradient(135deg,#00f5ff,#ff2d78)",WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",marginBottom:6}}>YASSALA</div>
            <div style={{fontSize:"1.5rem",marginBottom:8}}>🔐</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",color:"#f0eeff",
              letterSpacing:".04em",marginBottom:8}}>CRÉE TON MOT DE PASSE</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470",
              lineHeight:1.6}}>
              L'admin t'a donné un mot de passe temporaire.<br/>
              Choisis maintenant ton propre mot de passe.
            </div>
          </div>

          <div style={{background:"#0c0918",border:"1px solid rgba(0,245,255,.15)",borderRadius:12,
            padding:"24px 20px",display:"grid",gap:14}}>

            {pwdSetupError && (
              <div style={{background:"rgba(255,45,120,.1)",border:"1px solid rgba(255,45,120,.3)",
                borderRadius:6,padding:"10px 14px",color:"#ff2d78",
                fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",textAlign:"center"}}>
                {pwdSetupError}
              </div>
            )}

            <div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470",
                letterSpacing:".1em",marginBottom:6}}>NOUVEAU MOT DE PASSE</div>
              <input type="password" value={newDriverPwd}
                onChange={e => { setNewDriverPwd(e.target.value); setPwdSetupError(""); }}
                placeholder="Minimum 6 caractères"
                style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.12)",
                  borderRadius:6,padding:"12px 14px",color:"#f0eeff",fontSize:"1rem",
                  fontFamily:"'Rajdhani',sans-serif"}} />
            </div>

            <div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470",
                letterSpacing:".1em",marginBottom:6}}>CONFIRMER LE MOT DE PASSE</div>
              <input type="password" value={newDriverPwd2}
                onChange={e => { setNewDriverPwd2(e.target.value); setPwdSetupError(""); }}
                placeholder="Répète ton mot de passe"
                style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.12)",
                  borderRadius:6,padding:"12px 14px",color:"#f0eeff",fontSize:"1rem",
                  fontFamily:"'Rajdhani',sans-serif"}} />
            </div>

            <button onClick={async () => {
              if (newDriverPwd.length < 6) { setPwdSetupError("Minimum 6 caractères."); return; }
              if (newDriverPwd !== newDriverPwd2) { setPwdSetupError("Les mots de passe ne correspondent pas."); return; }
              try {
                await updateDoc(doc(db, "driver_applications", driverData.id), {
                  password: newDriverPwd,
                  passwordSet: true,
                });
                setDriverData((d: any) => ({ ...d, password: newDriverPwd, passwordSet: true }));
                setNewDriverPwd(""); setNewDriverPwd2(""); setPwdSetupError("");
                setShowPasswordSetup(false);
                showToast("Mot de passe créé ! Bienvenue 🎉");
              } catch {
                setPwdSetupError("Erreur lors de l'enregistrement. Réessaie.");
              }
            }}
              style={{background:"linear-gradient(135deg,#00f5ff,#0090ff)",border:"none",color:"#000",
                padding:"14px",borderRadius:8,fontFamily:"'Black Ops One',cursive",fontSize:"1rem",
                letterSpacing:".06em",cursor:"pointer",marginTop:4}}>
              ✓ ENREGISTRER MON MOT DE PASSE
            </button>
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

  // ── MODE FOCUS MISSION — prioritaire dès qu'une commande est acceptée ──
  if (loggedIn && !showContract && !showPasswordSetup && myOrders.length > 0) {
    return (
      <>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
          *{margin:0;padding:0;box-sizing:border-box;}
          body{background:#080514;color:#f0eeff;font-family:'Inter',sans-serif;}
          @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
          @keyframes pulseGlow{0%,100%{box-shadow:0 0 8px rgba(255,45,120,.3)}50%{box-shadow:0 0 20px rgba(255,45,120,.6)}}
          @keyframes slideIn{from{opacity:0;transform:translateY(-20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
          @keyframes missionBlink{0%,100%{opacity:1;}50%{opacity:.5;}}
          ::-webkit-scrollbar{width:4px;}
          ::-webkit-scrollbar-track{background:#080514;}
          ::-webkit-scrollbar-thumb{background:#ff2d78;border-radius:2px;}
          .leaflet-container{background:#080514 !important;border-radius:10px;}
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

        {/* Confirm Modal (livraison) */}
        {confirmAction && (
          <div style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,.8)",
            backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
            onClick={() => setConfirmAction(null)}>
            <div onClick={e => e.stopPropagation()}
              style={{background:"#0c0918",border:"1px solid rgba(0,245,255,.2)",borderRadius:16,
                padding:"30px 28px",maxWidth:380,width:"100%",textAlign:"center",
                animation:"slideIn .2s both"}}>
              <div style={{fontSize:"2.5rem",marginBottom:14}}>✅</div>
              <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.2rem",
                marginBottom:8,color:"#f0eeff"}}>Confirmer la livraison ?</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
                marginBottom:24}}>Cette commande sera marquée comme livrée.</div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={() => setConfirmAction(null)}
                  style={{flex:1,padding:"13px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",
                    background:"transparent",color:"#5a5470",fontFamily:"'Rajdhani',sans-serif",
                    fontWeight:700,fontSize:".95rem",cursor:"pointer"}}>ANNULER</button>
                <button onClick={() => markDelivered(confirmAction.id)}
                  style={{flex:1,padding:"13px",borderRadius:10,border:"none",
                    background:"linear-gradient(135deg,#b8ff00,#7acc00)",
                    color:"#000",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".95rem",
                    cursor:"pointer",boxShadow:"0 4px 16px rgba(184,255,0,.3)"}}>
                  ✓ CONFIRMER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Problem Modal */}
        {problemModal && (
          <div style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,.8)",
            backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
            onClick={() => setProblemModal(null)}>
            <div onClick={e => e.stopPropagation()}
              style={{background:"#0c0918",border:"1px solid rgba(255,45,120,.3)",borderRadius:16,
                padding:"28px 24px",maxWidth:380,width:"100%",animation:"slideIn .2s both"}}>
              <div style={{fontSize:"2rem",textAlign:"center",marginBottom:10}}>⚠️</div>
              <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.15rem",
                color:"#ff2d78",textAlign:"center",marginBottom:18,letterSpacing:".04em"}}>
                SIGNALER UN PROBLÈME
              </div>
              <div style={{display:"grid",gap:8,marginBottom:16}}>
                {["Client absent / injoignable","Adresse introuvable","Problème avec la commande","Autre problème"].map(label => (
                  <a key={label}
                    href={`https://wa.me/+594694000000?text=${encodeURIComponent(`⚠️ PROBLÈME LIVRAISON\nCommande : #${(orders.find(o => o.id === problemModal.orderId)?.orderNumber ?? problemModal.orderId.slice(-6).toUpperCase())}\nProblème : ${label}\nLivreur : ${driverData?.name}`)}`}
                    target="_blank" rel="noopener"
                    onClick={() => setProblemModal(null)}
                    style={{padding:"13px 16px",borderRadius:10,
                      background:"rgba(255,45,120,.07)",border:"1px solid rgba(255,45,120,.2)",
                      color:"#ff2d78",fontFamily:"'Rajdhani',sans-serif",fontWeight:600,
                      fontSize:".92rem",textDecoration:"none",display:"block",textAlign:"center",
                      transition:"all .15s"}}>
                    {label}
                  </a>
                ))}
              </div>
              <button onClick={() => setProblemModal(null)}
                style={{width:"100%",padding:"12px",borderRadius:10,border:"1px solid rgba(255,255,255,.08)",
                  background:"transparent",color:"#5a5470",fontFamily:"'Rajdhani',sans-serif",
                  fontWeight:700,fontSize:".9rem",cursor:"pointer"}}>
                ANNULER
              </button>
            </div>
          </div>
        )}

        {/* Header Focus Mission */}
        <header style={{background:"rgba(8,5,20,.98)",borderBottom:"1px solid rgba(255,45,120,.25)",
          padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",
          position:"sticky",top:0,zIndex:100,backdropFilter:"blur(20px)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:"#ff2d78",flexShrink:0,
              boxShadow:"0 0 10px #ff2d78",animation:"missionBlink 1.2s infinite"}} />
            <div>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",
                background:"linear-gradient(135deg,#ff2d78,#ff9500)",WebkitBackgroundClip:"text",
                WebkitTextFillColor:"transparent",letterSpacing:".06em"}}>
                MISSION EN COURS
              </div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#5a5470",
                letterSpacing:".12em"}}>{myOrders.length} COMMANDE{myOrders.length > 1 ? "S" : ""} ACTIVE{myOrders.length > 1 ? "S" : ""}</div>
            </div>
          </div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470"}}>
            {driverData?.name}
          </div>
        </header>

        {/* Commandes actives */}
        <div style={{maxWidth:600,margin:"0 auto",padding:"18px 14px",display:"grid",gap:14,
          animation:"fadeUp .3s both"}}>
          {myOrders.map(o => (
            <div key={o.id} style={{background:"rgba(255,45,120,.03)",
              border:"1px solid rgba(255,45,120,.35)",borderRadius:14,overflow:"hidden",
              boxShadow:"0 4px 30px rgba(255,45,120,.08)"}}>

              {/* Badge Rush */}
              {o.isRush && (
                <div style={{background:"#ef4444",color:"white",padding:"8px 16px",
                  fontFamily:"'Share Tech Mono',monospace",fontWeight:700,fontSize:".85rem",
                  letterSpacing:".1em",display:"flex",alignItems:"center",gap:8}}>
                  🚨 COMMANDE RUSH
                  {o.rushFee ? <span style={{marginLeft:"auto"}}>+{o.rushFee.toFixed(2)} €</span> : null}
                </div>
              )}

              <div style={{padding:"18px 16px",display:"grid",gap:14}}>

                {/* Numéro + Montant */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",color:"#ff2d78",
                    letterSpacing:".04em"}}>
                    #{o.orderNumber ?? o.id.slice(-6).toUpperCase()}
                  </div>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.6rem",color:"#b8ff00",
                    textShadow:"0 0 16px rgba(184,255,0,.4)"}}>
                    {Number(o.total).toFixed(2)}€
                  </div>
                </div>

                {/* Client */}
                <div style={{background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.12)",
                  borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:"50%",
                    background:"rgba(0,245,255,.08)",border:"1px solid rgba(0,245,255,.2)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>
                    👤
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:"1rem",marginBottom:2}}>{o.name || "Client"}</div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470"}}>
                      {o.phone}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0}}>
                    <a href={`tel:${o.phone}`}
                      style={{width:40,height:40,borderRadius:"50%",
                        background:"rgba(0,245,255,.1)",border:"1px solid rgba(0,245,255,.25)",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        textDecoration:"none",fontSize:"1.1rem"}}>
                      📞
                    </a>
                    <a href={`https://wa.me/${o.phone.replace(/[^0-9+]/g,"")}?text=${encodeURIComponent(`Bonjour ${o.name || ""}, votre livreur Yassala est en route ! 🏍️`)}`}
                      target="_blank" rel="noopener"
                      style={{width:40,height:40,borderRadius:"50%",
                        background:"rgba(37,211,102,.1)",border:"1px solid rgba(37,211,102,.3)",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        textDecoration:"none",fontSize:"1.1rem"}}>
                      💬
                    </a>
                  </div>
                </div>

                {/* Adresse */}
                {o.address && (
                  <div>
                    <div style={{background:"rgba(0,245,255,.05)",border:"1px solid rgba(0,245,255,.15)",
                      borderRadius: expandedMap === o.id ? "10px 10px 0 0" : 10,
                      padding:"12px 14px",display:"flex",alignItems:"center",gap:10,
                      cursor: o.lat ? "pointer" : "default"}}
                      onClick={() => {
                        if (o.lat && o.lng) {
                          if (expandedMap === o.id) {
                            cleanupMap(`map-focus-${o.id}`);
                            setExpandedMap(null);
                          } else {
                            if (expandedMap) cleanupMap(`map-focus-${expandedMap}`);
                            setExpandedMap(o.id);
                          }
                        }
                      }}>
                      <span style={{fontSize:"1.3rem",flexShrink:0}}>📍</span>
                      <span style={{color:"#00f5ff",fontSize:".95rem",lineHeight:1.4,fontWeight:500,flex:1}}>
                        {o.address}
                      </span>
                      {o.lat && o.lng && (
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",
                          color:"#5a5470",flexShrink:0}}>
                          {expandedMap === o.id ? "▲" : "🗺️"}
                        </span>
                      )}
                    </div>

                    {/* ETA */}
                    {o.lat && o.lng && etaData[o.id] && (
                      <div style={{display:"flex",gap:8,padding:"8px 14px",
                        background:"rgba(184,255,0,.06)",borderLeft:"3px solid #b8ff00",
                        borderRight:"1px solid rgba(184,255,0,.1)",
                        borderBottom: expandedMap === o.id ? "none" : "1px solid rgba(184,255,0,.1)",
                        borderRadius: expandedMap === o.id ? 0 : "0 0 10px 10px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                          <span>🕐</span>
                          <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                            fontSize:"1rem",color:"#b8ff00"}}>{etaData[o.id].duration}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span>📏</span>
                          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",
                            color:"#5a5470"}}>{etaData[o.id].distance}</span>
                        </div>
                      </div>
                    )}

                    {/* Map */}
                    {expandedMap === o.id && o.lat && o.lng && (
                      <div style={{border:"1px solid rgba(0,245,255,.15)",borderTop:"none",
                        borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
                        <div id={`map-focus-${o.id}`}
                          ref={el => { if (el) setTimeout(() => initMap(`map-focus-${o.id}`, o.lat!, o.lng!), 100); }}
                          style={{height:200,width:"100%"}} />
                        <div style={{padding:"8px 12px",background:"rgba(0,0,0,.4)",display:"flex",gap:8}}>
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}&travelmode=driving`}
                            target="_blank" rel="noopener"
                            style={{flex:1,padding:"9px",borderRadius:6,textAlign:"center",
                              background:"rgba(0,245,255,.1)",border:"1px solid rgba(0,245,255,.2)",
                              color:"#00f5ff",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                              fontSize:".82rem",textDecoration:"none",letterSpacing:".04em"}}>
                            🧭 GOOGLE MAPS
                          </a>
                          <a href={`https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`}
                            target="_blank" rel="noopener"
                            style={{padding:"9px 16px",borderRadius:6,textAlign:"center",
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

                {/* Articles */}
                <div style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:"12px 14px",
                  border:"1px solid rgba(255,255,255,.06)"}}>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470",
                    letterSpacing:".12em",marginBottom:6}}>ARTICLES</div>
                  {o.items.split("\n").map((line, i) => (
                    <div key={i} style={{fontSize:".9rem",padding:"3px 0",color:"#d0d0e0",
                      borderBottom: i < o.items.split("\n").length - 1 ? "1px solid rgba(255,255,255,.04)" : "none"}}>
                      {line}
                    </div>
                  ))}
                </div>

                {/* Paiement */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                  background: o.paidOnline ? "rgba(184,255,0,.06)" : "rgba(255,165,0,.06)",
                  border:`1px solid ${o.paidOnline ? "rgba(184,255,0,.2)" : "rgba(255,165,0,.2)"}`,
                  borderRadius:10}}>
                  <span style={{fontSize:"1.3rem"}}>{o.paidOnline ? "💳" : "💵"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".95rem",
                      color: o.paidOnline ? "#b8ff00" : "#ffa500"}}>
                      {o.paidOnline ? "PAYÉ EN LIGNE" : "PAIEMENT EN ESPÈCES"}
                    </div>
                    {!o.paidOnline && (
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470",
                        marginTop:2}}>
                        Récupérer {Number(o.total).toFixed(2)} € à la livraison
                      </div>
                    )}
                  </div>
                </div>

                {/* Boutons d'action */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
                  <button onClick={() => setConfirmAction({id: o.id, type: "deliver"})}
                    style={{gridColumn:"1 / -1",padding:"16px",borderRadius:12,border:"none",
                      background:"linear-gradient(135deg,#b8ff00,#7acc00)",
                      color:"#000",fontFamily:"'Black Ops One',cursive",fontSize:"1.05rem",
                      letterSpacing:".06em",cursor:"pointer",
                      boxShadow:"0 6px 24px rgba(184,255,0,.35)"}}>
                    ✓ LIVRAISON EFFECTUÉE
                  </button>
                  <a href={`https://wa.me/${o.phone.replace(/[^0-9+]/g,"")}?text=${encodeURIComponent(`Bonjour ${o.name || ""}, je suis en route pour votre livraison ! 🏍️ Yassala`)}`}
                    target="_blank" rel="noopener"
                    style={{padding:"13px",borderRadius:12,
                      background:"rgba(37,211,102,.1)",border:"1px solid rgba(37,211,102,.3)",
                      color:"#25d366",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                      fontSize:".9rem",textDecoration:"none",textAlign:"center",
                      letterSpacing:".04em",display:"flex",alignItems:"center",
                      justifyContent:"center",gap:6}}>
                    🏍️ EN ROUTE
                  </a>
                  <button onClick={() => setProblemModal({orderId: o.id})}
                    style={{padding:"13px",borderRadius:12,border:"1px solid rgba(255,45,120,.3)",
                      background:"rgba(255,45,120,.07)",color:"#ff2d78",
                      fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
                      cursor:"pointer",letterSpacing:".04em"}}>
                    ⚠️ PROBLÈME
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div style={{height:20}} />
        </div>
      </>
    );
  }

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

        {/* Stats livraisons */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(0,245,255,.1)",
            borderRadius:12,padding:"14px 16px",borderLeft:"3px solid #00f5ff"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470",
              letterSpacing:".08em",marginBottom:2}}>LIVRAISONS AUJOURD&apos;HUI</div>
            <div style={{fontWeight:700,fontSize:"1.6rem",color:"#00f5ff"}}>{stats.today}</div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(184,255,0,.1)",
            borderRadius:12,padding:"14px 16px",borderLeft:"3px solid #b8ff00"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470",
              letterSpacing:".08em",marginBottom:2}}>TOTAL LIVRAISONS</div>
            <div style={{fontWeight:700,fontSize:"1.6rem",color:"#b8ff00"}}>{stats.total}</div>
          </div>
        </div>

        {/* ── WALLET ─────────────────────────────────────────────────── */}

        {/* Ligne 1 : Gains du jour + Dernière livraison */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          {/* Gains du jour */}
          <div style={{background:"rgba(184,255,0,.05)",border:"1px solid rgba(184,255,0,.2)",
            borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",color:"#5a5470",
              letterSpacing:".1em",marginBottom:6}}>GAINS DU JOUR</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.7rem",color:"#b8ff00",
              textShadow:"0 0 16px rgba(184,255,0,.4)",lineHeight:1}}>
              {gainsJour > 0 ? `+${gainsJour.toFixed(2)}€` : "0.00€"}
            </div>
          </div>
          {/* Dernière livraison */}
          <div style={{background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.15)",
            borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",color:"#5a5470",
              letterSpacing:".1em",marginBottom:6}}>DERNIÈRE LIVRAISON</div>
            {derniereTransaction ? (
              <>
                <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.7rem",color:"#00f5ff",
                  textShadow:"0 0 16px rgba(0,245,255,.35)",lineHeight:1}}>
                  +{(derniereTransaction.amount || 0).toFixed(2)}€
                </div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".58rem",
                  color:"#5a5470",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",
                  whiteSpace:"nowrap"}}>
                  {derniereTransaction.description || "Livraison"}
                </div>
              </>
            ) : (
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.7rem",color:"#3a3455",lineHeight:1}}>
                —
              </div>
            )}
          </div>
        </div>

        {/* Ligne 2 : Portefeuille cette semaine */}
        <div style={{marginBottom:10,background:"rgba(184,255,0,.07)",
          border:"1px solid rgba(184,255,0,.3)",borderRadius:14,padding:"18px 20px",
          position:"relative",overflow:"hidden"}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",color:"#7a7490",
            letterSpacing:".14em",marginBottom:8}}>PORTEFEUILLE (CETTE SEMAINE)</div>
          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"2.6rem",color:"#b8ff00",
            textShadow:"0 0 28px rgba(184,255,0,.5)",lineHeight:1}}>
            {portefeuilleWeek.toFixed(2)}€
          </div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",color:"#5a5470",
            marginTop:6,letterSpacing:".06em"}}>
            depuis vendredi {weekStartStr.slice(8, 10)}/{weekStartStr.slice(5, 7)}
          </div>
          <div style={{position:"absolute",right:-20,bottom:-20,width:100,height:100,
            borderRadius:"50%",background:"rgba(184,255,0,.04)",pointerEvents:"none"}} />
        </div>

        {/* Ligne 3 : À recevoir vendredi */}
        <div style={{marginBottom:16,background:"rgba(255,45,120,.05)",
          border:"1px solid rgba(255,45,120,.25)",borderRadius:14,padding:"16px 20px",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",color:"#7a7490",
              letterSpacing:".14em",marginBottom:6}}>À RECEVOIR VENDREDI {nextFriday}</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"2rem",color:"#ff2d78",
              textShadow:"0 0 20px rgba(255,45,120,.4)",lineHeight:1}}>
              {portefeuilleWeek.toFixed(2)}€
            </div>
          </div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"2rem",color:"rgba(255,45,120,.2)"}}>
            💸
          </div>
        </div>

        {/* Ligne 4 : Historique des gains */}
        <div style={{marginBottom:20,background:"rgba(255,255,255,.02)",
          border:"1px solid rgba(255,255,255,.07)",borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"14px 18px 10px",borderBottom:"1px solid rgba(255,255,255,.06)",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#7a7490",
              letterSpacing:".12em"}}>HISTORIQUE DES GAINS</div>
            {walletTxns.length > 0 && (
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
                color:"#3a3455",letterSpacing:".06em"}}>
                {walletTxns.filter(t => t.type !== "payment").length} transaction{walletTxns.filter(t => t.type !== "payment").length > 1 ? "s" : ""}
              </div>
            )}
          </div>

          {walletTxns.length === 0 ? (
            <div style={{padding:"24px 18px",textAlign:"center",fontFamily:"'Share Tech Mono',monospace",
              fontSize:".7rem",color:"#3a3455",letterSpacing:".06em"}}>
              Aucune transaction pour l&apos;instant
            </div>
          ) : (
            <div style={{maxHeight:260,overflowY:"auto"}}>
              {walletTxns.slice(0, 30).map((t, i) => {
                const isPayment = t.type === "payment";
                const amount = t.amount || 0;
                const date = t.createdAt ? new Date(t.createdAt) : null;
                const timeStr = date ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
                const dateStr = date ? date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "";
                const isToday = t.createdAt?.slice(0, 10) === todayStr;
                return (
                  <div key={t.id || i}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"11px 18px",
                      borderBottom: i < walletTxns.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                      background: isPayment ? "rgba(0,245,255,.03)" : "transparent"}}>
                    <div style={{width:34,height:34,borderRadius:10,flexShrink:0,
                      background: isPayment ? "rgba(0,245,255,.1)" : "rgba(184,255,0,.08)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:"1rem"}}>
                      {isPayment ? "🏦" : t.type === "bonus" ? "⭐" : "🏍️"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,
                        fontSize:".9rem",color: isPayment ? "#00f5ff" : "#f0eeff",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {t.description || (isPayment ? "Virement du vendredi" : "Livraison")}
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
                        color:"#5a5470",marginTop:2}}>
                        {isToday ? `aujourd'hui ${timeStr}` : `${dateStr} ${timeStr}`}
                      </div>
                    </div>
                    <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",
                      color: isPayment ? "#00f5ff" : amount >= 0 ? "#b8ff00" : "#ff2d78",
                      flexShrink:0}}>
                      {isPayment ? `-${Math.abs(amount).toFixed(2)}€` : `+${amount.toFixed(2)}€`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bandeau multi-commandes actives */}
        {myOrders.length > 1 && (
          <div style={{marginBottom:14,background:"rgba(0,245,255,.08)",
            border:"1px solid rgba(0,245,255,.3)",borderRadius:10,
            padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:"1.1rem"}}>⚡</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",
                color:"#00f5ff",fontWeight:700,letterSpacing:".08em"}}>
                {myOrders.length} COMMANDES EN PARALLÈLE
              </div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",
                color:"#5a5470",marginTop:2}}>
                Mode multi-livraison actif · livrez dans l'ordre affiché
              </div>
            </div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",
              color:"#00f5ff",opacity:.7}}>{myOrders.length}/2</div>
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",gap:6,marginBottom:18}}>
          {([
            { key: "available" as const, label: "DISPO", count: availableOrders.length, color: "#ff2d78" },
            { key: "mine" as const, label: "EN COURS", count: myOrders.length, color: "#00f5ff" },
            { key: "delivered" as const, label: "AUJOURD'HUI", count: deliveredOrders.length, color: "#b8ff00" },
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
               "Aucune livraison aujourd'hui"}
            </div>
          </div>
        ) : (
          <div style={{display:"grid",gap:10}}>
            {displayOrders.map(o => {
              const isMine = o.assignedDriver === driverData?.id;
              return (
                <div key={o.id} style={{background: o.isRush ? "rgba(239,68,68,.04)" : "rgba(255,255,255,.02)",
                  border:`1px solid ${o.isRush ? "rgba(239,68,68,.5)" : o.status === "nouveau" && !o.assignedDriver ? "rgba(255,45,120,.3)" : isMine ? "rgba(0,245,255,.2)" : "rgba(255,255,255,.06)"}`,
                  borderRadius:12,padding:"16px 18px",transition:"all .15s",
                  boxShadow: o.isRush ? "0 0 16px rgba(239,68,68,.12)" : "none",
                  animation: o.isRush ? "pulseGlow 1.5s infinite" : o.status === "nouveau" && !o.assignedDriver ? "pulseGlow 3s infinite" : "none"}}>

                  {/* Badge RUSH */}
                  {o.isRush && (
                    <div style={{background:"#ef4444",color:"white",padding:"6px 12px",borderRadius:6,
                      fontWeight:700,fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",
                      letterSpacing:".1em",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                      🚨 COMMANDE RUSH
                      {o.rushFee ? <span style={{marginLeft:"auto",fontSize:".9rem"}}>+{o.rushFee.toFixed(2)} €</span> : null}
                    </div>
                  )}

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
