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
  driverArrived?: boolean;
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
  const [stats, setStats] = useState({ today: 0, total: 0 });
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const prevOrderCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [walletTxns, setWalletTxns] = useState<any[]>([]);
  const [driverDeliveries, setDriverDeliveries] = useState<any[]>([]);
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
  const [activeTab, setActiveTab] = useState<"home"|"commandes"|"menu">("home");
  const [showHistory, setShowHistory] = useState(false);
  const [rewardChips, setRewardChips] = useState<{amount:number;key:number}[]>([]);
  const rewardKeyRef = useRef(0);
  const isFirstWalletLoad = useRef(true);
  const prevWalletIdsRef = useRef<Set<string>>(new Set());


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
    // Créditer le portefeuille + créer le document deliveries via API serveur (Admin SDK, fiable)
    fetch('/api/driver-wallet-credit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driverId: driverData.id,
        orderId,
        orderNumber: order?.orderNumber ?? null,
        paidOnline: order?.paidOnline !== false,
        orderTotal: order?.total ?? 0,
      }),
    }).catch(() => {});
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

  const notifyArrival = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), {
      driverArrived: true,
      driverArrivedAt: new Date().toISOString(),
    });
    showToast("📍 Client notifié de ton arrivée !");
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
      snap => {
        const txns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!isFirstWalletLoad.current) {
          const newIds = snap.docs.map(d => d.id).filter(id => !prevWalletIdsRef.current.has(id));
          if (newIds.length > 0) {
            const newestDoc = snap.docs.find(d => newIds.includes(d.id));
            if (newestDoc) {
              const data = newestDoc.data();
              if (data.type !== "payment") {
                rewardKeyRef.current++;
                const key = rewardKeyRef.current;
                setRewardChips(prev => [...prev, { amount: data.amount || 0, key }]);
                setTimeout(() => setRewardChips(prev => prev.filter(c => c.key !== key)), 1600);
              }
            }
          }
        } else { isFirstWalletLoad.current = false; }
        prevWalletIdsRef.current = new Set(snap.docs.map(d => d.id));
        setWalletTxns(txns);
      }
    );
    return () => unsub();
  }, [driverData?.id, loggedIn]);

  // Listener deliveries temps réel — pour cashAReverser (argent cash à rendre)
  useEffect(() => {
    if (!driverData?.id || !loggedIn) return;
    const unsub = onSnapshot(
      query(
        collection(db, "deliveries"),
        where("driverId", "==", driverData.id),
        orderBy("createdAt", "desc")
      ),
      snap => {
        setDriverDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
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
  // Début de semaine = lundi (cumul lun→ven, paiement vendredi)
  const weekStartStr = (() => {
    const d = new Date();
    const offset = (d.getDay() - 1 + 7) % 7; // 0 si lundi, 6 si dimanche
    d.setDate(d.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  })();

  // Gains du jour — uniquement les livraisons ONLINE (les CASH vont dans cashAReverser)
  const gainsJour = walletTxns
    .filter(t => t.type !== "payment" && t.paymentType === "ONLINE" && (t.createdAt || "").slice(0, 10) === todayStr)
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
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Exo+2:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:linear-gradient(135deg,#05070F 0%,#0B1020 100%);color:#f0eeff;font-family:'Exo 2',sans-serif;}
        input{outline:none;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
        @keyframes glowLogin{0%,100%{box-shadow:0 4px 24px rgba(0,245,255,.3)}50%{box-shadow:0 4px 32px rgba(0,245,255,.6),0 0 60px rgba(0,245,255,.15)}}
      `}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
        background:"radial-gradient(ellipse 70% 60% at 50% 35%,rgba(0,245,255,.07) 0%,transparent 70%)"}}>
        <div style={{width:"100%",maxWidth:400,padding:"0 20px",animation:"fadeUp .5s both"}}>
          <div style={{textAlign:"center",marginBottom:36}}>
            <div style={{fontSize:"3rem",marginBottom:10}}>🏍️</div>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.05rem",fontWeight:900,
              background:"linear-gradient(135deg,#00f5ff,#b8ff00)",WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",letterSpacing:".08em",marginBottom:4}}>
              ESPACE LIVREUR
            </div>
            <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".72rem",color:"#5a5470",
              letterSpacing:".2em",marginTop:4,fontWeight:600}}>YASSALA NIGHT DELIVERY</div>
          </div>
          <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(0,245,255,.15)",
            borderRadius:18,padding:28,backdropFilter:"blur(10px)",
            boxShadow:"0 0 40px rgba(0,245,255,.05),0 20px 60px rgba(0,0,0,.4)"}}>
            <div style={{marginBottom:16}}>
              <label style={{fontFamily:"'Exo 2',sans-serif",fontSize:".68rem",color:"#5a5470",
                letterSpacing:".16em",display:"block",marginBottom:6,fontWeight:700}}>TÉLÉPHONE</label>
              <input value={phone} onChange={e=>setPhone(e.target.value)}
                placeholder="+594 6XX XXX XXX" type="tel"
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{width:"100%",background:"rgba(255,255,255,.04)",
                  border:"1px solid rgba(0,245,255,.15)",borderRadius:10,
                  padding:"13px 15px",color:"#f0eeff",fontFamily:"'Exo 2',sans-serif",fontSize:".95rem"}} />
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontFamily:"'Exo 2',sans-serif",fontSize:".68rem",color:"#5a5470",
                letterSpacing:".16em",display:"block",marginBottom:6,fontWeight:700}}>MOT DE PASSE</label>
              <input value={password} onChange={e=>setPassword(e.target.value)}
                placeholder="••••••" type="password"
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{width:"100%",background:"rgba(255,255,255,.04)",
                  border:"1px solid rgba(0,245,255,.15)",borderRadius:10,
                  padding:"13px 15px",color:"#f0eeff",fontFamily:"'Exo 2',sans-serif",fontSize:".95rem"}} />
            </div>
            {loginError&&<div style={{color:"#ff2d78",fontSize:".82rem",fontFamily:"'Exo 2',sans-serif",
              fontWeight:600,marginBottom:12,letterSpacing:".04em"}}>{loginError}</div>}
            <button onClick={handleLogin}
              style={{width:"100%",padding:"14px",borderRadius:12,border:"none",
                background:"linear-gradient(135deg,#00f5ff,#0090ff)",
                color:"#000",fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                fontSize:".88rem",cursor:"pointer",letterSpacing:".1em",
                animation:"glowLogin 3s infinite"}}>
              CONNEXION →
            </button>
          </div>
          <div style={{textAlign:"center",marginTop:20}}>
            <a href="/" style={{color:"#5a5470",fontFamily:"'Exo 2',sans-serif",
              fontSize:".78rem",textDecoration:"none",letterSpacing:".1em",fontWeight:600}}>
              ← RETOUR AU SHOP
            </a>
          </div>
        </div>
      </div>
    </>
  );
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

  // ── MAIN DASHBOARD (cyberpunk neon dark UI) ──────────────────────────────
  // Cash à reverser = montant cash collecté auprès des clients, non encore remis au business
  const cashToReverser = driverDeliveries
    .filter(d => d.paymentType === "CASH" && d.cashStatus === "unsettled")
    .reduce((s, d) => s + (d.cashCollectedAmount || 0), 0);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Exo+2:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:linear-gradient(135deg,#05070F 0%,#0B1020 50%,#080E1C 100%);background-attachment:fixed;color:#f0eeff;font-family:'Exo 2',sans-serif;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(0,245,255,.3);border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 8px rgba(0,245,255,.3)}50%{box-shadow:0 0 20px rgba(0,245,255,.6),0 0 40px rgba(0,245,255,.15)}}
        @keyframes slideIn{from{opacity:0;transform:translateY(-16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes gainFloat{0%{opacity:0;transform:translateY(0) scale(.8)}20%{opacity:1;transform:translateY(-15px) scale(1.1)}70%{opacity:.8;transform:translateY(-55px) scale(1)}100%{opacity:0;transform:translateY(-90px) scale(.85)}}
        @keyframes walletGlow{0%,100%{text-shadow:0 0 10px rgba(184,255,0,.6),0 0 20px rgba(184,255,0,.3)}50%{text-shadow:0 0 22px rgba(184,255,0,.9),0 0 44px rgba(184,255,0,.5),0 0 66px rgba(184,255,0,.2)}}
        @keyframes missionBlink{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes rushPulse{0%,100%{box-shadow:0 0 10px rgba(239,68,68,.3)}50%{box-shadow:0 0 24px rgba(239,68,68,.7),0 0 48px rgba(239,68,68,.2)}}
        .leaflet-container{background:#05070F !important;border-radius:12px;}
        .leaflet-tile-pane{filter:brightness(.75) contrast(1.1) saturate(.6) hue-rotate(20deg);}
      `}</style>

      {/* FLOATING REWARD CHIPS */}
      {rewardChips.map(chip=>(
        <div key={chip.key} style={{position:"fixed",bottom:140,left:"50%",
          transform:"translateX(-50%)",zIndex:9999,pointerEvents:"none",
          animation:"gainFloat 1.6s ease-out forwards"}}>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.4rem",fontWeight:900,
            color:"#b8ff00",background:"rgba(5,7,15,.9)",
            border:"1px solid rgba(184,255,0,.5)",borderRadius:20,padding:"6px 18px",
            boxShadow:"0 0 16px rgba(184,255,0,.4),0 4px 20px rgba(0,0,0,.6)",
            whiteSpace:"nowrap"}}>
            +{(chip.amount).toFixed(2)}€
          </div>
        </div>
      ))}

      {/* TOAST */}
      <div style={{position:"fixed",top:18,right:18,zIndex:10000,
        background:"rgba(184,255,0,.1)",border:"1px solid rgba(184,255,0,.4)",
        borderRadius:12,padding:"12px 18px",fontFamily:"'Exo 2',sans-serif",
        fontSize:".8rem",fontWeight:600,color:"#b8ff00",maxWidth:280,
        boxShadow:"0 8px 32px rgba(0,0,0,.4),0 0 20px rgba(184,255,0,.1)",
        transform:toast.show?"translateX(0)":"translateX(130%)",
        transition:"transform .4s cubic-bezier(.34,1.56,.64,1)"}}>
        {toast.msg}
      </div>

      {/* NEW ORDER ALERT */}
      {newOrderAlert&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9998,
          background:"linear-gradient(135deg,#ff2d78,#ff6b35)",
          padding:"14px 20px",textAlign:"center",fontFamily:"'Orbitron',sans-serif",
          fontWeight:700,fontSize:".9rem",color:"#fff",letterSpacing:".1em",
          animation:"slideIn .3s both",boxShadow:"0 4px 30px rgba(255,45,120,.5)"}}>
          🔔 NOUVELLE COMMANDE DISPONIBLE !
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmAction&&(
        <div style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,.8)",
          backdropFilter:"blur(10px)",display:"flex",alignItems:"center",
          justifyContent:"center",padding:20}}
          onClick={()=>setConfirmAction(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"rgba(8,12,26,.98)",border:"1px solid rgba(0,245,255,.2)",
              borderRadius:20,padding:"30px 28px",maxWidth:380,width:"100%",
              textAlign:"center",animation:"slideIn .2s both",
              boxShadow:"0 0 40px rgba(0,245,255,.1),0 20px 60px rgba(0,0,0,.5)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:14}}>
              {confirmAction.type==="take"?"🏍️":"✅"}
            </div>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,fontSize:"1rem",
              marginBottom:8,color:"#f0eeff",letterSpacing:".04em"}}>
              {confirmAction.type==="take"?"PRENDRE CETTE COMMANDE ?":"CONFIRMER LA LIVRAISON ?"}
            </div>
            <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".82rem",color:"#5a5470",
              marginBottom:24}}>
              {confirmAction.type==="take"?"Tu seras responsable de cette livraison.":"Cette commande sera marquée comme livrée."}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmAction(null)}
                style={{flex:1,padding:"13px",borderRadius:12,
                  border:"1px solid rgba(255,255,255,.1)",background:"transparent",
                  color:"#5a5470",fontFamily:"'Exo 2',sans-serif",fontWeight:700,
                  fontSize:".9rem",cursor:"pointer"}}>ANNULER</button>
              <button onClick={()=>confirmAction.type==="take"?takeOrder(confirmAction.id):markDelivered(confirmAction.id)}
                style={{flex:1,padding:"13px",borderRadius:12,border:"none",
                  background:confirmAction.type==="take"
                    ?"linear-gradient(135deg,#00f5ff,#0090ff)"
                    :"linear-gradient(135deg,#b8ff00,#7acc00)",
                  color:"#000",fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                  fontSize:".88rem",cursor:"pointer",letterSpacing:".06em",
                  boxShadow:confirmAction.type==="take"
                    ?"0 4px 16px rgba(0,245,255,.4)"
                    :"0 4px 16px rgba(184,255,0,.4)"}}>
                CONFIRMER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROBLEM MODAL */}
      {problemModal&&(
        <div style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,.8)",
          backdropFilter:"blur(10px)",display:"flex",alignItems:"center",
          justifyContent:"center",padding:20}}
          onClick={()=>setProblemModal(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"rgba(8,12,26,.98)",border:"1px solid rgba(255,45,120,.3)",
              borderRadius:20,padding:"28px 24px",maxWidth:380,width:"100%",
              animation:"slideIn .2s both"}}>
            <div style={{fontSize:"2rem",textAlign:"center",marginBottom:10}}>⚠️</div>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,fontSize:".95rem",
              color:"#ff2d78",textAlign:"center",marginBottom:18,letterSpacing:".06em"}}>
              SIGNALER UN PROBLÈME
            </div>
            <div style={{display:"grid",gap:8,marginBottom:14}}>
              {["Client absent / injoignable","Adresse introuvable","Problème avec la commande","Autre problème"].map(label=>(
                <a key={label}
                  href={`https://wa.me/+594694000000?text=${encodeURIComponent(`⚠️ PROBLÈME LIVRAISON\nCommande : #${(orders.find(o=>o.id===problemModal.orderId)?.orderNumber??problemModal.orderId.slice(-6).toUpperCase())}\nProblème : ${label}\nLivreur : ${driverData?.name}`)}`}
                  target="_blank" rel="noopener"
                  onClick={()=>setProblemModal(null)}
                  style={{padding:"13px 16px",borderRadius:10,
                    background:"rgba(255,45,120,.07)",border:"1px solid rgba(255,45,120,.2)",
                    color:"#ff2d78",fontFamily:"'Exo 2',sans-serif",fontWeight:600,
                    fontSize:".9rem",textDecoration:"none",display:"block",textAlign:"center"}}>
                  {label}
                </a>
              ))}
            </div>
            <button onClick={()=>setProblemModal(null)}
              style={{width:"100%",padding:"12px",borderRadius:10,
                border:"1px solid rgba(255,255,255,.08)",background:"transparent",
                color:"#5a5470",fontFamily:"'Exo 2',sans-serif",fontWeight:700,
                fontSize:".9rem",cursor:"pointer"}}>
              ANNULER
            </button>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {showHistory&&(
        <div style={{position:"fixed",inset:0,zIndex:10001,background:"rgba(0,0,0,.75)",
          backdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",
          justifyContent:"center"}}
          onClick={()=>setShowHistory(false)}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"rgba(8,12,26,.99)",borderTop:"1px solid rgba(184,255,0,.2)",
              borderRadius:"24px 24px 0 0",width:"100%",maxWidth:560,maxHeight:"85vh",
              display:"flex",flexDirection:"column",
              boxShadow:"0 -20px 60px rgba(0,0,0,.6),0 0 30px rgba(184,255,0,.05)"}}>
            <div style={{padding:"20px 20px 14px",borderBottom:"1px solid rgba(255,255,255,.06)",
              display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <span style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,fontSize:".9rem",
                color:"#b8ff00",letterSpacing:".06em"}}>HISTORIQUE DES GAINS</span>
              <button onClick={()=>setShowHistory(false)}
                style={{width:32,height:32,borderRadius:"50%",border:"1px solid rgba(255,255,255,.1)",
                  background:"rgba(255,255,255,.04)",color:"#5a5470",cursor:"pointer",fontSize:".9rem"}}>
                ✕
              </button>
            </div>
            <div style={{overflowY:"auto",flex:1}}>
              {walletTxns.length===0?(
                <div style={{padding:"40px 20px",textAlign:"center",color:"#3a3455",
                  fontFamily:"'Exo 2',sans-serif",fontSize:".8rem"}}>
                  Aucune transaction pour l&apos;instant
                </div>
              ):(
                walletTxns.map((t,i)=>{
                  const isPayment=t.type==="payment";
                  const amount=t.amount||0;
                  const date=t.createdAt?new Date(t.createdAt):null;
                  const isToday=t.createdAt?.slice(0,10)===todayStr;
                  return (
                    <div key={t.id||i}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"13px 20px",
                        borderBottom:i<walletTxns.length-1?"1px solid rgba(255,255,255,.04)":"none",
                        background:isPayment?"rgba(0,245,255,.03)":"transparent"}}>
                      <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
                        background:isPayment?"rgba(0,245,255,.1)":"rgba(184,255,0,.08)",
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem"}}>
                        {isPayment?"🏦":t.type==="bonus"?"⭐":"🏍️"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Exo 2',sans-serif",fontWeight:600,fontSize:".88rem",
                          color:isPayment?"#00f5ff":"#f0eeff",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {t.description||(isPayment?"Virement du vendredi":"Livraison")}
                        </div>
                        <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".62rem",
                          color:"#5a5470",marginTop:2}}>
                          {isToday?`aujourd'hui ${date?.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`:date?.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}
                        </div>
                      </div>
                      <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:".95rem",fontWeight:700,
                        color:isPayment?"#00f5ff":amount>=0?"#b8ff00":"#ff2d78",flexShrink:0,
                        textShadow:isPayment?"0 0 8px rgba(0,245,255,.4)":"0 0 8px rgba(184,255,0,.4)"}}>
                        {isPayment?`-${Math.abs(amount).toFixed(2)}€`:`+${amount.toFixed(2)}€`}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#05070F 0%,#0B1020 50%,#080E1C 100%)",backgroundAttachment:"fixed",paddingBottom:110}}>

        {/* STICKY HEADER */}
        <header style={{background:"rgba(5,7,15,.9)",backdropFilter:"blur(24px)",
          borderBottom:"1px solid rgba(0,245,255,.1)",padding:"13px 20px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          position:"sticky",top:0,zIndex:50,
          boxShadow:"0 2px 20px rgba(0,0,0,.4)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:"1.4rem"}}>🏍️</span>
            <div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:".78rem",fontWeight:900,
                background:"linear-gradient(135deg,#00f5ff,#b8ff00)",
                WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:".08em"}}>
                YASSALA
              </div>
              <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".6rem",color:"#5a5470",
                letterSpacing:".16em",fontWeight:600}}>ESPACE LIVREUR</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {myOrders.length>0&&(
              <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".7rem",fontWeight:700,
                color:"#ff2d78",animation:"missionBlink 1.2s infinite",letterSpacing:".06em"}}>
                ⚡ MISSION
              </div>
            )}
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".88rem",color:"#f0eeff"}}>
                {driverData?.name}
              </div>
              <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".65rem",color:"#5a5470"}}>
                {driverData?.zone||driverData?.phone}
              </div>
            </div>
            <button onClick={()=>{
              stopGPS();
              if(heartbeatRef.current){clearInterval(heartbeatRef.current);heartbeatRef.current=null;}
              if(driverData?.id){
                setDoc(doc(db,"drivers",driverData.id),{isOnline:false,status:"offline",lastSeen:serverTimestamp()},{merge:true}).catch(()=>{});
              }
              setLoggedIn(false);setDriverData(null);setPhone("");setPassword("");
              localStorage.removeItem("yassala_driver");
            }}
              style={{width:32,height:32,borderRadius:"50%",border:"1px solid rgba(255,255,255,.1)",
                background:"rgba(255,255,255,.04)",color:"#5a5470",cursor:"pointer",
                fontSize:".85rem",display:"flex",alignItems:"center",justifyContent:"center"}}>
              ✕
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <div style={{maxWidth:560,margin:"0 auto",padding:"18px 16px"}}>

          {/* ═══════════════ HOME TAB ═══════════════ */}
          {activeTab==="home"&&(
            <div style={{animation:"fadeUp .35s both"}}>

              {/* GPS strip */}
              <div style={{marginBottom:14,padding:"10px 16px",
                background:gpsActive?"rgba(184,255,0,.06)":"rgba(255,255,255,.02)",
                border:`1px solid ${gpsActive?"rgba(184,255,0,.2)":"rgba(255,255,255,.06)"}`,
                borderRadius:14,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",
                  background:gpsActive?"#b8ff00":"#3a3455",
                  boxShadow:gpsActive?"0 0 8px #b8ff00":"none",
                  animation:gpsActive?"glowPulse 2s infinite":"none"}} />
                <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".72rem",fontWeight:600,
                  color:gpsActive?"#b8ff00":"#5a5470",letterSpacing:".1em",flex:1}}>
                  {gpsActive?"📡 GPS ACTIF — POSITION PARTAGÉE":"GPS INACTIF"}
                </span>
                <div style={{display:"flex",gap:4}}>
                  {(["scooter","velo","voiture"] as const).map(t=>(
                    <button key={t} onClick={()=>{
                      setTransportType(t);
                      if(driverData?.id) updateDoc(doc(db,"driver_applications",driverData.id),{transport:t}).catch(()=>{});
                    }} style={{padding:"4px 10px",borderRadius:8,cursor:"pointer",
                      border:transportType===t?"1px solid rgba(0,245,255,.4)":"1px solid transparent",
                      background:transportType===t?"rgba(0,245,255,.12)":"transparent",
                      color:transportType===t?"#00f5ff":"#5a5470",
                      transition:"all .2s",fontSize:".9rem"}}>
                      {t==="scooter"?"🏍️":t==="velo"?"🚲":"🚗"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3 STAT CARDS */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                <div style={{background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.2)",
                  borderRadius:16,padding:"14px 10px",textAlign:"center",
                  boxShadow:"0 0 20px rgba(0,245,255,.08),inset 0 1px 0 rgba(0,245,255,.1)"}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.9rem",fontWeight:900,
                    color:"#00f5ff",textShadow:"0 0 12px rgba(0,245,255,.7),0 0 24px rgba(0,245,255,.3)",
                    lineHeight:1,marginBottom:5}}>{stats.today}</div>
                  <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".58rem",color:"#5a5470",
                    letterSpacing:".1em",fontWeight:600}}>COURSES{"\n"}AUJOURD&apos;HUI</div>
                </div>
                <div style={{background:"rgba(184,255,0,.03)",border:"1px solid rgba(184,255,0,.18)",
                  borderRadius:16,padding:"14px 10px",textAlign:"center",
                  boxShadow:"0 0 20px rgba(184,255,0,.06),inset 0 1px 0 rgba(184,255,0,.08)"}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.9rem",fontWeight:900,
                    color:"#b8ff00",textShadow:"0 0 12px rgba(184,255,0,.7),0 0 24px rgba(184,255,0,.3)",
                    lineHeight:1,marginBottom:5}}>{stats.total}</div>
                  <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".58rem",color:"#5a5470",
                    letterSpacing:".1em",fontWeight:600}}>COURSES{"\n"}TOTALES</div>
                </div>
                <div style={{background:"rgba(184,255,0,.05)",border:"1px solid rgba(184,255,0,.25)",
                  borderRadius:16,padding:"14px 10px",textAlign:"center",
                  boxShadow:"0 0 20px rgba(184,255,0,.1),inset 0 1px 0 rgba(184,255,0,.12)"}}>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.4rem",fontWeight:900,
                    color:"#b8ff00",textShadow:"0 0 12px rgba(184,255,0,.7),0 0 24px rgba(184,255,0,.3)",
                    lineHeight:1,marginBottom:5}}>{gainsJour.toFixed(0)}€</div>
                  <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".58rem",color:"#5a5470",
                    letterSpacing:".1em",fontWeight:600}}>GAINS{"\n"}DU JOUR</div>
                </div>
              </div>

              {/* MAIN WALLET CARD */}
              <div style={{background:"linear-gradient(135deg,rgba(184,255,0,.07) 0%,rgba(0,245,255,.04) 100%)",
                border:"1px solid rgba(184,255,0,.25)",borderRadius:20,padding:"20px",
                marginBottom:12,position:"relative",overflow:"hidden",
                boxShadow:"0 0 40px rgba(184,255,0,.1),0 20px 40px rgba(0,0,0,.4)"}}>
                <div style={{position:"absolute",right:-30,bottom:-30,width:160,height:160,
                  borderRadius:"50%",background:"radial-gradient(circle,rgba(184,255,0,.1) 0%,transparent 70%)",
                  pointerEvents:"none"}} />
                <div style={{position:"absolute",left:-20,top:-20,width:100,height:100,
                  borderRadius:"50%",background:"radial-gradient(circle,rgba(0,245,255,.06) 0%,transparent 70%)",
                  pointerEvents:"none"}} />
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14}}>
                  <div>
                    <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".6rem",color:"#7a7490",
                      letterSpacing:".18em",fontWeight:700,marginBottom:2}}>PORTEFEUILLE</div>
                    <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".68rem",color:"#5a5470",
                      letterSpacing:".1em"}}>— CETTE SEMAINE</div>
                  </div>
                  <button onClick={()=>setShowHistory(true)} style={{
                    background:"rgba(184,255,0,.08)",border:"1px solid rgba(184,255,0,.3)",
                    borderRadius:10,padding:"7px 12px",color:"#b8ff00",
                    fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".68rem",
                    cursor:"pointer",letterSpacing:".06em",
                    boxShadow:"0 0 12px rgba(184,255,0,.12)"}}>
                    VOIR HISTORIQUE →
                  </button>
                </div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"3rem",fontWeight:900,
                  color:"#b8ff00",animation:portefeuilleWeek>0?"walletGlow 3s ease-in-out infinite":"none",
                  lineHeight:1,marginBottom:8}}>
                  {portefeuilleWeek.toFixed(2)}€
                </div>
                <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".74rem",color:"#7a7490",marginBottom:14}}>
                  À recevoir vendredi {nextFriday} :
                  <span style={{color:"#b8ff00",fontWeight:700,marginLeft:5,
                    textShadow:"0 0 8px rgba(184,255,0,.4)"}}>
                    {portefeuilleWeek.toFixed(2)}€
                  </span>
                </div>
                {derniereTransaction&&(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    paddingTop:12,borderTop:"1px solid rgba(255,255,255,.06)"}}>
                    <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".72rem",color:"#5a5470"}}>
                      Dernière livraison
                    </span>
                    <span style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,fontSize:".95rem",
                      color:"#00f5c8",textShadow:"0 0 10px rgba(0,245,200,.5)"}}>
                      +{(derniereTransaction.amount||0).toFixed(2)}€
                    </span>
                  </div>
                )}
              </div>

              {/* FINANCIAL PILLS */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div style={{background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.22)",
                  borderRadius:14,padding:"13px 14px",boxShadow:"0 0 14px rgba(0,245,255,.07)"}}>
                  <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".58rem",color:"#5a5470",
                    letterSpacing:".12em",fontWeight:600,marginBottom:5}}>SOLDE DISPONIBLE</div>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.15rem",fontWeight:700,
                    color:"#00f5ff",textShadow:"0 0 10px rgba(0,245,255,.5)"}}>
                    {gainsJour.toFixed(2)}€
                  </div>
                </div>
                <div style={{background:"rgba(255,45,120,.04)",border:"1px solid rgba(255,45,120,.22)",
                  borderRadius:14,padding:"13px 14px",boxShadow:"0 0 14px rgba(255,45,120,.07)"}}>
                  <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".58rem",color:"#5a5470",
                    letterSpacing:".12em",fontWeight:600,marginBottom:5}}>CASH À REVERSER</div>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.15rem",fontWeight:700,
                    color:"#ff2d78",textShadow:"0 0 10px rgba(255,45,120,.5)"}}>
                    {cashToReverser.toFixed(2)}€
                  </div>
                </div>
              </div>

              {/* HISTORY PREVIEW */}
              <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
                borderRadius:16,overflow:"hidden"}}>
                <div style={{padding:"13px 18px",borderBottom:"1px solid rgba(255,255,255,.05)",
                  display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".72rem",
                    color:"#7a7490",letterSpacing:".12em"}}>HISTORIQUE DES GAINS</span>
                  {walletTxns.filter(t=>t.type!=="payment").length>4&&(
                    <button onClick={()=>setShowHistory(true)}
                      style={{background:"none",border:"none",color:"#5a5470",
                        fontFamily:"'Exo 2',sans-serif",fontSize:".65rem",cursor:"pointer"}}>
                      Tout voir →
                    </button>
                  )}
                </div>
                {walletTxns.filter(t=>t.type!=="payment").length===0?(
                  <div style={{padding:"24px",textAlign:"center",color:"#3a3455",
                    fontFamily:"'Exo 2',sans-serif",fontSize:".75rem"}}>
                    Aucune transaction pour l&apos;instant
                  </div>
                ):(
                  walletTxns.filter(t=>t.type!=="payment").slice(0,4).map((t,i)=>{
                    const date=t.createdAt?new Date(t.createdAt):null;
                    const isToday=t.createdAt?.slice(0,10)===todayStr;
                    return (
                      <div key={t.id||i} style={{display:"flex",alignItems:"center",gap:12,
                        padding:"11px 18px",
                        borderBottom:i<3?"1px solid rgba(255,255,255,.04)":"none"}}>
                        <div style={{width:32,height:32,borderRadius:10,
                          background:"rgba(184,255,0,.08)",display:"flex",
                          alignItems:"center",justifyContent:"center",fontSize:".9rem",flexShrink:0}}>
                          {t.type==="bonus"?"⭐":"🏍️"}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:"'Exo 2',sans-serif",fontWeight:600,fontSize:".85rem",
                            color:"#d0d0e0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {t.description||"Livraison"}
                          </div>
                          <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".6rem",color:"#5a5470",marginTop:2}}>
                            {isToday?`aujourd'hui ${date?.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`:date?.toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}
                          </div>
                        </div>
                        <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,fontSize:".9rem",
                          color:"#b8ff00",textShadow:"0 0 8px rgba(184,255,0,.4)",flexShrink:0}}>
                          +{(t.amount||0).toFixed(2)}€
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ COMMANDES TAB ═══════════════ */}
          {activeTab==="commandes"&&(
            <div style={{animation:"fadeUp .35s both"}}>
              {myOrders.length>0&&(
                <div style={{marginBottom:12,background:"rgba(255,45,120,.06)",
                  border:"1px solid rgba(255,45,120,.3)",borderRadius:12,
                  padding:"10px 16px",display:"flex",alignItems:"center",gap:10,
                  boxShadow:"0 0 20px rgba(255,45,120,.1)"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#ff2d78",
                    boxShadow:"0 0 8px #ff2d78",animation:"missionBlink 1.2s infinite"}} />
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:".78rem",fontWeight:700,
                      background:"linear-gradient(135deg,#ff2d78,#ff9500)",
                      WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:".04em"}}>
                      MISSION EN COURS
                    </div>
                    <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".65rem",color:"#5a5470",marginTop:2}}>
                      {myOrders.length} commande{myOrders.length>1?"s":""} active{myOrders.length>1?"s":""}
                    </div>
                  </div>
                </div>
              )}
              {myOrders.length>1&&(
                <div style={{marginBottom:12,background:"rgba(0,245,255,.07)",
                  border:"1px solid rgba(0,245,255,.25)",borderRadius:12,
                  padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
                  <span>⚡</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".78rem",color:"#00f5ff"}}>
                      {myOrders.length} COMMANDES EN PARALLÈLE
                    </div>
                    <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".65rem",color:"#5a5470",marginTop:2}}>
                      Mode multi-livraison actif · livrez dans l&apos;ordre affiché
                    </div>
                  </div>
                  <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.3rem",color:"#00f5ff",opacity:.7}}>
                    {myOrders.length}/2
                  </div>
                </div>
              )}

              {/* Filter tabs */}
              <div style={{display:"flex",gap:6,marginBottom:16}}>
                {([
                  {key:"available" as const,label:"DISPO",count:availableOrders.length,color:"#ff2d78"},
                  {key:"mine" as const,label:"EN COURS",count:myOrders.length,color:"#00f5ff"},
                  {key:"delivered" as const,label:"AUJOURD'HUI",count:deliveredOrders.length,color:"#b8ff00"},
                ]).map(t=>(
                  <button key={t.key} onClick={()=>setFilter(t.key)} style={{
                    flex:1,padding:"10px 6px",borderRadius:12,cursor:"pointer",
                    fontFamily:"'Exo 2',sans-serif",fontWeight:700,
                    fontSize:".72rem",letterSpacing:".06em",
                    border:filter===t.key?`1px solid ${t.color}44`:"1px solid rgba(255,255,255,.05)",
                    background:filter===t.key?`${t.color}14`:"rgba(255,255,255,.02)",
                    color:filter===t.key?t.color:"#5a5470",
                    boxShadow:filter===t.key?`0 0 14px ${t.color}1a`:"none",
                    transition:"all .2s"}}>
                    {t.label}
                    {t.count>0&&(
                      <span style={{marginLeft:5,
                        background:filter===t.key?t.color:"rgba(255,255,255,.08)",
                        color:filter===t.key?"#000":"#5a5470",
                        borderRadius:8,padding:"1px 6px",fontSize:".68rem",fontWeight:700}}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Orders */}
              {displayOrders.length===0?(
                <div style={{textAlign:"center",color:"#5a5470",padding:"50px 20px",
                  border:"1px dashed rgba(255,255,255,.07)",borderRadius:16}}>
                  <div style={{fontSize:"2.5rem",marginBottom:10}}>
                    {filter==="available"?"📭":filter==="mine"?"🏍️":"📦"}
                  </div>
                  <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".82rem",letterSpacing:".1em"}}>
                    {filter==="available"?"Aucune commande disponible":
                     filter==="mine"?"Aucune course en cours":
                     "Aucune livraison aujourd'hui"}
                  </div>
                </div>
              ):(
                <div style={{display:"grid",gap:12}}>
                  {displayOrders.map(o=>{
                    const isMine=o.assignedDriver===driverData?.id;
                    return (
                      <div key={o.id} style={{
                        background:o.isRush?"rgba(239,68,68,.05)":"rgba(255,255,255,.025)",
                        border:`1px solid ${o.isRush?"rgba(239,68,68,.5)":o.status==="nouveau"&&!o.assignedDriver?"rgba(255,45,120,.3)":isMine?"rgba(0,245,255,.2)":"rgba(255,255,255,.07)"}`,
                        borderRadius:16,padding:"16px 18px",transition:"all .15s",
                        boxShadow:o.isRush?"0 0 16px rgba(239,68,68,.12)":"none",
                        animation:o.isRush?"rushPulse 1.5s infinite":o.status==="nouveau"&&!o.assignedDriver?"glowPulse 3s infinite":"none"}}>
                        {o.isRush&&(
                          <div style={{background:"#ef4444",color:"#fff",padding:"6px 12px",
                            borderRadius:8,fontFamily:"'Exo 2',sans-serif",fontWeight:700,
                            fontSize:".82rem",letterSpacing:".1em",marginBottom:10,
                            display:"flex",alignItems:"center",gap:8}}>
                            🚨 COMMANDE RUSH
                            {o.rushFee&&<span style={{marginLeft:"auto"}}>+{o.rushFee.toFixed(2)} €</span>}
                          </div>
                        )}
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                          gap:10,marginBottom:10}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                              <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1rem",
                                fontWeight:700,color:"#ff2d78"}}>
                                #{o.orderNumber??o.id.slice(-6).toUpperCase()}
                              </span>
                              <span style={{fontSize:".68rem",
                                background:`${statusColor(o.status)}18`,color:statusColor(o.status),
                                borderRadius:6,padding:"2px 8px",fontFamily:"'Exo 2',sans-serif",
                                fontWeight:700,border:`1px solid ${statusColor(o.status)}33`,
                                letterSpacing:".06em"}}>
                                {statusLabel(o.status)}
                              </span>
                              {o.paidOnline&&(
                                <span style={{fontSize:".68rem",background:"rgba(184,255,0,.12)",
                                  color:"#b8ff00",borderRadius:6,padding:"2px 8px",
                                  fontFamily:"'Exo 2',sans-serif",fontWeight:700}}>💳 PAYÉ</span>
                              )}
                            </div>
                            <div style={{fontSize:".7rem",color:"#5a5470",fontFamily:"'Exo 2',sans-serif"}}>
                              {timeSince(o.createdAt)}
                            </div>
                          </div>
                          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"1.3rem",fontWeight:700,
                            color:"#b8ff00",textShadow:"0 0 10px rgba(184,255,0,.35)",flexShrink:0}}>
                            {Number(o.total).toFixed(2)}€
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,
                          padding:"10px 12px",background:"rgba(255,255,255,.025)",borderRadius:12,
                          border:"1px solid rgba(255,255,255,.05)"}}>
                          <div style={{width:36,height:36,borderRadius:"50%",
                            background:"rgba(0,245,255,.08)",border:"1px solid rgba(0,245,255,.15)",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:"1rem",flexShrink:0}}>👤</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".92rem"}}>
                              {o.name||"Client"}
                            </div>
                            <div style={{fontSize:".75rem",color:"#5a5470",fontFamily:"'Exo 2',sans-serif"}}>
                              {o.phone}
                            </div>
                          </div>
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            <a href={`tel:${o.phone}`} style={{width:36,height:36,borderRadius:"50%",
                              background:"rgba(0,245,255,.1)",border:"1px solid rgba(0,245,255,.2)",
                              display:"flex",alignItems:"center",justifyContent:"center",
                              textDecoration:"none",fontSize:".95rem"}}>📞</a>
                            <a href={`https://wa.me/${o.phone.replace(/[^0-9+]/g,"")}?text=${encodeURIComponent(`Bonjour ${o.name||""}, votre livreur Yassala est en route ! 🏍️`)}`}
                              target="_blank" rel="noopener"
                              style={{width:36,height:36,borderRadius:"50%",
                                background:"rgba(37,211,102,.1)",border:"1px solid rgba(37,211,102,.3)",
                                display:"flex",alignItems:"center",justifyContent:"center",
                                textDecoration:"none",fontSize:".95rem"}}>💬</a>
                          </div>
                        </div>
                        {o.address&&(
                          <div style={{marginBottom:10}}>
                            <div style={{background:"rgba(0,245,255,.05)",border:"1px solid rgba(0,245,255,.12)",
                              borderRadius:expandedMap===o.id?"10px 10px 0 0":10,
                              padding:"10px 12px",display:"flex",alignItems:"center",gap:8,
                              cursor:o.lat?"pointer":"default"}}
                              onClick={()=>{
                                if(o.lat&&o.lng){
                                  if(expandedMap===o.id){cleanupMap(`map-${o.id}`);setExpandedMap(null);}
                                  else{if(expandedMap)cleanupMap(`map-${expandedMap}`);setExpandedMap(o.id);}
                                }
                              }}>
                              <span style={{flexShrink:0}}>📍</span>
                              <span style={{color:"#00f5ff",lineHeight:1.4,flex:1,fontSize:".88rem"}}>{o.address}</span>
                              {o.lat&&o.lng&&(
                                <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".7rem",color:"#5a5470",flexShrink:0}}>
                                  {expandedMap===o.id?"▲":"🗺️"}
                                </span>
                              )}
                            </div>
                            {o.lat&&o.lng&&etaData[o.id]&&(
                              <div style={{display:"flex",gap:8,padding:"8px 12px",
                                background:"rgba(184,255,0,.06)",borderLeft:"3px solid #b8ff00",
                                borderRight:"1px solid rgba(184,255,0,.1)",
                                borderBottom:expandedMap===o.id?"none":"1px solid rgba(184,255,0,.1)",
                                borderRadius:expandedMap===o.id?0:"0 0 10px 10px"}}>
                                <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                                  <span>🕐</span>
                                  <span style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                                    fontSize:".9rem",color:"#b8ff00"}}>{etaData[o.id].duration}</span>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <span>📏</span>
                                  <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".8rem",
                                    color:"#5a5470"}}>{etaData[o.id].distance}</span>
                                </div>
                              </div>
                            )}
                            {expandedMap===o.id&&o.lat&&o.lng&&(
                              <div style={{border:"1px solid rgba(0,245,255,.12)",borderTop:"none",
                                borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
                                <div id={`map-${o.id}`} style={{height:200,width:"100%"}} />
                                <div style={{padding:"8px 12px",background:"rgba(0,0,0,.4)",display:"flex",gap:8}}>
                                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}&travelmode=driving`}
                                    target="_blank" rel="noopener"
                                    style={{flex:1,padding:"8px",borderRadius:8,textAlign:"center",
                                      background:"rgba(0,245,255,.1)",border:"1px solid rgba(0,245,255,.2)",
                                      color:"#00f5ff",fontFamily:"'Exo 2',sans-serif",fontWeight:700,
                                      fontSize:".82rem",textDecoration:"none",letterSpacing:".04em"}}>
                                    🧭 GOOGLE MAPS
                                  </a>
                                  <a href={`https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`}
                                    target="_blank" rel="noopener"
                                    style={{padding:"8px 14px",borderRadius:8,textAlign:"center",
                                      background:"rgba(51,122,255,.1)",border:"1px solid rgba(51,122,255,.2)",
                                      color:"#337aff",fontFamily:"'Exo 2',sans-serif",fontWeight:700,
                                      fontSize:".82rem",textDecoration:"none"}}>
                                    WAZE
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{background:"rgba(255,255,255,.02)",borderRadius:10,padding:"10px 12px",
                          marginBottom:12,border:"1px solid rgba(255,255,255,.05)"}}>
                          <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".65rem",color:"#5a5470",
                            letterSpacing:".1em",marginBottom:5,fontWeight:600}}>ARTICLES</div>
                          {o.items.split("\n").map((line,i)=>(
                            <div key={i} style={{fontSize:".85rem",padding:"2px 0",color:"#d0d0e0",
                              fontFamily:"'Exo 2',sans-serif"}}>{line}</div>
                          ))}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                          background:o.paidOnline?"rgba(184,255,0,.05)":"rgba(255,165,0,.05)",
                          border:`1px solid ${o.paidOnline?"rgba(184,255,0,.15)":"rgba(255,165,0,.15)"}`,
                          borderRadius:10,marginBottom:10}}>
                          <span>{o.paidOnline?"💳":"💵"}</span>
                          <span style={{fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".88rem",
                            color:o.paidOnline?"#b8ff00":"#ffa500"}}>
                            {o.paidOnline?"PAYÉ EN LIGNE":"PAIEMENT EN ESPÈCES"}
                          </span>
                          {!o.paidOnline&&(
                            <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".7rem",
                              color:"#5a5470",marginLeft:"auto"}}>
                              Récupérer {Number(o.total).toFixed(2)}€
                            </span>
                          )}
                        </div>
                        {filter==="available"&&!o.assignedDriver&&(
                          <button onClick={()=>setConfirmAction({id:o.id,type:"take"})} style={{
                            width:"100%",padding:"14px",borderRadius:12,border:"none",
                            background:"linear-gradient(135deg,#00f5ff,#0090ff)",
                            color:"#000",fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                            fontSize:".88rem",cursor:"pointer",letterSpacing:".08em",
                            boxShadow:"0 4px 20px rgba(0,245,255,.35)"}}>
                            🏍️ JE PRENDS CETTE COMMANDE
                          </button>
                        )}
                        {filter==="mine"&&isMine&&(
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>
                            {!o.driverArrived ? (
                              <button onClick={()=>notifyArrival(o.id)} style={{
                                width:"100%",padding:"13px",borderRadius:12,border:"none",
                                background:"linear-gradient(135deg,#ff9500,#ff6200)",
                                color:"#fff",fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                                fontSize:".88rem",cursor:"pointer",letterSpacing:".06em",
                                boxShadow:"0 4px 16px rgba(255,149,0,.4)"}}>
                                📍 JE SUIS LÀ !
                              </button>
                            ) : (
                              <div style={{
                                padding:"11px 14px",borderRadius:12,textAlign:"center",
                                background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",
                                fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".82rem",
                                color:"#ff9500",letterSpacing:".04em"}}>
                                ✓ Client notifié de ton arrivée
                              </div>
                            )}
                            <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8}}>
                              <button onClick={()=>setConfirmAction({id:o.id,type:"deliver"})} style={{
                                padding:"14px",borderRadius:12,border:"none",
                                background:"linear-gradient(135deg,#b8ff00,#7acc00)",
                                color:"#000",fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                                fontSize:".88rem",cursor:"pointer",letterSpacing:".06em",
                                boxShadow:"0 4px 16px rgba(184,255,0,.35)"}}>
                                ✓ LIVRÉ
                              </button>
                              <a href={`https://wa.me/${o.phone.replace(/[^0-9+]/g,"")}?text=${encodeURIComponent(`Bonjour ${o.name||""}, votre livreur Yassala est en route ! 🏍️`)}`}
                                target="_blank" rel="noopener"
                                style={{padding:"14px 16px",borderRadius:12,
                                  background:"rgba(37,211,102,.1)",border:"1px solid rgba(37,211,102,.3)",
                                  color:"#25d366",display:"flex",alignItems:"center",
                                  justifyContent:"center",textDecoration:"none",fontSize:"1.1rem"}}>💬</a>
                              <button onClick={()=>setProblemModal({orderId:o.id})} style={{
                                padding:"14px 16px",borderRadius:12,
                                border:"1px solid rgba(255,45,120,.3)",background:"rgba(255,45,120,.07)",
                                color:"#ff2d78",cursor:"pointer",fontSize:"1rem"}}>⚠️</button>
                            </div>
                          </div>
                        )}
                        {filter==="delivered"&&(
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            padding:"8px 12px",background:"rgba(184,255,0,.06)",borderRadius:10,
                            border:"1px solid rgba(184,255,0,.12)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{color:"#b8ff00"}}>✓</span>
                              <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".8rem",
                                fontWeight:700,color:"#b8ff00"}}>LIVRÉ</span>
                            </div>
                            {o.deliveredAt&&(
                              <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".72rem",color:"#5a5470"}}>
                                {new Date(o.deliveredAt).toLocaleString("fr-FR")}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{height:20}} />
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ MENU TAB ═══════════════ */}
          {activeTab==="menu"&&(
            <div style={{animation:"fadeUp .35s both"}}>
              <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",
                borderRadius:20,padding:"20px",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                  <div style={{width:54,height:54,borderRadius:"50%",
                    background:"linear-gradient(135deg,rgba(0,245,255,.2),rgba(184,255,0,.1))",
                    border:"2px solid rgba(0,245,255,.3)",display:"flex",
                    alignItems:"center",justifyContent:"center",
                    fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:"1.3rem",color:"#00f5ff"}}>
                    {driverData?.name?.charAt(0)?.toUpperCase()||"?"}
                  </div>
                  <div>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,fontSize:".95rem",
                      color:"#f0eeff"}}>{driverData?.name}</div>
                    <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".72rem",
                      color:"#5a5470",marginTop:2}}>{driverData?.zone||driverData?.phone}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:"#b8ff00",
                        boxShadow:"0 0 6px #b8ff00"}} />
                      <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".65rem",
                        color:"#b8ff00",fontWeight:600,letterSpacing:".08em"}}>EN LIGNE</span>
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[["Téléphone",driverData?.phone],["Zone",driverData?.zone||"—"],
                    ["Total livraisons",String(stats.total)],["Aujourd'hui",String(stats.today)]
                  ].map(([k,v])=>(
                    <div key={k} style={{background:"rgba(255,255,255,.02)",
                      border:"1px solid rgba(255,255,255,.05)",borderRadius:10,padding:"10px 12px"}}>
                      <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".6rem",
                        color:"#5a5470",letterSpacing:".1em",marginBottom:3}}>{k}</div>
                      <div style={{fontFamily:"'Exo 2',sans-serif",fontWeight:600,
                        fontSize:".85rem",color:"#f0eeff"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{background:"rgba(255,255,255,.025)",border:"1px solid rgba(255,255,255,.07)",
                borderRadius:16,padding:"16px",marginBottom:14}}>
                <div style={{fontFamily:"'Exo 2',sans-serif",fontSize:".68rem",color:"#7a7490",
                  letterSpacing:".12em",fontWeight:600,marginBottom:12}}>PARAMÈTRES</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".85rem",
                    color:gpsActive?"#b8ff00":"#5a5470"}}>
                    {gpsActive?"📡 GPS actif":"GPS inactif"}
                  </span>
                  <button onClick={gpsActive?stopGPS:startGPS} style={{
                    padding:"8px 16px",borderRadius:10,cursor:"pointer",
                    border:gpsActive?"1px solid rgba(255,45,120,.3)":"1px solid rgba(184,255,0,.3)",
                    background:gpsActive?"rgba(255,45,120,.08)":"rgba(184,255,0,.08)",
                    color:gpsActive?"#ff2d78":"#b8ff00",
                    fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:".8rem"}}>
                    {gpsActive?"DÉSACTIVER":"ACTIVER"}
                  </button>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {(["scooter","velo","voiture"] as const).map(t=>(
                    <button key={t} onClick={()=>{
                      setTransportType(t);
                      if(driverData?.id) updateDoc(doc(db,"driver_applications",driverData.id),{transport:t}).catch(()=>{});
                    }} style={{flex:1,padding:"10px 4px",borderRadius:10,cursor:"pointer",
                      border:transportType===t?"1px solid rgba(0,245,255,.4)":"1px solid rgba(255,255,255,.07)",
                      background:transportType===t?"rgba(0,245,255,.12)":"rgba(255,255,255,.02)",
                      color:transportType===t?"#00f5ff":"#5a5470",
                      fontFamily:"'Exo 2',sans-serif",fontWeight:600,fontSize:".8rem",transition:"all .2s"}}>
                      {t==="scooter"?"🏍️":t==="velo"?"🚲":"🚗"}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={()=>{
                stopGPS();
                if(heartbeatRef.current){clearInterval(heartbeatRef.current);heartbeatRef.current=null;}
                if(driverData?.id){
                  setDoc(doc(db,"drivers",driverData.id),{isOnline:false,status:"offline",lastSeen:serverTimestamp()},{merge:true}).catch(()=>{});
                }
                setLoggedIn(false);setDriverData(null);setPhone("");setPassword("");
                localStorage.removeItem("yassala_driver");
              }} style={{width:"100%",padding:"14px",borderRadius:14,
                border:"1px solid rgba(255,45,120,.3)",background:"rgba(255,45,120,.06)",
                color:"#ff2d78",fontFamily:"'Orbitron',sans-serif",fontWeight:700,
                fontSize:".9rem",cursor:"pointer",letterSpacing:".08em",
                boxShadow:"0 0 14px rgba(255,45,120,.08)"}}>
                ✕ SE DÉCONNECTER
              </button>
            </div>
          )}

        </div>

        {/* FLOATING BOTTOM NAVBAR */}
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
          width:"calc(100% - 40px)",maxWidth:420,zIndex:200}}>
          <div style={{background:"rgba(5,7,15,.94)",backdropFilter:"blur(24px)",
            border:"1px solid rgba(255,255,255,.1)",borderRadius:28,
            padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-around",
            boxShadow:"0 8px 32px rgba(0,0,0,.6),0 0 20px rgba(0,245,255,.04),inset 0 1px 0 rgba(255,255,255,.08)"}}>
            {([
              {id:"home",icon:"🏠",label:"Home",notif:0},
              {id:"commandes",icon:"📬",label:"Commandes",notif:availableOrders.length+myOrders.length},
              {id:"menu",icon:"☰",label:"Menu",notif:0},
            ] as const).map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                padding:"8px 22px",borderRadius:20,border:"none",
                background:activeTab===tab.id?"rgba(184,255,0,.1)":"transparent",
                cursor:"pointer",position:"relative",transition:"all .3s ease",
                boxShadow:activeTab===tab.id?"0 0 18px rgba(184,255,0,.2)":"none"}}>
                {tab.notif>0&&(
                  <div style={{position:"absolute",top:4,right:10,width:18,height:18,
                    borderRadius:"50%",background:"#ff2d78",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:".55rem",fontWeight:700,color:"#fff",
                    boxShadow:"0 0 8px rgba(255,45,120,.5)"}}>
                    {tab.notif>9?"9+":tab.notif}
                  </div>
                )}
                {activeTab===tab.id&&(
                  <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
                    width:30,height:2,borderRadius:2,
                    background:"linear-gradient(90deg,transparent,#b8ff00,transparent)"}} />
                )}
                <span style={{fontSize:"1.3rem"}}>{tab.icon}</span>
                <span style={{fontFamily:"'Exo 2',sans-serif",fontSize:".62rem",fontWeight:700,
                  letterSpacing:".08em",
                  color:activeTab===tab.id?"#b8ff00":"#5a5470",
                  textShadow:activeTab===tab.id?"0 0 8px rgba(184,255,0,.6)":"none"}}>
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
