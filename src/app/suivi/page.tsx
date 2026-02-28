"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
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
  assignedDriver?: string; assignedDriverName?: string;
  lat?: number; lng?: number; orderNumber?: number;
  fulfillmentType?: 'delivery'|'pickup';
  pickupType?: 'stock'|'relay';
  pickupLocationSnapshot?: {name:string;address:string;city:string;instructions:string};
  pickupTime?: string;
  driverArrived?: boolean;
  driverArrivedAt?: string;
};

type DriverLocation = {
  lat: number; lng: number; heading: number; speed: number;
  transport: string; driverName: string; updatedAt: string;
};

const TRANSPORT_ICONS: Record<string, string> = {
  scooter: "🏍️",
  velo: "🚲",
  voiture: "🚗",
};

const STEPS_DELIVERY = [
  { key: "nouveau",   label: "Commande reçue",    icon: "📥", desc: "Votre commande a bien été enregistrée." },
  { key: "en_cours",  label: "En route",            icon: "🏍️", desc: "Votre livreur est en route vers vous !" },
  { key: "livre",     label: "Livrée",              icon: "✅", desc: "Votre commande a été livrée. Bonne soirée !" },
];

const STEPS_PICKUP = [
  { key: "nouveau",   label: "Commande reçue",   icon: "📥", desc: "Votre commande a bien été enregistrée." },
  { key: "en_cours",  label: "Prête à retirer",   icon: "🏪", desc: "Votre commande est prête ! Venez la récupérer." },
  { key: "livre",     label: "Retirée",            icon: "✅", desc: "Commande retirée. Merci et bonne soirée !" },
];

function SuiviContent() {
  const params = useSearchParams();
  const id = params.get("id");
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [driverLoc, setDriverLoc] = useState<DriverLocation | null>(null);
  const [eta, setEta] = useState<{duration: string; distance: string} | null>(null);
  const [arrivedBannerDismissed, setArrivedBannerDismissed] = useState(false);
  const mapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const mapInitRef = useRef(false);

  useEffect(() => {
    if (!id) { setNotFound(true); return; }
    const unsub = onSnapshot(doc(db, "orders", id), snap => {
      if (!snap.exists()) { setNotFound(true); return; }
      setOrder({ id: snap.id, ...snap.data() } as Order);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!order?.assignedDriver) { setDriverLoc(null); return; }
    if (order.status === "livre") { setDriverLoc(null); return; }
    const unsub = onSnapshot(doc(db, "driver_locations", order.assignedDriver), snap => {
      if (!snap.exists()) { setDriverLoc(null); return; }
      setDriverLoc(snap.data() as DriverLocation);
    });
    return () => unsub();
  }, [order?.assignedDriver, order?.status]);

  const fetchETA = useCallback(async (dLat: number, dLng: number, cLat: number, cLng: number) => {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${dLng},${dLat};${cLng},${cLat}?overview=false`
      );
      const data = await res.json();
      if (data.routes?.[0]) {
        const mins = Math.ceil(data.routes[0].duration / 60);
        const km = (data.routes[0].distance / 1000).toFixed(1);
        setEta({
          duration: mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h${mins%60}min`,
          distance: `${km} km`
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (driverLoc && order?.lat && order?.lng) {
      fetchETA(driverLoc.lat, driverLoc.lng, order.lat, order.lng);
    }
  }, [driverLoc?.lat, driverLoc?.lng, order?.lat, order?.lng]);

  const initMap = useCallback(() => {
    if (mapInitRef.current) return;
    if (!order?.lat || !order?.lng) return;
    mapInitRef.current = true;

    import("leaflet").then(L => {
      const container = document.getElementById("tracking-map");
      if (!container || (container as any)._leaflet_id) return;

      const map = L.map(container, { zoomControl: false, attributionControl: false })
        .setView([order.lat!, order.lng!], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      const clientIcon = L.divIcon({
        html: '<div style="font-size:30px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))">📍</div>',
        iconSize: [30, 30], iconAnchor: [15, 30], className: ''
      });
      L.marker([order.lat!, order.lng!], { icon: clientIcon }).addTo(map);

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    });
  }, [order?.lat, order?.lng]);

  useEffect(() => {
    if (order?.status === "en_cours" && order?.lat && order?.lng) {
      setTimeout(initMap, 100);
    }
  }, [order?.status, initMap]);

  useEffect(() => {
    if (!mapRef.current || !driverLoc) return;
    import("leaflet").then(L => {
      const transport = driverLoc.transport || "scooter";
      const emoji = TRANSPORT_ICONS[transport] || "🏍️";
      const driverIcon = L.divIcon({
        html: `<div style="font-size:32px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));transition:transform .3s;transform:rotate(${driverLoc.heading || 0}deg)">${emoji}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16], className: ''
      });

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverLoc.lat, driverLoc.lng]);
        driverMarkerRef.current.setIcon(driverIcon);
      } else {
        driverMarkerRef.current = L.marker([driverLoc.lat, driverLoc.lng], { icon: driverIcon }).addTo(mapRef.current);
      }

      const bounds = L.latLngBounds(
        [driverLoc.lat, driverLoc.lng],
        [order?.lat || driverLoc.lat, order?.lng || driverLoc.lng]
      );
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    });
  }, [driverLoc?.lat, driverLoc?.lng, driverLoc?.transport, driverLoc?.heading]);

  const isPickup = order?.fulfillmentType === 'pickup';
  const STEPS = isPickup ? STEPS_PICKUP : STEPS_DELIVERY;
  const stepIdx = order ? STEPS.findIndex(s => s.key === order.status) : -1;
  const isCancelled = order?.status === "annule";
  const isEnRoute = !isPickup && order?.status === "en_cours" && order?.assignedDriver;
  const isPickupReady = isPickup && order?.status === "en_cours";
  const isPendingPayment = order?.status === "pending_payment";
  const isPendingConfirmation = order?.status === "pending_confirmation";
  const isConfirmed = order?.status === "confirmed";

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;min-height:100vh;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 8px rgba(184,255,0,.3)}50%{box-shadow:0 0 20px rgba(184,255,0,.6)}}
        @keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-100%);}to{opacity:1;transform:translateY(0);}}
        .spin{animation:pulse 1.2s infinite;}
        .leaflet-container{background:#0a0a12 !important;border-radius:12px;}
        .leaflet-tile-pane{filter:brightness(.8) contrast(1.1) saturate(.7);}
      `}</style>

      <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",
        borderBottom:"1px solid rgba(0,245,255,.1)",background:"rgba(10,10,18,.95)",backdropFilter:"blur(20px)",
        position:"sticky",top:0,zIndex:100}}>
        <a href="/" style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",
          background:"linear-gradient(135deg,#00f5ff,#ff2d78)",WebkitBackgroundClip:"text",
          WebkitTextFillColor:"transparent",textDecoration:"none",letterSpacing:".04em"}}>
          YASSALA
        </a>
        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
          letterSpacing:".1em"}}>SUIVI EN DIRECT</span>
      </nav>

      <main style={{maxWidth:560,margin:"0 auto",padding:"24px 16px",animation:"fadeUp .4s both"}}>
        {!id && (
          <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",padding:"60px 0"}}>
            Aucun identifiant de commande fourni.
          </div>
        )}

        {id && !order && !notFound && (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div className="spin" style={{fontSize:"2rem",marginBottom:12}}>⏳</div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",color:"#5a5470"}}>Chargement...</div>
          </div>
        )}

        {notFound && (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:"2.5rem",marginBottom:16}}>❌</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",color:"#ff2d78",marginBottom:8}}>
              COMMANDE INTROUVABLE
            </div>
            <a href="/" style={{background:"linear-gradient(135deg,#ff2d78,#ff6b35)",color:"#fff",borderRadius:8,
              padding:"12px 24px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,textDecoration:"none",
              fontSize:".9rem",letterSpacing:".06em"}}>
              RETOUR AU SHOP
            </a>
          </div>
        )}

        {order && (
          <div>
            {/* Driver Arrived Banner */}
            {order.driverArrived && !arrivedBannerDismissed && order.status !== 'livre' && (
              <div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,
                background:"linear-gradient(135deg,#ff9500,#ff6200)",
                padding:"16px 20px",display:"flex",alignItems:"center",
                justifyContent:"space-between",gap:12,
                boxShadow:"0 4px 30px rgba(255,149,0,.5)",
                animation:"slideDown .4s both"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:"1.8rem",animation:"bounce 1s infinite"}}>🔔</span>
                  <div>
                    <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",color:"#fff",
                      letterSpacing:".04em"}}>
                      VOTRE LIVREUR EST LÀ !
                    </div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                      color:"rgba(255,255,255,.85)",marginTop:2}}>
                      {order.assignedDriverName||"Votre livreur"} est devant chez vous 🏠
                    </div>
                  </div>
                </div>
                <button onClick={()=>setArrivedBannerDismissed(true)}
                  style={{width:32,height:32,borderRadius:"50%",border:"none",
                    background:"rgba(255,255,255,.25)",color:"#fff",
                    cursor:"pointer",fontSize:".9rem",flexShrink:0}}>✕</button>
              </div>
            )}
            {/* Order Header */}
            <div style={{marginBottom:20}}>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",letterSpacing:".04em",marginBottom:4}}>
                {isCancelled ? "❌" : isPendingPayment ? "⏳" : isPendingConfirmation ? "🔐" : isConfirmed ? "✅" : isEnRoute ? "🏍️" : isPickupReady ? "🏪" : isPickup ? "📦" : "📦"}
                <span style={{color: isCancelled ? "#ff2d78" : isPendingPayment || isPendingConfirmation ? "#a855f7" : isConfirmed ? "#00f5ff" : "#f0eeff",marginLeft:8}}>
                  {isCancelled ? "ANNULÉE" : isPendingPayment ? "PAIEMENT EN COURS" : isPendingConfirmation ? "EN ATTENTE OTP" : isConfirmed ? "VALIDATION EN COURS" : isEnRoute ? "EN ROUTE !" : isPickupReady ? "PRÊTE À RETIRER !" : "SUIVI COMMANDE"}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470",letterSpacing:".1em"}}>
                  #{order.orderNumber || (order.id || "").slice(-8).toUpperCase()} · {new Date(order.createdAt).toLocaleString("fr-FR")}
                </div>
                {isPickup && (
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                    background:"rgba(0,245,255,.12)",color:"#00f5ff",borderRadius:3,
                    padding:"2px 7px",letterSpacing:".08em"}}>🏪 CLICK & COLLECT</span>
                )}
              </div>
            </div>

            {/* Pickup ready card */}
            {isPickupReady && (
              <div style={{marginBottom:20,borderRadius:14,overflow:"hidden",
                border:"1px solid rgba(0,245,255,.3)",
                boxShadow:"0 4px 30px rgba(0,245,255,.08)"}}>
                <div style={{background:"linear-gradient(135deg,rgba(0,245,255,.12),rgba(184,255,0,.06))",
                  padding:"18px 20px",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:"2rem",animation:"bounce 1.5s infinite"}}>🏪</div>
                  <div>
                    <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.1rem",color:"#00f5ff"}}>
                      Votre commande est prête !
                    </div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",marginTop:2}}>
                      Présentez votre numéro de commande au retrait
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE MAP - Only shows when driver is en route */}
            {isEnRoute && order.lat && order.lng && (
              <div style={{marginBottom:20,borderRadius:14,overflow:"hidden",
                border:"1px solid rgba(0,245,255,.2)",
                boxShadow:"0 4px 30px rgba(0,245,255,.08)"}}>

                {/* ETA Banner */}
                <div style={{background:"linear-gradient(135deg,rgba(184,255,0,.12),rgba(0,245,255,.08))",
                  padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",
                  borderBottom:"1px solid rgba(184,255,0,.15)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{fontSize:"1.5rem",animation:"bounce 1.5s infinite"}}>
                      {driverLoc ? (TRANSPORT_ICONS[driverLoc.transport] || "🏍️") : "⏳"}
                    </div>
                    <div>
                      <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.1rem",
                        color: driverLoc ? "#b8ff00" : "#5a5470"}}>
                        {driverLoc
                          ? (eta ? `Arrivée dans ~${eta.duration}` : "Livreur en route...")
                          : "En attente du livreur..."}
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>
                        {driverLoc
                          ? `${order.assignedDriverName || "Livreur"} · ${eta?.distance || "calcul..."}`
                          : "Le livreur va bientôt démarrer"}
                      </div>
                    </div>
                  </div>
                  {driverLoc && (
                    <div style={{width:12,height:12,borderRadius:"50%",background:"#b8ff00",
                      boxShadow:"0 0 10px #b8ff00",animation:"pulseGlow 2s infinite",flexShrink:0}} />
                  )}
                </div>

                {/* Map */}
                <div id="tracking-map" style={{height:280,width:"100%"}} />

                {/* Legend */}
                <div style={{padding:"10px 16px",background:"rgba(0,0,0,.3)",
                  display:"flex",justifyContent:"center",gap:20,
                  fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>
                  <span>📍 Ton adresse</span>
                  <span>{driverLoc ? (TRANSPORT_ICONS[driverLoc.transport] || "🏍️") : "🏍️"} Ton livreur</span>
                </div>
              </div>
            )}

            {/* Pre-confirmation banners */}
            {isPendingPayment && (
              <div style={{marginBottom:20,padding:"20px 20px",
                background:"rgba(168,85,247,.06)",border:"1px solid rgba(168,85,247,.3)",
                borderRadius:12,textAlign:"center"}}>
                <div style={{fontSize:"2rem",marginBottom:8,animation:"pulse 1.2s infinite"}}>⏳</div>
                <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.05rem",
                  color:"#a855f7",marginBottom:6}}>Vérification du paiement en cours…</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#7a7490",lineHeight:1.7}}>
                  Ton paiement Stripe est en cours de traitement.<br />
                  Cette page se mettra à jour automatiquement.
                </div>
              </div>
            )}
            {isPendingConfirmation && (
              <div style={{marginBottom:20,padding:"20px 20px",
                background:"rgba(168,85,247,.06)",border:"1px solid rgba(168,85,247,.35)",
                borderRadius:12,textAlign:"center"}}>
                <div style={{fontSize:"2rem",marginBottom:8,animation:"pulse 1.5s infinite"}}>🔐</div>
                <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.05rem",
                  color:"#a855f7",marginBottom:6}}>En attente de ta confirmation</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#7a7490",
                  lineHeight:1.7,marginBottom:14}}>
                  L'admin t'a envoyé un code OTP par WhatsApp.<br />
                  Saisis-le sur la page de confirmation pour valider ta commande.
                </div>
                {id && (
                  <a href={`/confirm?id=${id}`}
                    style={{display:"inline-block",background:"#a855f7",color:"#fff",
                      borderRadius:8,padding:"10px 22px",textDecoration:"none",
                      fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
                      letterSpacing:".06em",boxShadow:"0 0 18px rgba(168,85,247,.4)"}}>
                    🔐 ENTRER MON CODE
                  </a>
                )}
              </div>
            )}
            {isConfirmed && (
              <div style={{marginBottom:20,padding:"20px 20px",
                background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.3)",
                borderRadius:12,textAlign:"center"}}>
                <div style={{fontSize:"2rem",marginBottom:8,animation:"pulse 1.5s infinite"}}>✅</div>
                <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.05rem",
                  color:"#00f5ff",marginBottom:6}}>Code confirmé — validation admin en cours</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#7a7490",lineHeight:1.7}}>
                  Ton code a bien été accepté.<br />
                  L'admin va valider ta commande et un livreur sera assigné très bientôt.
                </div>
              </div>
            )}

            {/* Progress Steps */}
            {!isCancelled && !isPendingPayment && !isPendingConfirmation && !isConfirmed && (
              <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
                borderRadius:12,padding:"24px 20px",marginBottom:20}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:0}}>
                  {STEPS.map((step, i) => {
                    const done = i <= stepIdx;
                    const active = i === stepIdx;
                    return (
                      <div key={step.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative"}}>
                        {i < STEPS.length - 1 && (
                          <div style={{position:"absolute",top:20,left:"50%",width:"100%",height:2,
                            background: i < stepIdx ? "#b8ff00" : "rgba(255,255,255,.06)",
                            transition:"background .5s"}} />
                        )}
                        <div style={{width:42,height:42,borderRadius:"50%",display:"flex",alignItems:"center",
                          justifyContent:"center",fontSize:"1.2rem",position:"relative",zIndex:1,marginBottom:8,
                          border:`2px solid ${active ? "#ff2d78" : done ? "#b8ff00" : "rgba(255,255,255,.08)"}`,
                          background: active ? "rgba(255,45,120,.12)" : done ? "rgba(184,255,0,.08)" : "rgba(255,255,255,.02)",
                          boxShadow: active ? "0 0 14px rgba(255,45,120,.4)" : done ? "0 0 10px rgba(184,255,0,.3)" : "none",
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
                  <div style={{marginTop:18,padding:"12px 14px",
                    background: (isEnRoute || isPickupReady) ? "rgba(184,255,0,.06)" : "rgba(255,45,120,.06)",
                    borderRadius:8,fontFamily:"'Rajdhani',sans-serif",fontSize:".88rem",color:"#f0eeff",
                    textAlign:"center",borderLeft:`3px solid ${(isEnRoute || isPickupReady) ? "#b8ff00" : "#ff2d78"}`}}>
                    {STEPS[stepIdx]?.desc}
                  </div>
                )}
              </div>
            )}

            {/* Driver Info */}
            {order.assignedDriverName && order.status !== "nouveau" && (
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
                background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.12)",
                borderRadius:12,marginBottom:16}}>
                <div style={{width:44,height:44,borderRadius:"50%",
                  background:"rgba(0,245,255,.1)",border:"2px solid rgba(0,245,255,.25)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.3rem",flexShrink:0}}>
                  {driverLoc ? (TRANSPORT_ICONS[driverLoc.transport] || "🏍️") : "🏍️"}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:".95rem"}}>{order.assignedDriverName}</div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>
                    {order.status === "en_cours" ? "En route vers vous" : order.status === "livre" ? "Livraison effectuée" : "Votre livreur"}
                  </div>
                </div>
                {driverLoc && (
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"#b8ff00",
                      boxShadow:"0 0 6px #b8ff00"}} />
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#b8ff00"}}>EN LIGNE</span>
                  </div>
                )}
              </div>
            )}

            {/* Order detail */}
            <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
              borderRadius:12,padding:"18px 20px",marginBottom:16}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",letterSpacing:".1em",
                color:"#5a5470",marginBottom:12}}>DÉTAIL DE LA COMMANDE</div>
              <div style={{fontFamily:"'Rajdhani',sans-serif",fontSize:".88rem",color:"#d0d0e0",lineHeight:1.9,
                borderLeft:"2px solid rgba(0,245,255,.2)",paddingLeft:12,marginBottom:14}}>
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
                fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",
                borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12}}>
                <span style={{color:"#ff2d78"}}>TOTAL</span>
                <span style={{color:"#b8ff00",textShadow:"0 0 12px rgba(184,255,0,.4)"}}>
                  {Number(order.total).toFixed(2)}€
                </span>
              </div>
            </div>

            {/* Address / Pickup location */}
            {isPickup ? (
              <div style={{background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.15)",
                borderRadius:12,padding:"14px 18px",marginBottom:20}}>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
                  letterSpacing:".08em",marginBottom:8}}>POINT DE RETRAIT</div>
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <span style={{fontSize:"1.1rem",flexShrink:0}}>🏪</span>
                  <div>
                    <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".95rem",color:"#00f5ff",marginBottom:2}}>
                      {order.pickupLocationSnapshot?.name || "Stock Yassala"}
                    </div>
                    <div style={{fontSize:".82rem",color:"#d0d0e0"}}>
                      {order.pickupLocationSnapshot?.address}{order.pickupLocationSnapshot?.city ? `, ${order.pickupLocationSnapshot.city}` : ""}
                    </div>
                    {order.pickupLocationSnapshot?.instructions && (
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#b8ff00",marginTop:4}}>
                        ℹ️ {order.pickupLocationSnapshot.instructions}
                      </div>
                    )}
                    {order.pickupTime && order.pickupTime !== 'asap' && (
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#ff2d78",marginTop:4}}>
                        🕐 Retrait prévu à {order.pickupTime}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : order.address && (
              <div style={{background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.1)",
                borderRadius:12,padding:"14px 18px",marginBottom:20,
                display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:"1.1rem",flexShrink:0}}>📍</span>
                <div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",
                    letterSpacing:".08em",marginBottom:2}}>LIVRAISON</div>
                  <div style={{fontSize:".88rem",color:"#00f5ff"}}>{order.address}</div>
                </div>
              </div>
            )}

            <a href="/" style={{display:"block",textAlign:"center",
              background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",
              color:"#5a5470",borderRadius:10,padding:"14px",
              fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",letterSpacing:".06em",
              textDecoration:"none"}}>
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
      <div style={{background:"#0a0a12",minHeight:"100vh",display:"flex",alignItems:"center",
        justifyContent:"center",color:"#5a5470",fontFamily:"monospace"}}>
        Chargement...
      </div>
    }>
      <SuiviContent />
    </Suspense>
  );
}
