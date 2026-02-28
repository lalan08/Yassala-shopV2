"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAdminAlerts, type AdminAlert } from "@/hooks/useAdminAlerts";
import { DEFAULT_DELIVERY_CONFIG, type DeliveryConfig } from "@/types/delivery";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Cropper from "react-easy-crop";

// ── FIREBASE CONFIG ──
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
const storage = getStorage(app);

// ── TYPES ──
type Product = { id?: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; order?: number; isActive?: boolean; };
type Pack = { id?: string; name: string; tag: string; emoji: string; items: string; price: number; real: number; star: boolean; };
type Order = { id?: string; items: string; total: number; status: string; createdAt: string; phone: string; orderNumber?: number; name?: string; address?: string; paidOnline?: boolean; fulfillmentType?: 'delivery'|'pickup'; pickupType?: 'stock'|'relay'; pickupLocationSnapshot?: {name:string;address:string;city:string;instructions:string}; pickupTime?: string; isRush?: boolean; rushFee?: number; };
type PickupLocation = { id?: string; name: string; address: string; city: string; instructions: string; isActive: boolean; };
type Settings = { shopOpen: boolean; deliveryMin: number; freeDelivery: number; hours: string; zone: string; whatsapp: string; paymentOnlineEnabled: boolean; paymentCashEnabled: boolean; fulfillmentDeliveryEnabled: boolean; fulfillmentPickupEnabled: boolean; aiChatEnabled: boolean; aiVoiceEnabled: boolean; aiRecommendEnabled: boolean; aiDescEnabled: boolean; aiPredictEnabled: boolean; aiAnomalyEnabled: boolean; aiBannerEnabled: boolean; aiStockEnabled: boolean; aiCoachingEnabled: boolean; aiCouponEnabled: boolean; aiRouteEnabled: boolean; };
type Banner = { id?: string; title: string; subtitle: string; desc: string; cta: string; link: string; gradient: string; image: string; brightness: number; active: boolean; order: number; };
type Coupon = { id?: string; code: string; type: "percent"|"fixed"; value: number; active: boolean; };
type Category = { id?: string; key: string; label: string; emoji: string; order: number; };
type OnlineDriver = { uid: string; name: string; status: "online"|"offline"|"busy"; isOnline: boolean; lastSeen: any; performanceScore?: number; };

const ADMIN_PASSWORD = "yassala2025";

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise(r => { image.onload = r; });
  const canvas = document.createElement("canvas");
  canvas.width  = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise(r => canvas.toBlob(b => r(b!), "image/jpeg", 0.92));
}

const defaultSettings: Settings = {
  shopOpen: true, deliveryMin: 15, freeDelivery: 50,
  hours: "22:00–06:00", zone: "Cayenne & alentours", whatsapp: "+594 XXX XXX",
  paymentOnlineEnabled: true, paymentCashEnabled: true,
  fulfillmentDeliveryEnabled: true, fulfillmentPickupEnabled: true,
  aiChatEnabled: true, aiVoiceEnabled: true, aiRecommendEnabled: true,
  aiDescEnabled: true, aiPredictEnabled: true, aiAnomalyEnabled: true,
  aiBannerEnabled: true, aiStockEnabled: true, aiCoachingEnabled: true,
  aiCouponEnabled: true, aiRouteEnabled: true,
};

export default function AdminPage() {
  const [auth, setAuth]           = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("yassala_admin_auth");
  });
  const [pwd, setPwd]             = useState("");
  const [pwdError, setPwdError]   = useState(false);
  const [tab, setTab]             = useState<"dashboard"|"products"|"categories"|"packs"|"orders"|"settings"|"banners"|"coupons"|"users"|"drivers"|"dispatch"|"online_drivers"|"pickup_locations">("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dispatchFilter, setDispatchFilter] = useState<"available"|"mine"|"delivered">("available");
  const [driverLocations, setDriverLocations] = useState<any[]>([]);
  const [dispatchConfirm, setDispatchConfirm] = useState<{id:string;type:"take"|"deliver"}|null>(null);
  const [onlineDrivers, setOnlineDrivers]     = useState<OnlineDriver[]>([]);
  const [assignDriverModal, setAssignDriverModal] = useState<OnlineDriver|null>(null);
  const [products, setProducts]   = useState<Product[]>([]);
  const [packs, setPacks]         = useState<Pack[]>([]);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [settings, setSettings]   = useState<Settings>(defaultSettings);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY_CONFIG);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [toast, setToast]         = useState({ msg: "", show: false, type: "ok" });
  const [editProd, setEditProd]   = useState<Product | null>(null);
  const [editPack, setEditPack]   = useState<Pack | null>(null);
  const [showProdForm, setShowProdForm] = useState(false);
  const [showPackForm, setShowPackForm] = useState(false);
  const [banners, setBanners]         = useState<Banner[]>([]);
  const [editBanner, setEditBanner]   = useState<Banner | null>(null);
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [coupons, setCoupons]             = useState<Coupon[]>([]);
  const [newCoupon, setNewCoupon]         = useState<Coupon>({code:"",type:"percent",value:10,active:true});
  const [dbCats, setDbCats]               = useState<Category[]>([]);
  const [editCat, setEditCat]             = useState<Category | null>(null);
  const [catForm, setCatForm]             = useState<Category>({key:"",label:"",emoji:"",order:0});
  const [loading, setLoading]     = useState(false);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [orderFilter, setOrderFilter] = useState<"all"|"nouveau"|"en_cours">("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<"all"|"delivery"|"pickup">("all");
  const [orderSubTab, setOrderSubTab] = useState<"active"|"archived">("active");
  const [archiveSearch, setArchiveSearch] = useState({ date: "", client: "", phone: "" });
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [editPickupLoc, setEditPickupLoc] = useState<PickupLocation|null>(null);
  const [pickupLocForm, setPickupLocForm] = useState<PickupLocation>({name:"",address:"",city:"Cayenne",instructions:"",isActive:true});
  const [adminHash, setAdminHash] = useState<string|null>(null);
  const [usersCount, setUsersCount]           = useState(0);
  const [usersWithOrders, setUsersWithOrders] = useState(0);
  const [usersList, setUsersList]             = useState<{id:string;name:string;email:string;createdAt?:string;lastLoginAt?:string}[]>([]);
  const [usersSearch, setUsersSearch]         = useState("");
  const [driverApps, setDriverApps]           = useState<{id:string;name:string;phone:string;email:string;zone:string;vehicle:string;message:string;status:string;createdAt:string;password?:string;contractAccepted?:boolean;contractAcceptedAt?:string}[]>([]);
  const [driverFilter, setDriverFilter]       = useState<"all"|"nouveau"|"accepte"|"refuse">("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string,boolean>>({"OPÉRATIONS":true,"CATALOGUE":true,"MARKETING":true,"CONFIGURATION":true});
  const [dashPeriod, setDashPeriod] = useState<"24h"|"7j"|"30j">("7j");
  const [pwdWarning, setPwdWarning] = useState(false);
  const [adminWeather, setAdminWeather] = useState<{ condition: string; precipitation: number; isRaining: boolean; isHeavyRain: boolean } | null>(null);
  const [newPwd,  setNewPwd]  = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdFormErr, setPwdFormErr] = useState("");
  const prevOrderIdsRef    = useRef<Set<string>>(new Set());
  const prevOrderStatesRef = useRef<Map<string, string>>(new Map());
  const dragRef            = useRef<number | null>(null);
  const isFirstLoadRef     = useRef(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── IA ──
  const [aiPrediction, setAiPrediction]         = useState<any>(null);
  const [aiPredLoading, setAiPredLoading]       = useState(false);
  const [aiSummary, setAiSummary]               = useState("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiRoute, setAiRoute]                   = useState<{order:number[];tips:string}|null>(null);
  const [aiRouteLoading, setAiRouteLoading]     = useState(false);
  const [aiAnomalies, setAiAnomalies]           = useState<{orderId:string;reason:string;severity:string}[]>([]);
  const [aiAnomalyLoading, setAiAnomalyLoading] = useState(false);
  const [aiStock, setAiStock]                   = useState<{name:string;risk:string;estimatedDaysLeft:number;action:string}[]>([]);
  const [aiStockLoading, setAiStockLoading]     = useState(false);
  const [aiCoachId, setAiCoachId]               = useState<string|null>(null);
  const [aiCoachText, setAiCoachText]           = useState("");
  const [aiCoachLoading, setAiCoachLoading]     = useState(false);
  const [aiCoupon, setAiCoupon]                 = useState<{code:string;type:string;value:number;minOrder:number;reason:string}|null>(null);
  const [aiCouponLoading, setAiCouponLoading]   = useState(false);

  // ── Alertes opérationnelles ──
  const {
    alerts: adminAlerts,
    unresolvedCount: alertCount,
    resolveAlert,
    deleteAlert,
    deleteAllResolved,
    dismissAll,
    soundEnabled: alertSound,
    setSoundEnabled: setAlertSound,
  } = useAdminAlerts({ orders, onlineDrivers });

  const playOrderSound = useCallback(() => {
    try {
      const ctx  = new AudioContext();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.24);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.55);
    } catch {}
  }, []);

  // Son distinct pour livraison/retrait confirmé (deux notes descendantes)
  const playDeliverySound = useCallback(() => {
    try {
      const ctx  = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      [1047, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.connect(gain);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch {}
  }, []);

  const login = async () => {
    const hash = await sha256(pwd);
    let ok = false;
    if (adminHash) {
      ok = hash === adminHash;
    } else {
      // No hash stored yet → accept default password, warn to change it
      ok = pwd === ADMIN_PASSWORD;
      if (ok) setPwdWarning(true);
    }
    if (ok) {
      setAuth(true);
      setPwdError(false);
      // Persist auth so /admin/payouts doesn't re-ask the password
      sha256(ADMIN_PASSWORD).then(h => localStorage.setItem("yassala_admin_auth", h));
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } else { setPwdError(true); }
  };

  const showToast = (msg: string, type = "ok") => {
    setToast({ msg, show: true, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  const callAI = async (action: string, data: Record<string, unknown>) => {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "Erreur IA");
    return json.result;
  };

  // Read URL params on mount (e.g. /admin/orders?filter=archived redirects here)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "orders") {
      setTab("orders");
    }
    if (params.get("filter") === "archived") {
      setTab("orders");
      setOrderSubTab("archived");
    }
  }, []);

  // Load admin hash on mount + auto-restore session from localStorage
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "adminAuth"), async snap => {
      const h = snap.exists() ? (snap.data().hash ?? null) : null;
      setAdminHash(h);

      if (typeof window === "undefined") return;
      const stored = localStorage.getItem("yassala_admin_auth");
      if (!stored) return;

      if (h) {
        if (stored === h) setAuth(true);
      } else {
        const defaultHash = await sha256(ADMIN_PASSWORD);
        if (stored === defaultHash) setAuth(true);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!auth) return;
    setLoading(true);

    const unsubProducts = onSnapshot(collection(db, "products"), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setLoading(false);
    });
    const unsubPacks = onSnapshot(collection(db, "packs"), snap => {
      setPacks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Pack)));
    });
    const unsubOrders = onSnapshot(collection(db, "orders"), snap => {
      const allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (!isFirstLoadRef.current) {
        // ── Nouvelles commandes ──
        const added = allOrders.filter(o => o.id && !prevOrderIdsRef.current.has(o.id) && o.status === "nouveau");
        if (added.length > 0) {
          playOrderSound();
          added.forEach(o => {
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification("🔔 Nouvelle commande !", {
                body: `📞 ${o.phone}  •  💶 ${Number(o.total).toFixed(2)} €`,
                icon: "/favicon.ico",
                tag: o.id,
              });
            }
          });
        }

        // ── Détection changements de statut (livraison / retrait) ──
        allOrders.forEach(o => {
          if (!o.id) return;
          const prevStatus = prevOrderStatesRef.current.get(o.id);
          if (!prevStatus || prevStatus === o.status) return;

          const isDelivery = (o as any).fulfillmentType !== "pickup";
          const name = (o as any).name || o.phone;

          if (o.status === "livre" && prevStatus !== "livre") {
            playDeliverySound();
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification(isDelivery ? "✅ Commande livrée !" : "✅ Commande retirée !", {
                body: `#${(o as any).orderNumber ?? o.id!.slice(-6).toUpperCase()} — ${name}  •  ${Number(o.total).toFixed(2)} €`,
                icon: "/favicon.ico",
                tag: `done-${o.id}`,
              });
            }
          } else if (o.status === "en_cours" && (prevStatus === "nouveau")) {
            playOrderSound();
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification("🏍️ Livreur en route !", {
                body: `#${(o as any).orderNumber ?? o.id!.slice(-6).toUpperCase()} — ${name} pris en charge`,
                icon: "/favicon.ico",
                tag: `enroute-${o.id}`,
              });
            }
          }
        });

        prevOrderIdsRef.current = new Set(allOrders.map(o => o.id!));
        prevOrderStatesRef.current = new Map(allOrders.map(o => [o.id!, o.status]));
      } else {
        prevOrderIdsRef.current = new Set(allOrders.map(o => o.id!));
        prevOrderStatesRef.current = new Map(allOrders.map(o => [o.id!, o.status]));
        isFirstLoadRef.current = false;
      }

      setNewOrdersCount(allOrders.filter(o => o.status === "nouveau").length);
      setOrders(allOrders);
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "main"), snap => {
      if (snap.exists()) setSettings(snap.data() as Settings);
    });
    const unsubDelivery = onSnapshot(doc(db, "settings", "delivery"), snap => {
      if (snap.exists()) setDeliveryConfig({ ...DEFAULT_DELIVERY_CONFIG, ...snap.data() } as DeliveryConfig);
    });
    const unsubBanners = onSnapshot(collection(db, "banners"), snap => {
      setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    const unsubCoupons = onSnapshot(collection(db, "coupons"), snap => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
    });
    const unsubUsers = onSnapshot(collection(db, "users"), snap => {
      setUsersCount(snap.size);
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || data.displayName || "",
          email: data.email || "",
          createdAt: data.createdAt || "",
          lastLoginAt: data.lastLoginAt || "",
        };
      }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setUsersList(list);
    });
    const unsubCats = onSnapshot(collection(db, "categories"), snap => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setDbCats(loaded);
    });
    const unsubDrivers = onSnapshot(collection(db, "driver_applications"), snap => {
      setDriverApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
        .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    });
    const unsubDriverLocs = onSnapshot(collection(db, "driver_locations"), snap => {
      setDriverLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubOnlineDrivers = onSnapshot(collection(db, "drivers"), snap => {
      const now = Date.now();
      const active = snap.docs
        .map(d => ({ uid: d.id, ...d.data() } as OnlineDriver))
        .filter(d => {
          if (!d.isOnline) return false;
          if (!d.lastSeen) return false;
          const ms = d.lastSeen.toMillis ? d.lastSeen.toMillis() : typeof d.lastSeen === "number" ? d.lastSeen : Date.parse(d.lastSeen);
          return now - ms < 60000;
        });
      setOnlineDrivers(active);
    });

    const unsubPickupLocs = onSnapshot(collection(db, "pickup_locations_v1"), snap => {
      setPickupLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as PickupLocation))
        .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
    });
    return () => { unsubProducts(); unsubPacks(); unsubOrders(); unsubSettings(); unsubDelivery(); unsubBanners(); unsubCoupons(); unsubUsers(); unsubCats(); unsubDrivers(); unsubDriverLocs(); unsubOnlineDrivers(); unsubPickupLocs(); };
  }, [auth]);

  // Auto best seller : badge BEST sur le produit le plus commandé
  useEffect(() => {
    if (!auth || products.length === 0 || orders.length === 0) return;
    const prodCount: Record<string, number> = {};
    orders.forEach(o => {
      o.items.split("\n").forEach(line => {
        const name = line.replace(/\s*x\d+.*/, "").trim();
        if (name) prodCount[name] = (prodCount[name] || 0) + 1;
      });
    });
    const topName = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!topName) return;
    const updates: Promise<void>[] = [];
    products.forEach(p => {
      if (!p.id) return;
      if (p.badge === "BEST" && p.name !== topName)
        updates.push(updateDoc(doc(db, "products", p.id), { badge: "" }));
      if (p.name === topName && p.badge !== "BEST")
        updates.push(updateDoc(doc(db, "products", p.id), { badge: "BEST" }));
    });
    if (updates.length > 0) Promise.all(updates);
  }, [orders.length, products.length, auth]);

  /* ── météo admin (poll toutes les 5 min) ── */
  useEffect(() => {
    const load = () => fetch('/api/weather').then(r => r.json()).then(setAdminWeather).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const saveProd = async (p: Product) => {
    try {
      if (p.id) { await updateDoc(doc(db, "products", p.id), { ...p }); showToast("Produit mis à jour ✓"); }
      else { await addDoc(collection(db, "products"), p); showToast("Produit ajouté ✓"); }
      setShowProdForm(false); setEditProd(null);
    } catch { showToast("Erreur lors de la sauvegarde", "err"); }
  };

  const deleteProd = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    await deleteDoc(doc(db, "products", id));
    showToast("Produit supprimé");
  };

  const reorderProducts = async (from: number, to: number) => {
    if (from === to) return;
    const list = [...products];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    setProducts(list);
    await Promise.all(list.map((p, i) => updateDoc(doc(db, "products", p.id!), { order: i })));
  };

  const savePack = async (p: Pack) => {
    try {
      if (p.id) { await updateDoc(doc(db, "packs", p.id), { ...p }); showToast("Pack mis à jour ✓"); }
      else { await addDoc(collection(db, "packs"), p); showToast("Pack ajouté ✓"); }
      setShowPackForm(false); setEditPack(null);
    } catch { showToast("Erreur lors de la sauvegarde", "err"); }
  };

  const deletePack = async (id: string) => {
    if (!confirm("Supprimer ce pack ?")) return;
    await deleteDoc(doc(db, "packs", id));
    showToast("Pack supprimé");
  };

  const saveBanner = async (b: Banner) => {
    try {
      const { id, ...data } = b;
      if (id) {
        await setDoc(doc(db, "banners", id), data, { merge: true });
      } else {
        await addDoc(collection(db, "banners"), data);
      }
      showToast(b.id ? "Bannière mise à jour ✓" : "Bannière ajoutée ✓");
      setShowBannerForm(false); setEditBanner(null);
    } catch (e: any) { showToast(e.message || "Erreur lors de la sauvegarde", "err"); }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm("Supprimer cette bannière ?")) return;
    try {
      await deleteDoc(doc(db, "banners", id));
      showToast("Bannière supprimée");
    } catch { showToast("Erreur suppression", "err"); }
  };

  const toggleBannerActive = async (b: Banner) => {
    if (!b.id) return;
    await updateDoc(doc(db, "banners", b.id), { active: !b.active });
    showToast(`Bannière ${!b.active ? "activée" : "désactivée"} ✓`);
  };

  const updateOrderStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
    showToast("Statut mis à jour ✓");
    if (status === "en_cours" || status === "livre") {
      const o = orders.find(x => x.id === id);
      if (o) {
        const phone = o.phone.replace(/[^0-9+]/g, "");
        const name  = (o as any).name || "client";
        const msgs: Record<string, string> = {
          en_cours: `🔥 *Bonjour ${name} !*\n\nVotre commande *Yassala Night Shop* est en cours de préparation. Elle sera chez vous très bientôt 🛵\n\n🔎 Suivez-la en temps réel :\nhttps://yassalashop.gf/suivi?id=${id}`,
          livre:    `✅ *Bonjour ${name} !*\n\nVotre commande *Yassala Night Shop* vient d'être livrée.\nMerci et bonne soirée ! 🌙🍺`,
        };
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msgs[status])}`;
        if (window.confirm(`Envoyer une notification WhatsApp à ${name} (${o.phone}) ?`)) {
          window.open(waUrl, "_blank");
        }
      }
    }
  };

  const deleteOrder = async (id: string) => {
    await deleteDoc(doc(db, "orders", id));
    setConfirmDeleteId(null);
    showToast("Commande supprimée");
  };

  const toggleRush = async (id: string, currentIsRush?: boolean) => {
    const newIsRush = !currentIsRush;
    await updateDoc(doc(db, "orders", id), {
      isRush: newIsRush,
      rushFee: newIsRush ? 2.00 : 0,
      rushMarkedAt: newIsRush ? new Date().toISOString() : null,
    });
    showToast(newIsRush ? "🚨 Commande marquée RUSH" : "RUSH retiré");
  };

  const adminTakeOrder = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), {
      assignedDriver: "admin",
      assignedDriverName: "ADMIN",
      status: "en_cours",
    });
    showToast("Commande prise en charge ✓");
    setDispatchConfirm(null);
    setDispatchFilter("mine");
  };

  const adminMarkDelivered = async (orderId: string) => {
    await updateDoc(doc(db, "orders", orderId), {
      status: "livre",
      deliveredAt: new Date().toISOString(),
    });
    showToast("Commande livrée ✓");
    setDispatchConfirm(null);
    setDispatchFilter("delivered");
  };

  const purgeArchivedOrders = async () => {
    const archived = orders.filter(o => o.status === "livre" || o.status === "annule");
    if (archived.length === 0) { showToast("Aucune commande archivée"); return; }
    if (!confirm(`Supprimer ${archived.length} commande(s) livrée(s)/annulée(s) ?`)) return;
    await Promise.all(archived.map(o => deleteDoc(doc(db, "orders", o.id!))));
    showToast(`${archived.length} commande(s) supprimée(s) ✓`);
  };

  const saveCoupon = async () => {
    const c = { ...newCoupon, code: newCoupon.code.trim().toUpperCase() };
    if (!c.code || c.value <= 0) { showToast("Code et valeur requis"); return; }
    if (c.id) {
      await updateDoc(doc(db, "coupons", c.id), { code:c.code, type:c.type, value:c.value, active:c.active });
    } else {
      await addDoc(collection(db, "coupons"), { code:c.code, type:c.type, value:c.value, active:c.active });
    }
    setNewCoupon({ code:"", type:"percent", value:10, active:true });
    showToast("Coupon sauvegardé ✓");
  };
  const deleteCoupon = async (id: string) => {
    if (!confirm("Supprimer ce coupon ?")) return;
    await deleteDoc(doc(db, "coupons", id));
    showToast("Coupon supprimé");
  };
  const toggleCoupon = async (c: Coupon) => {
    await updateDoc(doc(db, "coupons", c.id!), { active: !c.active });
  };

  const changePassword = async (newPwd: string) => {
    const hash = await sha256(newPwd);
    await setDoc(doc(db, "settings", "adminAuth"), { hash });
    setAdminHash(hash);
    setPwdWarning(false);
    showToast("Mot de passe mis à jour ✓");
  };

  const exportCSV = () => {
    const src = orders.filter(o => {
      if (orderSubTab === "archived") {
        if (o.status !== "livre" && o.status !== "annule") return false;
        if (fulfillmentFilter !== "all" && (o as any).fulfillmentType !== fulfillmentFilter && !(fulfillmentFilter === "delivery" && !(o as any).fulfillmentType)) return false;
        if (archiveSearch.date) {
          const orderDate = new Date(o.createdAt).toISOString().slice(0,10);
          if (orderDate !== archiveSearch.date) return false;
        }
        if (archiveSearch.client && !((o as any).name || "").toLowerCase().includes(archiveSearch.client.toLowerCase())) return false;
        if (archiveSearch.phone && !o.phone.includes(archiveSearch.phone)) return false;
        return true;
      }
      return (
        (o.status === "nouveau" || o.status === "en_cours") &&
        (orderFilter === "all" || o.status === orderFilter) &&
        (fulfillmentFilter === "all" || (o as any).fulfillmentType === fulfillmentFilter || (fulfillmentFilter === "delivery" && !(o as any).fulfillmentType))
      );
    });
    const rows = [
      ["Date", "Client", "Téléphone", "Adresse", "Articles", "Total (€)", "Statut"],
      ...src.map(o => [
        new Date(o.createdAt).toLocaleString("fr-FR"),
        (o as any).name || "",
        o.phone,
        (o as any).address || "",
        o.items.replace(/\n/g, " | "),
        Number(o.total).toFixed(2),
        o.status,
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `commandes-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── CATÉGORIES CRUD ──
  const DEFAULT_CATS: Category[] = [
    { key: "biere", label: "🍺 BIÈRES", emoji: "🍺", order: 1 },
    { key: "cocktail", label: "🍹 COCKTAILS", emoji: "🍹", order: 2 },
    { key: "spiritueux", label: "🥃 SPIRITUEUX", emoji: "🥃", order: 3 },
    { key: "snack", label: "🍟 SNACKS", emoji: "🍟", order: 4 },
  ];
  const initDefaultCats = async () => {
    if (!confirm("Ajouter les catégories par défaut (Bières, Cocktails, Spiritueux, Snacks) dans la base ?")) return;
    try {
      for (const cat of DEFAULT_CATS) {
        const exists = dbCats.some(c => c.key === cat.key);
        if (!exists) await addDoc(collection(db, "categories"), { key: cat.key, label: cat.label, emoji: cat.emoji, order: cat.order });
      }
      showToast("Catégories par défaut ajoutées ✓");
    } catch { showToast("Erreur lors de l'initialisation", "err"); }
  };
  const saveCat = async () => {
    const data = editCat ?? catForm;
    if (!data.key.trim() || !data.label.trim()) { showToast("Clé et libellé requis", "err"); return; }
    const clean = { key: data.key.trim().toLowerCase().replace(/\s+/g, "_"), label: data.label.trim(), emoji: data.emoji.trim(), order: Number(data.order) || 0 };
    try {
      if (data.id) { await updateDoc(doc(db, "categories", data.id), clean); showToast("Catégorie mise à jour ✓"); }
      else { await addDoc(collection(db, "categories"), clean); showToast("Catégorie ajoutée ✓"); }
      setEditCat(null); setCatForm({ key: "", label: "", emoji: "", order: 0 });
    } catch { showToast("Erreur sauvegarde catégorie", "err"); }
  };
  const deleteCat = async (id: string) => {
    if (!confirm("Supprimer cette catégorie ?")) return;
    await deleteDoc(doc(db, "categories", id));
    showToast("Catégorie supprimée");
  };

  // Déplace une catégorie d'une position (direction: -1 = monter, +1 = descendre)
  const moveCat = async (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= dbCats.length) return;
    // Swap in a copy of the array, then write sequential order values for all
    // (avoids the bug where duplicate order values make swapping a no-op)
    const reordered = [...dbCats];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    const batch = writeBatch(db);
    reordered.forEach((c, i) => {
      batch.update(doc(db, "categories", c.id!), { order: i });
    });
    await batch.commit();
  };

  const printOrder = (o: Order) => {
    const w = window.open("", "_blank", "width=420,height=620");
    if (!w) return;
    const d = (o as any);
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
      <title>Ticket #${(o.id||"").slice(-6).toUpperCase()}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:monospace;font-size:13px;padding:16px;max-width:380px;}
      h1{font-size:18px;text-align:center;margin-bottom:4px;}
      .sub{text-align:center;color:#666;font-size:11px;margin-bottom:12px;}
      .sep{border-top:1px dashed #000;margin:10px 0;}
      .row{display:flex;justify-content:space-between;margin:3px 0;}
      .total{font-size:16px;font-weight:bold;}</style></head><body>
      <h1>YASSALA NIGHT SHOP</h1>
      <div class="sub">Livraison nocturne — Guyane</div>
      <div class="sep"></div>
      <div class="row"><span>Date</span><span>${new Date(o.createdAt).toLocaleString("fr-FR")}</span></div>
      <div class="row"><span>Commande</span><span>#${(o.id||"").slice(-6).toUpperCase()}</span></div>
      <div class="row"><span>Client</span><span>${d.name||""}</span></div>
      <div class="row"><span>Tél</span><span>${o.phone}</span></div>
      ${d.address ? `<div class="row"><span>Adresse</span><span style="text-align:right;max-width:200px">${d.address}</span></div>` : ""}
      <div class="sep"></div>
      ${o.items.split("\n").map((l:string)=>`<div>${l}</div>`).join("")}
      <div class="sep"></div>
      ${(d.discount>0)?`<div class="row"><span>Réduction (${d.coupon})</span><span>-${Number(d.discount).toFixed(2)}€</span></div>`:""}
      <div class="row total"><span>TOTAL</span><span>${Number(o.total).toFixed(2)}€</span></div>
      <div class="sep"></div>
      <div style="text-align:center;font-size:11px;margin-top:8px">Merci pour votre commande !</div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const saveSettings = async () => {
    await setDoc(doc(db, "settings", "main"), settings);
    showToast("Paramètres sauvegardés ✓");
  };

  if (!auth) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        input{outline:none;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
        background:"radial-gradient(ellipse 60% 60% at 50% 40%,rgba(255,45,120,.06) 0%,transparent 70%)"}}>
        <div style={{width:"100%",maxWidth:380,padding:"0 20px",animation:"fadeUp .5s both"}}>
          <div style={{textAlign:"center",marginBottom:36}}>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"2.2rem",color:"#ff2d78",
              textShadow:"0 0 20px rgba(255,45,120,.6)",letterSpacing:".06em"}}>
              YASSALA
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#00f5ff",
              letterSpacing:".2em",marginTop:4}}>ADMIN PANEL</div>
          </div>
          <div style={{background:"#0c0918",border:"1px solid rgba(255,45,120,.25)",borderRadius:8,padding:28}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470",
              letterSpacing:".12em",marginBottom:16}}>// MOT DE PASSE</div>
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              placeholder="••••••••••"
              style={{width:"100%",background:"#080514",border:`1px solid ${pwdError ? "#ff2d78" : "rgba(255,255,255,.1)"}`,
                borderRadius:4,padding:"12px 16px",color:"#f0eeff",fontFamily:"'Share Tech Mono',monospace",
                fontSize:".9rem",marginBottom:16}}
            />
            {pwdError && <div style={{color:"#ff2d78",fontSize:".78rem",fontFamily:"'Share Tech Mono',monospace",
              marginBottom:12}}>// mot de passe incorrect</div>}
            <button onClick={login} style={{width:"100%",background:"#ff2d78",color:"#000",border:"none",
              borderRadius:4,padding:"13px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",
              letterSpacing:".1em",textTransform:"uppercase",cursor:"pointer"}}>
              ACCÉDER →
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@300;400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        html{scroll-behavior:smooth;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        input,select,textarea{outline:none;font-family:'Inter',sans-serif;}
        button,a{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
        input,select{-webkit-appearance:none;}

        /* ── ANIMATIONS ── */
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @keyframes badgePulse{0%,100%{transform:scale(1);box-shadow:0 0 6px #ff2d78;}50%{transform:scale(1.2);box-shadow:0 0 14px #ff2d78;}}
        @keyframes tabIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes toastSlide{from{opacity:0;transform:translateY(12px) scale(.96);}to{opacity:1;transform:translateY(0) scale(1);}}

        /* ── SCROLLBAR ── */
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:#0a0a12;}
        ::-webkit-scrollbar-thumb{background:#2a1a2e;border-radius:2px;}
        ::-webkit-scrollbar-thumb:hover{background:#ff2d78;}

        /* ── ROW HOVER ── */
        .row:hover{background:rgba(255,255,255,.04);}

        /* ── SIDEBAR ── */
        .admin-sidebar-btn{transition:background .15s ease,color .15s ease!important;}
        .admin-sidebar-btn:hover{background:rgba(255,255,255,.05)!important;}

        /* ── HAMBURGER: hidden on desktop ── */
        .admin-hamburger{
          display:none;background:none;border:none;cursor:pointer;
          padding:7px;border-radius:8px;color:#f0eeff;line-height:0;
          -webkit-tap-highlight-color:transparent;
        }
        .admin-hamburger:hover{background:rgba(255,255,255,.07);}
        .admin-sidebar-close{
          display:none;background:none;border:none;cursor:pointer;
          padding:8px;color:#7a7490;line-height:0;border-radius:8px;
          -webkit-tap-highlight-color:transparent;
        }
        .admin-sidebar-close:hover{background:rgba(255,255,255,.06);color:#f0eeff;}

        /* ── TAB ANIMATION ── */
        .admin-tab-content{animation:tabIn .22s ease both;}

        /* ── TABLE SCROLL ── */
        .admin-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        .admin-table-wrap::-webkit-scrollbar{height:3px;}

        /* ── TOAST ── */
        .admin-toast{animation:toastSlide .3s cubic-bezier(.34,1.56,.64,1) both;}

        /* ── TABLET (641–900px) ── */
        @media(max-width:900px) and (min-width:641px){
          .admin-sidebar{width:190px!important;}
          .admin-nav-label{font-size:.8rem!important;}
        }

        /* ══ MOBILE (≤640px) ══ */
        @media(max-width:640px){

          /* ── HAMBURGER visible ── */
          .admin-hamburger{display:flex;align-items:center;justify-content:center;}
          .admin-sidebar-close{display:flex;align-items:center;justify-content:center;}
          .admin-drawer-top{display:flex!important;}

          /* ── DRAWER OVERLAY ── */
          .admin-drawer-overlay{
            position:fixed;inset:0;z-index:250;
            background:rgba(0,0,0,.55);
            backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
            animation:fadeIn .2s ease;
          }
          @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}

          /* ── SIDEBAR AS LEFT DRAWER ── */
          .admin-layout{flex-direction:column!important;}
          .admin-sidebar{
            position:fixed!important;top:0!important;left:0!important;bottom:0!important;
            width:min(290px,85vw)!important;height:100%!important;
            flex-direction:column!important;display:flex!important;
            transform:translateX(-105%)!important;
            transition:transform .32s cubic-bezier(.4,0,.2,1)!important;
            z-index:300!important;overflow-y:auto!important;overflow-x:hidden!important;
            padding:0!important;
            border-right:1px solid rgba(255,255,255,.08)!important;border-top:none!important;
            background:#08050f!important;
            box-shadow:12px 0 48px rgba(0,0,0,.6)!important;
            scrollbar-width:none!important;
          }
          .admin-sidebar::-webkit-scrollbar{display:none!important;}
          .admin-sidebar.open{transform:translateX(0)!important;}

          /* Section headers re-enabled in drawer */
          .admin-section-header{display:flex!important;}

          /* Nav buttons — horizontal layout in drawer */
          .admin-sidebar-btn{
            flex-direction:row!important;align-items:center!important;
            justify-content:flex-start!important;
            padding:12px 18px!important;gap:14px!important;
            width:100%!important;flex:0 0 auto!important;
            border:none!important;border-radius:0!important;
            border-left:3px solid transparent!important;
            border-top:none!important;height:auto!important;
            text-align:left!important;min-height:44px!important;
          }
          .admin-sidebar-btn.active{
            border-left-color:#ff2d78!important;
            background:rgba(255,45,120,.09)!important;
          }
          .admin-sidebar-btn.active .admin-nav-label{color:#ff2d78!important;}

          .admin-nav-icon{font-size:1.15rem!important;line-height:1!important;display:block!important;flex-shrink:0!important;}
          .admin-nav-label{
            font-size:.85rem!important;line-height:1!important;
            white-space:nowrap!important;max-width:none!important;
            display:block!important;font-weight:500!important;
            letter-spacing:.06em!important;text-transform:uppercase!important;
          }
          .admin-badge-dot{
            margin-left:auto!important;position:static!important;
            width:auto!important;height:20px!important;min-width:20px!important;
            border-radius:10px!important;border:none!important;
            font-size:.78rem!important;overflow:visible!important;
            display:flex!important;align-items:center!important;justify-content:center!important;
            padding:0 6px!important;color:#000!important;font-weight:700!important;
            font-family:'Share Tech Mono',monospace!important;
          }

          /* ── HEADER ── */
          .admin-header{padding:10px 14px!important;}
          .admin-header-subtitle{display:none!important;}
          .admin-site-link{display:none!important;}
          .admin-disconnect-btn{padding:6px 10px!important;font-size:.72rem!important;}
          .admin-disconnect-full{display:none!important;}
          .admin-disconnect-short{display:inline!important;}

          /* ── SHOPBAR ── */
          .admin-shopbar{padding:7px 14px!important;font-size:.78rem!important;}

          /* ── BREADCRUMB: hidden ── */
          .admin-breadcrumb{display:none!important;}

          /* ── MAIN CONTENT ── */
          .admin-main{padding:14px!important;padding-bottom:28px!important;}

          /* ── DASHBOARD: KPI horizontal scroll strip ── */
          .admin-dash-date{display:none!important;}
          .admin-kpi-grid{
            display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;
            overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;
            gap:10px!important;margin-bottom:16px!important;
            padding-bottom:6px!important;scrollbar-width:none!important;
          }
          .admin-kpi-grid::-webkit-scrollbar{display:none!important;}
          .admin-kpi-grid>*{
            min-width:150px!important;flex:0 0 150px!important;
            padding:14px 12px!important;
          }
          .admin-kpi-grid>* > div:first-child{font-size:1.3rem!important;margin-bottom:4px!important;}
          .admin-kpi-grid>* > div:nth-child(3){font-size:1.2rem!important;}

          /* ── ORDERS ── */
          .admin-orders-actions{flex-wrap:wrap!important;gap:7px!important;}
          .admin-orders-actions>button{flex:1!important;min-width:120px!important;text-align:center!important;}

          /* ── PRODUCTS ── */
          .admin-product-row{flex-wrap:wrap!important;gap:8px!important;}
          .admin-prod-actions{margin-left:auto!important;}

          /* ── CATEGORIES ── */
          .admin-cat-form-grid{grid-template-columns:1fr 1fr!important;}

          /* ── SETTINGS ── */
          .admin-settings-form{max-width:100%!important;}

          /* ── USERS ── */
          .admin-users-header{flex-direction:column!important;align-items:stretch!important;gap:12px!important;}
          .admin-users-search{width:100%!important;}
          .admin-users-table-header,.admin-users-table-row{
            grid-template-columns:minmax(110px,1.2fr) minmax(140px,1.5fr) 95px 110px!important;
            min-width:455px!important;
          }

          /* ── TOAST ── */
          .admin-toast{
            top:auto!important;bottom:20px!important;
            right:12px!important;left:12px!important;
            max-width:none!important;width:auto!important;
            border-radius:12px!important;
          }

          button{min-height:36px;}
        }
      `}</style>

      <div className="admin-toast" style={{position:"fixed",top:18,right:18,zIndex:10000,
        background: toast.type==="err" ? "rgba(255,45,120,.12)" : "rgba(184,255,0,.12)",
        border:`1px solid ${toast.type==="err" ? "#ff2d78" : "#b8ff00"}`,
        borderRadius:10,padding:"12px 18px",fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
        color: toast.type==="err" ? "#ff2d78" : "#b8ff00",maxWidth:260,
        boxShadow:"0 8px 32px rgba(0,0,0,.4)",backdropFilter:"blur(12px)",
        transform: toast.show ? "translateX(0)" : "translateX(130%)",
        transition:"transform .4s cubic-bezier(.34,1.56,.64,1)"}}>
        {toast.msg}
      </div>

      <header className="admin-header" style={{background:"rgba(10,10,18,.9)",borderBottom:"1px solid rgba(255,255,255,.06)",
        padding:"12px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100,backdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Hamburger — mobile only */}
          <button className="admin-hamburger" onClick={() => setDrawerOpen(true)} title="Menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="0" y="3.5" width="20" height="2.5" rx="1.25" fill="currentColor"/>
              <rect x="0" y="8.75" width="20" height="2.5" rx="1.25" fill="currentColor"/>
              <rect x="0" y="14" width="14" height="2.5" rx="1.25" fill="currentColor"/>
            </svg>
          </button>
          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",color:"#ff2d78",
            letterSpacing:".06em"}}>YASSALA</div>
          <div className="admin-header-subtitle" style={{fontFamily:"'Inter',sans-serif",fontSize:".75rem",fontWeight:500,color:"#6b7280",
            letterSpacing:".15em"}}>ADMIN PANEL</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <a className="admin-site-link" href="/" target="_blank" style={{fontFamily:"'Inter',sans-serif",fontSize:".82rem",fontWeight:500,
            color:"#6b7280",letterSpacing:".1em",textDecoration:"none"}}>
            VOIR LE SITE →
          </a>
          <button className="admin-disconnect-btn" onClick={() => { setAuth(false); localStorage.removeItem("yassala_admin_auth"); }} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
            color:"#6b7280",padding:"6px 14px",borderRadius:6,fontFamily:"'Inter',sans-serif",
            fontSize:".82rem",fontWeight:500,letterSpacing:".1em",cursor:"pointer"}}>
            <span className="admin-disconnect-full">DÉCONNEXION</span>
            <span className="admin-disconnect-short" style={{display:"none"}}>✕</span>
          </button>
        </div>
      </header>

      <div className="admin-breadcrumb" style={{padding:"10px 24px",fontFamily:"'Inter',sans-serif",fontSize:".82rem",fontWeight:400,color:"#5a5470",borderBottom:"1px solid rgba(255,255,255,.04)",background:"rgba(10,10,18,.85)"}}>
        <span style={{color:"#5a5470"}}>🏠 Accueil</span>
        <span style={{margin:"0 8px",color:"#3a3450"}}>›</span>
        <span style={{color:"#00f5ff"}}>{{dashboard:"Tableau de bord",orders:"Commandes",dispatch:"Dispatch",online_drivers:"Livreur en ligne",products:"Produits",categories:"Catégories",packs:"Packs",coupons:"Coupons",banners:"Bannières",users:"Clients",drivers:"Candidature",settings:"Paramètres"}[tab]}</span>
      </div>

      <div className="admin-shopbar" style={{background: settings.shopOpen ? "rgba(184,255,0,.08)" : "rgba(255,45,120,.08)",
        borderBottom:`1px solid ${settings.shopOpen ? "rgba(184,255,0,.2)" : "rgba(255,45,120,.2)"}`,
        padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",
            background: settings.shopOpen ? "#b8ff00" : "#ff2d78",
            boxShadow: settings.shopOpen ? "0 0 10px #b8ff00" : "0 0 10px #ff2d78"}} />
          <span style={{fontFamily:"'Inter',sans-serif",fontSize:".78rem",fontWeight:500,
            color: settings.shopOpen ? "#b8ff00" : "#ff2d78",letterSpacing:".1em"}}>
            SHOP {settings.shopOpen ? "OUVERT" : "FERMÉ"}
          </span>
        </div>
        <button onClick={async () => {
          const newSettings = { ...settings, shopOpen: !settings.shopOpen };
          setSettings(newSettings);
          await setDoc(doc(db, "settings", "main"), newSettings);
          showToast(`Shop ${newSettings.shopOpen ? "ouvert" : "fermé"} ✓`);
        }} style={{background: settings.shopOpen ? "rgba(255,45,120,.15)" : "rgba(184,255,0,.15)",
          border:`1px solid ${settings.shopOpen ? "#ff2d78" : "#b8ff00"}`,
          color: settings.shopOpen ? "#ff2d78" : "#b8ff00",
          padding:"6px 16px",borderRadius:6,fontFamily:"'Inter',sans-serif",fontWeight:500,
          fontSize:".82rem",letterSpacing:".1em",cursor:"pointer"}}>
          {settings.shopOpen ? "FERMER LE SHOP" : "OUVRIR LE SHOP"}
        </button>
      </div>

      {/* ── Drawer overlay (mobile) ── */}
      {drawerOpen && (
        <div className="admin-drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      <div className="admin-layout" style={{display:"flex",minHeight:"calc(100vh - 100px)"}}>

        <aside className={`admin-sidebar${drawerOpen ? " open" : ""}`} style={{width:230,background:"#0e0e18",borderRight:"1px solid rgba(255,255,255,.06)",
          padding:"12px 0",flexShrink:0,overflowY:"auto"}}>

          {/* ── Drawer top header (mobile only via CSS) ── */}
          <div className="admin-drawer-top" style={{display:"none",alignItems:"center",justifyContent:"space-between",
            padding:"14px 18px 10px",borderBottom:"1px solid rgba(255,255,255,.06)",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",color:"#ff2d78",letterSpacing:".06em"}}>YASSALA</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#3a3450",letterSpacing:".2em"}}>ADMIN</div>
            </div>
            <button className="admin-sidebar-close" onClick={() => setDrawerOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 3L15 15M3 15L15 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {([
            { section:"OPÉRATIONS", items:[
              { key:"dashboard",      label:"TABLEAU DE BORD",  icon:"📊" },
              { key:"orders",         label:"COMMANDES",        icon:"📦" },
              { key:"dispatch",       label:"DISPATCH",         icon:"🗺️" },
              { key:"online_drivers", label:"LIVREUR EN LIGNE", icon:"🟢" },
              { key:"users",          label:"CLIENTS",          icon:"👥" },
              { key:"drivers",        label:"CANDIDATURE",      icon:"🏍️" },
            ]},
            { section:"CATALOGUE", items:[
              { key:"products",   label:"PRODUITS",        icon:"🍺" },
              { key:"categories", label:"CATÉGORIES",      icon:"🗂️" },
              { key:"packs",      label:"PACKS",           icon:"🎉" },
            ]},
            { section:"MARKETING", items:[
              { key:"coupons",    label:"COUPONS",         icon:"🏷️" },
              { key:"banners",    label:"BANNIÈRES",       icon:"🎨" },
            ]},
            { section:"CONFIGURATION", items:[
              { key:"settings",          label:"PARAMÈTRES",      icon:"⚙️" },
              { key:"pickup_locations",  label:"POINTS RELAIS",   icon:"🏪" },
            ]},
          ] as const).map((group, gi) => (
            <div key={group.section}>
              <button
                className="admin-section-header"
                onClick={() => setCollapsedSections(s => ({...s, [group.section]: !s[group.section]}))}
                style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                  fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".68rem",color:"#4b5563",
                  letterSpacing:".15em",textTransform:"uppercase" as const,padding:"16px 20px 8px",background:"transparent",border:"none",
                  cursor:"pointer",textAlign:"left",...(gi > 0 ? {marginTop:"4px"} : {})}}>
                <span>{group.section}</span>
                <span style={{transform: collapsedSections[group.section] ? "rotate(0deg)" : "rotate(180deg)",
                  transition:"transform .2s",fontSize:".7rem",color:"#3a3450"}}>▼</span>
              </button>
              {!collapsedSections[group.section] && group.items.map(item => (
                <button key={item.key}
                  className={`admin-sidebar-btn${tab===item.key ? " active" : ""}`}
                  onClick={() => { setTab(item.key); setDrawerOpen(false); if (item.key === "orders") setNewOrdersCount(0); }}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"11px 20px",
                    background: tab===item.key ? "rgba(255,45,120,.08)" : "transparent",
                    border:"none",borderLeft: tab===item.key ? "2px solid #ff2d78" : "2px solid transparent",
                    color: tab===item.key ? "#ff2d78" : "#7a7490",cursor:"pointer",
                    fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".88rem",
                    letterSpacing:".06em",textTransform:"uppercase",textAlign:"left",
                    transition:"all .2s",position:"relative",borderRadius:0}}>
                  <span className="admin-nav-icon" style={{fontSize:"1.1rem"}}>{item.icon}</span>
                  <span className="admin-nav-label">{item.label}</span>
                  {item.key === "orders" && newOrdersCount > 0 && (
                    <span className="admin-badge-dot" style={{marginLeft:"auto",background:"#ff2d78",color:"#000",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",fontWeight:700,
                      minWidth:22,height:22,borderRadius:11,display:"flex",alignItems:"center",
                      justifyContent:"center",padding:"0 6px",
                      animation:"badgePulse 1.2s ease-in-out infinite"}}>
                      {newOrdersCount}
                    </span>
                  )}
                  {item.key === "dashboard" && alertCount > 0 && (
                    <span className="admin-badge-dot" style={{marginLeft:"auto",background:"#ff6b35",color:"#000",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",fontWeight:700,
                      minWidth:20,height:20,borderRadius:10,display:"flex",alignItems:"center",
                      justifyContent:"center",padding:"0 5px"}}>
                      {alertCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}

          {/* ── lien externe : module rémunération ── */}
          <div style={{padding:"12px 20px 8px",borderTop:"1px solid rgba(255,255,255,.05)",marginTop:8}}>
            <div style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".68rem",color:"#4b5563",
              letterSpacing:".15em",textTransform:"uppercase",marginBottom:8}}>FINANCE</div>
            <a href="/admin/payouts"
              style={{display:"flex",alignItems:"center",gap:12,padding:"11px 20px",
                background:"rgba(184,255,0,.06)",border:"none",borderLeft:"2px solid #b8ff00",
                color:"#b8ff00",fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".88rem",
                letterSpacing:".06em",textTransform:"uppercase",textDecoration:"none",
                borderRadius:"0 6px 6px 0",transition:"background .15s"}}
              onMouseEnter={e=>(e.currentTarget.style.background="rgba(184,255,0,.12)")}
              onMouseLeave={e=>(e.currentTarget.style.background="rgba(184,255,0,.06)")}>
              <span style={{fontSize:"1.1rem"}}>💳</span>
              <span>PAIEMENTS</span>
              <span style={{marginLeft:"auto",fontSize:".75rem",opacity:.6}}>↗</span>
            </a>
            <a href="/admin/analytics"
              style={{display:"flex",alignItems:"center",gap:12,padding:"11px 20px",
                background:"rgba(0,245,255,.06)",border:"none",borderLeft:"2px solid #00f5ff",
                color:"#00f5ff",fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".88rem",
                textDecoration:"none",cursor:"pointer",marginTop:2}}
              onMouseEnter={e=>(e.currentTarget.style.background="rgba(0,245,255,.12)")}
              onMouseLeave={e=>(e.currentTarget.style.background="rgba(0,245,255,.06)")}>
              <span style={{fontSize:"1.1rem"}}>🔮</span>
              <span>PRÉVISIONS</span>
              <span style={{marginLeft:"auto",fontSize:".75rem",opacity:.6}}>↗</span>
            </a>
          </div>

        </aside>

        <main className="admin-main" style={{flex:1,padding:"28px",overflowY:"auto",animation:"fadeUp .3s both"}}>

          {tab === "dashboard" && (() => {
            const now        = new Date();
            const todayStr   = now.toISOString().slice(0, 10);
            const monthStr   = now.toISOString().slice(0, 7);

            const todayOrders  = orders.filter(o => o.createdAt.slice(0,10) === todayStr);
            const monthOrders  = orders.filter(o => o.createdAt.slice(0,7) === monthStr);
            const weekOrders   = orders.filter(o => new Date(o.createdAt) >= new Date(now.getTime() - 7*24*60*60*1000));
            const periodOrders = dashPeriod === "24h" ? todayOrders : dashPeriod === "7j" ? weekOrders : monthOrders;
            const periodLabel  = dashPeriod === "24h" ? "AUJOURD'HUI" : dashPeriod === "7j" ? "7 JOURS" : "CE MOIS";

            const pending    = orders.filter(o => o.status === "nouveau");
            const inProgress = orders.filter(o => o.status === "en_cours");
            const delivered  = orders.filter(o => o.status === "livre");
            const cancelled  = orders.filter(o => o.status === "annule");

            const sum  = (list: Order[]) => list.reduce((acc, o) => acc + Number(o.total), 0);
            const avg  = (list: Order[]) => list.length ? sum(list) / list.length : 0;

            const doneCount   = delivered.length + cancelled.length;
            const successRate = doneCount > 0 ? Math.round(delivered.length / doneCount * 100) : null;
            const activeUids  = new Set(orders.map((o: any) => o.uid).filter(Boolean));

            const prodCount: Record<string, number> = {};
            orders.forEach(o => {
              o.items.split("\n").forEach(line => {
                const name = line.replace(/x\d+.*/, "").trim();
                if (name) prodCount[name] = (prodCount[name] || 0) + 1;
              });
            });
            const top3 = Object.entries(prodCount).sort((a,b) => b[1]-a[1]).slice(0,3);

            const todayDelivery = todayOrders.filter(o => !o.fulfillmentType || o.fulfillmentType === "delivery").length;
            const todayPickup   = todayOrders.filter(o => o.fulfillmentType === "pickup").length;

            const last7 = Array.from({length:7}, (_,i) => {
              const d = new Date(); d.setDate(d.getDate() - (6-i));
              const str = d.toISOString().slice(0,10);
              const dayOrds = orders.filter(o => o.createdAt.slice(0,10) === str);
              return {
                label: d.toLocaleDateString("fr-FR",{weekday:"short"}),
                count: dayOrds.length,
                ca: dayOrds.reduce((s,o) => s+Number(o.total), 0),
              };
            });
            const maxCa = Math.max(...last7.map(d => d.ca), 1);

            const chip = (icon: string, value: string, label: string, color = "#00f5ff", onClick?: () => void) => (
              <div onClick={onClick} style={{
                background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.09)",
                borderRadius:8,padding:"10px 16px",cursor:onClick?"pointer":"default",
                minWidth:120,flexShrink:0,position:"relative" as const,
              }}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                  <span style={{fontSize:".88rem"}}>{icon}</span>
                  <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.1rem",color,lineHeight:1}}>{value}</span>
                  {onClick && <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#ff2d78",position:"absolute" as const,top:8,right:10}}>→</span>}
                </div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:".68rem",color:"#5a5470",letterSpacing:".05em",whiteSpace:"nowrap"}}>{label}</div>
              </div>
            );

            return (
              <div>
                {/* Header */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
                  <div>
                    <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.5rem",color:"#ff2d78"}}>Tableau de bord</span>
                    <span className="admin-dash-date" style={{fontFamily:"'Inter',sans-serif",fontWeight:400,fontSize:".82rem",color:"#5a5470",
                      marginLeft:14,letterSpacing:".1em"}}>{now.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {(["24h","7j","30j"] as const).map(p => (
                      <button key={p} onClick={() => setDashPeriod(p)}
                        style={{padding:"6px 14px",borderRadius:6,border:"none",
                          fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".85rem",letterSpacing:".06em",cursor:"pointer",
                          background: dashPeriod===p ? "#ff2d78" : "rgba(255,255,255,.06)",
                          color: dashPeriod===p ? "#000" : "#7a7490"}}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── ALERTES OPÉRATIONNELLES ── */}
                {(() => {
                  const unresolved = adminAlerts.filter(a => !a.resolved);
                  const ALERT_META: Record<string, { icon: string; label: string }> = {
                    driver_shortage: { icon: "🏍️", label: "Manque livreurs"  },
                    demand_spike:    { icon: "📈", label: "Pic de demande"    },
                    payment_failed:  { icon: "💳", label: "Erreur paiement"  },
                    cash_pending:    { icon: "💵", label: "Cash en attente"  },
                  };
                  const SEVERITY_STYLE: Record<string, { border: string; bg: string; color: string; badge: string }> = {
                    critical: { border:"rgba(255,45,120,.5)",  bg:"rgba(255,45,120,.07)",  color:"#ff2d78", badge:"#ff2d78"  },
                    warning:  { border:"rgba(255,107,53,.5)",  bg:"rgba(255,107,53,.07)",  color:"#ff6b35", badge:"#ff6b35"  },
                    info:     { border:"rgba(0,245,255,.3)",   bg:"rgba(0,245,255,.05)",   color:"#00f5ff", badge:"#00f5ff"  },
                  };

                  return (
                    <div style={{marginBottom:20}}>
                      {/* Header row */}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                            letterSpacing:".12em",color:"#5a5470"}}>// ALERTES</span>
                          {unresolved.length > 0 && (
                            <span style={{background:"#ff6b35",color:"#000",fontFamily:"'Share Tech Mono',monospace",
                              fontSize:".7rem",fontWeight:700,minWidth:20,height:20,borderRadius:10,
                              display:"flex",alignItems:"center",justifyContent:"center",padding:"0 5px"}}>
                              {unresolved.length}
                            </span>
                          )}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {adminAlerts.length > 0 && (
                            <button
                              onClick={() => { if (confirm("Supprimer toutes les alertes ?")) dismissAll(); }}
                              title="Supprimer toutes les alertes"
                              style={{background:"rgba(255,45,120,.08)",border:"1px solid rgba(255,45,120,.2)",
                                borderRadius:6,padding:"4px 10px",cursor:"pointer",
                                color:"#ff2d78",fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",letterSpacing:".04em"}}>
                              🗑 TOUT SUPPRIMER
                            </button>
                          )}
                          <button
                            onClick={() => setAlertSound(!alertSound)}
                            title={alertSound ? "Son activé" : "Son désactivé"}
                            style={{background:"none",border:`1px solid ${alertSound ? "rgba(184,255,0,.3)" : "rgba(255,255,255,.08)"}`,
                              borderRadius:6,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
                              color: alertSound ? "#b8ff00" : "#5a5470",
                              fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem"}}>
                            {alertSound ? "🔔 SON ON" : "🔕 SON OFF"}
                          </button>
                        </div>
                      </div>

                      {/* Alert cards */}
                      {unresolved.length === 0 ? (
                        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",
                          background:"rgba(184,255,0,.04)",border:"1px solid rgba(184,255,0,.12)",
                          borderRadius:10,fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                          color:"#5a5470"}}>
                          <span>✅</span>
                          <span>Aucune alerte active — opérations normales</span>
                        </div>
                      ) : (
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {unresolved.map((alert: AdminAlert) => {
                            const meta  = ALERT_META[alert.type]  ?? { icon:"⚠️", label: alert.type };
                            const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.warning;
                            return (
                              <div key={alert.id} style={{
                                display:"flex",alignItems:"flex-start",gap:12,
                                background: style.bg,
                                border:`1px solid ${style.border}`,
                                borderRadius:10,padding:"11px 14px",
                              }}>
                                <span style={{fontSize:"1.2rem",flexShrink:0,marginTop:1}}>{meta.icon}</span>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                                    <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,
                                      fontSize:".82rem",color: style.color}}>
                                      {meta.label}
                                    </span>
                                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
                                      background: style.badge,color:"#000",borderRadius:4,
                                      padding:"1px 6px",fontWeight:700,letterSpacing:".06em"}}>
                                      {alert.severity.toUpperCase()}
                                    </span>
                                    {alert.count != null && (
                                      <span style={{marginLeft:"auto",fontFamily:"'Black Ops One',cursive",
                                        fontSize:"1rem",color: style.color}}>
                                        ×{alert.count}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:".78rem",
                                    color:"#d0d0e0",lineHeight:1.4,marginBottom:6}}>
                                    {alert.message}
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470"}}>
                                      {new Date(alert.createdAt).toLocaleString("fr-FR",{
                                        day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",
                                      })}
                                    </span>
                                    {alert.type === "driver_shortage" && (
                                      <button onClick={() => setTab("online_drivers" as any)}
                                        style={{background:"none",border:"none",cursor:"pointer",
                                          fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                                          color:"#00f5ff",padding:0,textDecoration:"underline"}}>
                                        Voir livreurs →
                                      </button>
                                    )}
                                    {(alert.type === "payment_failed" || alert.type === "cash_pending") && (
                                      <button onClick={() => setTab("orders")}
                                        style={{background:"none",border:"none",cursor:"pointer",
                                          fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                                          color:"#00f5ff",padding:0,textDecoration:"underline"}}>
                                        Voir commandes →
                                      </button>
                                    )}
                                    <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
                                      <button onClick={() => resolveAlert(alert.id)}
                                        style={{background:"rgba(255,255,255,.05)",
                                          border:"1px solid rgba(255,255,255,.1)",
                                          borderRadius:5,padding:"3px 10px",cursor:"pointer",
                                          fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                                          color:"#5a5470",transition:"background .15s"}}
                                        onMouseEnter={e => (e.currentTarget.style.background="rgba(184,255,0,.08)")}
                                        onMouseLeave={e => (e.currentTarget.style.background="rgba(255,255,255,.05)")}>
                                        ✓ Résoudre
                                      </button>
                                      <button onClick={() => deleteAlert(alert.id)}
                                        title="Supprimer cette alerte"
                                        style={{background:"rgba(255,45,120,.06)",
                                          border:"1px solid rgba(255,45,120,.15)",
                                          borderRadius:5,padding:"3px 8px",cursor:"pointer",
                                          fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                                          color:"#ff2d78",transition:"background .15s"}}
                                        onMouseEnter={e => (e.currentTarget.style.background="rgba(255,45,120,.18)")}
                                        onMouseLeave={e => (e.currentTarget.style.background="rgba(255,45,120,.06)")}>
                                        ×
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Resolved history (collapsed) */}
                      {adminAlerts.filter(a => a.resolved).length > 0 && (
                        <details style={{marginTop:8}}>
                          <summary style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                            color:"#3a3450",cursor:"pointer",letterSpacing:".06em",userSelect:"none",
                            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span>{adminAlerts.filter(a => a.resolved).length} alerte{adminAlerts.filter(a => a.resolved).length > 1 ? "s" : ""} résolue{adminAlerts.filter(a => a.resolved).length > 1 ? "s" : ""} (historique)</span>
                            <button onClick={e => { e.preventDefault(); deleteAllResolved(); }}
                              style={{background:"transparent",border:"none",color:"#ff2d78",
                                fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",cursor:"pointer",padding:"0 4px"}}>
                              🗑 vider
                            </button>
                          </summary>
                          <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:6}}>
                            {adminAlerts.filter(a => a.resolved).slice(0,5).map((alert: AdminAlert) => {
                              const meta = ALERT_META[alert.type] ?? { icon:"✅", label: alert.type };
                              return (
                                <div key={alert.id} style={{display:"flex",alignItems:"center",gap:10,
                                  padding:"8px 12px",background:"rgba(255,255,255,.02)",
                                  border:"1px solid rgba(255,255,255,.05)",borderRadius:8,opacity:.6}}>
                                  <span>{meta.icon}</span>
                                  <span style={{fontFamily:"'Inter',sans-serif",fontSize:".78rem",
                                    color:"#5a5470",flex:1,overflow:"hidden",textOverflow:"ellipsis",
                                    whiteSpace:"nowrap"}}>
                                    {alert.message}
                                  </span>
                                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",
                                    color:"#3a3450",flexShrink:0}}>
                                    ✓ {alert.resolvedAt
                                      ? new Date(alert.resolvedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})
                                      : ""}
                                  </span>
                                  <button onClick={() => deleteAlert(alert.id)}
                                    style={{background:"transparent",border:"none",color:"#5a5470",
                                      cursor:"pointer",fontSize:".8rem",padding:"0 4px",lineHeight:1,flexShrink:0}}
                                    title="Supprimer">×</button>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })()}

                {/* Alerte commandes en attente */}
                {pending.length > 0 && (
                  <div onClick={() => setTab("orders")} style={{
                    display:"flex",alignItems:"center",gap:12,
                    background:"rgba(255,45,120,.07)",border:"1px solid rgba(255,45,120,.4)",
                    borderRadius:10,padding:"11px 18px",marginBottom:18,cursor:"pointer",
                  }}>
                    <span style={{fontSize:"1.1rem"}}>🔔</span>
                    <span style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".88rem",color:"#ff2d78"}}>
                      {pending.length} commande{pending.length > 1 ? "s" : ""} en attente de traitement
                    </span>
                    <span style={{marginLeft:"auto",fontFamily:"'Share Tech Mono',monospace",color:"#5a5470",fontSize:".78rem"}}>traiter →</span>
                  </div>
                )}

                {/* Chips de métriques — rangée horizontale scrollable */}
                <div style={{display:"flex",gap:10,overflowX:"auto",marginBottom:20,paddingBottom:2,
                  scrollbarWidth:"none" as any}}>
                  {chip("💰", `${sum(periodOrders).toFixed(0)} €`, `Chiffre d'affaires · ${periodLabel}`, "#b8ff00")}
                  {chip("🗓️", String(periodOrders.length), `Commandes · ${periodLabel}`, "#00f5ff")}
                  {chip("🔔", String(pending.length), "En attente", "#ff2d78", pending.length > 0 ? () => setTab("orders") : undefined)}
                  {chip("🚚", String(inProgress.length), "En cours", "#ff9500", inProgress.length > 0 ? () => { setOrderFilter("en_cours"); setTab("orders"); } : undefined)}
                  {chip("✅", String(delivered.length), "Livrées / retirées", "#b8ff00")}
                  {successRate !== null && chip("📊", `${successRate}%`, "Taux de réussite", successRate >= 80 ? "#b8ff00" : successRate >= 60 ? "#ff9500" : "#ff2d78")}
                  {chip("💶", `${avg(periodOrders).toFixed(2)} €`, "Panier moyen", "#a855f7")}
                  {chip("👥", String(usersCount), `Clients · ${activeUids.size} actifs`, "#00f5ff")}
                  {chip("🏍️", String(onlineDrivers.length), "Livreurs en ligne", onlineDrivers.length > 0 ? "#b8ff00" : "#5a5470", onlineDrivers.length > 0 ? () => setTab("online_drivers") : undefined)}
                  {chip("📅", String(todayOrders.length), `Aujourd'hui · ${todayDelivery}🚚 ${todayPickup}🏪`, "#ff9500")}
                  {adminWeather && chip(
                    adminWeather.isHeavyRain ? "⛈" : adminWeather.isRaining ? "🌧" : "☀️",
                    adminWeather.isHeavyRain ? "+3€" : adminWeather.isRaining ? "+1.50€" : "OK",
                    `Matoury · ${adminWeather.precipitation.toFixed(1)}mm`,
                    adminWeather.isHeavyRain ? "#60a5fa" : adminWeather.isRaining ? "#93c5fd" : "#facc15",
                  )}
                </div>

                {/* Graphique 7 jours */}
                <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,
                  padding:"18px 22px",marginBottom:18}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".83rem",letterSpacing:".08em",color:"#5a5470"}}>
                      Tendances — CA 7 derniers jours
                    </div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#5a5470"}}>
                      semaine : <span style={{color:"#b8ff00"}}>{sum(weekOrders).toFixed(0)} €</span>
                      <span style={{marginLeft:10}}>{weekOrders.length} cmd</span>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:8,height:86}}>
                    {last7.map((d, i) => (
                      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#b8ff00",minHeight:15,textAlign:"center"}}>
                          {d.ca > 0 ? `${d.ca.toFixed(0)}€` : ""}
                        </div>
                        <div style={{
                          width:"100%",
                          height: d.ca === 0 ? 3 : Math.max(6, Math.round((d.ca/maxCa)*62)),
                          background: i === 6 ? "#ff2d78" : "#b8ff00",
                          borderRadius:"3px 3px 0 0",
                          opacity: d.ca === 0 ? .2 : 1,
                          transition:"height .4s",
                          boxShadow: d.ca > 0 ? (i === 6 ? "0 0 8px rgba(255,45,120,.5)" : "0 0 8px rgba(184,255,0,.35)") : "none"
                        }} />
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>{d.label}</div>
                        {d.count > 0 && <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".55rem",color:"#5a5470"}}>{d.count}cmd</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bas de page : Top produits + Dernières commandes */}
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  {top3.length > 0 && (
                    <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
                      borderRadius:10,padding:"16px 20px",minWidth:200,flex:"0 0 auto"}}>
                      <div style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".83rem",
                        letterSpacing:".08em",color:"#5a5470",marginBottom:14}}>TOP PRODUITS</div>
                      {top3.map(([name, count], i) => (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i < top3.length-1 ? 10 : 0}}>
                          <span style={{fontFamily:"'Black Ops One',cursive",fontSize:".82rem",
                            color: i===0 ? "#b8ff00" : i===1 ? "#00f5ff" : "#a855f7",minWidth:22}}>#{i+1}</span>
                          <span style={{flex:1,fontSize:".82rem",fontFamily:"'Inter',sans-serif",
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name.slice(0,24)}</span>
                          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem",color:"#5a5470"}}>{count}×</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
                    borderRadius:10,padding:"16px 20px",flex:1,minWidth:280}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                      <div style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".83rem",
                        letterSpacing:".08em",color:"#5a5470"}}>Activité récente</div>
                      <button onClick={() => setTab("orders")} style={{background:"none",border:"none",color:"#ff2d78",
                        fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",cursor:"pointer",padding:0}}>
                        voir tout →
                      </button>
                    </div>
                    {orders.slice(0,8).map(o => (
                      <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",
                        borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                        <span style={{fontFamily:"'Black Ops One',cursive",fontSize:".78rem",color:"#ff2d78",minWidth:44}}>
                          #{(o as any).orderNumber ?? o.id?.slice(-4).toUpperCase()}
                        </span>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem",color:"#5a5470",minWidth:64}}>
                          {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                        <span style={{flex:1,fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {(o as any).name || o.phone}
                        </span>
                        <span style={{fontFamily:"'Black Ops One',cursive",fontSize:".88rem",color:"#b8ff00",whiteSpace:"nowrap"}}>
                          {Number(o.total).toFixed(2)} €
                        </span>
                        <span style={{fontSize:".73rem",padding:"3px 8px",borderRadius:20,fontFamily:"'Share Tech Mono',monospace",flexShrink:0,
                          background: o.status==="nouveau" ? "rgba(255,45,120,.15)" : o.status==="en_cours" ? "rgba(255,149,0,.15)" : o.status==="livre" ? "rgba(184,255,0,.15)" : "rgba(90,84,112,.2)",
                          color: o.status==="nouveau" ? "#ff2d78" : o.status==="en_cours" ? "#ff9500" : o.status==="livre" ? "#b8ff00" : "#5a5470"}}>
                          {o.status}
                        </span>
                      </div>
                    ))}
                    {orders.length === 0 && (
                      <div style={{color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem"}}>// aucune commande</div>
                    )}
                  </div>
                </div>

                {/* ── SECTION IA ── */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginTop:20}}>

                  {/* Résumé IA du jour */}
                  <div style={{background:"rgba(255,45,120,.05)",border:"1px solid rgba(255,45,120,.25)",borderRadius:12,padding:"18px 20px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".9rem",color:"#ff2d78",letterSpacing:".06em"}}>
                        ✨ RÉSUMÉ IA DU JOUR
                      </div>
                      <button
                        disabled={aiSummaryLoading || settings.aiPredictEnabled === false}
                        title={settings.aiPredictEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                        onClick={async () => {
                          setAiSummaryLoading(true);
                          try {
                            const peakHour = (() => {
                              const hrs: Record<number,number> = {};
                              todayOrders.forEach(o => { const h = new Date(o.createdAt).getHours(); hrs[h] = (hrs[h]||0)+1; });
                              const pk = Object.entries(hrs).sort((a,b)=>+b[1]-+a[1])[0];
                              return pk ? pk[0] : "?";
                            })();
                            const topProds = Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n])=>n).join(", ") || "aucun";
                            const doneC = delivered.length + cancelled.length;
                            const r = doneC > 0 ? Math.round(delivered.length/doneC*100) : 100;
                            const result = await callAI("summary", {
                              count: todayOrders.length,
                              total: sum(todayOrders).toFixed(2),
                              topProducts: topProds,
                              peakHour,
                              rate: r,
                              drivers: 0,
                            });
                            setAiSummary(result);
                          } catch { showToast("Erreur IA", "err"); }
                          setAiSummaryLoading(false);
                        }}
                        style={{background:"rgba(255,45,120,.15)",border:"1px solid rgba(255,45,120,.4)",color:"#ff2d78",
                          padding:"5px 12px",borderRadius:6,cursor:"pointer",fontFamily:"'Share Tech Mono',monospace",
                          fontSize:".75rem",letterSpacing:".06em",opacity:aiSummaryLoading?0.5:1}}>
                        {aiSummaryLoading ? "..." : "↻ GÉNÉRER"}
                      </button>
                    </div>
                    {aiSummary
                      ? <div style={{fontFamily:"'Inter',sans-serif",fontSize:".88rem",lineHeight:1.75,color:"#d0d0e0"}}>{aiSummary}</div>
                      : <div style={{color:"#3a3454",fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem"}}>// Clique ↻ GÉNÉRER pour le résumé IA du jour</div>
                    }
                  </div>

                  {/* Prédictions IA */}
                  <div style={{background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.18)",borderRadius:12,padding:"18px 20px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".9rem",color:"#00f5ff",letterSpacing:".06em"}}>
                        🔮 PRÉDICTIONS IA
                      </div>
                      <button
                        disabled={aiPredLoading || settings.aiPredictEnabled === false}
                        title={settings.aiPredictEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                        onClick={async () => {
                          setAiPredLoading(true);
                          try {
                            const result = await callAI("predict", { weekData: last7 });
                            setAiPrediction(result);
                          } catch { showToast("Erreur IA", "err"); }
                          setAiPredLoading(false);
                        }}
                        style={{background:"rgba(0,245,255,.12)",border:"1px solid rgba(0,245,255,.35)",color:"#00f5ff",
                          padding:"5px 12px",borderRadius:6,cursor:"pointer",fontFamily:"'Share Tech Mono',monospace",
                          fontSize:".75rem",letterSpacing:".06em",opacity:aiPredLoading?0.5:1}}>
                        {aiPredLoading ? "..." : "↻ ANALYSER"}
                      </button>
                    </div>
                    {aiPrediction ? (
                      <div style={{display:"grid",gap:8}}>
                        {([
                          {label:"⏰ Heure de pointe", val: aiPrediction.peakHour},
                          {label:"📅 Meilleur jour",   val: aiPrediction.bestDay},
                          {label:"🎯 Conseil promo",   val: aiPrediction.promoSuggestion},
                          {label:"🏪 Ouverture",       val: aiPrediction.openRecommendation},
                          {label:"💡 Insight",         val: aiPrediction.insight},
                        ] as {label:string;val:string}[]).filter(i => i.val).map((item, idx) => (
                          <div key={idx} style={{borderBottom:"1px solid rgba(255,255,255,.04)",paddingBottom:6}}>
                            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".66rem",color:"#5a5470",letterSpacing:".1em"}}>{item.label}</div>
                            <div style={{fontFamily:"'Inter',sans-serif",fontSize:".84rem",color:"#f0eeff",marginTop:2}}>{item.val}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{color:"#3a3454",fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem"}}>// Clique ↻ ANALYSER pour les prédictions de la semaine</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {tab === "products" && (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                  🍺 <span style={{color:"#ff2d78"}}>PRODUITS</span>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button
                    disabled={aiStockLoading || settings.aiStockEnabled === false}
                    title={settings.aiStockEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                    onClick={async () => {
                      setAiStockLoading(true); setAiStock([]);
                      try {
                        const soldMap: Record<string,number> = {};
                        orders.forEach(o => o.items.split("\n").forEach(line => {
                          const n = line.replace(/x\d+.*/, "").trim();
                          if (n) soldMap[n] = (soldMap[n]||0)+1;
                        }));
                        const result = await callAI("stock_predict", {
                          products: products.map(p => ({ name:p.name, stock:p.stock, vendu_semaine: soldMap[p.name]||0 })),
                        });
                        setAiStock(result.at_risk ?? []);
                        if (!(result.at_risk ?? []).length) showToast("Stocks OK ✓");
                      } catch { showToast("Erreur IA","err"); }
                      setAiStockLoading(false);
                    }}
                    style={{background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.35)",
                      color:"#ff9500",padding:"8px 16px",borderRadius:8,cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",letterSpacing:".06em",
                      opacity:aiStockLoading?0.5:1}}>
                    {aiStockLoading ? "..." : "📦 RUPTURES IA"}
                  </button>
                  <button onClick={() => { setEditProd({name:"",desc:"",price:0,image:"",cat:"biere",badge:"",stock:0}); setShowProdForm(true); }}
                    style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:8,
                      padding:"10px 20px",fontFamily:"'Inter',sans-serif",fontWeight:600,
                      fontSize:".85rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                    + AJOUTER
                  </button>
                </div>
              </div>

              {/* ── Alertes stock IA ── */}
              {aiStock.length > 0 && (
                <div style={{background:"rgba(255,149,0,.05)",border:"1px solid rgba(255,149,0,.25)",
                  borderRadius:10,padding:"14px 18px",marginBottom:20}}>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#ff9500",
                    letterSpacing:".12em",marginBottom:10}}>📦 RISQUES DE RUPTURE DÉTECTÉS ({aiStock.length})</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {aiStock.map((item, i) => (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",
                        background:"rgba(0,0,0,.2)",borderRadius:6}}>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",padding:"2px 8px",borderRadius:4,
                          background: item.risk==="high" ? "rgba(255,45,120,.2)" : "rgba(255,149,0,.2)",
                          color: item.risk==="high" ? "#ff2d78" : "#ff9500",border:`1px solid ${item.risk==="high"?"rgba(255,45,120,.4)":"rgba(255,149,0,.4)"}`}}>
                          {item.risk.toUpperCase()}
                        </span>
                        <span style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".88rem",flex:1}}>{item.name}</span>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>
                          ~{item.estimatedDaysLeft}j restants
                        </span>
                        <span style={{fontFamily:"'Inter',sans-serif",fontSize:".8rem",color:"#ff9500",fontStyle:"italic"}}>
                          {item.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loading ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem"}}>// chargement...</div>
              ) : products.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                  // aucun produit — ajoutes-en un !
                </div>
              ) : (
                <div style={{display:"grid",gap:10}}>
                  {products.map((p, idx) => (
                    <div key={p.id}
                      draggable
                      onDragStart={() => { dragRef.current = idx; }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => { if (dragRef.current !== null) reorderProducts(dragRef.current, idx); dragRef.current = null; }}
                      className="admin-product-row row" style={{background:"rgba(255,255,255,.02)",
                        border: p.isActive === false ? "1px solid rgba(255,255,255,.03)" : "1px solid rgba(255,255,255,.06)",
                        borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",
                        gap:14,transition:"all .15s ease",cursor:"grab",
                        opacity: p.isActive === false ? 0.45 : 1}}>
                      {/* poignée drag */}
                      <span style={{color:"#3a3450",fontSize:"1.1rem",lineHeight:1,flexShrink:0,cursor:"grab"}}
                        title="Glisser pour réordonner">⠿</span>
                      {p.image ? (
                        <img src={p.image} alt={p.name} style={{width:60,height:60,objectFit:"cover",borderRadius:4,
                          filter: p.isActive === false ? "grayscale(1)" : "none"}} />
                      ) : (
                        <div style={{width:60,height:60,background:"#080514",borderRadius:4,
                          display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem"}}>
                          📷
                        </div>
                      )}
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:"1rem",letterSpacing:".04em",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          {p.name}
                          {p.isActive === false && (
                            <span style={{fontSize:".7rem",fontFamily:"'Share Tech Mono',monospace",
                              background:"rgba(90,84,112,.5)",color:"#5a5470",padding:"2px 7px",borderRadius:3,
                              letterSpacing:".1em",border:"1px solid rgba(255,255,255,.06)"}}>
                              INACTIF
                            </span>
                          )}
                          {p.badge === "BEST" && (
                            <span style={{fontSize:".78rem",fontFamily:"'Share Tech Mono',monospace",
                              background:"rgba(255,180,0,.9)",color:"#000",padding:"2px 7px",borderRadius:3,
                              letterSpacing:".1em",boxShadow:"0 0 8px rgba(255,180,0,.5)"}}>
                              ⭐ BEST
                            </span>
                          )}
                        </div>
                        <div style={{fontSize:".78rem",color:"#5a5470",marginTop:2}}>{p.desc}</div>
                        <div style={{fontSize:".9rem",marginTop:4,fontFamily:"'Share Tech Mono',monospace",
                          color: p.stock === 0 ? "#ff2d78" : p.stock < 5 ? "#b8ff00" : "#00f5ff"}}>
                          Stock: {p.stock} {p.stock === 0 ? "⚠️ RUPTURE" : p.stock < 5 ? "⚠️ FAIBLE" : ""}
                        </div>
                      </div>
                      <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",
                        color:"#b8ff00",textShadow:"0 0 10px rgba(184,255,0,.4)"}}>
                        {Number(p.price).toFixed(2)}€
                      </div>
                      <div className="admin-prod-actions" style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        <button onClick={async () => {
                          const next = p.isActive === false ? true : false;
                          await updateDoc(doc(db, "products", p.id!), { isActive: next });
                          showToast(`Produit ${next ? "activé" : "désactivé"} ✓`);
                        }}
                          style={{background: p.isActive === false
                            ? "rgba(184,255,0,.1)" : "rgba(90,84,112,.15)",
                            border: p.isActive === false
                            ? "1px solid rgba(184,255,0,.4)" : "1px solid rgba(255,255,255,.1)",
                            color: p.isActive === false ? "#b8ff00" : "#5a5470",
                            padding:"8px 12px",borderRadius:6,fontFamily:"'Share Tech Mono',monospace",
                            fontSize:".78rem",letterSpacing:".06em",cursor:"pointer",transition:"all .2s"}}>
                          {p.isActive === false ? "✓ ACTIVER" : "⏸ DÉSACTIVER"}
                        </button>
                        <button onClick={() => { setEditProd(p); setShowProdForm(true); }}
                          style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                            padding:"8px 18px",borderRadius:6,fontFamily:"'Inter',sans-serif",fontWeight:500,
                            fontSize:".88rem",letterSpacing:".06em",cursor:"pointer"}}>
                          ✏️ ÉDITER
                        </button>
                        <button onClick={() => deleteProd(p.id!)}
                          style={{background:"transparent",border:"1px solid rgba(255,45,120,.3)",color:"#ff2d78",
                            padding:"8px 14px",borderRadius:6,fontFamily:"'Inter',sans-serif",fontWeight:500,
                            fontSize:".88rem",cursor:"pointer"}}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showProdForm && editProd && (
                <ProductForm
                  prod={editProd}
                  cats={dbCats}
                  onSave={saveProd}
                  onClose={() => { setShowProdForm(false); setEditProd(null); }}
                  showToast={showToast}
                  settings={settings}
                />
              )}
            </div>
          )}

          {/* ── CATÉGORIES ── */}
          {tab === "categories" && (
            <div>
              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em",marginBottom:28}}>
                🗂️ <span style={{color:"#ff2d78"}}>CATÉGORIES</span>
              </div>

              {dbCats.length === 0 && (
                <div style={{background:"rgba(255,45,120,.06)",border:"1px solid rgba(255,45,120,.2)",borderRadius:10,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",color:"#ff9ec4",lineHeight:1.6}}>
                    Aucune catégorie en base. Les catégories affichées sur le site sont celles par défaut (hardcodées). Initialisez-les pour pouvoir les gérer.
                  </div>
                  <button onClick={initDefaultCats}
                    style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:6,padding:"12px 24px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".06em",cursor:"pointer",whiteSpace:"nowrap"}}>
                    🚀 INITIALISER LES CATÉGORIES
                  </button>
                </div>
              )}

              {/* Formulaire ajout / édition */}
              <div style={{background:"#0c0918",border:"1px solid rgba(255,45,120,.2)",borderRadius:10,padding:"24px",marginBottom:28}}>
                <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.1rem",
                  letterSpacing:".06em",color:"#00f5ff",marginBottom:20}}>
                  {editCat ? "✏️ MODIFIER LA CATÉGORIE" : "➕ NOUVELLE CATÉGORIE"}
                </div>

                <div className="admin-cat-form-grid" style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr 80px auto",gap:14,alignItems:"end"}}>
                  {/* Emoji */}
                  <div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#7a7490",letterSpacing:".1em",marginBottom:8}}>EMOJI</div>
                    <input
                      value={editCat ? editCat.emoji : catForm.emoji}
                      onChange={e => editCat ? setEditCat(s => s && ({...s, emoji: e.target.value})) : setCatForm(s => ({...s, emoji: e.target.value}))}
                      placeholder="🍺"
                      style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.15)",borderRadius:6,
                        padding:"12px",color:"#f0eeff",fontSize:"1.5rem",textAlign:"center"}} />
                  </div>
                  {/* Clé technique */}
                  <div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#7a7490",letterSpacing:".1em",marginBottom:8}}>CLÉ (ex: biere)</div>
                    <input
                      value={editCat ? editCat.key : catForm.key}
                      onChange={e => editCat ? setEditCat(s => s && ({...s, key: e.target.value})) : setCatForm(s => ({...s, key: e.target.value}))}
                      placeholder="biere"
                      style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.15)",borderRadius:6,
                        padding:"12px 14px",color:"#f0eeff",fontSize:"1rem",fontFamily:"'Share Tech Mono',monospace"}} />
                  </div>
                  {/* Label affiché */}
                  <div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#7a7490",letterSpacing:".1em",marginBottom:8}}>LIBELLÉ AFFICHÉ</div>
                    <input
                      value={editCat ? editCat.label : catForm.label}
                      onChange={e => editCat ? setEditCat(s => s && ({...s, label: e.target.value})) : setCatForm(s => ({...s, label: e.target.value}))}
                      placeholder="🍺 BIÈRES"
                      style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.15)",borderRadius:6,
                        padding:"12px 14px",color:"#f0eeff",fontSize:"1rem"}} />
                  </div>
                  {/* Ordre */}
                  <div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#7a7490",letterSpacing:".1em",marginBottom:8}}>ORDRE</div>
                    <input
                      type="number"
                      value={editCat ? editCat.order : catForm.order}
                      onChange={e => editCat ? setEditCat(s => s && ({...s, order: Number(e.target.value)})) : setCatForm(s => ({...s, order: Number(e.target.value)}))}
                      placeholder="1"
                      style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.15)",borderRadius:6,
                        padding:"12px",color:"#f0eeff",fontSize:"1rem",fontFamily:"'Share Tech Mono',monospace",textAlign:"center"}} />
                  </div>
                  {/* Boutons */}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={saveCat}
                      style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:6,
                        padding:"12px 22px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                        fontSize:"1rem",letterSpacing:".06em",cursor:"pointer",whiteSpace:"nowrap"}}>
                      {editCat ? "✓ MODIFIER" : "✓ AJOUTER"}
                    </button>
                    {editCat && (
                      <button onClick={() => setEditCat(null)}
                        style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"#7a7490",
                          borderRadius:6,padding:"12px 16px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                          fontSize:"1rem",cursor:"pointer"}}>
                        ANNULER
                      </button>
                    )}
                  </div>
                </div>

                {!editCat && (
                  <div style={{marginTop:12,fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#5a5470"}}>
                    💡 La clé est l&apos;identifiant technique (sans accent, en minuscules). Le libellé est ce que voit le client sur le site.
                  </div>
                )}
              </div>

              {/* Liste des catégories */}
              {dbCats.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"48px",fontSize:".9rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:10}}>
                  // aucune catégorie — ajoutez-en une ci-dessus
                </div>
              ) : (
                <div style={{display:"grid",gap:8}}>
                  {dbCats.map((c, idx) => (
                    <div key={c.id} style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
                      borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:10,transition:"all .15s ease"}}>

                      {/* Boutons monter / descendre — grands pour le tactile */}
                      <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                        <button onClick={() => moveCat(idx, -1)} disabled={idx === 0}
                          style={{width:36,height:36,borderRadius:6,border:"1px solid rgba(255,255,255,.15)",
                            background: idx === 0 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.07)",
                            color: idx === 0 ? "rgba(255,255,255,.2)" : "#f0eeff",
                            cursor: idx === 0 ? "default" : "pointer",
                            fontSize:"1.1rem",display:"flex",alignItems:"center",justifyContent:"center",
                            lineHeight:1,userSelect:"none",WebkitUserSelect:"none"}}>
                          ▲
                        </button>
                        <button onClick={() => moveCat(idx, 1)} disabled={idx === dbCats.length - 1}
                          style={{width:36,height:36,borderRadius:6,border:"1px solid rgba(255,255,255,.15)",
                            background: idx === dbCats.length - 1 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.07)",
                            color: idx === dbCats.length - 1 ? "rgba(255,255,255,.2)" : "#f0eeff",
                            cursor: idx === dbCats.length - 1 ? "default" : "pointer",
                            fontSize:"1.1rem",display:"flex",alignItems:"center",justifyContent:"center",
                            lineHeight:1,userSelect:"none",WebkitUserSelect:"none"}}>
                          ▼
                        </button>
                      </div>

                      <span style={{fontSize:"1.8rem",minWidth:38,textAlign:"center"}}>{c.emoji}</span>

                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:"1rem",letterSpacing:".03em",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.label}</div>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470",marginTop:2}}>
                          clé : <span style={{color:"#00f5ff"}}>{c.key}</span>
                        </div>
                      </div>

                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button onClick={() => setEditCat(c)}
                          style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                            padding:"10px 14px",borderRadius:6,fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                            fontSize:".85rem",cursor:"pointer",whiteSpace:"nowrap",minHeight:44}}>
                          ✏️
                        </button>
                        <button onClick={() => deleteCat(c.id!)}
                          style={{background:"transparent",border:"1px solid rgba(255,45,120,.3)",color:"#ff2d78",
                            padding:"10px 14px",borderRadius:6,fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                            fontSize:".85rem",cursor:"pointer",minHeight:44}}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{marginTop:20,padding:"16px 20px",background:"rgba(0,245,255,.04)",
                border:"1px solid rgba(0,245,255,.12)",borderRadius:8,
                fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",lineHeight:1.7}}>
                📌 Les catégories créées ici apparaissent automatiquement sur le site client et dans le formulaire produit.
                Supprimez &quot;Snack Péyi&quot; si elle existe encore en base de données.
              </div>
            </div>
          )}

          {tab === "packs" && (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                  🎉 PACKS <span style={{color:"#ff2d78"}}>SOIRÉE</span>
                </div>
                <button onClick={() => { setEditPack({name:"",tag:"",emoji:"🎉",items:"",price:0,real:0,star:false}); setShowPackForm(true); }}
                  style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:8,
                    padding:"10px 20px",fontFamily:"'Inter',sans-serif",fontWeight:600,
                    fontSize:".85rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                  + AJOUTER
                </button>
              </div>

              {packs.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                  // aucun pack — ajoutes-en un !
                </div>
              ) : (
                <div style={{display:"grid",gap:10}}>
                  {packs.map(p => (
                    <div key={p.id} className="row" style={{background:"rgba(255,255,255,.02)",
                      border:`1px solid ${p.star ? "rgba(255,45,120,.3)" : "rgba(255,255,255,.06)"}`,
                      borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,transition:"all .15s ease"}}>
                      <span style={{fontSize:"1.8rem"}}>{p.emoji}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:"1rem",letterSpacing:".04em",
                          display:"flex",alignItems:"center",gap:8}}>
                          {p.name}
                          {p.star && <span style={{background:"#ff2d78",color:"#000",fontSize:".78rem",
                            padding:"2px 8px",borderRadius:2,fontFamily:"'Share Tech Mono',monospace"}}>★ POP</span>}
                        </div>
                        <div style={{fontSize:".78rem",color:"#5a5470",marginTop:2,
                          fontFamily:"'Share Tech Mono',monospace"}}>{p.tag}</div>
                      </div>
                      <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",
                        color:"#b8ff00",textShadow:"0 0 10px rgba(184,255,0,.4)"}}>
                        {Number(p.price).toFixed(2)}€
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={() => { setEditPack(p); setShowPackForm(true); }}
                          style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                            padding:"6px 14px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                            fontSize:".88rem",letterSpacing:".08em",cursor:"pointer"}}>
                          ÉDITER
                        </button>
                        <button onClick={() => deletePack(p.id!)}
                          style={{background:"transparent",border:"1px solid rgba(255,45,120,.3)",color:"#ff2d78",
                            padding:"6px 14px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                            fontSize:".88rem",letterSpacing:".08em",cursor:"pointer"}}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showPackForm && editPack && (
                <PackForm
                  pack={editPack}
                  onSave={savePack}
                  onClose={() => { setShowPackForm(false); setEditPack(null); }}
                />
              )}
            </div>
          )}

          {tab === "orders" && (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                  📦 <span style={{color:"#ff2d78"}}>COMMANDES</span>
                </div>
                <div className="admin-orders-actions" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  {typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted" && (
                    <button onClick={() => Notification.requestPermission()}
                      style={{background:"rgba(255,45,120,.12)",border:"1px solid rgba(255,45,120,.4)",
                        color:"#ff2d78",padding:"7px 14px",borderRadius:4,cursor:"pointer",
                        fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",letterSpacing:".08em"}}>
                      🔔 ACTIVER LES NOTIFS
                    </button>
                  )}
                  {typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && (
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",
                      color:"#b8ff00",letterSpacing:".1em",display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:"#b8ff00",
                        display:"inline-block",boxShadow:"0 0 6px #b8ff00"}} />
                      NOTIFS ACTIVES
                    </div>
                  )}
                  <button onClick={exportCSV}
                    style={{background:"rgba(184,255,0,.1)",border:"1px solid rgba(184,255,0,.35)",
                      color:"#b8ff00",padding:"7px 14px",borderRadius:4,cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",letterSpacing:".08em"}}>
                    ⬇ EXPORT CSV
                  </button>
                  <button
                    disabled={aiAnomalyLoading || settings.aiAnomalyEnabled === false}
                    title={settings.aiAnomalyEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                    onClick={async () => {
                      setAiAnomalyLoading(true);
                      try {
                        const recent = orders.slice(0, 60).map(o => ({
                          id: o.id,
                          phone: o.phone,
                          name: (o as any).name,
                          address: (o as any).address,
                          total: o.total,
                          method: (o as any).paidOnline ? "online" : "cash",
                          createdAt: o.createdAt,
                        }));
                        const result = await callAI("anomaly", { orders: recent });
                        const list = result.suspicious ?? [];
                        setAiAnomalies(list);
                        if (list.length === 0) showToast("Aucune anomalie détectée ✓");
                        else showToast(`${list.length} anomalie(s) détectée(s) !`, "err");
                      } catch { showToast("Erreur IA", "err"); }
                      setAiAnomalyLoading(false);
                    }}
                    style={{background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.35)",
                      color:"#ff9500",padding:"7px 14px",borderRadius:4,cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",letterSpacing:".08em",
                      opacity:aiAnomalyLoading?0.5:1}}>
                    {aiAnomalyLoading ? "..." : "🔍 ANOMALIES IA"}
                  </button>
                </div>
              </div>

              {/* Sous-onglets ACTIVES / ARCHIVES */}
              <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:"1px solid rgba(255,255,255,.08)"}}>
                {([
                  { val:"active",   label:"⚡ ACTIVES",  color:"#ff2d78",
                    count: orders.filter(o => o.status === "nouveau" || o.status === "en_cours" || o.status === "pending_confirmation").length },
                  { val:"archived", label:"🗂 ARCHIVES", color:"#5a5470",
                    count: orders.filter(o => o.status === "livre" || o.status === "annule").length },
                ] as const).map(t => (
                  <button key={t.val} onClick={() => setOrderSubTab(t.val)}
                    style={{background:"transparent",border:"none",borderBottom:`2px solid ${orderSubTab===t.val ? t.color : "transparent"}`,
                      color: orderSubTab===t.val ? t.color : "#5a5470",
                      padding:"10px 20px",cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",letterSpacing:".08em",
                      transition:"all .2s",marginBottom:-1}}>
                    {t.label}
                    <span style={{marginLeft:6,opacity:.7}}>({t.count})</span>
                  </button>
                ))}
              </div>

              {orderSubTab === "active" ? (<>
                {/* Filtres par mode de livraison */}
                <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                  {([
                    { val:"all",      label:"TOUS",       color:"#5a5470" },
                    { val:"delivery", label:"🚗 LIVRAISON", color:"#ff2d78" },
                    { val:"pickup",   label:"🏪 COLLECT",  color:"#00f5ff" },
                  ] as const).map(f => (
                    <button key={f.val} onClick={() => setFulfillmentFilter(f.val)}
                      style={{background: fulfillmentFilter===f.val ? `${f.color}22` : "transparent",
                        border:`1px solid ${fulfillmentFilter===f.val ? f.color : "rgba(255,255,255,.1)"}`,
                        color: fulfillmentFilter===f.val ? f.color : "#5a5470",
                        padding:"5px 14px",borderRadius:20,cursor:"pointer",
                        fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",letterSpacing:".08em",
                        transition:"all .2s"}}>
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Filtres par statut — actives uniquement */}
                <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                  {([
                    { val:"all",                  label:"TOUTES",      color:"#5a5470" },
                    { val:"pending_confirmation", label:"⏳ EN ATTENTE", color:"#a855f7" },
                    { val:"nouveau",              label:"NOUVEAU",      color:"#ff2d78" },
                    { val:"en_cours",             label:"EN COURS",     color:"#ff9500" },
                  ] as const).map(f => (
                    <button key={f.val} onClick={() => setOrderFilter(f.val)}
                      style={{background: orderFilter===f.val ? `${f.color}22` : "transparent",
                        border:`1px solid ${orderFilter===f.val ? f.color : "rgba(255,255,255,.1)"}`,
                        color: orderFilter===f.val ? f.color : "#5a5470",
                        padding:"6px 16px",borderRadius:20,cursor:"pointer",
                        fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",letterSpacing:".08em",
                        transition:"all .2s"}}>
                      {f.label}
                      {f.val !== "all" && (
                        <span style={{marginLeft:6,opacity:.7}}>
                          ({orders.filter(o => o.status === f.val).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {orders.filter(o => o.status === "nouveau" || o.status === "en_cours" || o.status === "pending_confirmation").length === 0 ? (
                  <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                    padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                    // aucune commande active
                  </div>
                ) : (
                  <div style={{display:"grid",gap:10}}>
                    {orders.filter(o =>
                      (o.status === "nouveau" || o.status === "en_cours" || o.status === "pending_confirmation") &&
                      (orderFilter === "all" || o.status === orderFilter) &&
                      (fulfillmentFilter === "all" || (o as any).fulfillmentType === fulfillmentFilter || (fulfillmentFilter === "delivery" && !(o as any).fulfillmentType))
                    ).map(o => (
                    <div key={o.id} style={{background:"rgba(255,255,255,.02)",
                      border:`1px solid ${o.status==="nouveau" ? "rgba(255,45,120,.35)" : "rgba(255,255,255,.06)"}`,
                      borderRadius:10,padding:"18px 20px",transition:"all .15s ease",
                      boxShadow: o.status==="nouveau" ? "0 0 16px rgba(255,45,120,.08)" : "none"}}>

                      {/* En-tête commande */}
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12,gap:12}}>
                        <div style={{flex:1,minWidth:0}}>
                          {/* Numéro + heure */}
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                            <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",
                              color:"#ff2d78",letterSpacing:".04em"}}>
                              #{(o as any).orderNumber ?? (o.id ?? '').slice(-6).toUpperCase()}
                            </span>
                            {(() => {
                              const flag = aiAnomalies.find(a => a.orderId === o.id);
                              if (!flag) return null;
                              const color = flag.severity === "high" ? "#ff2d78" : flag.severity === "medium" ? "#ff9500" : "#b8ff00";
                              return (
                                <span title={flag.reason} style={{background:`${color}22`,border:`1px solid ${color}`,color,
                                  padding:"2px 8px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                  fontSize:".68rem",letterSpacing:".08em",cursor:"help"}}>
                                  ⚠ {flag.severity.toUpperCase()}
                                </span>
                              );
                            })()}
                            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",
                              color:"#5a5470",letterSpacing:".06em"}}>
                              {new Date(o.createdAt).toLocaleString("fr-FR")}
                            </span>
                            {(o as any).paidOnline && (
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                                background:"rgba(184,255,0,.15)",color:"#b8ff00",borderRadius:3,
                                padding:"2px 7px",letterSpacing:".08em"}}>✅ STRIPE</span>
                            )}
                            {(o as any).fulfillmentType === 'pickup' && (
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                                background:"rgba(0,245,255,.12)",color:"#00f5ff",borderRadius:3,
                                padding:"2px 7px",letterSpacing:".08em"}}>🏪 COLLECT</span>
                            )}
                            {o.status === "pending_confirmation" && (
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                                background:"rgba(168,85,247,.15)",color:"#a855f7",borderRadius:3,
                                padding:"2px 7px",letterSpacing:".08em",border:"1px solid rgba(168,85,247,.3)"}}>
                                ⏳ ATTENTE OTP
                              </span>
                            )}
                            {o.isRush && (
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                                background:"rgba(239,68,68,.2)",color:"#ef4444",borderRadius:3,
                                padding:"2px 7px",letterSpacing:".08em",fontWeight:700,
                                border:"1px solid rgba(239,68,68,.5)"}}>🚨 RUSH</span>
                            )}
                          </div>
                          {/* Client */}
                          <div style={{fontWeight:700,fontSize:"1rem",marginBottom:2}}>{(o as any).name || o.phone}</div>
                          {(o as any).name && <div style={{fontSize:".78rem",color:"#7a7490",fontFamily:"'Share Tech Mono',monospace"}}>{o.phone}</div>}
                          {(o as any).fulfillmentType === 'pickup' ? (
                            <div style={{fontSize:".78rem",color:"#00f5ff",marginTop:3}}>
                              🏪 {(o as any).pickupType === 'relay' && (o as any).pickupLocationSnapshot
                                ? `${(o as any).pickupLocationSnapshot.name} — ${(o as any).pickupLocationSnapshot.city}`
                                : "Stock Yassala"}
                              {(o as any).pickupTime && (o as any).pickupTime !== 'asap' && (
                                <span style={{color:"#b8ff00",marginLeft:8}}>🕐 {(o as any).pickupTime}</span>
                              )}
                            </div>
                          ) : (
                            (o as any).address && <div style={{fontSize:".78rem",color:"#7a7490",marginTop:3}}>📍 {(o as any).address}</div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,flexShrink:0}}>
                          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",
                            color:"#b8ff00",textShadow:"0 0 10px rgba(184,255,0,.4)"}}>
                            {Number(o.total).toFixed(2)}€
                          </div>
                          {/* OTP block — visible uniquement pour commandes en attente de confirmation */}
                          {o.status === "pending_confirmation" && (o as any).otpCode && (
                            <div style={{background:"rgba(168,85,247,.1)",border:"1px solid rgba(168,85,247,.35)",
                              borderRadius:8,padding:"8px 12px",textAlign:"center",minWidth:130}}>
                              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
                                color:"#a855f7",letterSpacing:".1em",marginBottom:4}}>CODE OTP</div>
                              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.8rem",
                                color:"#f0eeff",letterSpacing:".3em",textShadow:"0 0 12px rgba(168,85,247,.5)"}}>
                                {(o as any).otpCode}
                              </div>
                              <a
                                href={`https://wa.me/${o.phone?.replace(/\D/g,"")}?text=${encodeURIComponent(`🔐 *Yassala Night Shop*\n\nBonjour ${(o as any).name || ""}!\n\nVoici votre code de confirmation pour la commande #${(o as any).orderNumber || o.id?.slice(-6).toUpperCase()} :\n\n*${(o as any).otpCode}*\n\nSaisissez ce code sur la page de confirmation pour valider votre commande.\n\nMerci 🙏`)}`}
                                target="_blank" rel="noreferrer"
                                style={{display:"block",marginTop:6,background:"rgba(37,211,102,.15)",
                                  border:"1px solid rgba(37,211,102,.4)",color:"#25d366",borderRadius:6,
                                  padding:"5px 8px",textDecoration:"none",fontFamily:"'Share Tech Mono',monospace",
                                  fontSize:".68rem",letterSpacing:".06em"}}>
                                📲 ENVOYER VIA WHATSAPP
                              </a>
                            </div>
                          )}
                          <select value={o.status} onChange={e => updateOrderStatus(o.id!, e.target.value)}
                            style={{background:"#080514",border:"1px solid rgba(255,45,120,.4)",
                              color:"#ff2d78",padding:"7px 12px",borderRadius:4,
                              fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",
                              letterSpacing:".06em",cursor:"pointer",minWidth:130}}>
                            <option value="pending_confirmation">⏳ EN ATTENTE</option>
                            <option value="nouveau">🔴 NOUVEAU</option>
                            <option value="en_cours">🟠 EN COURS</option>
                            <option value="livre">🟢 {(o as any).fulfillmentType === 'pickup' ? 'RETIRÉ' : 'LIVRÉ'}</option>
                            <option value="annule">⚫ ANNULÉ</option>
                          </select>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            <button onClick={() => toggleRush(o.id!, o.isRush)}
                              style={{background: o.isRush ? "rgba(239,68,68,.18)" : "rgba(239,68,68,.08)",
                                border:`1px solid ${o.isRush ? "#ef4444" : "rgba(239,68,68,.3)"}`,
                                color:"#ef4444",padding:"6px 12px",borderRadius:4,
                                fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",
                                letterSpacing:".06em",cursor:"pointer",fontWeight: o.isRush ? 700 : 400}}>
                              {o.isRush ? "⛔ RUSH OFF" : "🚨 RUSH"}
                            </button>
                            <button onClick={() => printOrder(o)}
                              style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                                padding:"6px 14px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                fontSize:".88rem",letterSpacing:".06em",cursor:"pointer"}}>
                              🖨 TICKET
                            </button>
                            {confirmDeleteId === o.id ? (
                              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                <button onClick={() => deleteOrder(o.id!)}
                                  style={{background:"rgba(255,45,120,.18)",border:"1px solid #ff2d78",color:"#ff2d78",
                                    padding:"6px 10px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                    fontSize:".78rem",letterSpacing:".06em",cursor:"pointer",fontWeight:700}}>
                                  ✕ OUI
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)}
                                  style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"#5a5470",
                                    padding:"6px 8px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                    fontSize:".78rem",cursor:"pointer"}}>
                                  NON
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmDeleteId(o.id!)}
                                style={{background:"transparent",border:"1px solid rgba(255,45,120,.25)",color:"#7a5070",
                                  padding:"6px 12px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                  fontSize:".88rem",letterSpacing:".06em",cursor:"pointer"}}>
                                🗑
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Frais livraison / Bonus / Marge ── */}
                      {(o as any).fulfillmentType !== 'pickup' && (o as any).deliveryFee > 0 && (
                        <div style={{borderTop:"1px solid rgba(255,255,255,.05)",paddingTop:8,marginBottom:6,
                          display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                          {/* Frais livraison */}
                          <div style={{display:"flex",alignItems:"center",gap:4,
                            background:"rgba(184,255,0,.05)",border:"1px solid rgba(184,255,0,.15)",
                            borderRadius:6,padding:"3px 10px"}}>
                            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",
                              color:"#5a5470",letterSpacing:".06em"}}>LIVRAISON</span>
                            <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                              fontSize:".88rem",color:"#b8ff00",marginLeft:4}}>
                              {Number((o as any).deliveryFee).toFixed(2)}€
                            </span>
                          </div>
                          {/* Suppléments */}
                          {Array.isArray((o as any).deliverySupplements) && (o as any).deliverySupplements.length > 0 && (
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              {((o as any).deliverySupplements as string[]).map((s: string, i: number) => (
                                <span key={i} style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",
                                  background:"rgba(167,139,250,.08)",border:"1px solid rgba(167,139,250,.2)",
                                  color:"#a78bfa",borderRadius:4,padding:"2px 6px",letterSpacing:".04em"}}>
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Marge */}
                          {(o as any).driverPay != null && (
                            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
                                color:"#5a5470",letterSpacing:".06em"}}>LIVREUR</span>
                              <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                                fontSize:".82rem",color:"#00f5ff"}}>
                                {Number((o as any).driverPay).toFixed(2)}€
                              </span>
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
                                color:"#5a5470",letterSpacing:".06em",marginLeft:4}}>MARGE</span>
                              <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".82rem",
                                color: (Number((o as any).deliveryFee) - Number((o as any).driverPay)) >= 0
                                  ? "#ff2d78" : "#ef4444"}}>
                                {(Number((o as any).deliveryFee) - Number((o as any).driverPay)) >= 0 ? "+" : ""}
                                {(Number((o as any).deliveryFee) - Number((o as any).driverPay)).toFixed(2)}€
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Driver Assignment — delivery only */}
                      {(o as any).fulfillmentType !== 'pickup' && (
                      <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:10,marginBottom:8,
                        display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",
                          letterSpacing:".08em"}}>🏍️ LIVREUR :</span>
                        {(o as any).assignedDriverName ? (
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
                              color:"#00f5ff"}}>{(o as any).assignedDriverName}</span>
                            <button onClick={async () => {
                              await updateDoc(doc(db, "orders", o.id!), { assignedDriver: null, assignedDriverName: null });
                              showToast("Livreur retiré");
                            }}
                              style={{background:"rgba(255,45,120,.08)",border:"1px solid rgba(255,45,120,.2)",
                                color:"#ff2d78",padding:"3px 10px",borderRadius:4,cursor:"pointer",
                                fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem"}}>
                              ✕ Retirer
                            </button>
                          </div>
                        ) : (
                          <select defaultValue="" onChange={async (e) => {
                            if (!e.target.value) return;
                            const [driverId, driverName] = e.target.value.split("||");
                            await updateDoc(doc(db, "orders", o.id!), {
                              assignedDriver: driverId,
                              assignedDriverName: driverName,
                              status: o.status === "nouveau" ? "en_cours" : o.status,
                            });
                            showToast(`Assigné à ${driverName}`);
                            e.target.value = "";
                          }}
                            style={{background:"#080514",border:"1px solid rgba(0,245,255,.3)",
                              color:"#00f5ff",padding:"6px 10px",borderRadius:4,
                              fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",
                              cursor:"pointer",minWidth:160}}>
                            <option value="">Assigner un livreur...</option>
                            {driverApps.filter(d => d.status === "accepte").map(d => (
                              <option key={d.id} value={`${d.id}||${d.name}`}>{d.name} ({d.zone || d.phone})</option>
                            ))}
                          </select>
                        )}
                      </div>
                      )}

                      {/* Pickup instructions */}
                      {(o as any).fulfillmentType === 'pickup' && (o as any).pickupLocationSnapshot?.instructions && (
                        <div style={{borderTop:"1px solid rgba(0,245,255,.1)",paddingTop:10,marginBottom:8,
                          fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#00f5ff",letterSpacing:".06em"}}>
                          ℹ️ {(o as any).pickupLocationSnapshot.instructions}
                        </div>
                      )}

                      {/* Articles */}
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem",
                        color:"#8a84a0",borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:10,
                        lineHeight:2,whiteSpace:"pre-line"}}>
                        {o.items}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </>) : (<>
                {/* ── ARCHIVES ── */}
                {/* Barre de recherche */}
                <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                  <input
                    type="date"
                    value={archiveSearch.date}
                    onChange={e => setArchiveSearch(s => ({...s, date: e.target.value}))}
                    style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.12)",borderRadius:6,
                      padding:"8px 12px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",
                      fontSize:".82rem",outline:"none",minWidth:160}}
                  />
                  <input
                    type="text"
                    placeholder="🔍 Client…"
                    value={archiveSearch.client}
                    onChange={e => setArchiveSearch(s => ({...s, client: e.target.value}))}
                    style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.12)",borderRadius:6,
                      padding:"8px 12px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",
                      fontSize:".82rem",outline:"none",flex:1,minWidth:160}}
                  />
                  <input
                    type="text"
                    placeholder="📞 Téléphone…"
                    value={archiveSearch.phone}
                    onChange={e => setArchiveSearch(s => ({...s, phone: e.target.value}))}
                    style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.12)",borderRadius:6,
                      padding:"8px 12px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",
                      fontSize:".82rem",outline:"none",minWidth:160}}
                  />
                  {(archiveSearch.date || archiveSearch.client || archiveSearch.phone) && (
                    <button onClick={() => setArchiveSearch({ date:"", client:"", phone:"" })}
                      style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"#5a5470",
                        borderRadius:6,padding:"8px 14px",fontFamily:"'Share Tech Mono',monospace",
                        fontSize:".82rem",cursor:"pointer",letterSpacing:".06em"}}>
                      ✕ RÉINITIALISER
                    </button>
                  )}
                </div>

                {/* Filtre livraison pour archives */}
                <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                  {([
                    { val:"all",      label:"TOUS",       color:"#5a5470" },
                    { val:"delivery", label:"🚗 LIVRAISON", color:"#ff2d78" },
                    { val:"pickup",   label:"🏪 COLLECT",  color:"#00f5ff" },
                  ] as const).map(f => (
                    <button key={f.val} onClick={() => setFulfillmentFilter(f.val)}
                      style={{background: fulfillmentFilter===f.val ? `${f.color}22` : "transparent",
                        border:`1px solid ${fulfillmentFilter===f.val ? f.color : "rgba(255,255,255,.1)"}`,
                        color: fulfillmentFilter===f.val ? f.color : "#5a5470",
                        padding:"5px 14px",borderRadius:20,cursor:"pointer",
                        fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",letterSpacing:".08em",
                        transition:"all .2s"}}>
                      {f.label}
                    </button>
                  ))}
                </div>

                {(() => {
                  const archivedOrders = orders.filter(o => {
                    if (o.status !== "livre" && o.status !== "annule") return false;
                    if (fulfillmentFilter !== "all" && (o as any).fulfillmentType !== fulfillmentFilter && !(fulfillmentFilter === "delivery" && !(o as any).fulfillmentType)) return false;
                    if (archiveSearch.date) {
                      const orderDate = new Date(o.createdAt).toISOString().slice(0,10);
                      if (orderDate !== archiveSearch.date) return false;
                    }
                    if (archiveSearch.client) {
                      const name = ((o as any).name || "").toLowerCase();
                      if (!name.includes(archiveSearch.client.toLowerCase())) return false;
                    }
                    if (archiveSearch.phone) {
                      if (!o.phone.includes(archiveSearch.phone)) return false;
                    }
                    return true;
                  });
                  if (archivedOrders.length === 0) return (
                    <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                      padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                      // aucune commande archivée
                    </div>
                  );
                  return (
                    <div style={{display:"grid",gap:10}}>
                      {archivedOrders.map(o => (
                        <div key={o.id} style={{background:"rgba(255,255,255,.015)",
                          border:"1px solid rgba(255,255,255,.06)",
                          borderRadius:10,padding:"18px 20px",opacity:.85}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10,gap:12}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                                <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",
                                  color:"#5a5470",letterSpacing:".04em"}}>
                                  #{(o as any).orderNumber ?? (o.id ?? '').slice(-6).toUpperCase()}
                                </span>
                                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470"}}>
                                  {new Date(o.createdAt).toLocaleString("fr-FR")}
                                </span>
                                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                                  background: o.status==="livre" ? "rgba(184,255,0,.12)" : "rgba(90,84,112,.15)",
                                  color: o.status==="livre" ? "#b8ff00" : "#5a5470",
                                  border: `1px solid ${o.status==="livre" ? "rgba(184,255,0,.35)" : "rgba(90,84,112,.3)"}`,
                                  padding:"2px 8px",borderRadius:4,letterSpacing:".08em"}}>
                                  {o.status==="livre" ? ((o as any).fulfillmentType==="pickup" ? "🟢 RETIRÉ" : "🟢 LIVRÉ") : "⚫ ANNULÉ"}
                                </span>
                                {(o as any).paidOnline && (
                                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                                    background:"rgba(184,255,0,.1)",color:"#b8ff00",borderRadius:3,
                                    padding:"2px 6px",letterSpacing:".06em"}}>✅ STRIPE</span>
                                )}
                                {(o as any).fulfillmentType==="pickup" && (
                                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                                    background:"rgba(0,245,255,.08)",color:"#00f5ff",borderRadius:3,
                                    padding:"2px 6px",letterSpacing:".06em"}}>🏪 COLLECT</span>
                                )}
                              </div>
                              <div style={{fontWeight:700,fontSize:".95rem",marginBottom:2}}>{(o as any).name || o.phone}</div>
                              {(o as any).name && <div style={{fontSize:".76rem",color:"#7a7490",fontFamily:"'Share Tech Mono',monospace"}}>{o.phone}</div>}
                              {(o as any).address && (
                                <div style={{fontSize:".76rem",color:"#7a7490",marginTop:3}}>📍 {(o as any).address}</div>
                              )}
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",
                                color:"#5a5470"}}>
                                {Number(o.total).toFixed(2)}€
                              </div>
                              <button onClick={() => printOrder(o)}
                                style={{background:"transparent",border:"1px solid rgba(0,245,255,.2)",color:"#00f5ff",
                                  padding:"5px 12px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                  fontSize:".8rem",letterSpacing:".06em",cursor:"pointer"}}>
                                🖨 TICKET
                              </button>
                            </div>
                          </div>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".74rem",
                            color:"#8a84a0",borderTop:"1px solid rgba(255,255,255,.05)",paddingTop:8,
                            lineHeight:1.9,whiteSpace:"pre-line"}}>
                            {o.items}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>)}
            </div>
          )}

          {tab === "coupons" && (
            <div>
              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em",marginBottom:24}}>
                🏷️ <span style={{color:"#ff2d78"}}>CODES PROMO</span>
              </div>

              {/* Formulaire nouveau coupon */}
              <div style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,
                padding:"20px 24px",marginBottom:24}}>
                <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".85rem",
                  letterSpacing:".08em",color:"#5a5470",marginBottom:14}}>
                  {newCoupon.id ? "MODIFIER LE COUPON" : "NOUVEAU COUPON"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                  <div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",marginBottom:4}}>CODE</div>
                    <input value={newCoupon.code} onChange={e => setNewCoupon(c=>({...c, code:e.target.value.toUpperCase()}))}
                      placeholder="EX: PROMO20"
                      style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:4,
                        padding:"9px 12px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",outline:"none"}} />
                  </div>
                  <div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",marginBottom:4}}>TYPE</div>
                    <select value={newCoupon.type} onChange={e => setNewCoupon(c=>({...c, type:e.target.value as "percent"|"fixed"}))}
                      style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:4,
                        padding:"9px 12px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",outline:"none"}}>
                      <option value="percent">% RÉDUCTION</option>
                      <option value="fixed">€ FIXE</option>
                    </select>
                  </div>
                  <div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",marginBottom:4}}>
                      VALEUR ({newCoupon.type==="percent" ? "%" : "€"})
                    </div>
                    <input type="number" min="1" value={newCoupon.value}
                      onChange={e => setNewCoupon(c=>({...c, value:Number(e.target.value)}))}
                      style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:4,
                        padding:"9px 12px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",outline:"none"}} />
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={saveCoupon}
                    style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:4,
                      padding:"10px 24px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                      fontSize:".85rem",letterSpacing:".08em",cursor:"pointer"}}>
                    {newCoupon.id ? "METTRE À JOUR" : "CRÉER"}
                  </button>
                  <button
                    disabled={aiCouponLoading || settings.aiCouponEnabled === false}
                    title={settings.aiCouponEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                    onClick={async () => {
                      setAiCouponLoading(true); setAiCoupon(null);
                      try {
                        const soldMap: Record<string,number> = {};
                        orders.forEach(o => o.items.split("\n").forEach(line => {
                          const n = line.replace(/x\d+.*/, "").trim();
                          if (n) soldMap[n] = (soldMap[n]||0)+1;
                        }));
                        const topProducts = Object.entries(soldMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n])=>n).join(", ") || "aucun";
                        const avg = orders.length ? (orders.reduce((s,o)=>s+Number(o.total),0)/orders.length).toFixed(2) : "0";
                        const result = await callAI("coupon_suggest", {
                          topProducts, totalOrders: orders.length, avgBasket: avg, period: "7 derniers jours",
                        });
                        setAiCoupon(result);
                      } catch { showToast("Erreur IA","err"); }
                      setAiCouponLoading(false);
                    }}
                    style={{background:"rgba(184,255,0,.1)",border:"1px solid rgba(184,255,0,.3)",
                      color:"#b8ff00",padding:"10px 18px",borderRadius:4,cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",letterSpacing:".06em",
                      opacity:aiCouponLoading?0.5:1}}>
                    {aiCouponLoading ? "..." : "✨ SUGGESTION IA"}
                  </button>
                  {newCoupon.id && (
                    <button onClick={() => setNewCoupon({code:"",type:"percent",value:10,active:true})}
                      style={{background:"transparent",border:"1px solid rgba(255,255,255,.1)",color:"#5a5470",
                        borderRadius:4,padding:"10px 16px",fontFamily:"'Share Tech Mono',monospace",
                        fontSize:".9rem",cursor:"pointer"}}>
                      ANNULER
                    </button>
                  )}
                </div>
              </div>

              {/* ── Suggestion IA ── */}
              {aiCoupon && (
                <div style={{background:"rgba(184,255,0,.05)",border:"1px solid rgba(184,255,0,.3)",
                  borderRadius:10,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#b8ff00",letterSpacing:".12em",marginBottom:8}}>
                      ✨ SUGGESTION IA
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                      <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",color:"#f0eeff",letterSpacing:".06em"}}>
                        {aiCoupon.code}
                      </span>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#b8ff00"}}>
                        {aiCoupon.type==="percent" ? `-${aiCoupon.value}%` : `-${aiCoupon.value}€`}
                      </span>
                      {aiCoupon.minOrder > 0 && (
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem",color:"#5a5470"}}>
                          dès {aiCoupon.minOrder}€
                        </span>
                      )}
                    </div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:".82rem",color:"#7a7090",marginTop:6,fontStyle:"italic"}}>
                      {aiCoupon.reason}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setNewCoupon(c => ({...c, code: aiCoupon.code, type: aiCoupon.type as "percent"|"fixed", value: aiCoupon.value}));
                      setAiCoupon(null);
                      showToast("Coupon IA appliqué au formulaire ✓");
                    }}
                    style={{background:"#b8ff00",color:"#000",border:"none",borderRadius:6,padding:"10px 18px",
                      fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".85rem",letterSpacing:".08em",
                      cursor:"pointer",flexShrink:0}}>
                    APPLIQUER →
                  </button>
                </div>
              )}

              {/* Liste coupons */}
              {coupons.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                  // aucun coupon créé
                </div>
              ) : (
                <div style={{display:"grid",gap:8}}>
                  {coupons.map(c => (
                    <div key={c.id} style={{background:"rgba(255,255,255,.02)",border:`1px solid ${c.active ? "rgba(184,255,0,.2)" : "rgba(255,255,255,.06)"}`,
                      borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,transition:"all .15s ease"}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",
                          color: c.active ? "#b8ff00" : "#5a5470"}}>{c.code}</div>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470",marginTop:2}}>
                          {c.type==="percent" ? `-${c.value}%` : `-${Number(c.value).toFixed(2)}€ fixe`}
                        </div>
                      </div>
                      <button onClick={() => toggleCoupon(c)}
                        style={{background: c.active ? "rgba(184,255,0,.1)" : "rgba(90,84,112,.15)",
                          border:`1px solid ${c.active ? "rgba(184,255,0,.4)" : "rgba(255,255,255,.1)"}`,
                          color: c.active ? "#b8ff00" : "#5a5470",padding:"5px 14px",borderRadius:3,
                          fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",cursor:"pointer",letterSpacing:".06em"}}>
                        {c.active ? "ACTIF" : "INACTIF"}
                      </button>
                      <button onClick={() => setNewCoupon(c)}
                        style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                          padding:"5px 14px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                          fontSize:".82rem",cursor:"pointer",letterSpacing:".06em"}}>
                        ÉDITER
                      </button>
                      <button onClick={() => deleteCoupon(c.id!)}
                        style={{background:"transparent",border:"1px solid rgba(255,45,120,.3)",color:"#ff2d78",
                          padding:"5px 12px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                          fontSize:".82rem",cursor:"pointer"}}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "banners" && (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                  🎨 <span style={{color:"#ff2d78"}}>BANNIÈRES</span>
                </div>
                <button onClick={() => { setEditBanner({title:"",subtitle:"",desc:"",cta:"COMMANDER →",link:"catalogue",gradient:"linear-gradient(135deg,rgba(255,45,120,.85) 0%,rgba(80,0,40,.9) 100%)",image:"",brightness:0.28,active:true,order:banners.length}); setShowBannerForm(true); }}
                  style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:8,
                    padding:"10px 20px",fontFamily:"'Inter',sans-serif",fontWeight:600,
                    fontSize:".85rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                  + AJOUTER
                </button>
              </div>

              {banners.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                  // aucune bannière — crée ta première bannière !
                </div>
              ) : (
                <div style={{display:"grid",gap:10}}>
                  {banners.map(b => (
                    <div key={b.id} style={{borderRadius:6,overflow:"hidden",
                      border:`1px solid ${b.active ? "rgba(255,45,120,.35)" : "rgba(255,255,255,.06)"}`,
                      opacity: b.active ? 1 : 0.55}}>
                      {/* Aperçu de la bannière */}
                      <div style={{height:80,position:"relative",
                        background: b.gradient || "linear-gradient(135deg,rgba(255,45,120,.85) 0%,rgba(80,0,40,.9) 100%)"}}>
                        {b.image && (
                          <div style={{position:"absolute",inset:0,
                            backgroundImage:`url(${b.image})`,backgroundSize:"cover",backgroundPosition:"center",opacity:.3}} />
                        )}
                        <div style={{position:"absolute",inset:0,padding:"12px 16px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#00f5ff",letterSpacing:".15em",marginBottom:4}}>
                            &gt; {b.subtitle || "tagline"}
                          </div>
                          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",color:"#fff",
                            textShadow:"0 0 15px rgba(255,255,255,.2)",letterSpacing:".03em"}}>
                            {b.title || "Titre de la bannière"}
                          </div>
                        </div>
                        <div style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.6)",
                          border:`1px solid ${b.active ? "#b8ff00" : "#5a5470"}`,
                          color: b.active ? "#b8ff00" : "#5a5470",
                          fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                          padding:"3px 8px",borderRadius:2,letterSpacing:".1em"}}>
                          {b.active ? "● ACTIVE" : "○ INACTIVE"}
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{background:"#0c0918",padding:"10px 16px",
                        display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470",letterSpacing:".08em"}}>
                          CTA: <span style={{color:"#f0eeff"}}>{b.cta || "—"}</span>
                          &nbsp;·&nbsp;LIEN: <span style={{color:"#00f5ff"}}>{b.link || "catalogue"}</span>
                          &nbsp;·&nbsp;ORDRE: <span style={{color:"#b8ff00"}}>{b.order ?? 0}</span>
                        </div>
                        <div style={{display:"flex",gap:8,flexShrink:0}}>
                          <button onClick={() => toggleBannerActive(b)}
                            style={{background:"transparent",border:`1px solid ${b.active ? "rgba(255,45,120,.4)" : "rgba(184,255,0,.4)"}`,
                              color: b.active ? "#ff2d78" : "#b8ff00",
                              padding:"5px 12px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                              fontSize:".82rem",letterSpacing:".08em",cursor:"pointer"}}>
                            {b.active ? "DÉSACTIVER" : "ACTIVER"}
                          </button>
                          <button onClick={() => { setEditBanner(b); setShowBannerForm(true); }}
                            style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                              padding:"5px 12px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                              fontSize:".82rem",letterSpacing:".08em",cursor:"pointer"}}>
                            ÉDITER
                          </button>
                          <button onClick={() => deleteBanner(b.id!)}
                            style={{background:"transparent",border:"1px solid rgba(255,45,120,.3)",color:"#ff2d78",
                              padding:"5px 12px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                              fontSize:".82rem",letterSpacing:".08em",cursor:"pointer"}}>
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showBannerForm && editBanner && (
                <BannerForm
                  banner={editBanner}
                  onSave={saveBanner}
                  onClose={() => { setShowBannerForm(false); setEditBanner(null); }}
                  showToast={showToast}
                  settings={settings}
                />
              )}
            </div>
          )}

          {tab === "users" && (
            <div>
              <div className="admin-users-header" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                  👥 <span style={{color:"#ff2d78"}}>CLIENTS INSCRITS</span>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470",
                    marginLeft:12,letterSpacing:".1em"}}>{usersList.length} compte(s)</span>
                </div>
                <input
                  className="admin-users-search"
                  value={usersSearch}
                  onChange={e => setUsersSearch(e.target.value)}
                  placeholder="Rechercher un client..."
                  style={{background:"#080514",border:"1px solid rgba(255,255,255,.12)",borderRadius:6,
                    padding:"10px 16px",color:"#f0eeff",fontSize:".9rem",fontFamily:"'Rajdhani',sans-serif",
                    width:260,outline:"none"}}
                />
              </div>

              {usersList.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                  // aucun client inscrit
                </div>
              ) : (
                <div className="admin-table-wrap" style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,overflow:"hidden"}}>
                  <div className="admin-users-table-header" style={{display:"grid",gridTemplateColumns:"1fr 1fr 140px 140px",padding:"14px 18px",
                    borderBottom:"1px solid rgba(255,255,255,.08)",background:"rgba(255,45,120,.06)"}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".78rem",color:"#ff2d78",letterSpacing:".1em"}}>NOM</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".78rem",color:"#ff2d78",letterSpacing:".1em"}}>EMAIL</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".78rem",color:"#ff2d78",letterSpacing:".1em"}}>INSCRIT LE</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".78rem",color:"#ff2d78",letterSpacing:".1em"}}>DERNIÈRE CONNEXION</div>
                  </div>
                  {usersList
                    .filter(u => {
                      if (!usersSearch.trim()) return true;
                      const s = usersSearch.toLowerCase();
                      return (u.name||"").toLowerCase().includes(s) || (u.email||"").toLowerCase().includes(s);
                    })
                    .map(u => (
                    <div key={u.id} className="row admin-users-table-row" style={{display:"grid",gridTemplateColumns:"1fr 1fr 140px 140px",
                      padding:"12px 18px",borderBottom:"1px solid rgba(255,255,255,.04)",
                      transition:"background .2s",alignItems:"center"}}>
                      <div style={{fontWeight:600,fontSize:".95rem"}}>
                        {u.name || <span style={{color:"#5a5470",fontStyle:"italic"}}>Sans nom</span>}
                      </div>
                      <div style={{fontSize:".88rem",color:"#00f5ff",fontFamily:"'Share Tech Mono',monospace",
                        wordBreak:"break-all"}}>{u.email || "—"}</div>
                      <div style={{fontSize:".82rem",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace"}}>
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}
                      </div>
                      <div style={{fontSize:".82rem",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace"}}>
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("fr-FR") : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "drivers" && (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                  🏍️ <span style={{color:"#00f5ff"}}>CANDIDATURES LIVREURS</span>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470",
                    marginLeft:12,letterSpacing:".1em"}}>{driverApps.length} candidature(s)</span>
                </div>
              </div>

              <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                {([
                  { val:"all",      label:"TOUTES",   color:"#5a5470" },
                  { val:"nouveau",  label:"NOUVEAU",  color:"#00f5ff" },
                  { val:"accepte",  label:"ACCEPTÉ",  color:"#b8ff00" },
                  { val:"refuse",   label:"REFUSÉ",   color:"#ff2d78" },
                ] as const).map(f => (
                  <button key={f.val} onClick={() => setDriverFilter(f.val)}
                    style={{background: driverFilter===f.val ? `${f.color}22` : "transparent",
                      border:`1px solid ${driverFilter===f.val ? f.color : "rgba(255,255,255,.1)"}`,
                      color: driverFilter===f.val ? f.color : "#5a5470",
                      padding:"6px 16px",borderRadius:20,cursor:"pointer",
                      fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".85rem",letterSpacing:".06em",
                      transition:"all .2s"}}>
                    {f.label}
                    {f.val !== "all" && (
                      <span style={{marginLeft:6,opacity:.7}}>
                        ({driverApps.filter(d => d.status === f.val).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {driverApps.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:10}}>
                  // aucune candidature pour l&apos;instant
                </div>
              ) : (
                <div style={{display:"grid",gap:12}}>
                  {(driverFilter === "all" ? driverApps : driverApps.filter(d => d.status === driverFilter)).map(d => (
                    <div key={d.id} style={{background:"rgba(255,255,255,.02)",
                      border:`1px solid ${d.status==="nouveau" ? "rgba(0,245,255,.25)" : "rgba(255,255,255,.06)"}`,
                      borderRadius:10,padding:"20px 22px",transition:"all .15s ease",
                      boxShadow: d.status==="nouveau" ? "0 0 16px rgba(0,245,255,.06)" : "none"}}>

                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:200}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                            <span style={{fontSize:"1.4rem"}}>
                              {d.vehicle === "moto" ? "🏍️" : d.vehicle === "voiture" ? "🚗" : "🚲"}
                            </span>
                            <div>
                              <div style={{fontWeight:700,fontSize:"1.1rem",letterSpacing:".02em"}}>{d.name}</div>
                              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",letterSpacing:".06em"}}>
                                {new Date(d.createdAt).toLocaleString("fr-FR")}
                              </div>
                            </div>
                            <span style={{marginLeft:8,padding:"3px 10px",borderRadius:12,fontSize:".75rem",fontWeight:600,
                              fontFamily:"'Inter',sans-serif",letterSpacing:".06em",
                              background: d.status==="nouveau" ? "rgba(0,245,255,.12)" : d.status==="accepte" ? "rgba(184,255,0,.12)" : "rgba(255,45,120,.12)",
                              color: d.status==="nouveau" ? "#00f5ff" : d.status==="accepte" ? "#b8ff00" : "#ff2d78",
                              border: `1px solid ${d.status==="nouveau" ? "rgba(0,245,255,.3)" : d.status==="accepte" ? "rgba(184,255,0,.3)" : "rgba(255,45,120,.3)"}`}}>
                              {d.status==="nouveau" ? "NOUVEAU" : d.status==="accepte" ? "ACCEPTÉ" : "REFUSÉ"}
                            </span>
                            {d.status === "accepte" && (
                              <span style={{padding:"3px 10px",borderRadius:12,fontSize:".72rem",fontWeight:600,
                                fontFamily:"'Share Tech Mono',monospace",letterSpacing:".06em",
                                background: d.contractAccepted ? "rgba(184,255,0,.08)" : "rgba(255,165,0,.1)",
                                color: d.contractAccepted ? "#b8ff00" : "#ffa500",
                                border: `1px solid ${d.contractAccepted ? "rgba(184,255,0,.2)" : "rgba(255,165,0,.25)"}`}}>
                                {d.contractAccepted ? "📋 CONTRAT SIGNÉ" : "⚠️ CONTRAT NON SIGNÉ"}
                              </span>
                            )}
                          </div>

                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px",marginTop:10}}>
                            <div style={{fontSize:".88rem"}}>
                              <span style={{color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".1em"}}>TEL </span>
                              <span style={{color:"#00f5ff"}}>{d.phone}</span>
                            </div>
                            {d.email && (
                              <div style={{fontSize:".88rem"}}>
                                <span style={{color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".1em"}}>EMAIL </span>
                                <span style={{color:"#7a7490"}}>{d.email}</span>
                              </div>
                            )}
                            {d.zone && (
                              <div style={{fontSize:".88rem"}}>
                                <span style={{color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".1em"}}>ZONE </span>
                                <span>{d.zone}</span>
                              </div>
                            )}
                            <div style={{fontSize:".88rem"}}>
                              <span style={{color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".1em"}}>VÉHICULE </span>
                              <span>{d.vehicle === "moto" ? "Moto" : d.vehicle === "voiture" ? "Voiture" : "Vélo"}</span>
                            </div>
                          </div>

                          {d.message && (
                            <div style={{marginTop:10,padding:"10px 14px",background:"rgba(255,255,255,.03)",
                              borderRadius:8,border:"1px solid rgba(255,255,255,.04)",
                              fontSize:".88rem",color:"#7a7490",fontStyle:"italic"}}>
                              &quot;{d.message}&quot;
                            </div>
                          )}

                          {d.status === "accepte" && d.password && (
                            <div style={{marginTop:10,padding:"10px 14px",background:"rgba(184,255,0,.06)",
                              borderRadius:8,border:"1px solid rgba(184,255,0,.15)",
                              display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470",letterSpacing:".1em"}}>MOT DE PASSE</span>
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"1rem",color:"#b8ff00",
                                letterSpacing:".15em",fontWeight:700}}>{d.password}</span>
                              <button onClick={() => { navigator.clipboard.writeText(d.password!); showToast("Copié !"); }}
                                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                                  color:"#5a5470",padding:"4px 10px",borderRadius:6,cursor:"pointer",
                                  fontFamily:"'Inter',sans-serif",fontSize:".75rem",marginLeft:"auto"}}>
                                Copier
                              </button>
                            </div>
                          )}

                          {d.status === "accepte" && d.contractAccepted && d.contractAcceptedAt && (
                            <div style={{marginTop:10,padding:"10px 14px",background:"rgba(184,255,0,.04)",
                              borderRadius:8,border:"1px solid rgba(184,255,0,.1)",
                              fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#b8ff00",
                              display:"flex",alignItems:"center",gap:8}}>
                              📋 Contrat signé le {new Date(d.contractAcceptedAt).toLocaleString("fr-FR")}
                            </div>
                          )}
                        </div>

                        {/* ── Coaching IA ── */}
                        {aiCoachId === d.id && aiCoachText && (
                          <div style={{marginTop:12,padding:"12px 16px",background:"rgba(168,85,247,.06)",
                            border:"1px solid rgba(168,85,247,.25)",borderRadius:8}}>
                            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#a855f7",
                              letterSpacing:".12em",marginBottom:6}}>🤖 COACHING IA PERSONNALISÉ</div>
                            <div style={{fontFamily:"'Inter',sans-serif",fontSize:".87rem",color:"#d0d0e0",lineHeight:1.7}}>
                              {aiCoachText}
                            </div>
                          </div>
                        )}

                        <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap",marginTop:8}}>
                          {d.status === "accepte" && (
                            <button
                              disabled={(aiCoachLoading && aiCoachId === d.id) || settings.aiCoachingEnabled === false}
                              title={settings.aiCoachingEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                              onClick={async () => {
                                setAiCoachId(d.id); setAiCoachText(""); setAiCoachLoading(true);
                                try {
                                  const result = await callAI("coaching", {
                                    driverName: (d as any).name || "Livreur",
                                    vehicle: (d as any).transport || (d as any).vehicle,
                                    zone: (d as any).zone,
                                    message: (d as any).message,
                                    status: d.status,
                                    deliveries: (d as any).deliveryCount || 0,
                                  });
                                  setAiCoachText(result);
                                } catch { showToast("Erreur IA","err"); }
                                setAiCoachLoading(false);
                              }}
                              style={{background:"rgba(168,85,247,.1)",border:"1px solid rgba(168,85,247,.3)",
                                color:"#a855f7",padding:"8px 14px",borderRadius:8,cursor:"pointer",
                                fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",letterSpacing:".06em",
                                opacity:(aiCoachLoading && aiCoachId===d.id)?0.5:1}}>
                              {aiCoachLoading && aiCoachId===d.id ? "..." : "🤖 COACHING IA"}
                            </button>
                          )}
                          {d.status !== "accepte" && (
                            <button onClick={async () => {
                              const pwd = Math.random().toString(36).slice(-6).toUpperCase();
                              await updateDoc(doc(db, "driver_applications", d.id), { status: "accepte", password: pwd });
                              showToast(`Accepté ! Mot de passe : ${pwd}`);
                            }}
                              style={{background:"rgba(184,255,0,.1)",border:"1px solid rgba(184,255,0,.35)",
                                color:"#b8ff00",padding:"8px 16px",borderRadius:8,cursor:"pointer",
                                fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".82rem",letterSpacing:".06em"}}>
                              ✓ ACCEPTER
                            </button>
                          )}
                          {d.status !== "refuse" && (
                            <button onClick={async () => {
                              await updateDoc(doc(db, "driver_applications", d.id), { status: "refuse" });
                              showToast("Candidature refusée.");
                            }}
                              style={{background:"rgba(255,45,120,.08)",border:"1px solid rgba(255,45,120,.25)",
                                color:"#ff2d78",padding:"8px 16px",borderRadius:8,cursor:"pointer",
                                fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".82rem",letterSpacing:".06em"}}>
                              ✕ REFUSER
                            </button>
                          )}
                          <button onClick={async () => {
                            if (confirm("Supprimer cette candidature ?")) {
                              await deleteDoc(doc(db, "driver_applications", d.id));
                              showToast("Candidature supprimée.");
                            }
                          }}
                            style={{background:"transparent",border:"1px solid rgba(255,255,255,.1)",
                              color:"#5a5470",padding:"8px 12px",borderRadius:8,cursor:"pointer",
                              fontFamily:"'Inter',sans-serif",fontSize:".82rem"}}>
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "online_drivers" && (() => {
            const fmtLastSeen = (lastSeen: any) => {
              if (!lastSeen) return "Inconnu";
              const ms = lastSeen.toMillis ? lastSeen.toMillis() : typeof lastSeen === "number" ? lastSeen : Date.parse(lastSeen);
              const diff = Math.floor((Date.now() - ms) / 1000);
              if (diff < 10) return "À l'instant";
              if (diff < 60) return `Il y a ${diff}s`;
              return `Il y a ${Math.floor(diff / 60)}min`;
            };
            const statusLabel = (s: string) => s === "busy" ? "Occupé" : s === "online" ? "En ligne" : "Hors ligne";
            const statusColor = (s: string) => s === "busy" ? "#ff9500" : s === "online" ? "#b8ff00" : "#5a5470";
            return (
              <div style={{padding:"28px 24px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#f0eeff",letterSpacing:".04em"}}>
                    🟢 LIVREURS EN LIGNE
                  </div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                    color: onlineDrivers.length > 0 ? "#b8ff00" : "#5a5470",
                    letterSpacing:".12em",
                    background: onlineDrivers.length > 0 ? "rgba(184,255,0,.08)" : "rgba(90,84,112,.08)",
                    border:`1px solid ${onlineDrivers.length > 0 ? "rgba(184,255,0,.25)" : "rgba(90,84,112,.25)"}`,
                    borderRadius:4,padding:"4px 12px"}}>
                    {onlineDrivers.length} actif{onlineDrivers.length !== 1 ? "s" : ""}
                  </div>
                </div>

                {onlineDrivers.length === 0 ? (
                  <div style={{textAlign:"center",padding:"60px 20px",
                    border:"1px dashed rgba(255,255,255,.08)",borderRadius:10}}>
                    <div style={{fontSize:"2.5rem",marginBottom:12}}>🏍️</div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",
                      color:"#5a5470",letterSpacing:".1em"}}>
                      Aucun livreur disponible
                    </div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",
                      color:"#3a3450",marginTop:6,letterSpacing:".08em"}}>
                      Les livreurs apparaissent ici lorsqu'ils sont connectés
                    </div>
                  </div>
                ) : (
                  <div style={{display:"grid",gap:12}}>
                    {onlineDrivers.map(driver => (
                      <div key={driver.uid} style={{
                        background:"#0c0918",
                        border:"1px solid rgba(184,255,0,.15)",
                        borderRadius:10,padding:"16px 20px",
                        display:"flex",alignItems:"center",
                        justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                        <div style={{display:"flex",alignItems:"center",gap:14}}>
                          <div style={{width:42,height:42,borderRadius:"50%",
                            background:"rgba(184,255,0,.08)",
                            border:"2px solid rgba(184,255,0,.3)",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:"1.2rem",flexShrink:0}}>
                            🏍️
                          </div>
                          <div>
                            <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                              fontSize:"1rem",color:"#f0eeff",letterSpacing:".04em"}}>
                              {driver.name || driver.uid}
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
                              <div style={{width:6,height:6,borderRadius:"50%",
                                background: statusColor(driver.status || "online"),
                                boxShadow:`0 0 6px ${statusColor(driver.status || "online")}`,
                                animation:"pulse 1.5s infinite",flexShrink:0}} />
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                                color: statusColor(driver.status || "online"),letterSpacing:".1em"}}>
                                {statusLabel(driver.status || "online")}
                              </span>
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                                color:"#5a5470",letterSpacing:".06em"}}>
                                · {fmtLastSeen(driver.lastSeen)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                          {driver.performanceScore !== undefined && (
                            <div style={{
                              display:"flex",alignItems:"center",gap:6,
                              background:"rgba(0,0,0,.3)",
                              border:`1px solid ${driver.performanceScore > 80 ? "rgba(34,197,94,.4)" : driver.performanceScore >= 60 ? "rgba(249,115,22,.4)" : "rgba(239,68,68,.4)"}`,
                              borderRadius:6,padding:"5px 10px",
                            }}>
                              <div style={{
                                width:8,height:8,borderRadius:"50%",flexShrink:0,
                                background: driver.performanceScore > 80 ? "#22c55e" : driver.performanceScore >= 60 ? "#f97316" : "#ef4444",
                                boxShadow:`0 0 5px ${driver.performanceScore > 80 ? "#22c55e" : driver.performanceScore >= 60 ? "#f97316" : "#ef4444"}`,
                              }} />
                              <span style={{
                                fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".06em",
                                color: driver.performanceScore > 80 ? "#22c55e" : driver.performanceScore >= 60 ? "#f97316" : "#ef4444",
                              }}>
                                {driver.performanceScore > 80 ? "EXCELLENT" : driver.performanceScore >= 60 ? "BON" : "FAIBLE"}
                              </span>
                              <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".85rem",
                                color: driver.performanceScore > 80 ? "#22c55e" : driver.performanceScore >= 60 ? "#f97316" : "#ef4444",
                              }}>
                                {driver.performanceScore}
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => setAssignDriverModal(driver)}
                            style={{background:"rgba(255,45,120,.1)",
                              border:"1px solid rgba(255,45,120,.4)",
                              color:"#ff2d78",padding:"8px 18px",borderRadius:6,
                              fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                              fontSize:".82rem",letterSpacing:".08em",
                              textTransform:"uppercase",cursor:"pointer",
                              whiteSpace:"nowrap"}}>
                            📦 Assigner commande
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {tab === "dispatch" && (() => {
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            const availableOrders  = orders.filter(o => o.status === "nouveau");
            const inProgressOrders = orders.filter(o => o.status === "en_cours");
            const deliveredOrders  = orders.filter(o => o.status === "livre");
            const todayDelivered   = deliveredOrders.filter(o => (o as any).deliveredAt?.slice(0,10) === todayStr);
            const displayOrders    = dispatchFilter === "available" ? availableOrders : dispatchFilter === "mine" ? inProgressOrders : deliveredOrders;

            return (
              <div className="admin-tab-content">
                {/* ── Header ── */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:12}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                    🗺️ <span style={{color:"#00f5ff"}}>DISPATCH</span>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#5a5470",marginLeft:12,letterSpacing:".1em"}}>VUE OPÉRATIONNELLE</span>
                  </div>
                </div>

                {/* ── Confirmation modal ── */}
                {dispatchConfirm && (
                  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                    <div style={{background:"#0e0e18",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"28px 24px",maxWidth:360,width:"100%",textAlign:"center",animation:"fadeUp .2s ease"}}>
                      <div style={{fontSize:"2.2rem",marginBottom:14}}>{dispatchConfirm.type === "take" ? "🚀" : "✅"}</div>
                      <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.1rem",marginBottom:8}}>
                        {dispatchConfirm.type === "take" ? "Prendre cette commande ?" : "Marquer comme livrée ?"}
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",marginBottom:24}}>
                        {dispatchConfirm.type === "take" ? "Vous serez assigné comme livreur." : "Cette action est irréversible."}
                      </div>
                      <div style={{display:"flex",gap:10}}>
                        <button onClick={() => setDispatchConfirm(null)}
                          style={{flex:1,padding:"11px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,color:"#7a7490",fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".88rem",cursor:"pointer"}}>
                          ANNULER
                        </button>
                        <button onClick={() => dispatchConfirm.type === "take" ? adminTakeOrder(dispatchConfirm.id) : adminMarkDelivered(dispatchConfirm.id)}
                          style={{flex:1,padding:"11px",background: dispatchConfirm.type === "take" ? "#00f5ff" : "#b8ff00",border:"none",borderRadius:8,color:"#000",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".88rem",cursor:"pointer"}}>
                          CONFIRMER
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Stats row ── */}
                <div className="admin-kpi-grid" style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
                  <div style={{background:"rgba(0,245,255,.06)",border:"1px solid rgba(0,245,255,.2)",borderRadius:10,padding:"14px 18px",flex:1,minWidth:130}}>
                    <div style={{fontSize:"1.4rem",marginBottom:4}}>📋</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".72rem",color:"#5a5470",letterSpacing:".1em",textTransform:"uppercase" as const}}>Disponibles</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.6rem",color:"#00f5ff"}}>{availableOrders.length}</div>
                  </div>
                  <div style={{background:"rgba(255,149,0,.06)",border:"1px solid rgba(255,149,0,.2)",borderRadius:10,padding:"14px 18px",flex:1,minWidth:130}}>
                    <div style={{fontSize:"1.4rem",marginBottom:4}}>🚚</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".72rem",color:"#5a5470",letterSpacing:".1em",textTransform:"uppercase" as const}}>En cours</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.6rem",color:"#ff9500"}}>{inProgressOrders.length}</div>
                  </div>
                  <div style={{background:"rgba(184,255,0,.06)",border:"1px solid rgba(184,255,0,.2)",borderRadius:10,padding:"14px 18px",flex:1,minWidth:130}}>
                    <div style={{fontSize:"1.4rem",marginBottom:4}}>✅</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".72rem",color:"#5a5470",letterSpacing:".1em",textTransform:"uppercase" as const}}>Livrées auj.</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.6rem",color:"#b8ff00"}}>{todayDelivered.length}</div>
                  </div>
                </div>

                {/* ── Livreurs actifs (GPS) ── */}
                {driverLocations.length > 0 && (
                  <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(184,255,0,.2)",borderRadius:10,padding:"14px 16px",marginBottom:20}}>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#b8ff00",letterSpacing:".12em",marginBottom:10}}>
                      📡 LIVREURS GPS ACTIFS ({driverLocations.length})
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {driverLocations.map((loc: any) => (
                        <a key={loc.id} href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer"
                          style={{display:"flex",alignItems:"center",gap:10,background:"rgba(184,255,0,.06)",border:"1px solid rgba(184,255,0,.2)",borderRadius:8,padding:"9px 14px",textDecoration:"none",transition:"background .2s"}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:"#b8ff00",boxShadow:"0 0 8px #b8ff00",flexShrink:0}} />
                          <div>
                            <div style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".88rem",color:"#f0eeff"}}>
                              {loc.transport === "moto" || loc.transport === "scooter" ? "🏍️" : loc.transport === "voiture" ? "🚗" : "🚲"} {loc.driverName || loc.id}
                            </div>
                            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470"}}>
                              {loc.updatedAt ? `màj ${new Date(loc.updatedAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}` : "GPS actif"}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Filtres ── */}
                <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                  {([
                    {val:"available", label:"DISPONIBLES", color:"#ff2d78",  count: availableOrders.length},
                    {val:"mine",      label:"EN COURS",    color:"#ff9500",  count: inProgressOrders.length},
                    {val:"delivered", label:"LIVRÉES",     color:"#b8ff00",  count: deliveredOrders.length},
                  ] as const).map(f => (
                    <button key={f.val} onClick={() => setDispatchFilter(f.val)}
                      style={{background: dispatchFilter===f.val ? `${f.color}22` : "transparent",
                        border:`1px solid ${dispatchFilter===f.val ? f.color : "rgba(255,255,255,.1)"}`,
                        color: dispatchFilter===f.val ? f.color : "#5a5470",
                        padding:"7px 16px",borderRadius:20,cursor:"pointer",
                        fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".82rem",letterSpacing:".06em",
                        transition:"all .2s",display:"flex",alignItems:"center",gap:8}}>
                      {f.label}
                      <span style={{background: dispatchFilter===f.val ? f.color : "rgba(255,255,255,.08)",
                        color: dispatchFilter===f.val ? "#000" : "#5a5470",
                        borderRadius:10,padding:"1px 7px",fontSize:".75rem",fontWeight:700,fontFamily:"'Share Tech Mono',monospace"}}>
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* ── Optimisation route IA ── */}
                {dispatchFilter === "mine" && inProgressOrders.filter(o => (o as any).address).length >= 2 && (
                  <div style={{background:"rgba(184,255,0,.04)",border:"1px solid rgba(184,255,0,.22)",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom: aiRoute ? 12 : 0}}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#b8ff00",letterSpacing:".12em"}}>
                        🗺️ ROUTE IA — {inProgressOrders.filter(o=>(o as any).address).length} livraisons
                      </div>
                      <button
                        disabled={aiRouteLoading || settings.aiRouteEnabled === false}
                        title={settings.aiRouteEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                        onClick={async () => {
                          setAiRouteLoading(true);
                          setAiRoute(null);
                          try {
                            const delivOrders = inProgressOrders.filter(o => (o as any).address);
                            const result = await callAI("route", {
                              orders: delivOrders.map(o => ({
                                id: o.id,
                                name: (o as any).name || o.phone,
                                address: (o as any).address,
                                total: o.total,
                              })),
                            });
                            setAiRoute(result);
                          } catch { showToast("Erreur IA", "err"); }
                          setAiRouteLoading(false);
                        }}
                        style={{background:"rgba(184,255,0,.15)",border:"1px solid rgba(184,255,0,.4)",color:"#b8ff00",
                          padding:"5px 12px",borderRadius:6,cursor:"pointer",fontFamily:"'Share Tech Mono',monospace",
                          fontSize:".75rem",letterSpacing:".06em",opacity:aiRouteLoading?0.5:1}}>
                        {aiRouteLoading ? "..." : "✨ OPTIMISER"}
                      </button>
                    </div>
                    {aiRoute && (
                      <div style={{marginTop:8}}>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {(aiRoute.order as number[]).map((idx, rank) => {
                            const delivOrders = inProgressOrders.filter(o => (o as any).address);
                            const o = delivOrders[idx - 1];
                            if (!o) return null;
                            return (
                              <div key={o.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                                background:"rgba(0,0,0,.2)",borderRadius:6}}>
                                <span style={{fontFamily:"'Black Ops One',cursive",fontSize:".88rem",color:"#b8ff00",minWidth:20}}>{rank + 1}.</span>
                                <span style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".88rem",flex:1}}>
                                  {(o as any).name || o.phone}
                                </span>
                                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#5a5470"}}>
                                  {((o as any).address ?? "").slice(0, 32)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {aiRoute.tips && (
                          <div style={{marginTop:8,fontFamily:"'Inter',sans-serif",fontSize:".8rem",color:"#7a7090",fontStyle:"italic"}}>
                            💡 {aiRoute.tips}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Liste des commandes ── */}
                {displayOrders.length === 0 ? (
                  <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                    padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:10}}>
                    // aucune commande dans cette catégorie
                  </div>
                ) : (
                  <div style={{display:"grid",gap:10}}>
                    {displayOrders.map(o => {
                      const isMyOrder  = (o as any).assignedDriver === "admin";
                      const driverName = (o as any).assignedDriverName;
                      return (
                        <div key={o.id} style={{background:"rgba(255,255,255,.02)",
                          border:`1px solid ${dispatchFilter==="available" ? "rgba(0,245,255,.2)" : isMyOrder ? "rgba(255,149,0,.25)" : "rgba(255,255,255,.06)"}`,
                          borderRadius:10,padding:"16px 18px",transition:"border .2s"}}>

                          {/* En-tête : n° + heure + badges + total */}
                          <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:10}}>
                            <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.05rem",color:"#ff2d78",letterSpacing:".04em"}}>
                              #{(o as any).orderNumber ?? (o.id ?? '').slice(-6).toUpperCase()}
                            </span>
                            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem",color:"#5a5470"}}>
                              {new Date(o.createdAt).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                            </span>
                            {(o as any).paidOnline && (
                              <span style={{background:"rgba(184,255,0,.15)",color:"#b8ff00",borderRadius:4,padding:"2px 8px",fontSize:".7rem",fontFamily:"'Share Tech Mono',monospace"}}>💳 STRIPE</span>
                            )}
                            {driverName && (
                              <span style={{background: isMyOrder ? "rgba(255,149,0,.15)" : "rgba(0,245,255,.12)",
                                color: isMyOrder ? "#ff9500" : "#00f5ff",
                                borderRadius:4,padding:"2px 8px",fontSize:".72rem",fontFamily:"'Inter',sans-serif",fontWeight:600}}>
                                {isMyOrder ? "👤 VOUS" : `🏍️ ${driverName}`}
                              </span>
                            )}
                            <span style={{marginLeft:"auto",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",color:"#f0eeff"}}>
                              {Number(o.total).toFixed(2)} €
                            </span>
                          </div>

                          {/* Client */}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,gap:8}}>
                            <div>
                              <div style={{fontWeight:700,fontSize:".95rem",marginBottom:2}}>{(o as any).name || o.phone}</div>
                              {(o as any).name && (
                                <a href={`tel:${o.phone}`} style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#00f5ff",textDecoration:"none"}}>
                                  📞 {o.phone}
                                </a>
                              )}
                            </div>
                            {(o as any).name && (
                              <a href={`https://wa.me/${o.phone?.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                                style={{flexShrink:0,background:"rgba(37,211,102,.12)",border:"1px solid rgba(37,211,102,.3)",color:"#25d366",
                                  padding:"6px 12px",borderRadius:8,textDecoration:"none",fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".78rem"}}>
                                WhatsApp
                              </a>
                            )}
                          </div>

                          {/* Adresse + navigation */}
                          {(o as any).address && (
                            <div style={{marginBottom:10}}>
                              <div style={{fontSize:".82rem",color:"#7a7490",marginBottom:6}}>📍 {(o as any).address}</div>
                              {(o as any).lat && (o as any).lng && (
                                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                                  <a href={`https://maps.google.com/?q=${(o as any).lat},${(o as any).lng}`} target="_blank" rel="noreferrer"
                                    style={{background:"rgba(66,133,244,.12)",border:"1px solid rgba(66,133,244,.3)",color:"#4285f4",padding:"5px 11px",borderRadius:6,textDecoration:"none",fontSize:".75rem",fontFamily:"'Inter',sans-serif",fontWeight:600}}>
                                    Google Maps
                                  </a>
                                  <a href={`https://waze.com/ul?ll=${(o as any).lat},${(o as any).lng}&navigate=yes`} target="_blank" rel="noreferrer"
                                    style={{background:"rgba(0,173,210,.12)",border:"1px solid rgba(0,173,210,.3)",color:"#00add2",padding:"5px 11px",borderRadius:6,textDecoration:"none",fontSize:".75rem",fontFamily:"'Inter',sans-serif",fontWeight:600}}>
                                    Waze
                                  </a>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Articles */}
                          <div style={{background:"rgba(255,255,255,.02)",borderRadius:6,padding:"8px 10px",marginBottom:12}}>
                            {o.items.split("\n").filter(Boolean).map((line: string, i: number) => (
                              <div key={i} style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".76rem",color:"#7a7490",
                                marginBottom: i < o.items.split("\n").filter(Boolean).length - 1 ? 3 : 0}}>
                                {line}
                              </div>
                            ))}
                          </div>

                          {/* Actions */}
                          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                            {dispatchFilter === "available" && (
                              <button onClick={() => setDispatchConfirm({id: o.id!, type:"take"})}
                                style={{flex:1,background:"rgba(0,245,255,.15)",border:"1px solid rgba(0,245,255,.5)",color:"#00f5ff",
                                  borderRadius:8,padding:"10px 16px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".88rem",
                                  letterSpacing:".06em",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                                🚀 JE PRENDS CETTE LIVRAISON
                              </button>
                            )}
                            {dispatchFilter === "mine" && isMyOrder && (
                              <button onClick={() => setDispatchConfirm({id: o.id!, type:"deliver"})}
                                style={{flex:1,background:"rgba(184,255,0,.15)",border:"1px solid rgba(184,255,0,.5)",color:"#b8ff00",
                                  borderRadius:8,padding:"10px 16px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".88rem",
                                  letterSpacing:".06em",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                                ✅ MARQUER LIVRÉ
                              </button>
                            )}
                            {dispatchFilter === "mine" && !isMyOrder && driverName && (
                              <div style={{flex:1,background:"rgba(0,245,255,.05)",border:"1px solid rgba(0,245,255,.15)",borderRadius:8,
                                padding:"10px 16px",fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".85rem",color:"#00f5ff",textAlign:"center"}}>
                                🏍️ En cours par {driverName}
                              </div>
                            )}
                            {dispatchFilter === "delivered" && (
                              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#b8ff00",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                <span style={{width:6,height:6,borderRadius:"50%",background:"#b8ff00",display:"inline-block",flexShrink:0}} />
                                Livré {(o as any).deliveredAt ? `le ${new Date((o as any).deliveredAt).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}` : ""}
                                {driverName && <span style={{color:"#5a5470"}}>— par {driverName}</span>}
                              </div>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {tab === "settings" && (
            <div>
              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em",marginBottom:24}}>
                ⚙️ <span style={{color:"#ff2d78"}}>PARAMÈTRES</span>
              </div>
              <div className="admin-settings-form" style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.06)",
                borderRadius:8,padding:24,maxWidth:500,display:"grid",gap:18}}>

                <Field label="HORAIRES D'OUVERTURE" value={settings.hours}
                  onChange={v => setSettings(s => ({...s, hours: v}))} />
                <Field label="ZONE DE LIVRAISON" value={settings.zone}
                  onChange={v => setSettings(s => ({...s, zone: v}))} />

                {/* ── FRAIS DE LIVRAISON ── */}
                <div style={{background:"rgba(0,245,255,.03)",border:"1px solid rgba(0,245,255,.15)",
                  borderRadius:10,padding:18}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                      color:"#00f5ff",letterSpacing:".12em"}}>🚗 FRAIS DE LIVRAISON</div>
                    <a href="/admin/settings/delivery"
                      style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                        color:"#5a5470",letterSpacing:".06em",textDecoration:"underline",cursor:"pointer"}}>
                      config avancée →
                    </a>
                  </div>
                  <div style={{display:"grid",gap:12}}>
                    {/* Base */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",letterSpacing:".1em",marginBottom:6}}>FRAIS DE BASE (€)</div>
                        <input type="number" min={0} step={0.5} value={deliveryConfig.delivery_base_fee}
                          onChange={e => setDeliveryConfig(c => ({...c, delivery_base_fee: parseFloat(e.target.value)||0}))}
                          style={{width:"100%",background:"#080514",border:"1px solid rgba(0,245,255,.2)",borderRadius:6,
                            padding:"10px 12px",color:"#00f5ff",fontFamily:"'Share Tech Mono',monospace",fontSize:"1rem"}} />
                      </div>
                      <div>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",letterSpacing:".1em",marginBottom:6}}>LIVRAISON OFFERTE (€)</div>
                        <input type="number" min={0} step={1} value={deliveryConfig.free_delivery_threshold}
                          onChange={e => setDeliveryConfig(c => ({...c, free_delivery_threshold: parseFloat(e.target.value)||0}))}
                          style={{width:"100%",background:"#080514",border:"1px solid rgba(184,255,0,.2)",borderRadius:6,
                            padding:"10px 12px",color:"#b8ff00",fontFamily:"'Share Tech Mono',monospace",fontSize:"1rem"}} />
                      </div>
                    </div>
                    {/* Toggle Distance */}
                    <div style={{background:"#080514",border:`1px solid ${deliveryConfig.distance_fee_enabled ? "rgba(167,139,250,.4)":"rgba(255,255,255,.06)"}`,
                      borderRadius:6,padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",
                          color:deliveryConfig.distance_fee_enabled ? "#a78bfa":"#5a5470",letterSpacing:".06em"}}>📍 FRAIS DE DISTANCE</span>
                        <div onClick={() => setDeliveryConfig(c => ({...c, distance_fee_enabled:!c.distance_fee_enabled}))}
                          style={{width:36,height:20,borderRadius:10,position:"relative",cursor:"pointer",flexShrink:0,
                            background:deliveryConfig.distance_fee_enabled ? "#a78bfa":"rgba(255,255,255,.1)",transition:"background .2s"}}>
                          <div style={{position:"absolute",top:2,left:deliveryConfig.distance_fee_enabled?18:2,
                            width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}} />
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,
                        opacity:deliveryConfig.distance_fee_enabled?1:0.4,pointerEvents:deliveryConfig.distance_fee_enabled?"auto":"none"}}>
                        <div>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#5a5470",marginBottom:4}}>RAYON INCLUS (km)</div>
                          <input type="number" min={0} step={0.5} value={deliveryConfig.base_radius_km}
                            disabled={!deliveryConfig.distance_fee_enabled}
                            onChange={e => setDeliveryConfig(c => ({...c, base_radius_km: parseFloat(e.target.value)||0}))}
                            style={{width:"100%",background:"rgba(0,0,0,.3)",border:"1px solid rgba(167,139,250,.2)",
                              borderRadius:4,padding:"6px 10px",color:"#a78bfa",fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem"}} />
                        </div>
                        <div>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#5a5470",marginBottom:4}}>PAR KM SUPPL. (€)</div>
                          <input type="number" min={0} step={0.25} value={deliveryConfig.extra_fee_per_km}
                            disabled={!deliveryConfig.distance_fee_enabled}
                            onChange={e => setDeliveryConfig(c => ({...c, extra_fee_per_km: parseFloat(e.target.value)||0}))}
                            style={{width:"100%",background:"rgba(0,0,0,.3)",border:"1px solid rgba(167,139,250,.2)",
                              borderRadius:4,padding:"6px 10px",color:"#a78bfa",fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem"}} />
                        </div>
                      </div>
                    </div>
                    {/* Toggles Rush + Pluie */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      {([
                        {key:"rush_mode_enabled" as const, feeKey:"rush_fee" as const, label:"🚀 MODE RUSH", color:"#ff9500"},
                        {key:"rain_mode_enabled" as const, feeKey:"rain_fee" as const, label:"🌧️ MODE PLUIE", color:"#00b4ff"},
                      ]).map(mode => (
                        <div key={mode.key} style={{background:"#080514",border:`1px solid ${deliveryConfig[mode.key] ? mode.color+"44":"rgba(255,255,255,.06)"}`,
                          borderRadius:6,padding:"10px 12px"}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",
                              color:deliveryConfig[mode.key] ? mode.color:"#5a5470",letterSpacing:".06em"}}>{mode.label}</span>
                            <div onClick={() => setDeliveryConfig(c => ({...c,[mode.key]:!c[mode.key]}))}
                              style={{width:36,height:20,borderRadius:10,position:"relative",cursor:"pointer",flexShrink:0,
                                background:deliveryConfig[mode.key] ? mode.color:"rgba(255,255,255,.1)",transition:"background .2s"}}>
                              <div style={{position:"absolute",top:2,left:deliveryConfig[mode.key]?18:2,
                                width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}} />
                            </div>
                          </div>
                          <input type="number" min={0} step={0.25} value={deliveryConfig[mode.feeKey]}
                            disabled={!deliveryConfig[mode.key]}
                            onChange={e => setDeliveryConfig(c => ({...c,[mode.feeKey]:parseFloat(e.target.value)||0}))}
                            style={{width:"100%",background:"rgba(0,0,0,.3)",border:`1px solid ${deliveryConfig[mode.key] ? mode.color+"44":"rgba(255,255,255,.05)"}`,
                              borderRadius:4,padding:"6px 10px",color:deliveryConfig[mode.key] ? mode.color:"#5a5470",
                              fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",
                              opacity:deliveryConfig[mode.key]?1:0.4}} />
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#5a5470",marginTop:4}}>supplément (€)</div>
                        </div>
                      ))}
                    </div>
                    {/* Tarif actuel estimé */}
                    <div style={{background:"rgba(0,0,0,.3)",borderRadius:6,padding:"10px 14px",
                      display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470",letterSpacing:".08em"}}>
                        TARIF ACTUEL ESTIMÉ
                      </span>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"1.1rem",color:"#00f5ff",fontWeight:700}}>
                        {(deliveryConfig.delivery_base_fee
                          + (deliveryConfig.rush_mode_enabled ? deliveryConfig.rush_fee : 0)
                          + (deliveryConfig.rain_mode_enabled ? deliveryConfig.rain_fee : 0)
                        ).toFixed(2)} €
                      </span>
                    </div>
                    {/* Bouton save */}
                    <button
                      onClick={async () => {
                        setDeliverySaving(true);
                        try {
                          const safe = { ...DEFAULT_DELIVERY_CONFIG, ...deliveryConfig };
                          await setDoc(doc(db, "settings", "delivery"), safe);
                          showToast("✓ Frais de livraison sauvegardés !");
                        } catch { showToast("Erreur sauvegarde frais", "err"); }
                        setDeliverySaving(false);
                      }}
                      disabled={deliverySaving}
                      style={{background: deliverySaving ? "#3a3450" : "#00f5ff",color:"#000",border:"none",
                        borderRadius:6,padding:"12px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                        fontSize:".9rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                      {deliverySaving ? "SAUVEGARDE..." : "💾 SAUVEGARDER LES FRAIS"}
                    </button>
                  </div>
                </div>

                {/* ── Modes de réception ── */}
                <div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",color:"#7a7490",
                    letterSpacing:".1em",marginBottom:12}}>MODES DE RÉCEPTION</div>
                  <div style={{display:"grid",gap:10}}>
                    {([
                      { key:"fulfillmentDeliveryEnabled", label:"🚗 Livraison à domicile", color:"#ff2d78" },
                      { key:"fulfillmentPickupEnabled",   label:"🏪 Click & Collect",      color:"#00f5ff" },
                    ] as const).map(opt => (
                      <label key={opt.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        background:"#080514",border:`1px solid ${settings[opt.key] ? opt.color + "44" : "rgba(255,255,255,.06)"}`,
                        borderRadius:6,padding:"12px 16px",cursor:"pointer",transition:"all .2s"}}>
                        <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:".95rem",
                          color: settings[opt.key] ? "#f0eeff" : "#5a5470",letterSpacing:".04em"}}>
                          {opt.label}
                        </span>
                        <div onClick={() => setSettings(s => ({...s, [opt.key]: !s[opt.key]}))}
                          style={{width:44,height:24,borderRadius:12,position:"relative",cursor:"pointer",flexShrink:0,
                            background: settings[opt.key] ? opt.color : "rgba(255,255,255,.1)",
                            transition:"background .2s",border:`1px solid ${settings[opt.key] ? opt.color : "rgba(255,255,255,.1)"}`}}>
                          <div style={{position:"absolute",top:2,
                            left: settings[opt.key] ? 22 : 2,
                            width:18,height:18,borderRadius:"50%",background:"#fff",
                            transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}} />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── Modes de paiement ── */}
                <div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",color:"#7a7490",
                    letterSpacing:".1em",marginBottom:12}}>MODES DE PAIEMENT</div>
                  <div style={{display:"grid",gap:10}}>
                    {([
                      { key:"paymentOnlineEnabled", label:"💳 Paiement en ligne (Stripe)", color:"#b8ff00" },
                      { key:"paymentCashEnabled",   label:"💵 Cash à la livraison / retrait", color:"#ff9500" },
                    ] as const).map(opt => (
                      <label key={opt.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        background:"#080514",border:`1px solid ${settings[opt.key] ? opt.color + "44" : "rgba(255,255,255,.06)"}`,
                        borderRadius:6,padding:"12px 16px",cursor:"pointer",transition:"all .2s"}}>
                        <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:".95rem",
                          color: settings[opt.key] ? "#f0eeff" : "#5a5470",letterSpacing:".04em"}}>
                          {opt.label}
                        </span>
                        <div onClick={() => setSettings(s => ({...s, [opt.key]: !s[opt.key]}))}
                          style={{width:44,height:24,borderRadius:12,position:"relative",cursor:"pointer",flexShrink:0,
                            background: settings[opt.key] ? opt.color : "rgba(255,255,255,.1)",
                            transition:"background .2s",border:`1px solid ${settings[opt.key] ? opt.color : "rgba(255,255,255,.1)"}`}}>
                          <div style={{position:"absolute",top:2,
                            left: settings[opt.key] ? 22 : 2,
                            width:18,height:18,borderRadius:"50%",background:"#fff",
                            transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}} />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── Fonctionnalités IA ── */}
                <div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",color:"#7a7490",
                    letterSpacing:".1em",marginBottom:6}}>FONCTIONNALITÉS IA</div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#3a3454",
                    letterSpacing:".06em",marginBottom:12}}>// Désactiver stoppe les appels Claude sans supprimer le code</div>

                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470",
                    letterSpacing:".08em",marginBottom:8,marginTop:4}}>— CLIENT —</div>
                  <div style={{display:"grid",gap:10,marginBottom:14}}>
                    {([
                      { key:"aiChatEnabled",      label:"💬 Chatbot IA",              color:"#00f5ff" },
                      { key:"aiVoiceEnabled",      label:"🎙️ Commande vocale",         color:"#b8ff00" },
                      { key:"aiRecommendEnabled",  label:"✨ Recommandations produits", color:"#ff9500" },
                    ] as const).map(opt => (
                      <label key={opt.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        background:"#080514",border:`1px solid ${settings[opt.key] !== false ? opt.color + "44" : "rgba(255,255,255,.06)"}`,
                        borderRadius:6,padding:"10px 16px",cursor:"pointer",transition:"all .2s"}}>
                        <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:".9rem",
                          color: settings[opt.key] !== false ? "#f0eeff" : "#5a5470",letterSpacing:".04em"}}>
                          {opt.label}
                        </span>
                        <div onClick={() => setSettings(s => ({...s, [opt.key]: s[opt.key] === false ? true : false}))}
                          style={{width:44,height:24,borderRadius:12,position:"relative",cursor:"pointer",flexShrink:0,
                            background: settings[opt.key] !== false ? opt.color : "rgba(255,255,255,.1)",
                            transition:"background .2s",border:`1px solid ${settings[opt.key] !== false ? opt.color : "rgba(255,255,255,.1)"}`}}>
                          <div style={{position:"absolute",top:2,
                            left: settings[opt.key] !== false ? 22 : 2,
                            width:18,height:18,borderRadius:"50%",background:"#fff",
                            transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}} />
                        </div>
                      </label>
                    ))}
                  </div>

                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470",
                    letterSpacing:".08em",marginBottom:8}}>— ADMIN —</div>
                  <div style={{display:"grid",gap:10}}>
                    {([
                      { key:"aiDescEnabled",    label:"📝 Génération de descriptions", color:"#b8ff00" },
                      { key:"aiPredictEnabled", label:"🔮 Prédictions & analytics",    color:"#00f5ff" },
                      { key:"aiAnomalyEnabled", label:"🔍 Détection d'anomalies",      color:"#ff9500" },
                      { key:"aiBannerEnabled",  label:"🖼️ Génération de bannières",    color:"#ff2d78" },
                      { key:"aiStockEnabled",   label:"📦 Prédiction des stocks",      color:"#b8ff00" },
                      { key:"aiCoachingEnabled",label:"🏆 Coaching livreurs",          color:"#00f5ff" },
                      { key:"aiCouponEnabled",  label:"🎟️ Suggestion de coupons",      color:"#ff9500" },
                      { key:"aiRouteEnabled",   label:"🗺️ Optimisation de routes",     color:"#ff2d78" },
                    ] as const).map(opt => (
                      <label key={opt.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        background:"#080514",border:`1px solid ${settings[opt.key] !== false ? opt.color + "44" : "rgba(255,255,255,.06)"}`,
                        borderRadius:6,padding:"10px 16px",cursor:"pointer",transition:"all .2s"}}>
                        <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:".9rem",
                          color: settings[opt.key] !== false ? "#f0eeff" : "#5a5470",letterSpacing:".04em"}}>
                          {opt.label}
                        </span>
                        <div onClick={() => setSettings(s => ({...s, [opt.key]: s[opt.key] === false ? true : false}))}
                          style={{width:44,height:24,borderRadius:12,position:"relative",cursor:"pointer",flexShrink:0,
                            background: settings[opt.key] !== false ? opt.color : "rgba(255,255,255,.1)",
                            transition:"background .2s",border:`1px solid ${settings[opt.key] !== false ? opt.color : "rgba(255,255,255,.1)"}`}}>
                          <div style={{position:"absolute",top:2,
                            left: settings[opt.key] !== false ? 22 : 2,
                            width:18,height:18,borderRadius:"50%",background:"#fff",
                            transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.4)"}} />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button onClick={saveSettings}
                  style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:4,
                    padding:"13px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",
                    letterSpacing:".1em",textTransform:"uppercase",cursor:"pointer",marginTop:8}}>
                  SAUVEGARDER
                </button>
              </div>


              {/* ── Changer le mot de passe ── */}
              {pwdWarning && (
                <div style={{background:"rgba(255,45,120,.1)",border:"1px solid rgba(255,45,120,.4)",
                  borderRadius:6,padding:"12px 16px",marginBottom:20,
                  fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",color:"#ff2d78",letterSpacing:".06em"}}>
                  ⚠️ Vous utilisez le mot de passe par défaut — veuillez le changer ci-dessous.
                </div>
              )}
              <div style={{background:"#0c0918",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,padding:"22px 24px",marginTop:24}}>
                <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",letterSpacing:".06em",marginBottom:16}}>
                  🔑 <span style={{color:"#00f5ff"}}>CHANGER LE MOT DE PASSE</span>
                </div>
                <div style={{display:"grid",gap:12}}>
                  {pwdFormErr && <div style={{color:"#ff2d78",fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem"}}>{pwdFormErr}</div>}
                  <input type="password" placeholder="Nouveau mot de passe" value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    style={{background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:4,
                      padding:"10px 14px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",outline:"none"}} />
                  <input type="password" placeholder="Confirmer le mot de passe" value={newPwd2}
                    onChange={e => setNewPwd2(e.target.value)}
                    style={{background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:4,
                      padding:"10px 14px",color:"#e0d9ff",fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",outline:"none"}} />
                  <button onClick={async () => {
                    if (newPwd.length < 6) { setPwdFormErr("Minimum 6 caractères."); return; }
                    if (newPwd !== newPwd2) { setPwdFormErr("Les mots de passe ne correspondent pas."); return; }
                    await changePassword(newPwd);
                    setNewPwd(""); setNewPwd2(""); setPwdFormErr("");
                  }}
                    style={{background:"#00f5ff",color:"#000",border:"none",borderRadius:4,
                      padding:"11px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
                      letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                    METTRE À JOUR
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "pickup_locations" && (
            <div>
              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em",marginBottom:24}}>
                🏪 <span style={{color:"#00f5ff"}}>POINTS RELAIS</span>
              </div>

              {/* Form */}
              <div style={{background:"#0c0918",border:"1px solid rgba(0,245,255,.1)",borderRadius:8,
                padding:"20px 24px",marginBottom:24}}>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470",
                  letterSpacing:".1em",marginBottom:14}}>
                  {editPickupLoc ? "// MODIFIER LE POINT RELAIS" : "// NOUVEAU POINT RELAIS"}
                </div>
                <div style={{display:"grid",gap:12}}>
                  {(["name","address","city","instructions"] as const).map(field => (
                    <div key={field}>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#7a7490",
                        letterSpacing:".1em",marginBottom:6,textTransform:"uppercase"}}>{field}</div>
                      <input value={pickupLocForm[field]} onChange={e => setPickupLocForm(f => ({...f, [field]: e.target.value}))}
                        placeholder={field === "name" ? "ex: Épicerie Le Marché" : field === "address" ? "ex: 12 Rue de la Liberté" : field === "city" ? "ex: Cayenne" : "ex: Présente ton numéro à l'accueil"}
                        style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
                          borderRadius:4,padding:"10px 12px",color:"#f0eeff",fontSize:".9rem",
                          fontFamily:"'Rajdhani',sans-serif"}} />
                    </div>
                  ))}
                  <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                    <input type="checkbox" checked={pickupLocForm.isActive}
                      onChange={e => setPickupLocForm(f => ({...f, isActive: e.target.checked}))}
                      style={{width:16,height:16,cursor:"pointer"}} />
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#7a7490",letterSpacing:".08em"}}>
                      ACTIF (visible par les clients)
                    </span>
                  </label>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={async () => {
                      if (!pickupLocForm.name || !pickupLocForm.address) { showToast("Nom et adresse requis", "err"); return; }
                      if (editPickupLoc?.id) {
                        await updateDoc(doc(db, "pickup_locations_v1", editPickupLoc.id), { ...pickupLocForm });
                        showToast("Point relais mis à jour ✓");
                      } else {
                        await addDoc(collection(db, "pickup_locations_v1"), { ...pickupLocForm });
                        showToast("Point relais ajouté ✓");
                      }
                      setPickupLocForm({name:"",address:"",city:"Cayenne",instructions:"",isActive:true});
                      setEditPickupLoc(null);
                    }}
                      style={{background:"linear-gradient(135deg,#00f5ff,#0090ff)",border:"none",
                        color:"#000",padding:"10px 20px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                        fontSize:".88rem",letterSpacing:".08em",cursor:"pointer",fontWeight:700}}>
                      {editPickupLoc ? "METTRE À JOUR" : "+ AJOUTER"}
                    </button>
                    {editPickupLoc && (
                      <button onClick={() => { setEditPickupLoc(null); setPickupLocForm({name:"",address:"",city:"Cayenne",instructions:"",isActive:true}); }}
                        style={{background:"transparent",border:"1px solid rgba(255,255,255,.1)",
                          color:"#5a5470",padding:"10px 16px",borderRadius:4,
                          fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",cursor:"pointer"}}>
                        ANNULER
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* List */}
              {pickupLocations.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                  // aucun point relais configuré
                </div>
              ) : (
                <div style={{display:"grid",gap:10}}>
                  {pickupLocations.map(loc => (
                    <div key={loc.id} style={{background:"rgba(255,255,255,.02)",
                      border:`1px solid ${loc.isActive ? "rgba(0,245,255,.15)" : "rgba(255,255,255,.06)"}`,
                      borderRadius:8,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                          <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",color:"#f0eeff"}}>{loc.name}</span>
                          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                            padding:"2px 6px",borderRadius:3,
                            background: loc.isActive ? "rgba(0,245,255,.12)" : "rgba(255,255,255,.06)",
                            color: loc.isActive ? "#00f5ff" : "#5a5470"}}>
                            {loc.isActive ? "ACTIF" : "INACTIF"}
                          </span>
                        </div>
                        <div style={{fontSize:".78rem",color:"#7a7490"}}>📍 {loc.address}, {loc.city}</div>
                        {loc.instructions && <div style={{fontSize:".72rem",color:"#5a5470",marginTop:2}}>ℹ️ {loc.instructions}</div>}
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button onClick={() => { setEditPickupLoc(loc); setPickupLocForm({name:loc.name,address:loc.address,city:loc.city,instructions:loc.instructions,isActive:loc.isActive}); }}
                          style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                            padding:"6px 12px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                            fontSize:".78rem",cursor:"pointer"}}>
                          ✎ MODIFIER
                        </button>
                        <button onClick={async () => {
                          if (!confirm(`Supprimer "${loc.name}" ?`)) return;
                          await deleteDoc(doc(db, "pickup_locations_v1", loc.id!));
                          showToast("Point relais supprimé");
                        }}
                          style={{background:"transparent",border:"1px solid rgba(255,45,120,.2)",color:"#5a5470",
                            padding:"6px 10px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                            fontSize:".78rem",cursor:"pointer"}}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* ── ASSIGN ORDER MODAL ── */}
      {assignDriverModal && (() => {
        const pendingOrders = orders.filter(o => o.status === "nouveau");
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:2000,
            display:"flex",alignItems:"center",justifyContent:"center",padding:20,
            backdropFilter:"blur(6px)"}}
            onClick={e => e.target === e.currentTarget && setAssignDriverModal(null)}>
            <div style={{background:"#0e0e18",border:"1px solid rgba(0,245,255,.2)",borderRadius:14,
              padding:"28px 24px",maxWidth:480,width:"100%",maxHeight:"80vh",
              overflowY:"auto",animation:"fadeUp .2s ease"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",
                    color:"#f0eeff",letterSpacing:".04em"}}>
                    ASSIGNER UNE COMMANDE
                  </div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",
                    color:"#b8ff00",letterSpacing:".1em",marginTop:4}}>
                    🏍️ {assignDriverModal.name || assignDriverModal.uid}
                  </div>
                </div>
                <button onClick={() => setAssignDriverModal(null)}
                  style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                    color:"#5a5470",width:32,height:32,borderRadius:"50%",
                    cursor:"pointer",fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  ✕
                </button>
              </div>

              {pendingOrders.length === 0 ? (
                <div style={{textAlign:"center",padding:"32px 0"}}>
                  <div style={{fontSize:"2rem",marginBottom:10}}>📭</div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",
                    color:"#5a5470",letterSpacing:".1em"}}>
                    Aucune commande en attente
                  </div>
                </div>
              ) : (
                <div style={{display:"grid",gap:10}}>
                  {pendingOrders.map(order => (
                    <div key={order.id} style={{background:"rgba(255,255,255,.03)",
                      border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"14px 16px",
                      display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                          fontSize:".9rem",color:"#f0eeff",marginBottom:3}}>
                          #{order.orderNumber || order.id?.slice(-5).toUpperCase()} — {order.name || "Client"}
                        </div>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",
                          color:"#5a5470",letterSpacing:".06em",
                          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>
                          {order.address || order.phone}
                        </div>
                        <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                          fontSize:".88rem",color:"#b8ff00",marginTop:3}}>
                          {order.total?.toFixed(2)}€
                        </div>
                      </div>
                      <button onClick={async () => {
                        await updateDoc(doc(db, "orders", order.id!), {
                          assignedDriver: assignDriverModal.uid,
                          assignedDriverName: assignDriverModal.name || assignDriverModal.uid,
                          status: "en_cours",
                        });
                        showToast(`Commande #${order.orderNumber || ""} assignée à ${assignDriverModal.name} ✓`);
                        setAssignDriverModal(null);
                      }} style={{background:"#ff2d78",border:"none",color:"#000",
                        padding:"8px 14px",borderRadius:6,fontFamily:"'Rajdhani',sans-serif",
                        fontWeight:700,fontSize:".82rem",letterSpacing:".08em",
                        textTransform:"uppercase" as const,cursor:"pointer",flexShrink:0}}>
                        ASSIGNER
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}

function Field({ label, value, onChange, type="text" }: { label:string; value:string; onChange:(v:string)=>void; type?:string }) {
  return (
    <div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",color:"#7a7490",
        letterSpacing:".1em",marginBottom:8}}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.12)",
          borderRadius:6,padding:"12px 14px",color:"#f0eeff",fontSize:"1rem",
          fontFamily:"'Rajdhani',sans-serif"}} />
    </div>
  );
}

function ProductForm({ prod, cats, onSave, onClose, showToast, settings }: { prod:Product; cats:Category[]; onSave:(p:Product)=>void; onClose:()=>void; showToast:(msg:string,type?:string)=>void; settings:Settings }) {
  const [p, setP] = useState(prod);
  const [uploading, setUploading] = useState(false);
  const [imgSrc, setImgSrc]       = useState("");          // raw file → cropper
  const [crop, setCrop]           = useState({ x: 0, y: 0 });
  const [zoom, setZoom]           = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Fichier invalide — choisis une image", "err"); return; }
    const reader = new FileReader();
    reader.onload = () => { setImgSrc(reader.result as string); setCrop({ x:0,y:0 }); setZoom(1); };
    reader.readAsDataURL(file);
  };

  const confirmCrop = async () => {
    if (!croppedAreaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedImg(imgSrc, croppedAreaPixels);
      const storageRef = ref(storage, `products/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setP(s => ({ ...s, image: url }));
      setImgSrc("");
      showToast("Image uploadée ✓");
    } catch { showToast("Erreur upload image", "err"); }
    setUploading(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(4,2,10,.9)",zIndex:500,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>

      {/* ── CROPPER OVERLAY ── */}
      {imgSrc && (
        <div style={{position:"fixed",inset:0,background:"#04020a",zIndex:600,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0}}>
          {/* Zone de recadrage */}
          <div style={{position:"relative",width:"100%",maxWidth:500,height:400,background:"#000"}}>
            <Cropper
              image={imgSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, p) => setCroppedAreaPixels(p)}
            />
          </div>
          {/* Contrôles */}
          <div style={{background:"#0c0918",width:"100%",maxWidth:500,padding:"18px 24px",
            borderTop:"1px solid rgba(255,45,120,.2)"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:8}}>ZOOM</div>
            <input type="range" min={1} max={3} step={0.05} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{width:"100%",accentColor:"#ff2d78",marginBottom:16}} />
            <div style={{display:"flex",gap:10}}>
              <button onClick={() => setImgSrc("")} type="button"
                style={{flex:1,background:"transparent",border:"1px solid rgba(255,255,255,.1)",
                  color:"#5a5470",borderRadius:4,padding:"11px",fontFamily:"'Rajdhani',sans-serif",
                  fontWeight:700,fontSize:".9rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                ANNULER
              </button>
              <button onClick={confirmCrop} type="button" disabled={uploading}
                style={{flex:2,background:"#ff2d78",color:"#000",border:"none",borderRadius:4,
                  padding:"11px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
                  letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                {uploading ? "UPLOAD..." : "✓ ROGNER & UPLOADER"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{background:"#0c0918",border:"1px solid rgba(255,45,120,.3)",borderRadius:10,
        padding:28,width:"100%",maxWidth:460,animation:"fadeUp .3s both",margin:"20px 0"}}>
        <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#ff2d78",
          marginBottom:22,letterSpacing:".04em"}}>
          {p.id ? "MODIFIER LE PRODUIT" : "NOUVEAU PRODUIT"}
        </div>
        <div style={{display:"grid",gap:14}}>

          {/* IMAGE */}
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:8}}>IMAGE DU PRODUIT</div>
            {p.image ? (
              <div style={{position:"relative"}}>
                <img src={p.image} alt="Preview" style={{width:"100%",height:180,objectFit:"cover",borderRadius:6}} />
                <button onClick={() => setP(s => ({...s, image: ""}))} type="button"
                  style={{position:"absolute",top:8,right:8,background:"rgba(255,45,120,.9)",
                    color:"#fff",border:"none",borderRadius:3,padding:"6px 12px",
                    fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",cursor:"pointer"}}>
                  CHANGER
                </button>
              </div>
            ) : (
              <label style={{display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",gap:8,width:"100%",height:180,
                border:"2px dashed rgba(255,45,120,.3)",borderRadius:6,
                cursor:"pointer",background:"#080514"}}>
                <div style={{fontSize:"2.5rem"}}>📷</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470",textAlign:"center"}}>
                  CLIQUE POUR CHOISIR<br/>
                  <span style={{fontSize:".8rem",opacity:.6}}>tu pourras rogner avant l'upload</span>
                </div>
                <input type="file" accept="image/*" onChange={onFileChange} style={{display:"none"}} />
              </label>
            )}
          </div>

          <Field label="NOM" value={p.name} onChange={v => setP(s=>({...s,name:v}))} />

          {/* DESCRIPTION + bouton IA */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",color:"#7a7490",letterSpacing:".1em"}}>DESCRIPTION</div>
              <button
                type="button"
                disabled={settings.aiDescEnabled === false}
                title={settings.aiDescEnabled === false ? "Désactivé dans Paramètres → IA" : undefined}
                onClick={async () => {
                  if (!p.name) { showToast("Entre le nom du produit d'abord", "err"); return; }
                  try {
                    const res = await fetch("/api/ai", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "description", name: p.name, cat: p.cat, price: p.price }),
                    });
                    const json = await res.json();
                    if (json.ok) setP(s => ({ ...s, desc: json.result }));
                    else showToast("Erreur IA", "err");
                  } catch { showToast("Erreur IA", "err"); }
                }}
                style={{background:"rgba(184,255,0,.12)",border:"1px solid rgba(184,255,0,.35)",color:"#b8ff00",
                  padding:"3px 10px",borderRadius:4,cursor:"pointer",fontFamily:"'Share Tech Mono',monospace",
                  fontSize:".72rem",letterSpacing:".06em"}}>
                ✨ IA
              </button>
            </div>
            <input
              type="text"
              value={p.desc}
              onChange={e => setP(s => ({ ...s, desc: e.target.value }))}
              placeholder="ou génère avec ✨ IA"
              style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.12)",
                borderRadius:6,padding:"12px 14px",color:"#f0eeff",fontSize:"1rem",
                fontFamily:"'Rajdhani',sans-serif"}}
            />
          </div>
          <Field label="PRIX (€)" value={String(p.price)} type="number" onChange={v => setP(s=>({...s,price:Number(v)}))} />
          <Field label="STOCK INITIAL" value={String(p.stock)} type="number" onChange={v => setP(s=>({...s,stock:Number(v)}))} />
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",color:"#7a7490",
              letterSpacing:".1em",marginBottom:8}}>CATÉGORIE</div>
            <select value={p.cat} onChange={e => setP(s=>({...s,cat:e.target.value}))}
              style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.12)",
                borderRadius:6,padding:"12px 14px",color:"#f0eeff",fontSize:"1rem"}}>
              {cats.length > 0
                ? cats.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)
                : (
                  <>
                    <option value="biere">🍺 Bière</option>
                    <option value="cocktail">🍹 Cocktail</option>
                    <option value="spiritueux">🥃 Spiritueux</option>
                    <option value="snack">🍟 Snack</option>
                  </>
                )
              }
            </select>
          </div>
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".85rem",color:"#7a7490",
              letterSpacing:".1em",marginBottom:8}}>BADGE</div>
            <select value={p.badge} onChange={e => setP(s=>({...s,badge:e.target.value}))}
              style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.12)",
                borderRadius:6,padding:"12px 14px",color:"#f0eeff",fontSize:"1rem"}}>
              <option value="">Aucun</option>
              <option value="BEST">⭐ BEST SELLER (auto)</option>
              <option value="HOT">🔥 HOT</option>
              <option value="NEW">✨ NEW</option>
              <option value="COOL">❄️ COOL</option>
            </select>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:22}}>
          <button onClick={onClose} type="button" style={{flex:1,background:"transparent",
            border:"1px solid rgba(255,255,255,.1)",color:"#5a5470",borderRadius:4,
            padding:"11px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
            letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
            ANNULER
          </button>
          <button onClick={() => onSave(p)} type="button" style={{flex:2,background:"#ff2d78",color:"#000",
            border:"none",borderRadius:4,padding:"11px",fontFamily:"'Rajdhani',sans-serif",
            fontWeight:700,fontSize:".9rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
            SAUVEGARDER
          </button>
        </div>
      </div>
    </div>
  );
}

const GRADIENT_PRESETS = [
  { label:"ROSE",   color:"#ff2d78", value:"linear-gradient(135deg,rgba(255,45,120,.88) 0%,rgba(80,0,40,.92) 100%)" },
  { label:"CYAN",   color:"#00b4dc", value:"linear-gradient(135deg,rgba(0,180,220,.85) 0%,rgba(0,40,80,.92) 100%)" },
  { label:"VIOLET", color:"#8c00ff", value:"linear-gradient(135deg,rgba(140,0,255,.85) 0%,rgba(30,0,80,.92) 100%)" },
  { label:"VERT",   color:"#3cc800", value:"linear-gradient(135deg,rgba(60,200,0,.82) 0%,rgba(10,50,0,.92) 100%)" },
  { label:"ORANGE", color:"#ff8c00", value:"linear-gradient(135deg,rgba(255,140,0,.88) 0%,rgba(100,40,0,.92) 100%)" },
  { label:"NUIT",   color:"#140a3c", value:"linear-gradient(135deg,rgba(20,10,60,.96) 0%,rgba(4,2,10,.98) 100%)" },
];

function BannerForm({ banner, onSave, onClose, showToast, settings }: { banner:Banner; onSave:(b:Banner)=>void; onClose:()=>void; showToast:(msg:string,type?:string)=>void; settings:Settings }) {
  const [b, setB] = useState<Banner>({ ...banner, brightness: banner.brightness ?? 0.28 });
  const [uploading, setUploading] = useState(false);
  const [imgSrc, setImgSrc]       = useState("");
  const [crop, setCrop]           = useState({ x: 0, y: 0 });
  const [zoom, setZoom]           = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [cropAspect, setCropAspect] = useState<number>(16/9);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Fichier invalide", "err"); return; }
    const reader = new FileReader();
    reader.onload = () => { setImgSrc(reader.result as string); setCrop({ x:0,y:0 }); setZoom(1); };
    reader.readAsDataURL(file);
  };

  const confirmCrop = async () => {
    if (!croppedAreaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedImg(imgSrc, croppedAreaPixels);
      const storageRef = ref(storage, `banners/${Date.now()}.jpg`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      setB(s => ({ ...s, image: url }));
      setImgSrc("");
      showToast("Image uploadée ✓");
    } catch { showToast("Erreur upload", "err"); }
    setUploading(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(4,2,10,.92)",zIndex:500,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>

      {/* ── CROPPER OVERLAY ── */}
      {imgSrc && (
        <div style={{position:"fixed",inset:0,background:"#04020a",zIndex:600,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{position:"relative",width:"100%",maxWidth:600,height:340,background:"#000"}}>
            <Cropper
              image={imgSrc}
              crop={crop}
              zoom={zoom}
              {...(cropAspect > 0 ? { aspect: cropAspect } : {})}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, p) => setCroppedAreaPixels(p)}
            />
          </div>
          <div style={{background:"#0c0918",width:"100%",maxWidth:600,padding:"18px 24px",
            borderTop:"1px solid rgba(255,45,120,.2)"}}>
            {/* Ratio selector */}
            <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
              {([
                { label:"16:9",  val: 16/9  },
                { label:"21:9",  val: 21/9  },
                { label:"4:3",   val: 4/3   },
                { label:"1:1",   val: 1     },
                { label:"LIBRE", val: 0     },
              ] as const).map(r => (
                <button key={r.label} type="button" onClick={() => setCropAspect(r.val)}
                  style={{background: cropAspect===r.val ? "rgba(255,45,120,.15)" : "transparent",
                    border:`1px solid ${cropAspect===r.val ? "#ff2d78" : "rgba(255,255,255,.1)"}`,
                    color: cropAspect===r.val ? "#ff2d78" : "#5a5470",
                    padding:"5px 14px",borderRadius:3,fontFamily:"'Share Tech Mono',monospace",
                    fontSize:".88rem",cursor:"pointer",letterSpacing:".06em"}}>
                  {r.label}
                </button>
              ))}
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:8}}>ZOOM</div>
            <input type="range" min={1} max={3} step={0.05} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{width:"100%",accentColor:"#ff2d78",marginBottom:16}} />
            <div style={{display:"flex",gap:10}}>
              <button onClick={() => setImgSrc("")} type="button"
                style={{flex:1,background:"transparent",border:"1px solid rgba(255,255,255,.1)",
                  color:"#5a5470",borderRadius:4,padding:"11px",fontFamily:"'Rajdhani',sans-serif",
                  fontWeight:700,fontSize:".9rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                ANNULER
              </button>
              <button onClick={confirmCrop} type="button" disabled={uploading}
                style={{flex:2,background:"#ff2d78",color:"#000",border:"none",borderRadius:4,
                  padding:"11px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
                  letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                {uploading ? "UPLOAD..." : "✓ ROGNER & UPLOADER"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{background:"#0c0918",border:"1px solid rgba(255,45,120,.3)",borderRadius:10,
        padding:28,width:"100%",maxWidth:500,animation:"fadeUp .3s both",margin:"20px 0"}}>
        <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#ff2d78",
          marginBottom:22,letterSpacing:".04em"}}>
          {b.id ? "MODIFIER LA BANNIÈRE" : "NOUVELLE BANNIÈRE"}
        </div>

        {/* Aperçu live */}
        <div style={{height:90,borderRadius:6,overflow:"hidden",marginBottom:18,position:"relative",
          background: b.gradient || GRADIENT_PRESETS[0].value}}>
          {b.image && (
            <div style={{position:"absolute",inset:0,backgroundImage:`url(${b.image})`,
              backgroundSize:"cover",backgroundPosition:"center",opacity: b.brightness ?? 0.28}} />
          )}
          <div style={{position:"absolute",inset:0,padding:"12px 16px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",color:"#00f5ff",letterSpacing:".15em",marginBottom:4}}>
              &gt; {b.subtitle || "tagline ici"}
            </div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#fff",letterSpacing:".03em"}}>
              {b.title || "TITRE DE LA BANNIÈRE"}
            </div>
          </div>
        </div>

        <div style={{display:"grid",gap:14}}>
          {/* Gradient presets */}
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:10}}>COULEUR DE FOND</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {GRADIENT_PRESETS.map(g => (
                <button key={g.label} type="button" onClick={() => setB(s => ({...s, gradient: g.value}))}
                  title={g.label}
                  style={{width:36,height:36,borderRadius:4,border: b.gradient===g.value ? "3px solid #fff" : "2px solid transparent",
                    background: g.value,cursor:"pointer",flexShrink:0,
                    boxShadow: b.gradient===g.value ? `0 0 10px ${g.color}` : "none",
                    transition:"all .2s"}} />
              ))}
            </div>
          </div>

          {/* Image de fond */}
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:8}}>IMAGE DE FOND (optionnel)</div>
            {b.image ? (
              <>
                <div style={{position:"relative",height:80,borderRadius:4,overflow:"hidden",marginBottom:10}}>
                  <img src={b.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover",
                    opacity: b.brightness ?? 0.28, filter:`brightness(${(b.brightness??0.28)*1.5})`}} />
                  <div style={{position:"absolute",top:6,right:6,display:"flex",gap:6}}>
                    <button onClick={() => fileInputRef.current?.click()} type="button"
                      style={{background:"rgba(0,245,255,.85)",color:"#000",border:"none",borderRadius:3,
                        padding:"4px 10px",fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",cursor:"pointer"}}>
                      ✂ RECADRER
                    </button>
                    <button onClick={() => setB(s => ({...s, image: ""}))} type="button"
                      style={{background:"rgba(255,45,120,.9)",color:"#fff",border:"none",borderRadius:3,
                        padding:"4px 10px",fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",cursor:"pointer"}}>
                      ✕
                    </button>
                  </div>
                </div>
                {/* Slider luminosité */}
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",letterSpacing:".1em"}}>
                      LUMINOSITÉ DE L'IMAGE
                    </span>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#00f5ff"}}>
                      {Math.round((b.brightness ?? 0.28) * 100)}%
                    </span>
                  </div>
                  <input type="range" min={0.05} max={1} step={0.05}
                    value={b.brightness ?? 0.28}
                    onChange={e => setB(s => ({...s, brightness: Number(e.target.value)}))}
                    style={{width:"100%",accentColor:"#00f5ff"}} />
                  <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'Share Tech Mono',monospace",
                    fontSize:".58rem",color:"#5a5470",marginTop:2}}>
                    <span>SOMBRE</span><span>LUMINEUX</span>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{display:"none"}} />
              </>
            ) : (
              <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                height:60,border:"2px dashed rgba(255,45,120,.25)",borderRadius:4,
                cursor:"pointer",background:"#080514"}}>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470"}}>
                  📷 CHOISIR &amp; ROGNER
                </span>
                <input type="file" accept="image/*" onChange={onFileChange} style={{display:"none"}} />
              </label>
            )}
          </div>

          {/* ── Génération IA ── */}
          {settings.aiBannerEnabled !== false && (
            <BannerAIGenerator onApply={(vals) => setB(s => ({...s, ...vals}))} showToast={showToast} />
          )}

          <Field label="TITRE (grand texte)" value={b.title} onChange={v => setB(s=>({...s,title:v}))} />
          <Field label="TAGLINE (petit texte au-dessus)" value={b.subtitle} onChange={v => setB(s=>({...s,subtitle:v}))} />
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:8}}>DESCRIPTION (optionnel)</div>
            <textarea value={b.desc} onChange={e => setB(s=>({...s,desc:e.target.value}))} rows={2}
              style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
                borderRadius:4,padding:"10px 14px",color:"#f0eeff",fontSize:".85rem",
                fontFamily:"'Rajdhani',sans-serif",resize:"vertical"}} />
          </div>
          <Field label="TEXTE DU BOUTON (ex: COMMANDER →)" value={b.cta} onChange={v => setB(s=>({...s,cta:v}))} />
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:8}}>LIEN DU BOUTON</div>
            <select value={b.link} onChange={e => setB(s=>({...s,link:e.target.value}))}
              style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
                borderRadius:4,padding:"10px 14px",color:"#f0eeff",fontSize:".9rem"}}>
              <option value="catalogue">→ Voir le catalogue</option>
              <option value="packs">→ Voir les packs soirée</option>
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="ORDRE (0 = premier)" value={String(b.order ?? 0)} type="number" onChange={v => setB(s=>({...s,order:Number(v)}))} />
            <div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
                letterSpacing:".15em",marginBottom:8}}>STATUT</div>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:4,padding:"10px 14px"}}>
                <input type="checkbox" checked={b.active} onChange={e => setB(s=>({...s,active:e.target.checked}))}
                  style={{width:16,height:16,accentColor:"#b8ff00"}} />
                <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
                  color: b.active ? "#b8ff00" : "#5a5470",letterSpacing:".05em"}}>
                  {b.active ? "ACTIVE" : "INACTIVE"}
                </span>
              </label>
            </div>
          </div>
        </div>

        <div style={{display:"flex",gap:10,marginTop:22}}>
          <button onClick={onClose} type="button" style={{flex:1,background:"transparent",
            border:"1px solid rgba(255,255,255,.1)",color:"#5a5470",borderRadius:4,
            padding:"11px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
            letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
            ANNULER
          </button>
          <button onClick={() => onSave(b)} type="button" style={{flex:2,background:"#ff2d78",color:"#000",
            border:"none",borderRadius:4,padding:"11px",fontFamily:"'Rajdhani',sans-serif",
            fontWeight:700,fontSize:".9rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
            SAUVEGARDER
          </button>
        </div>
      </div>
    </div>
  );
}

function PackForm({ pack, onSave, onClose }: { pack:Pack; onSave:(p:Pack)=>void; onClose:()=>void }) {
  const [p, setP] = useState(pack);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(4,2,10,.9)",zIndex:500,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#0c0918",border:"1px solid rgba(255,45,120,.3)",borderRadius:10,
        padding:28,width:"100%",maxWidth:460,animation:"fadeUp .3s both"}}>
        <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#ff2d78",
          marginBottom:22,letterSpacing:".04em"}}>
          {p.id ? "MODIFIER LE PACK" : "NOUVEAU PACK"}
        </div>
        <div style={{display:"grid",gap:14}}>
          <Field label="NOM" value={p.name} onChange={v => setP(s=>({...s,name:v}))} />
          <Field label="TAGLINE (ex: // on lance la soirée)" value={p.tag} onChange={v => setP(s=>({...s,tag:v}))} />
          <Field label="EMOJI" value={p.emoji} onChange={v => setP(s=>({...s,emoji:v}))} />
          <Field label="PRIX (€)" value={String(p.price)} type="number" onChange={v => setP(s=>({...s,price:Number(v)}))} />
          <Field label="VALEUR RÉELLE (€)" value={String(p.real)} type="number" onChange={v => setP(s=>({...s,real:Number(v)}))} />
          <div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",
              letterSpacing:".15em",marginBottom:8}}>CONTENU (1 article par ligne)</div>
            <textarea value={p.items} onChange={e => setP(s=>({...s,items:e.target.value}))} rows={4}
              style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
                borderRadius:4,padding:"10px 14px",color:"#f0eeff",fontSize:".85rem",
                fontFamily:"'Share Tech Mono',monospace",resize:"vertical"}} />
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <input type="checkbox" checked={p.star} onChange={e => setP(s=>({...s,star:e.target.checked}))}
              style={{width:16,height:16,accentColor:"#ff2d78"}} />
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",
              color:"#f0eeff",letterSpacing:".1em"}}>⭐ MARQUER COMME POPULAIRE</span>
          </label>
        </div>
        <div style={{display:"flex",gap:10,marginTop:22}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",
            border:"1px solid rgba(255,255,255,.1)",color:"#5a5470",borderRadius:4,
            padding:"11px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".9rem",
            letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
            ANNULER
          </button>
          <button onClick={() => onSave(p)} style={{flex:2,background:"#ff2d78",color:"#000",
            border:"none",borderRadius:4,padding:"11px",fontFamily:"'Rajdhani',sans-serif",
            fontWeight:700,fontSize:".9rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
            SAUVEGARDER
          </button>
        </div>
      </div>
    </div>
  );
}


function BannerAIGenerator({ onApply, showToast }: { onApply:(v:{title?:string;subtitle?:string;desc?:string;cta?:string})=>void; showToast:(m:string,t?:string)=>void }) {
  const [promo, setPromo]     = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div style={{background:"rgba(184,255,0,.04)",border:"1px solid rgba(184,255,0,.2)",borderRadius:8,padding:"12px 16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#b8ff00",letterSpacing:".12em"}}>
          ✨ GÉNÉRATION IA — titre, tagline, description, bouton
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "banner", promo }),
              });
              const json = await res.json();
              if (json.ok && typeof json.result === "object") {
                onApply(json.result);
                showToast("Textes IA générés ✓");
              } else { showToast("Erreur IA", "err"); }
            } catch { showToast("Erreur IA", "err"); }
            setLoading(false);
          }}
          style={{background:"rgba(184,255,0,.15)",border:"1px solid rgba(184,255,0,.35)",color:"#b8ff00",
            padding:"4px 12px",borderRadius:4,cursor:loading?"not-allowed":"pointer",
            fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".06em",
            opacity:loading?0.5:1}}>
          {loading ? "..." : "✨ GÉNÉRER"}
        </button>
      </div>
      <input
        type="text"
        value={promo}
        onChange={e => setPromo(e.target.value)}
        placeholder="Contexte promo (ex: Soirée Saint-Valentin, -20% alcools)…"
        style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
          borderRadius:4,padding:"8px 12px",color:"#f0eeff",fontSize:".85rem",
          fontFamily:"'Rajdhani',sans-serif",boxSizing:"border-box"}}
      />
    </div>
  );
}
