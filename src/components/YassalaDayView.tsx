"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { haversineKm, SHOP_LAT, SHOP_LNG } from "@/utils/pricing";
import { DEFAULT_DELIVERY_CONFIG, computeDeliveryFee, type DeliveryConfig, type DeliveryFeeResult } from "@/types/delivery";
import { computeETA, formatETA } from "@/utils/estimateDelivery";
import UpsellCarousel from "@/components/UpsellCarousel";
import SmartThresholdSuggestions from "@/components/SmartThresholdSuggestions";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, addDoc, runTransaction, getDocs, getDoc, query, where, setDoc, updateDoc, increment } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, updateProfile, RecaptchaVerifier, signInWithPhoneNumber, sendPasswordResetEmail, type ConfirmationResult } from "firebase/auth";
import type { User } from "firebase/auth";
import FlashDealBanner from "@/components/FlashDealBanner";
import { isPromoActive, computePromoDiscount, getProductPromoPrice, type Promotion } from "@/utils/promoEngine";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const STRIPE_APPEARANCE_DAY = {
  theme: "stripe" as const,
  variables: {
    colorPrimary:    "#FF2D7A",
    colorBackground: "#F7F7F8",
    colorText:       "#111827",
    colorDanger:     "#FF2D7A",
    fontFamily:      "'Inter', system-ui, sans-serif",
    borderRadius:    "12px",
  },
  rules: {
    ".Input": {
      border:     "1px solid #E5E7EB",
      padding:    "14px",
      fontSize:   ".9rem",
      background: "#FFFFFF",
      color:      "#111827",
    },
    ".Label": {
      color:         "#6B7280",
      fontSize:      ".75rem",
      fontFamily:    "'Inter', system-ui, sans-serif",
      fontWeight:    "500",
      letterSpacing: ".02em",
    },
    ".Tab": { border: "1px solid #E5E7EB", background: "#F7F7F8" },
    ".Tab--selected": { border: "1px solid #FF2D7A", background: "rgba(255,45,122,.06)" },
  },
} as const;

function CheckoutPaymentFormDay({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [error,      setError]      = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!stripe || !elements) return;
    setConfirming(true); setError(null);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/succes` },
      redirect: "if_required",
    });
    if (stripeError) { setError(stripeError.message || "Erreur lors du paiement."); setConfirming(false); }
    else { onSuccess(); }
  };

  return (
    <div>
      <div style={{ fontFamily:"'Inter',system-ui,sans-serif", fontSize:".68rem", color:"#6B7280", letterSpacing:".1em", marginBottom:12, textTransform:"uppercase" }}>
        // DÉTAILS DE PAIEMENT
      </div>
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(255,45,120,.08)", border:"1px solid rgba(255,45,120,.3)", borderRadius:4, fontFamily:"'Inter',system-ui,sans-serif", fontSize:".75rem", color:"#ff2d78" }}>
          ⚠️ {error}
        </div>
      )}
      <button onClick={handleConfirm} disabled={confirming || !stripe}
        style={{ width:"100%", marginTop:16, background: confirming ? "#6B7280" : "#ff2d78", color:"#fff", border:"none", borderRadius:4, padding:"16px", fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:"1rem", letterSpacing:".1em", textTransform:"uppercase", cursor: confirming ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        {confirming ? "⏳ CONFIRMATION EN COURS..." : "🔒 CONFIRMER LE PAIEMENT"}
      </button>
      <button onClick={onCancel} disabled={confirming}
        style={{ width:"100%", marginTop:10, background:"transparent", border:"1px solid rgba(0,0,0,.12)", color:"#6B7280", borderRadius:4, padding:"12px", fontFamily:"'Inter',system-ui,sans-serif", fontSize:".75rem", cursor: confirming ? "not-allowed" : "pointer", letterSpacing:".05em" }}>
        ← MODIFIER MA COMMANDE
      </button>
    </div>
  );
}

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16"
};

const app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db   = getFirestore(app);
const auth = getAuth(app);

const translateAuthError = (code: string) => {
  switch(code) {
    case "auth/email-already-in-use":    return "Cet email est déjà utilisé.";
    case "auth/wrong-password":          return "Mot de passe incorrect.";
    case "auth/invalid-credential":      return "Email ou mot de passe incorrect.";
    case "auth/user-not-found":          return "Aucun compte avec cet email.";
    case "auth/weak-password":           return "Mot de passe trop court (6 caractères min).";
    case "auth/invalid-email":           return "Adresse email invalide.";
    case "auth/popup-closed-by-user":    return "Connexion annulée.";
    case "auth/cancelled-popup-request": return "";
    case "auth/popup-blocked":           return "Popup bloqué par le navigateur. Réessaie.";
    case "auth/unauthorized-domain":     return "Domaine non autorisé dans Firebase. Contacte le support.";
    case "auth/network-request-failed":  return "Erreur réseau. Vérifie ta connexion.";
    case "auth/too-many-requests":       return "Trop de tentatives. Réessaie dans quelques minutes.";
    default: return "Une erreur est survenue, réessaie.";
  }
};

type Product = { id: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; isActive?: boolean; };
type Category = { id?: string; key: string; label: string; emoji: string; order: number; };
type Pack = { id: string; name: string; tag: string; emoji: string; items: string; price: number; real: number; star: boolean; };
type Settings = { shopOpen: boolean; deliveryMin: number; freeDelivery: number; hours: string; zone: string; whatsapp: string; paymentOnlineEnabled: boolean; paymentCashEnabled: boolean; fulfillmentDeliveryEnabled: boolean; fulfillmentPickupEnabled: boolean; aiRecommendEnabled: boolean; aiPredictEnabled: boolean; aiAnomalyEnabled: boolean; aiStockEnabled: boolean; aiCouponEnabled: boolean; aiRouteEnabled: boolean; };
type CartItem = { id: string; name: string; price: number; qty: number; note?: string; };
type Supplement = { id: string; name: string; price: number; etablissementId?: string; isActive?: boolean; emoji?: string; pricePetite?: number; priceGrande?: number; priceFamiliale?: number; };
type Banner   = { id: string; title: string; subtitle: string; desc: string; cta: string; link: string; gradient: string; image: string; brightness?: number; active: boolean; order: number; };
type Etablissement = { id: string; name: string; slug?: string; description?: string; address?: string; phone?: string; logoUrl?: string; coverUrl?: string; openHours?: string; isActive: boolean; isOpen?: boolean; emoji?: string; bgColor?: string; category?: string; isComingSoon?: boolean; deliveryMin?: number; deliveryMax?: number; deliveryFee?: number; rating?: number; reviewCount?: number; };

const DEFAULT_DAY_CATS: Category[] = [
  { key: "boisson", label: "🥤 BOISSONS",   emoji: "🥤", order: 1 },
  { key: "snack",   label: "🍟 SNACKS",     emoji: "🍟", order: 2 },
  { key: "repas",   label: "🍱 REPAS",      emoji: "🍱", order: 3 },
  { key: "dessert", label: "🍰 DESSERTS",   emoji: "🍰", order: 4 },
];

const defaultSettings: Settings = {
  shopOpen: true, deliveryMin: 15, freeDelivery: 50,
  hours: "07:00–21:00", zone: "Cayenne & alentours", whatsapp: "+594 XXX XXX",
  paymentOnlineEnabled: true, paymentCashEnabled: true,
  fulfillmentDeliveryEnabled: true, fulfillmentPickupEnabled: true,
  aiRecommendEnabled: true,
  aiPredictEnabled: true, aiAnomalyEnabled: true,
  aiStockEnabled: true, aiCouponEnabled: true, aiRouteEnabled: true,
};

// Countdown vers 21h (ouverture Night)
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
    const id = setInterval(() => setSeconds(getSecondsLeft()), 1000);
    return () => clearInterval(id);
  }, []);
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = seconds % 60;
  return {
    h: String(h).padStart(2,"0"),
    m: String(m).padStart(2,"0"),
    s: String(s).padStart(2,"0"),
    totalSeconds: seconds,
    label: `${String(h).padStart(2,"0")}h${String(m).padStart(2,"0")}m${String(s).padStart(2,"0")}s`,
    done: seconds === 0,
  };
}

function parseSizesEtab(desc: string): { label: string; price: number }[] | null {
  const idx = desc.indexOf(' • ');
  if (idx === -1) return null;
  const parts = desc.slice(idx + 3).split(/\s*[·•]\s*/);
  const sizes = parts.map(p => {
    const m = p.trim().match(/^(.+?)\s+([\d]+(?:[.,]\d{1,2})?)\s*€/);
    return m ? { label: m[1].trim(), price: parseFloat(m[2].replace(',', '.')) } : null;
  }).filter(Boolean) as { label: string; price: number }[];
  return sizes.length > 1 ? sizes : null;
}
function getDisplayDescEtab(desc: string) {
  const idx = desc.indexOf(' • ');
  return idx === -1 ? desc : desc.slice(0, idx);
}
function getBaseProductId(id: string) {
  const m = id.match(/^(.+)_(Petite|Grande|Familiale)(?:_half_.+)?$/);
  return m ? m[1] : id;
}
// Prix des suppléments selon la taille de pizza choisie
// Crevettes : 4€/5€/6€ — autres : 2€/3€/4€
function getSuppPrice(s: Supplement, sizeLabel?: string | null): number {
  if (!sizeLabel) return s.price;
  const isCrevettes = /crevett/i.test(s.name);
  if (s.pricePetite !== undefined || s.priceGrande !== undefined || s.priceFamiliale !== undefined) {
    if (sizeLabel === "Petite")    return s.pricePetite    ?? s.price;
    if (sizeLabel === "Grande")    return s.priceGrande    ?? s.price;
    if (sizeLabel === "Familiale") return s.priceFamiliale ?? s.price;
  }
  if (sizeLabel === "Petite")    return isCrevettes ? 4 : 2;
  if (sizeLabel === "Grande")    return isCrevettes ? 5 : 3;
  if (sizeLabel === "Familiale") return isCrevettes ? 6 : 4;
  return s.price;
}

export default function YassalaDayView() {
  const countdown = useCountdownToNight();

  // ── STATE ──
  const [clock, setClock]         = useState("--:--");
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [dbCats, setDbCats]       = useState<Category[]>([]);
  const [toast, setToast]         = useState({ msg: "", show: false });
  const [products, setProducts]   = useState<Product[]>([]);
  const [packs, setPacks]         = useState<Pack[]>([]);
  const [settings, setSettings]   = useState<Settings>(defaultSettings);
  const [loading, setLoading]     = useState(true);
  const [showCart, setShowCart]   = useState(false);
  const [orderForm, setOrderForm] = useState({ name:"", phone:"", address:"", email:"", lat:0, lng:0 });
  const [addressSuggestions, setAddressSuggestions] = useState<{display:string;lat:number;lng:number}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const shopsScrollRef     = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const addressTimerRef    = useRef<NodeJS.Timeout | null>(null);
  const trackedImpressionRef = useRef<string | null>(null);
  const phoneRecaptchaRef  = useRef<any>(null);
  const cashRecaptchaRef   = useRef<any>(null);
  const cashSmsVerifiedRef = useRef(false);
  const submitAttemptsRef  = useRef<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'online'>('cash');
  const [banners, setBanners]       = useState<Banner[]>([]);
  const [bannerIdx, setBannerIdx]   = useState(0);
  const [bannerPaused, setBannerPaused] = useState(false);
  const [cartReady, setCartReady]   = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon]           = useState<{code:string;type:"percent"|"fixed";value:number}|null>(null);
  const [couponError, setCouponError] = useState("");
  const [orderConfirmId, setOrderConfirmId]   = useState<string|null>(null);
  const [orderConfirmNum, setOrderConfirmNum] = useState<number|null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product|null>(null);
  const [aiRecs, setAiRecs]                   = useState<{name:string;why:string}[]>([]);
  const [aiRecsLoading, setAiRecsLoading]     = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [historyOrders, setHistoryOrders] = useState<any[]|null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // AUTH
  const [currentUser, setCurrentUser]     = useState<User|null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode]           = useState<"login"|"signup">("login");
  const [authName, setAuthName]           = useState("");
  const [authEmail, setAuthEmail]         = useState("");
  const [authPassword, setAuthPassword]   = useState("");
  const [authError, setAuthError]         = useState("");
  const [authLoading, setAuthLoading]     = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail]               = useState("");
  const [forgotLoading, setForgotLoading]           = useState(false);
  const [forgotSuccess, setForgotSuccess]           = useState(false);
  const [forgotError, setForgotError]               = useState("");
  const [phoneAuthStep, setPhoneAuthStep] = useState<'input'|'verify'>('input');
  const [phoneInput, setPhoneInput]       = useState('');
  const [phoneAuthCode, setPhoneAuthCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult|null>(null);
  const [phoneAuthLoading, setPhoneAuthLoading]   = useState(false);
  const [phoneAuthError, setPhoneAuthError]       = useState('');
  const [phoneCountry, setPhoneCountry]           = useState('+594');
  const [showSmsVerify, setShowSmsVerify]         = useState(false);
  const [cashSmsStep, setCashSmsStep]             = useState<'send'|'verify'>('send');
  const [cashSmsCode, setCashSmsCode]             = useState('');
  const [cashSmsConfirmation, setCashSmsConfirmation] = useState<ConfirmationResult|null>(null);
  const [cashSmsLoading, setCashSmsLoading]       = useState(false);
  const [cashSmsError, setCashSmsError]           = useState('');
  const [lastAddedId, setLastAddedId]     = useState<string|null>(null);
  const [sizePickerProd, setSizePickerProd] = useState<any>(null);
  const [supplements, setSupplements]     = useState<Supplement[]>([]);
  const [sizePickerStep, setSizePickerStep] = useState<'size'|'extras'>('size');
  const [sizePickerChosenSize, setSizePickerChosenSize] = useState<{label:string;price:number}|null>(null);
  const [sizePickerSelectedSupps, setSizePickerSelectedSupps] = useState<Supplement[]>([]);
  const [sizePickerNote, setSizePickerNote] = useState('');
  const [halfHalfMode, setHalfHalfMode]   = useState(false);
  const [halfHalfProd2, setHalfHalfProd2] = useState<any>(null);
  const [likes, setLikes]                 = useState<Set<string>>(new Set());
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [driverForm, setDriverForm]         = useState({name:"",phone:"",email:"",zone:"",vehicle:"moto",message:""});
  const [driverSubmitting, setDriverSubmitting] = useState(false);
  const [driverSuccess, setDriverSuccess]       = useState(false);
  // FULFILLMENT (sans relay pour Day)
  const [fulfillmentType, setFulfillmentType] = useState<'delivery'|'pickup'>('delivery');
  const [pickupTimeMode, setPickupTimeMode]   = useState<'asap'|'scheduled'>('asap');
  const [pickupTimeValue, setPickupTimeValue] = useState<string>('');
  const [lastConfirmPickup, setLastConfirmPickup] = useState<{type:'stock';snapshot:any;time:string|undefined}|null>(null);
  // ÉTABLISSEMENTS
  const [etablissements, setEtablissements] = useState<Etablissement[]>([]);
  const [selectedEtab, setSelectedEtab]     = useState<Etablissement|null>(null);
  const [etabSearch, setEtabSearch]         = useState("");
  // DELIVERY PRICING
  const [distanceKm, setDistanceKm]       = useState(0);
  const [deliveryStats, setDeliveryStats] = useState({ activeOrders:0, availableDrivers:1 });
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY_CONFIG);
  // STRIPE
  const [stripeClientSecret, setStripeClientSecret] = useState<string|null>(null);
  // FLASH DEALS
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  // Sync fulfillment/payment avec settings
  useEffect(() => {
    const deliveryOk = settings.fulfillmentDeliveryEnabled !== false;
    const pickupOk   = settings.fulfillmentPickupEnabled   !== false;
    if (!deliveryOk && pickupOk)   setFulfillmentType('pickup');
    if (!pickupOk   && deliveryOk) setFulfillmentType('delivery');
    const onlineOk = settings.paymentOnlineEnabled !== false;
    const cashOk   = settings.paymentCashEnabled   !== false;
    if (!onlineOk && cashOk)   setPaymentMethod('cash');
    if (!cashOk   && onlineOk) setPaymentMethod('online');
  }, [settings.fulfillmentDeliveryEnabled, settings.fulfillmentPickupEnabled,
      settings.paymentOnlineEnabled, settings.paymentCashEnabled]);

  useEffect(() => {
    if (orderForm.lat && orderForm.lng) setDistanceKm(haversineKm(SHOP_LAT, SHOP_LNG, orderForm.lat, orderForm.lng));
    else setDistanceKm(0);
  }, [orderForm.lat, orderForm.lng]);

  useEffect(() => {
    if (!showCart || fulfillmentType !== 'delivery') return;
    fetch('/api/delivery-stats').then(r => r.json()).then(data => setDeliveryStats(data)).catch(() => {});
  }, [showCart, fulfillmentType]);

  useEffect(() => {
    if (!showCart || fulfillmentType !== 'delivery') return;
    const id = setInterval(() => {
      fetch('/api/delivery-stats').then(r => r.json()).then(data => setDeliveryStats(data)).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [showCart, fulfillmentType]);

  const toggleLike = (id: string) => {
    setLikes(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      try { localStorage.setItem("yassala_day_likes", JSON.stringify([...n])); } catch {}
      return n;
    });
  };

  const etabCats = selectedEtab
    ? (() => {
        const withId = dbCats.filter((c: any) => c.etablissementId === selectedEtab.id);
        if (withId.length > 0) return withId;
        const withoutId = dbCats.filter((c: any) => !c.etablissementId);
        return withoutId.length > 0 ? withoutId : dbCats;
      })()
    : (dbCats.length > 0 ? dbCats : DEFAULT_DAY_CATS);
  const cats = [
    { key:"all", label:"TOUT", emoji:"", order:0 },
    ...etabCats,
  ];

  // LOAD DATA — collections Day
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "day_products"), snap => {
      setProducts(snap.docs.map(d => ({ id:d.id, ...d.data() } as Product)));
      setLoading(false);
    });
    const unsubPacks = onSnapshot(collection(db, "day_packs"), snap => {
      setPacks(snap.docs.map(d => ({ id:d.id, ...d.data() } as Pack)));
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "main"), snap => {
      if (snap.exists()) setSettings(snap.data() as Settings);
    });
    const unsubDeliveryConfig = onSnapshot(doc(db, "settings", "delivery"), snap => {
      if (snap.exists()) setDeliveryConfig({ ...DEFAULT_DELIVERY_CONFIG, ...snap.data() } as DeliveryConfig);
    });
    const unsubBanners = onSnapshot(collection(db, "day_banners"), snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() } as Banner))
        .filter(b => b.active !== false)
        .sort((a,b) => (a.order??0)-(b.order??0));
      if (all.length > 0) {
        setBanners(all);
        setBannerIdx(0);
      } else {
        // Fallback : utilise les bannières principales si day_banners est vide
        onSnapshot(collection(db, "banners"), mainSnap => {
          const mainAll = mainSnap.docs.map(d => ({ id:d.id, ...d.data() } as Banner))
            .filter(b => b.active !== false)
            .sort((a,b) => (a.order??0)-(b.order??0));
          setBanners(mainAll);
          setBannerIdx(0);
        });
      }
    });
    const unsubCats = onSnapshot(collection(db, "day_categories"), snap => {
      const loaded = snap.docs.map(d => ({ id:d.id, ...d.data() } as Category))
        .sort((a,b) => (a.order??0)-(b.order??0));
      setDbCats(loaded);
    });
    const unsubEtabs = onSnapshot(collection(db, "day_etablissements"), snap => {
      setEtablissements(snap.docs.map(d => ({ id:d.id, ...d.data() } as Etablissement))
        .filter(e => e.isActive)
        .sort((a,b) => (a.name||"").localeCompare(b.name||"")));
    });
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setOrderForm(f => ({ ...f, email: f.email || user.email || "" }));
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            const p = snap.data();
            setOrderForm(f => ({ ...f, name: f.name || p.name || user.displayName || "", phone: f.phone || p.phone || "", email: f.email || user.email || "", address: f.address || p.address || "", lat: f.lat || p.lat || 0, lng: f.lng || p.lng || 0 }));
          } else if (user.displayName) {
            setOrderForm(f => ({ ...f, name: f.name || user.displayName || "" }));
          }
        } catch {}
      }
    });
    const unsubPromos = onSnapshot(collection(db, "promotions"), snap => {
      setPromotions(snap.docs.map(d => ({ id:d.id, ...d.data() } as Promotion)));
    });
    const unsubSupplements = onSnapshot(collection(db, "day_supplements"), snap => {
      setSupplements(snap.docs.map(d => ({ id:d.id, ...d.data() } as Supplement)).filter(s => s.isActive !== false));
    });
    return () => { unsubEtabs(); unsubProducts(); unsubPacks(); unsubSettings(); unsubDeliveryConfig(); unsubBanners(); unsubCats(); unsubAuth(); unsubPromos(); unsubSupplements(); };
  }, []);

  useEffect(() => {
    getRedirectResult(auth).then(async (result) => {
      if (!result?.user) return;
      const user = result.user;
      await setDoc(doc(db, "users", user.uid), { uid:user.uid, name:user.displayName||"", email:user.email||"", lastLoginAt:new Date().toISOString() }, { merge:true });
      setShowAuthModal(false);
      showToast("Connecté avec Google !");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    try { const s = localStorage.getItem("yassala_day_cart"); if (s) setCart(JSON.parse(s)); } catch {}
    try { const l = localStorage.getItem("yassala_day_likes"); if (l) setLikes(new Set(JSON.parse(l))); } catch {}
    try {
      const p = localStorage.getItem("yassala_profile");
      if (p) {
        const d = JSON.parse(p);
        setOrderForm(f => ({ ...f, name:f.name||d.name||"", phone:f.phone||d.phone||"", email:f.email||d.email||"", address:f.address||d.address||"", lat:f.lat||d.lat||0, lng:f.lng||d.lng||0 }));
      }
    } catch {}
    setCartReady(true);
  }, []);
  useEffect(() => {
    if (!cartReady) return;
    localStorage.setItem("yassala_day_cart", JSON.stringify(cart));
  }, [cart, cartReady]);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive:true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const tick = () => { const n = new Date(); setClock(`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (banners.length <= 1 || bannerPaused) return;
    const id = setInterval(() => setBannerIdx(i => (i+1) % banners.length), 4500);
    return () => clearInterval(id);
  }, [banners.length, bannerPaused]);

  const showToast = (msg: string) => {
    setToast({ msg, show:true });
    setTimeout(() => setToast(t => ({ ...t, show:false })), 2800);
  };

  const addToCart = (id: string, name: string, price: number, note?: string) => {
    const baseId = getBaseProductId(id);
    const product = products.find(p => p.id === baseId);
    if (product && product.stock === 0) { showToast("Produit en rupture de stock !"); return; }
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      const currentQty = existing ? existing.qty : 0;
      if (product && currentQty >= product.stock) { showToast(`Stock limité à ${product.stock} unité(s) !`); return prev; }
      if (existing && !note) return prev.map(item => item.id === id ? { ...item, qty:item.qty+1 } : item);
      return [...prev, { id, name, price, qty:1, note }];
    });
    setLastAddedId(baseId);
    setTimeout(() => setLastAddedId(null), 600);
    showToast(`${name} ajouté · ${price.toFixed(2)}€`);
    if (activePromo && activePromo.productIds.includes(baseId)) {
      addDoc(collection(db, "promotion_events"), { promoId:activePromo.id, eventType:"add_to_cart", userId:currentUser?.uid||null, createdAt:new Date().toISOString() }).catch(() => {});
    }
  };

  const openProductModal = (p: Product) => {
    setSelectedProduct(p);
    if (activePromo && activePromo.productIds.includes(p.id)) {
      addDoc(collection(db, "promotion_events"), { promoId:activePromo.id, eventType:"click", userId:currentUser?.uid||null, createdAt:new Date().toISOString() }).catch(() => {});
    }
  };

  const updateQty = (id: string, change: number) => {
    const product = products.find(p => p.id === id);
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + change;
        if (product && newQty > product.stock) { showToast(`Stock limité à ${product.stock} unité(s) !`); return item; }
        return { ...item, qty:Math.max(0, newQty) };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const openCart = () => {
    if (cart.length === 0) { showToast("Panier vide — commande quelque chose !"); return; }
    setShowCart(true);
  };

  const getDiscount = () => {
    if (!coupon) return 0;
    if (coupon.type === "percent") return Math.round(cartTotal * coupon.value) / 100;
    return Math.min(coupon.value, cartTotal);
  };

  const activePromo = useMemo(() => promotions.find(isPromoActive) ?? null, [promotions]);
  const promoDiscount = computePromoDiscount(activePromo, cart);

  useEffect(() => {
    if (activePromo && trackedImpressionRef.current !== activePromo.id) {
      trackedImpressionRef.current = activePromo.id;
      addDoc(collection(db, "promotion_events"), { promoId:activePromo.id, eventType:"impression", userId:currentUser?.uid||null, createdAt:new Date().toISOString() }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePromo?.id]);

  const discountedTotal = cartTotal - getDiscount() - promoDiscount;
  const feeResult: DeliveryFeeResult | null = fulfillmentType === 'delivery'
    ? computeDeliveryFee(distanceKm, discountedTotal, deliveryConfig)
    : null;
  const etaResult = fulfillmentType === 'delivery'
    ? computeETA({ distanceKm, pendingOrders:deliveryStats.activeOrders, activeDrivers:deliveryStats.availableDrivers })
    : null;
  const deliveryFeeDisplay = feeResult?.total ?? 0;
  const finalTotal = discountedTotal + deliveryFeeDisplay;

  const searchAddress = useCallback((q: string) => {
    if (addressTimerRef.current) clearTimeout(addressTimerRef.current);
    if (q.length < 3) { setAddressSuggestions([]); setShowSuggestions(false); return; }
    addressTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q+", Guyane")}&limit=5&addressdetails=1&viewbox=-54.6,6.0,-51.5,2.1`);
        const data = await res.json();
        const guyana = data.filter((r: any) => { const lat=parseFloat(r.lat); const lon=parseFloat(r.lon); return lat>=2.1&&lat<=6.0&&lon>=-54.6&&lon<=-51.5; });
        const suggestions = guyana.map((r: any) => ({ display:r.display_name.replace(/, Guyane,.*$/,"").replace(/, France$/,"").replace(/, French Guiana.*$/,""), lat:parseFloat(r.lat), lng:parseFloat(r.lon) }));
        setAddressSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
      } catch { setAddressSuggestions([]); }
    }, 400);
  }, []);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const snap = await getDocs(query(collection(db, "coupons"), where("code","==",code), where("active","==",true)));
    if (snap.empty) { setCouponError("Code invalide ou expiré."); setCoupon(null); return; }
    const d = snap.docs[0].data();
    setCoupon({ code, type:d.type as "percent"|"fixed", value:d.value });
    setCouponError(""); showToast(`Coupon "${code}" appliqué ✓`);
  };

  const submitOrder = async () => {
    if (!currentUser) { setShowAuthModal(true); showToast("Connecte-toi pour finaliser ta commande 🔐"); return; }
    if (!cashSmsVerifiedRef.current) {
      const now = Date.now();
      const recent = submitAttemptsRef.current.filter(t => now - t < 60_000);
      if (recent.length >= 3) { showToast("Trop de tentatives. Réessaie dans 1 minute."); return; }
      submitAttemptsRef.current = [...recent, now];
    }
    if (!orderForm.name || !orderForm.phone) { showToast("Remplis ton nom et téléphone !"); return; }
    if (!orderForm.email) { showToast("L'email est requis pour recevoir les notifications !"); return; }
    if (fulfillmentType === 'delivery') {
      if (!orderForm.address) { showToast("Remplis l'adresse de livraison !"); return; }
      if (!orderForm.lat || !orderForm.lng) { showToast("Sélectionne une adresse dans la liste 📍"); return; }
    }
    if (cartTotal < deliveryConfig.minimum_order_amount) { showToast(`Commande minimum : ${deliveryConfig.minimum_order_amount}€`); return; }

    const cashOtpCode   = paymentMethod === 'cash' ? String(Math.floor(1000 + Math.random() * 9000)) : null;
    const cashOtpExpiry = paymentMethod === 'cash' ? new Date(Date.now() + 15*60*1000).toISOString() : null;
    setSubmitting(true);

    try {
      const orderRef = doc(collection(db, "orders"));
      const orderItems = cart.map(item => `${item.qty}× ${item.name} (${item.price.toFixed(2)}€)${item.note ? ` [${item.note}]` : ""}`).join("\n");
      const deliveryFee = deliveryFeeDisplay;
      const totalWithDelivery = discountedTotal + deliveryFee;
      const discount = getDiscount();
      const promoDiscountSnap = promoDiscount;

      const STOCK_LOCATION = { name:"Yassala Day Stock", address:"Retrait chez Yassala Day", city:"Cayenne", instructions:"Présente ton numéro de commande à l'accueil." };
      const pickupSnapshot = fulfillmentType === 'pickup' ? STOCK_LOCATION : null;
      const resolvedPickupTime = fulfillmentType === 'pickup' ? (pickupTimeMode === 'asap' ? 'asap' : pickupTimeValue || 'asap') : null;

      let orderNum = 1;
      const counterRef = doc(db, "settings", "orderCounter");

      await runTransaction(db, async (transaction) => {
        const prodRefs = cart.map(item => doc(db, "day_products", getBaseProductId(item.id)));
        const prodDocs = await Promise.all(prodRefs.map(ref => transaction.get(ref)));
        const counterSnap = await transaction.get(counterRef);
        orderNum = (counterSnap.exists() ? (counterSnap.data().count as number) : 0) + 1;

        let validatedPromoId: string | null = null;
        if (activePromo) {
          const promoRef = doc(db, "promotions", activePromo.id);
          const promoSnap = await transaction.get(promoRef);
          if (promoSnap.exists()) {
            const pd = promoSnap.data() as Omit<Promotion, "id">;
            const now = Date.now();
            const stillValid = pd.isActive && now >= new Date(pd.startAt).getTime() && now <= new Date(pd.endAt).getTime() && (pd.maxUses === undefined || pd.maxUses === null || pd.usesCount < pd.maxUses);
            if (stillValid) { transaction.update(promoRef, { usesCount:increment(1), updatedAt:new Date().toISOString() }); validatedPromoId = activePromo.id; }
          }
        }
        for (let i = 0; i < cart.length; i++) {
          const item = cart[i]; const prodDoc = prodDocs[i];
          if (!prodDoc.exists()) throw new Error(`Produit ${item.name} introuvable`);
          const currentStock = prodDoc.data().stock || 0;
          if (currentStock < item.qty) throw new Error(`Stock insuffisant pour ${item.name} (${currentStock} restant)`);
        }
        for (let i = 0; i < cart.length; i++) {
          transaction.update(prodRefs[i], { stock:(prodDocs[i].data()?.stock||0) - cart[i].qty });
        }
        transaction.set(counterRef, { count:orderNum });
        transaction.set(orderRef, {
          items:orderItems, cartItems:cart.map(i => ({ name:i.name, qty:i.qty, price:i.price, note:i.note||null })),
          total:totalWithDelivery, subtotal:cartTotal, discount,
          promoDiscount:promoDiscountSnap > 0 ? promoDiscountSnap : null, promoId:validatedPromoId,
          coupon:coupon?.code||null, deliveryFee,
          deliveryBreakdown: fulfillmentType==='delivery'&&feeResult ? feeResult.breakdown : null,
          deliverySupplements: fulfillmentType==='delivery'&&feeResult ? feeResult.supplements : null,
          driverPay: fulfillmentType==='delivery'&&feeResult ? feeResult.driverPay : null,
          fulfillmentType, pickupType: fulfillmentType==='pickup' ? 'stock' : null,
          pickupLocationId: fulfillmentType==='pickup' ? 'stock_default' : null,
          pickupLocationSnapshot: pickupSnapshot, pickupTime:resolvedPickupTime,
          status: paymentMethod==='cash' ? "pending_confirmation" : "pending_payment",
          otpCode:cashOtpCode, otpExpiry:cashOtpExpiry, createdAt:new Date().toISOString(),
          phone:orderForm.phone, name:orderForm.name,
          address: fulfillmentType==='delivery' ? orderForm.address : (pickupSnapshot?.address||''),
          lat: fulfillmentType==='delivery' ? (orderForm.lat||null) : null,
          lng: fulfillmentType==='delivery' ? (orderForm.lng||null) : null,
          uid:currentUser?.uid||null, email:orderForm.email||null, orderNumber:orderNum,
          shopMode: 'day',
        });
      });

      if (activePromo) {
        addDoc(collection(db, "promotion_events"), { promoId:activePromo.id, eventType:"checkout_success", userId:currentUser?.uid||null, orderId:orderRef.id, createdAt:new Date().toISOString() }).catch(() => {});
      }
      if (fulfillmentType === 'delivery') {
        fetch('/api/assign-driver', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ orderId:orderRef.id }) }).catch(() => {});
      }

      const savedAddress = fulfillmentType === 'delivery' ? orderForm.address : "";
      const savedLat     = fulfillmentType === 'delivery' ? orderForm.lat : 0;
      const savedLng     = fulfillmentType === 'delivery' ? orderForm.lng : 0;
      if (currentUser) {
        setDoc(doc(db, "users", currentUser.uid), { name:orderForm.name||null, phone:orderForm.phone||null, address:savedAddress||null, lat:savedLat||null, lng:savedLng||null, updatedAt:new Date().toISOString() }, { merge:true }).catch(() => {});
      }
      try { localStorage.setItem("yassala_profile", JSON.stringify({ name:orderForm.name, phone:orderForm.phone, email:orderForm.email, address:savedAddress, lat:savedLat, lng:savedLng })); } catch {}

      if (paymentMethod === 'online') {
        const res = await fetch('/api/create-payment-intent', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ items:cart.map(i=>({name:i.name,price:i.price,qty:i.qty})), deliveryFee, orderId:orderRef.id, orderNum, fulfillmentType }) });
        const data = await res.json();
        if (!res.ok || !data.clientSecret) throw new Error(data.error || 'Erreur paiement');
        if (!stripePromise) throw new Error('Paiement non configuré');
        setStripeClientSecret(data.clientSecret);
        setSubmitting(false);
        return;
      } else {
        fetch('/api/notify', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ orderNumber:orderNum, name:orderForm.name, phone:orderForm.phone, address: fulfillmentType==='delivery' ? orderForm.address : `☀️ Click & Collect Day — ${pickupSnapshot?.name||'Stock'}`, items:cart.map(i=>({name:i.name,qty:i.qty,price:i.price})), subtotal:cartTotal, deliveryFee, total:totalWithDelivery, method:'cash', fulfillmentType, pickupSnapshot, pickupTime:resolvedPickupTime, otpCode:cashOtpCode, orderId:orderRef.id }) }).catch(() => {});
        if (orderForm.email) {
          fetch('/api/email', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:'confirmation', email:orderForm.email, orderNumber:orderNum, items:orderItems, total:totalWithDelivery, address: fulfillmentType==='delivery' ? orderForm.address : `Click & Collect Day — ${pickupSnapshot?.name}`, method:'cash', fulfillmentType, trackingUrl:`${window.location.origin}/suivi?id=${orderRef.id}` }) }).catch(() => {});
        }
        setCart([]); try { localStorage.removeItem("yassala_day_cart"); } catch {}
        setShowCart(false);
        window.location.href = `/confirm?id=${orderRef.id}`;
        return;
      }
    } catch (err: any) { showToast(err.message || "Erreur lors de l'envoi"); }
    setSubmitting(false);
  };

  const handlePaymentSuccess = useCallback(() => {
    setStripeClientSecret(null); setCart([]);
    setOrderForm(f => ({ name:f.name, phone:f.phone, email:f.email, address:f.address, lat:f.lat, lng:f.lng }));
    setCoupon(null); setCouponInput("");
    setFulfillmentType('delivery'); setPickupTimeMode('asap'); setPickupTimeValue('');
    setShowCart(false);
    window.location.href = '/succes';
  }, []);

  const handlePaymentCancel = useCallback(() => { setStripeClientSecret(null); }, []);

  const etabProds = selectedEtab
    ? (() => {
        const withId = products.filter((p: any) => p.etablissementId === selectedEtab.id);
        if (withId.length > 0) return withId;
        return products.filter((p: any) => !p.etablissementId);
      })()
    : products.filter((p: any) => !p.etablissementId);

  const pickOrAddEtab = (p: any) => {
    const sizes = parseSizesEtab(p.desc || '');
    if (sizes) {
      setSizePickerProd(p);
      setSizePickerStep('size');
      setSizePickerChosenSize(null);
      setSizePickerSelectedSupps([]);
      setSizePickerNote('');
      setHalfHalfMode(false);
      setHalfHalfProd2(null);
      return;
    }
    addToCart(p.id, p.name, p.price);
  };
  const searchQ = etabSearch.toLowerCase().trim();
  const filtered = etabProds.filter(p =>
    p.isActive !== false &&
    (activeCat === "all" || p.cat === activeCat) &&
    (!searchQ || p.name.toLowerCase().includes(searchQ) || p.desc?.toLowerCase().includes(searchQ))
  );
  const suggestions = selectedProduct ? etabProds.filter(p => p.cat === selectedProduct.cat && p.id !== selectedProduct.id && p.stock > 0).slice(0, 4) : [];

  useEffect(() => {
    if (!selectedProduct || products.length < 3 || settings.aiRecommendEnabled === false) { setAiRecs([]); return; }
    let cancelled = false;
    setAiRecs([]); setAiRecsLoading(true);
    fetch("/api/ai", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ action:"recommend", productName:selectedProduct.name, productCat:selectedProduct.cat, allProducts:products.filter(p => p.id !== selectedProduct.id && p.stock > 0).slice(0,30) }) })
      .then(r => r.json())
      .then(json => {
        if (!cancelled && json.ok && Array.isArray(json.result?.recs)) {
          const matched = json.result.recs.map((rec: {name:string;why:string}) => { const found = products.find(p => p.name.toLowerCase().includes(rec.name.toLowerCase()) || rec.name.toLowerCase().includes(p.name.toLowerCase())); return found ? { ...rec, product:found } : null; }).filter(Boolean) as {name:string;why:string;product:Product}[];
          setAiRecs(matched.slice(0,2));
        }
      }).catch(() => {}).finally(() => { if (!cancelled) setAiRecsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedProduct?.id]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    if (currentUser) {
      const snap = await getDocs(query(collection(db, "orders"), where("uid","==",currentUser.uid)));
      const list = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a:any,b:any) => b.createdAt.localeCompare(a.createdAt));
      setHistoryOrders(list);
    }
    setHistoryLoading(false);
  };

  const submitDriverApplication = async () => {
    if (!driverForm.name.trim() || !driverForm.phone.trim()) { showToast("Remplis au moins ton nom et téléphone."); return; }
    setDriverSubmitting(true);
    try {
      await addDoc(collection(db, "driver_applications"), { ...driverForm, status:"nouveau", createdAt:new Date().toISOString() });
      setDriverSuccess(true);
      setTimeout(() => { setShowDriverForm(false); setDriverSuccess(false); setDriverForm({name:"",phone:"",email:"",zone:"",vehicle:"moto",message:""}); }, 3000);
    } catch { showToast("Erreur lors de l'envoi. Réessaie."); }
    setDriverSubmitting(false);
  };

  const handleSignup = async () => {
    if (!authName.trim()||!authEmail.trim()||!authPassword.trim()) { setAuthError("Remplis tous les champs."); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const { user } = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      await updateProfile(user, { displayName:authName.trim() });
      try { await setDoc(doc(db, "users", user.uid), { uid:user.uid, name:authName.trim(), email:authEmail.trim(), createdAt:new Date().toISOString(), lastLoginAt:new Date().toISOString() }); } catch {}
      try { const saved = JSON.parse(localStorage.getItem("yassala_profile")||"{}"); localStorage.setItem("yassala_profile", JSON.stringify({...saved, name:authName.trim(), email:authEmail.trim()})); } catch {}
      setOrderForm(f => ({ ...f, name:f.name||authName.trim(), email:f.email||authEmail.trim() }));
      setShowAuthModal(false); showToast("Compte créé ! Bienvenue 🎉");
    } catch (e: any) { setAuthError(translateAuthError(e.code)); }
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!authEmail.trim()||!authPassword.trim()) { setAuthError("Remplis tous les champs."); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const { user } = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      await setDoc(doc(db, "users", user.uid), { lastLoginAt:new Date().toISOString() }, { merge:true });
      setOrderForm(f => ({ ...f, email:f.email||authEmail.trim() }));
      setShowAuthModal(false); showToast("Connecté !");
    } catch (e: any) { setAuthError(translateAuthError(e.code)); }
    setAuthLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { setForgotError("Entre ton email."); return; }
    setForgotLoading(true); setForgotError("");
    try { await sendPasswordResetEmail(auth, forgotEmail.trim()); setForgotSuccess(true); }
    catch (e: any) { setForgotError(translateAuthError(e.code)); }
    setForgotLoading(false);
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true); setAuthError("");
    const provider = new GoogleAuthProvider();
    const isMobile = /Mobi|Android|iPhone|iPad|IEMobile/i.test(navigator.userAgent);
    if (isMobile) { try { await signInWithRedirect(auth, provider); } catch { setAuthLoading(false); } return; }
    try {
      const { user } = await signInWithPopup(auth, provider);
      await setDoc(doc(db, "users", user.uid), { uid:user.uid, name:user.displayName||"", email:user.email||"", lastLoginAt:new Date().toISOString() }, { merge:true });
      setShowAuthModal(false); showToast("Connecté avec Google !");
    } catch (e: any) {
      if (e.code === "auth/popup-blocked") { try { await signInWithRedirect(auth, provider); return; } catch {} }
      const msg = translateAuthError(e.code); if (msg) setAuthError(msg);
    }
    setAuthLoading(false);
  };

  const initRecaptcha = (ref: React.MutableRefObject<any>, elementId: string) => {
    if (ref.current) { try { ref.current.clear(); } catch {} ref.current = null; }
    ref.current = new RecaptchaVerifier(auth, elementId, { size:"invisible", callback:()=>{}, "expired-callback":()=>{ ref.current=null; } });
    return ref.current;
  };

  const handleCashSmsSend = async () => {
    const phone = orderForm.phone.trim();
    if (!phone) { setCashSmsError("Aucun numéro de téléphone dans ta commande."); return; }
    setCashSmsLoading(true); setCashSmsError("");
    try {
      const verifier = initRecaptcha(cashRecaptchaRef, "recaptcha-cash-sms-day");
      const formatted = phone.startsWith("+") ? phone : `${phoneCountry}${phone.replace(/^0/,"")}`;
      const confirmation = await signInWithPhoneNumber(auth, formatted, verifier);
      setCashSmsConfirmation(confirmation); setCashSmsStep("verify");
    } catch (e: any) { setCashSmsError(e.message||"Impossible d'envoyer le SMS."); cashRecaptchaRef.current=null; }
    setCashSmsLoading(false);
  };

  const handleCashSmsVerify = async () => {
    if (!cashSmsCode.trim()||!cashSmsConfirmation) return;
    setCashSmsLoading(true); setCashSmsError("");
    try {
      await cashSmsConfirmation.confirm(cashSmsCode);
      setShowSmsVerify(false); setCashSmsStep("send"); setCashSmsCode(""); setCashSmsConfirmation(null);
      cashSmsVerifiedRef.current = true; submitOrder();
    } catch { setCashSmsError("Code incorrect ou expiré. Réessaie."); }
    setCashSmsLoading(false);
  };

  const handleSignout = async () => {
    await signOut(auth); setShowHistory(false); setHistoryOrders(null); showToast("Déconnecté");
  };

  const shareProduct = (p: Product) => {
    const text = `${p.name} — ${Number(p.price).toFixed(2)}€ ☀️\nCommande sur Yassala Day Shop : https://yassalashop.gf`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title:p.name, text, url:"https://yassalashop.gf" }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => showToast("Lien copié !")).catch(() => showToast("Copie non supportée"));
    }
  };

  const catLabel = (cat: string) => cats.find(c => c.key === cat)?.label ?? cat.toUpperCase();
  const catColor = (cat: string) => cat === "snack_peyi" ? "#e67e00" : "#3ABFF8";

  const getBadgeType = (badge: string) => {
    if (badge === "HOT")  return "hot";
    if (badge === "NEW")  return "new";
    if (badge === "COOL") return "cool";
    if (badge === "BEST") return "best";
    return null;
  };


  // ── DAY COLORS ──
  const D = {
    bg:        "#F7F7F8",
    card:      "#FFFFFF",
    cardDark:  "#F2F3F5",
    text:      "#111827",
    muted:     "#6B7280",
    pink:      "#FF2D7A",
    cyan:      "#1BA9FF",
    lime:      "#22c55e",
    border:    "#E5E7EB",
    borderPink:"rgba(255,45,122,.15)",
    overlay:   "rgba(0,0,0,.45)",
    navBg:     "rgba(255,255,255,.97)",
    shadow:    "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
    shadowHov: "0 4px 12px rgba(0,0,0,.08)",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700;800;900&display=swap');
        :root { --bg:${D.bg}; --card:${D.card}; --pink:${D.pink}; --cyan:${D.cyan}; --lime:${D.lime}; --text:${D.text}; --muted:${D.muted}; }
        *{margin:0;padding:0;box-sizing:border-box;}
        html{scroll-behavior:smooth;font-size:16px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        body{background:${D.bg} !important;color:${D.text} !important;font-family:'Inter',system-ui,-apple-system,sans-serif !important;font-weight:400;min-height:100vh;overflow-x:hidden;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
        @keyframes bannerIn{from{opacity:0;transform:translateX(16px);}to{opacity:1;transform:translateX(0);}}
        @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes scrollHint{0%,100%{transform:translateX(0);opacity:.4;}50%{transform:translateX(6px);opacity:.8;}}
        @keyframes shimmer{0%{background-position:-200% 0;}100%{background-position:200% 0;}}
        .fade1{animation:fadeUp .4s .0s both;}.fade2{animation:fadeUp .4s .08s both;}.fade3{animation:fadeUp .4s .16s both;}
        .fade4{animation:fadeUp .4s .24s both;}.fade5{animation:fadeUp .4s .32s both;}
        @media(max-width:640px){
          .nav-main{padding:10px 14px !important;}
          .nav-logo{font-size:1.2rem !important;}
          .nav-status{display:none !important;}
          .nav-driver-btn{padding:7px 10px !important;font-size:.82rem !important;}
          .nav-driver-label{display:none !important;}
          .nav-cart-btn{padding:7px 12px !important;font-size:.85rem !important;gap:5px !important;}
          .hero-content{padding:32px 16px 56px !important;max-width:100% !important;}
          .hero-content h1{font-size:clamp(2rem,10vw,3rem) !important;}
          .clock-hero{display:none !important;}
          .info-bar{flex-wrap:wrap !important;}
          .info-bar-item{flex:0 0 50% !important;}
          .cat-bar{gap:6px !important;padding:10px 12px !important;}
          .cat-btn{padding:8px 10px !important;min-width:60px !important;}
          .section-title{font-size:1.1rem !important;}
          .products-grid{grid-template-columns:repeat(2,1fr) !important;gap:10px !important;}
        }
        @media(max-width:400px){
          .nav-logo{font-size:1.1rem !important;}
          .hero-content h1{font-size:clamp(1.8rem,10vw,2.5rem) !important;}
        }
        .cat-bar{overflow-x:auto;flex-wrap:nowrap !important;scrollbar-width:none;-ms-overflow-style:none;}
        .cat-bar::-webkit-scrollbar{display:none;}
        .cat-btn{flex-shrink:0;}
        body{padding-bottom:90px;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${D.pink} !important;box-shadow:0 0 0 3px rgba(255,45,122,.1) !important;}
      `}</style>

      {/* Fond Day */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,background:D.bg}} />

      {/* ── Bande info livraison ── */}
      <div style={{background:settings.shopOpen ? D.pink : "#6B7280",color:"#fff",textAlign:"center",padding:"10px 16px",
        fontFamily:"'Inter',system-ui,sans-serif",fontWeight:500,fontSize:".8rem",letterSpacing:".02em",position:"relative",zIndex:10}}>
        {settings.shopOpen
          ? `Livraison de jour · ${settings.zone} · Min. ${deliveryConfig.minimum_order_amount}€ · ${settings.hours}`
          : "Shop fermé · Revenez plus tard"}
      </div>

      {/* NAV */}
      <nav className="nav-main" style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 20px",borderBottom:`1px solid ${D.border}`,
        position:"sticky",top:0,zIndex:100,background:D.navBg,backdropFilter:"blur(20px)"}}>
        <div className="nav-logo" style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",
          letterSpacing:".02em",color:D.pink,lineHeight:1}}>
          YASSALA
          <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:600,fontSize:".55rem",color:D.muted,
            letterSpacing:".08em",display:"block",marginTop:"-2px"}}>
            Day Shop
          </span>
        </div>
        <div className="nav-status" style={{display:"flex",alignItems:"center",gap:6,
          background: settings.shopOpen ? "rgba(34,197,94,.08)" : D.cardDark,
          color: settings.shopOpen ? "#22c55e" : D.muted,
          padding:"6px 14px",borderRadius:20,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",fontWeight:600,letterSpacing:".02em"}}>
          <div style={{width:6,height:6,background: settings.shopOpen ? "#22c55e" : D.muted,borderRadius:"50%"}} />
          {settings.shopOpen ? `Ouvert · ${settings.hours}` : "Fermé"}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="nav-driver-btn" onClick={() => setShowDriverForm(true)}
            style={{background:D.cardDark,border:`1px solid ${D.border}`,color:D.text,
              padding:"8px 14px",fontFamily:"'Inter',system-ui,sans-serif",fontWeight:600,
              fontSize:".82rem",letterSpacing:".02em",cursor:"pointer",
              display:"flex",alignItems:"center",gap:6,borderRadius:12,whiteSpace:"nowrap"}}>
            🏍️ <span className="nav-driver-label">Livreur</span>
          </button>
          <button className="nav-cart-btn" onClick={openCart}
            style={{background:D.pink,border:"none",color:"#fff",
              padding:"8px 18px",fontFamily:"'Inter',system-ui,sans-serif",fontWeight:700,
              fontSize:".85rem",letterSpacing:".02em",cursor:"pointer",
              display:"flex",alignItems:"center",gap:8,borderRadius:12}}>
            🛒 Panier
            <span style={{background:"#fff",color:D.pink,borderRadius:"50%",width:22,height:22,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:".75rem",fontWeight:800}}>
              {cartCount}
            </span>
          </button>
        </div>
      </nav>

      {/* ── HERO / CAROUSEL ── */}
      <section style={{position:"relative",minHeight:300,overflow:"hidden",zIndex:1,display:"flex",alignItems:"center",background:D.bg}}
        onMouseEnter={() => banners.length > 1 && setBannerPaused(true)}
        onMouseLeave={() => banners.length > 1 && setBannerPaused(false)}>
        {banners.length > 0 && banners[bannerIdx]?.gradient && (
          <div key={`grad-${bannerIdx}`} style={{position:"absolute",inset:0,
            background: banners[bannerIdx].gradient,
            animation:"bannerIn .5s both",zIndex:1}} />
        )}
        {banners.length > 0 && banners[bannerIdx]?.image && (
          <div key={`img-${bannerIdx}`} style={{position:"absolute",inset:0,
            backgroundImage:`url(${banners[bannerIdx].image})`,backgroundSize:"cover",backgroundPosition:"center",
            opacity: banners[bannerIdx].brightness ?? .2,animation:"bannerIn .5s both",zIndex:1}} />
        )}
        <div key={banners.length > 0 ? `banner-${bannerIdx}` : "static"} className="hero-content"
          style={{position:"relative",zIndex:2,maxWidth:520,padding:"48px 20px 56px",
            animation: banners.length > 0 ? "bannerIn .4s .1s both" : undefined}}>
          <div className={banners.length === 0 ? "fade1" : undefined}
            style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:600,fontSize:".85rem",color:D.pink,letterSpacing:".04em",marginBottom:14}}>
            {banners.length > 0 ? (banners[bannerIdx]?.subtitle || "Livraison de jour — Guyane") : "Livraison de jour — Guyane"}
          </div>
          <h1 className={banners.length === 0 ? "fade2" : undefined}
            style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:900,fontSize:"clamp(2.2rem,7vw,3.5rem)",lineHeight:.95,letterSpacing:"-.02em",marginBottom:18}}>
            {banners.length > 0 ? (
              <span style={{color:D.text,display:"block"}}>
                {banners[bannerIdx]?.title || "YASSALA DAY SHOP"}
              </span>
            ) : (<>
              <span style={{color:D.pink,display:"block"}}>YASSALA</span>
              <span style={{color:D.cyan,display:"block"}}>DAY</span>
              <span style={{color:D.text,display:"block"}}>SHOP</span>
            </>)}
          </h1>
          {banners.length > 0 && banners[bannerIdx]?.desc ? (
            <p style={{fontSize:".95rem",color:D.muted,lineHeight:1.6,maxWidth:400,marginBottom:28}}>{banners[bannerIdx].desc}</p>
          ) : banners.length === 0 ? (
            <p className="fade3" style={{fontSize:".95rem",color:D.muted,lineHeight:1.6,maxWidth:400,marginBottom:28}}>
              Boissons, snacks et repas livrés chez toi en moins de 30 minutes. Partout à Cayenne, toute la journée.
            </p>
          ) : <div style={{marginBottom:28}} />}
          <div className={banners.length === 0 ? "fade4" : undefined} style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button onClick={() => {
              const link = banners.length > 0 ? (banners[bannerIdx]?.link||"catalogue") : "catalogue";
              if (link==="catalogue"||link==="") document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"});
              else if (link==="packs") document.getElementById("packs")?.scrollIntoView({behavior:"smooth"});
              else window.open(link,"_blank");
            }} style={{padding:"14px 28px",fontFamily:"'Inter',system-ui,sans-serif",fontWeight:700,
              fontSize:".9rem",letterSpacing:".02em",border:"none",
              cursor:"pointer",borderRadius:14,background:D.pink,color:"#fff"}}>
              {banners.length > 0 ? (banners[bannerIdx]?.cta||"Commander →") : "Commander →"}
            </button>
            {banners.length === 0 && (
              <button onClick={() => document.getElementById("packs")?.scrollIntoView({behavior:"smooth"})}
                style={{padding:"14px 28px",fontFamily:"'Inter',system-ui,sans-serif",fontWeight:700,
                  fontSize:".9rem",letterSpacing:".02em",
                  background:D.cardDark,color:D.text,border:`1px solid ${D.border}`,
                  cursor:"pointer",borderRadius:14}}>
                Voir les packs
              </button>
            )}
          </div>
        </div>
        {/* Horloge */}
        <div className="clock-hero" style={{position:"absolute",right:28,top:"50%",transform:"translateY(-50%)",zIndex:3,textAlign:"center"}}>
          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"2rem",color:D.muted,letterSpacing:".02em",lineHeight:1}}>
            {clock}
          </div>
          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",fontWeight:500,color:D.muted,letterSpacing:".04em",marginTop:4}}>
            heure locale
          </div>
        </div>
        {/* Dots navigation */}
        {banners.length > 1 && (
          <div style={{position:"absolute",bottom:16,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"center",gap:6,zIndex:3}}>
            {banners.map((_,i) => (
              <button key={i} onClick={() => { setBannerIdx(i); setBannerPaused(true); setTimeout(()=>setBannerPaused(false),8000); }}
                style={{width:i===bannerIdx?20:6,height:6,borderRadius:3,border:"none",cursor:"pointer",background:i===bannerIdx?D.pink:"rgba(0,0,0,.15)",transition:"all .3s",padding:0,flexShrink:0}} />
            ))}
          </div>
        )}
      </section>

      {/* ── INFO BAR ── */}
      <div className="info-bar" style={{
        position:"relative",zIndex:2,
        background:D.card,
        borderRadius:18,
        margin:"0 16px",
        marginTop:-20,
        overflow:"hidden",
        boxShadow:"0 2px 8px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      }}>
        <div style={{display:"flex",position:"relative"}}>
          {[
            {icon:"⚡", title:"Ultra rapide",     sub:"– 30 min"},
            {icon:"🎁", title:"Livraison offerte",sub:`dès ${deliveryConfig.free_delivery_threshold}€`},
            {icon:"📡", title:settings.zone,      sub:"Couverture totale"},
            {icon:"☀️", title:settings.hours,     sub:"7j/7"},
          ].map((item,i,arr) => (
            <div key={i} className="info-bar-item" style={{
              flex:1,
              padding:"16px 8px",
              display:"flex",
              flexDirection:"column",
              alignItems:"center",
              gap:6,
              borderRight: i < arr.length-1 ? `1px solid ${D.border}` : "none",
            }}>
              <div style={{
                width:38,height:38,
                borderRadius:12,
                background:D.cardDark,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:"1.2rem",
              }}>
                {item.icon}
              </div>
              <div style={{textAlign:"center"}}>
                <strong style={{
                  display:"block",
                  fontWeight:700,
                  fontSize:".75rem",
                  color:D.text,
                  lineHeight:1.2,
                }}>
                  {item.title}
                </strong>
                <small style={{
                  display:"block",
                  marginTop:2,
                  fontSize:".7rem",
                  fontFamily:"'Inter',system-ui,sans-serif",
                  fontWeight:500,
                  color:D.muted,
                }}>
                  {item.sub}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Countdown vers Night — bloc voyant (style identique Night) ── */}
      {!countdown.done && (
        <div style={{
          background:"linear-gradient(135deg,#000d1a 0%,#001f3d 40%,#000d1a 100%)",
          padding:"14px 20px",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          boxShadow:"0 4px 24px rgba(58,191,248,.2),inset 0 1px 0 rgba(255,255,255,.05)",
          position:"relative",overflow:"hidden",zIndex:9,
          borderTop:"1px solid rgba(58,191,248,.2)",
          borderBottom:"1px solid rgba(58,191,248,.2)",
        }}>
          {/* Shimmer */}
          <div style={{position:"absolute",inset:0,pointerEvents:"none",
            background:"linear-gradient(105deg,transparent 40%,rgba(255,255,255,.03) 50%,transparent 60%)",
            backgroundSize:"200% 100%",animation:"shimmer 3s linear infinite"}} />

          {/* Gauche : label */}
          <div style={{display:"flex",alignItems:"center",gap:10,zIndex:1}}>
            <span style={{fontSize:"1.8rem",lineHeight:1,filter:"drop-shadow(0 0 8px rgba(58,191,248,.7))"}}>🌙</span>
            <div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".58rem",
                color:"rgba(58,191,248,.55)",letterSpacing:".18em",textTransform:"uppercase"}}>
                PROCHAINEMENT
              </div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.1rem",
                color:"#FF2D8D",letterSpacing:".08em",lineHeight:1.1,
                textShadow:"0 0 12px rgba(255,45,141,.4)"}}>
                YASSALA NIGHT
              </div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".52rem",
                color:"rgba(58,191,248,.45)",letterSpacing:".12em",marginTop:2}}>
                → NIGHT DANS
              </div>
            </div>
          </div>

          {/* Droite : digits */}
          <div style={{
            background:"rgba(0,0,0,.5)",
            border:"1px solid rgba(58,191,248,.25)",
            borderRadius:12,
            padding:"10px 16px",
            display:"flex",alignItems:"center",gap:6,
            backdropFilter:"blur(8px)",
            boxShadow:"0 0 20px rgba(58,191,248,.15)",
            zIndex:1,
          }}>
            {[
              {val: countdown.h, unit:"heure"},
              {val: countdown.m, unit:"min"},
              {val: countdown.s, unit:"sec"},
            ].map(({val,unit},i) => (
              <div key={i} style={{display:"flex",alignItems:"baseline",gap:2}}>
                {i > 0 && <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:"1.4rem",
                  color:"rgba(58,191,248,.35)",marginRight:4,marginLeft:-2}}>:</span>}
                <div style={{textAlign:"center"}}>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:"1.9rem",fontWeight:900,
                    color:"#3abff8",lineHeight:1,letterSpacing:".02em",
                    textShadow:"0 0 16px rgba(58,191,248,.8)"}}>
                    {val}
                  </div>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".45rem",
                    color:"rgba(58,191,248,.4)",letterSpacing:".15em",textTransform:"uppercase",marginTop:2}}>
                    {unit}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Barre de progression (7h→21h = 50400s) */}
          <div style={{position:"absolute",bottom:0,left:0,height:3,
            width:`${Math.min(100,(1 - countdown.totalSeconds / 50400) * 100)}%`,
            background:"linear-gradient(90deg,#3abff8,#FF2D8D)",
            borderRadius:"0 3px 0 0",transition:"width 1s linear"}} />
        </div>
      )}

      {/* ── LISTE DES ÉTABLISSEMENTS (style Uber Eats) ── */}
      <section style={{padding:"24px 0 32px",position:"relative",zIndex:1,background:D.bg}}>
        <div style={{maxWidth:960,margin:"0 auto"}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"0 20px"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <h2 style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.25rem",color:D.text,margin:0,letterSpacing:"-.01em"}}>
                  Autour de toi
                </h2>
                {etablissements.filter(e => e.isActive).length > 0 && (
                  <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",fontWeight:600,color:D.pink,
                    background:"rgba(255,45,122,.08)",padding:"4px 10px",borderRadius:8,flexShrink:0}}>
                    {etablissements.filter(e => e.isActive).length} ouverts
                  </span>
                )}
              </div>
              <p style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".82rem",color:D.muted,margin:"4px 0 0"}}>
                Découvre les commerces disponibles
              </p>
            </div>
          </div>

          {etablissements.length === 0 ? (
            <div style={{textAlign:"center",padding:"72px 20px",border:"1px dashed rgba(255,45,120,.2)",borderRadius:20,margin:"0 20px"}}>
              <div style={{fontSize:"3.5rem",marginBottom:16}}>🏪</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",color:D.muted}}>
                Aucun établissement disponible pour le moment.
              </div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:".85rem",color:D.muted,marginTop:8}}>
                Revenez bientôt !
              </div>
            </div>
          ) : (
            <div style={{position:"relative"}}>
            <div
              ref={shopsScrollRef}
              onScroll={() => {
                const el = shopsScrollRef.current;
                if (el && el.scrollLeft > 20) setShowScrollHint(false);
              }}
              style={{
              display:"flex",
              overflowX:"auto",
              gap:14,
              paddingLeft:16,
              paddingRight:16,
              paddingBottom:20,
              scrollbarWidth:"none",
              scrollSnapType:"x mandatory",
              WebkitOverflowScrolling:"touch" as React.CSSProperties["WebkitOverflowScrolling"],
            }}>
              {etablissements.map(etab => {
                const isOpen = etab.isOpen ?? etab.isActive;
                return (
                <button key={etab.id}
                  onClick={() => { setSelectedEtab(etab); setActiveCat("all"); setEtabSearch(""); }}
                  style={{ flexShrink:0, width:200, scrollSnapAlign:"start",
                    background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left" }}
                >
                  <div style={{ borderRadius:18, overflow:"hidden",
                    background:"#0e0a1a",
                    border:"1px solid rgba(255,45,120,.18)",
                    boxShadow:"0 6px 24px rgba(0,0,0,.5)" }}>
                    {/* Cover */}
                    <div style={{position:"relative",height:130,overflow:"hidden",background:"rgba(255,255,255,.04)"}}>
                      {etab.coverUrl
                        ? <img src={etab.coverUrl} alt={etab.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",opacity:!isOpen&&!etab.isComingSoon?0.5:1}} />
                        : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2.5rem",opacity:.12}}>{etab.emoji||"🏪"}</div>}
                      {!isOpen && !etab.isComingSoon && <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.28)"}} />}
                      {/* Badge statut */}
                      <span style={{position:"absolute",top:8,left:8,
                        background:etab.isComingSoon?"#6366f1":isOpen?"#22c55e":"rgba(0,0,0,.55)",
                        color:"#fff",fontSize:".6rem",fontWeight:700,padding:"3px 9px",borderRadius:8,
                        backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)"}}>
                        {etab.isComingSoon?"Bientôt":isOpen?"Ouvert":"Fermé"}
                      </span>
                      {etab.deliveryFee===0 && (
                        <span style={{position:"absolute",bottom:8,left:8,background:"#ff2d78",color:"#fff",fontSize:".58rem",fontWeight:700,padding:"2px 7px",borderRadius:6}}>0 € livraison</span>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{padding:"11px 13px 14px"}}>
                      <div style={{fontWeight:700,fontSize:".9rem",
                        color:"#f0eeff",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                        {etab.name}
                      </div>
                      <div style={{marginTop:4,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                        {etab.category&&<span style={{fontSize:".7rem",color:"#9ca3af"}}>{etab.category}</span>}
                        {etab.deliveryMin!=null&&<span style={{fontSize:".7rem",color:"#6b7280"}}>· {etab.deliveryMin}–{etab.deliveryMax} min</span>}
                      </div>
                      {etab.rating!=null&&<div style={{marginTop:5,fontSize:".7rem",color:"#9ca3af",fontWeight:600}}>⭐ {etab.rating.toFixed(1)}{etab.reviewCount?` (${etab.reviewCount})`:""}</div>}
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
            {showScrollHint && etablissements.length > 1 && (
              <div style={{
                position:"absolute",right:0,top:0,bottom:20,
                display:"flex",alignItems:"center",
                pointerEvents:"none",
                background:`linear-gradient(270deg,${D.bg} 50%,transparent)`,
                paddingRight:14,paddingLeft:40,
              }}>
                <div style={{
                  animation:"scrollHint 1s ease-in-out infinite",
                  fontSize:"1.8rem",
                  color:D.pink,
                  lineHeight:1,
                  fontWeight:900,
                }}>›</div>
              </div>
            )}
            </div>
          )}
        </div>
      </section>

      {/* ── BOTTOM SHEET — ÉTABLISSEMENT SÉLECTIONNÉ ── */}
      {selectedEtab && (
        <>
          {/* Backdrop */}
          <div onClick={() => { setSelectedEtab(null); setActiveCat("all"); setEtabSearch(""); }}
            style={{position:"fixed",inset:0,background:"rgba(17,24,39,.3)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",zIndex:100,animation:"fadeIn .2s both"}} />

          {/* Bottom sheet */}
          <div style={{position:"fixed",bottom:0,left:0,right:0,height:"94vh",background:D.bg,
            borderRadius:"20px 20px 0 0",zIndex:101,overflow:"hidden",
            display:"flex",flexDirection:"column",
            animation:"slideUp .3s cubic-bezier(.32,.72,0,1) both",
            boxShadow:"0 -4px 32px rgba(0,0,0,.12)"}}>

            {/* Drag handle */}
            <div style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"10px 0 0",background:D.card}}>
              <div style={{width:40,height:4,background:D.border,borderRadius:2}} />
            </div>

            {/* Scrollable area */}
            <div style={{flex:1,overflowY:"auto",scrollbarWidth:"none"}}>

              {/* Cover */}
              <div style={{position:"relative",height:172,overflow:"hidden",background:`linear-gradient(135deg,${D.pink}18,${D.cyan}18)`,flexShrink:0}}>
                {selectedEtab.coverUrl && <img src={selectedEtab.coverUrl} alt={selectedEtab.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />}
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(0,0,0,.06) 0%,rgba(0,0,0,.32) 100%)"}} />
                <button onClick={() => { setSelectedEtab(null); setActiveCat("all"); setEtabSearch(""); }}
                  style={{position:"absolute",top:12,left:12,zIndex:3,width:36,height:36,borderRadius:"50%",
                    background:"rgba(255,255,255,.92)",backdropFilter:"blur(8px)",border:"none",
                    color:D.text,fontSize:"1rem",fontWeight:700,cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>←</button>
              </div>

              {/* Info panel */}
              <div style={{background:D.card,padding:"0 16px 14px",borderBottom:`1px solid ${D.border}`}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-end",marginTop:-26,position:"relative",zIndex:2,marginBottom:10}}>
                  <div style={{width:56,height:56,borderRadius:14,overflow:"hidden",flexShrink:0,
                    border:"3px solid #fff",background:"#fff",
                    boxShadow:"0 2px 12px rgba(0,0,0,.1)",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {selectedEtab.logoUrl
                      ? <img src={selectedEtab.logoUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                      : <span style={{fontSize:"1.6rem"}}>🏪</span>}
                  </div>
                  <div style={{paddingBottom:2,flex:1,minWidth:0}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:800,fontSize:"1.15rem",color:D.text,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{selectedEtab.name}</div>
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,
                      background: settings.shopOpen ? "rgba(22,163,74,.1)" : "rgba(107,114,128,.1)",
                      color: settings.shopOpen ? "#16a34a" : D.muted,
                      fontSize:".7rem",fontFamily:"'Inter',sans-serif",fontWeight:700,
                      padding:"3px 10px",borderRadius:20,marginTop:2}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background: settings.shopOpen ? "#16a34a" : D.muted,display:"inline-block"}} />
                      {settings.shopOpen ? "Ouvert" : "Fermé"}
                    </span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {selectedEtab.openHours && <span style={{display:"inline-flex",alignItems:"center",gap:5,background:D.cardDark,color:D.muted,fontSize:".75rem",fontFamily:"'Inter',sans-serif",padding:"5px 12px",borderRadius:20}}>⏱ {selectedEtab.openHours}</span>}
                  {selectedEtab.address && <span style={{display:"inline-flex",alignItems:"center",gap:5,background:D.cardDark,color:D.muted,fontSize:".75rem",fontFamily:"'Inter',sans-serif",padding:"5px 12px",borderRadius:20}}>📍 {selectedEtab.address}</span>}
                  {selectedEtab.phone && <a href={`tel:${selectedEtab.phone}`} style={{display:"inline-flex",alignItems:"center",gap:5,background:"rgba(27,169,255,.08)",color:D.cyan,fontSize:".75rem",fontFamily:"'Inter',sans-serif",fontWeight:600,padding:"5px 12px",borderRadius:20,textDecoration:"none"}}>📞 {selectedEtab.phone}</a>}
                </div>
              </div>

              {/* Sticky category tabs */}
              <div style={{position:"sticky",top:0,zIndex:10,background:D.card,
                borderBottom:`1px solid ${D.border}`,boxShadow:"0 1px 6px rgba(0,0,0,.04)"}}>
                <div style={{display:"flex",gap:8,overflowX:"auto",padding:"10px 16px",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
                  {cats.map(c => (
                    <button key={c.key} onClick={() => setActiveCat(c.key)}
                      style={{flexShrink:0,padding:"7px 16px",borderRadius:30,
                        border: activeCat===c.key ? "none" : `1px solid ${D.border}`,
                        background: activeCat===c.key ? D.text : D.card,
                        color: activeCat===c.key ? "#fff" : D.muted,
                        fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".82rem",
                        cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>
                      {c.key==="all" ? "Tout" : c.emoji ? `${c.emoji} ${c.label.replace(c.emoji,"").trim()}` : c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products */}
              <div style={{paddingBottom: 90}}>
                {loading ? (
                  <div style={{textAlign:"center",color:D.muted,padding:"60px 0",fontSize:".9rem"}}>Chargement...</div>
                ) : filtered.length === 0 ? (
                  <div style={{textAlign:"center",color:D.muted,padding:"60px 0",fontSize:".9rem",background:D.card,margin:16,borderRadius:12}}>Aucun produit disponible pour le moment.</div>
                ) : activeCat !== "all" ? (
                  <div style={{background:D.card,marginTop:8}}>
                    {filtered.map(p => <EtabProductRow key={p.id} p={p} D={D} lastAddedId={lastAddedId} addToCart={pickOrAddEtab} openProductModal={openProductModal} activePromo={activePromo} getProductPromoPrice={getProductPromoPrice} />)}
                  </div>
                ) : (
                  <>
                    {/* Category sections */}
                    {cats.filter(c => c.key !== "all").map(cat => {
                      const catProds = filtered.filter(p => p.cat === cat.key);
                      if (!catProds.length) return null;
                      return (
                        <div key={cat.key} style={{background:D.card,marginBottom:8}}>
                          <div style={{padding:"16px 16px 8px",display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontFamily:"'Inter',sans-serif",fontWeight:800,fontSize:".95rem",color:D.text}}>
                              {cat.emoji} {cat.emoji ? cat.label.replace(cat.emoji,"").trim() : cat.label}
                            </span>
                            <span style={{fontFamily:"'Inter',sans-serif",fontSize:".78rem",color:D.muted}}>{catProds.length}</span>
                          </div>
                          {catProds.map(p => <EtabProductRow key={p.id} p={p} D={D} lastAddedId={lastAddedId} addToCart={pickOrAddEtab} openProductModal={openProductModal} activePromo={activePromo} getProductPromoPrice={getProductPromoPrice} />)}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

            </div>{/* fin scrollable */}

          </div>{/* fin bottom sheet */}

          {/* Size picker — sélection taille + suppléments + moitié-moitié */}
          {sizePickerProd && (() => {
            const sizes = parseSizesEtab(sizePickerProd.desc||"") || [];
            const etabSupps = supplements.filter(s => !s.etablissementId || (selectedEtab && s.etablissementId === selectedEtab.id));
            const suppTotal = sizePickerSelectedSupps.reduce((s,x) => s + getSuppPrice(x, sizePickerChosenSize?.label), 0);
            const chosenPrice = sizePickerChosenSize ? sizePickerChosenSize.price + suppTotal : 0;
            const pizzasWithSizes = etabProds.filter(p => p.id !== sizePickerProd.id && parseSizesEtab(p.desc||"") && p.stock > 0);
            const confirmAdd = () => {
              if (!sizePickerChosenSize) return;
              let id: string;
              let name: string;
              let price: number;
              if (halfHalfMode && halfHalfProd2) {
                const sizes2 = parseSizesEtab(halfHalfProd2.desc||"") || [];
                const size2 = sizes2.find(s => s.label === sizePickerChosenSize.label) || sizes2[0];
                price = Math.max(sizePickerChosenSize.price, size2?.price||0) + suppTotal;
                id = `${sizePickerProd.id}_${sizePickerChosenSize.label}_half_${halfHalfProd2.id}`;
                name = `½ ${sizePickerProd.name} / ½ ${halfHalfProd2.name} (${sizePickerChosenSize.label})`;
              } else {
                price = chosenPrice;
                id = `${sizePickerProd.id}_${sizePickerChosenSize.label}`;
                name = `${sizePickerProd.name} (${sizePickerChosenSize.label})`;
              }
              const noteParts: string[] = [];
              if (sizePickerSelectedSupps.length > 0) noteParts.push(sizePickerSelectedSupps.map(s=>`+ ${s.name}`).join(', '));
              if (sizePickerNote.trim()) noteParts.push(sizePickerNote.trim());
              const note = noteParts.length > 0 ? noteParts.join(' · ') : undefined;
              addToCart(id, name, price, note);
              setSizePickerProd(null);
            };
            return (
            <div style={{position:"fixed",inset:0,zIndex:950}} onClick={() => setSizePickerProd(null)}>
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)"}} />
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:D.card,
                borderTop:`1px solid ${D.border}`,borderRadius:"22px 22px 0 0",padding:"0 20px 0",
                maxHeight:"85vh",overflowY:"auto"}}
                onClick={e => e.stopPropagation()}>
                <div style={{display:"flex",justifyContent:"center",padding:"14px 0 8px",position:"sticky",top:0,background:D.card,zIndex:1}}>
                  <div style={{width:38,height:4,background:D.border,borderRadius:2}} />
                </div>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:800,color:D.text,fontSize:"1.05rem",marginBottom:2}}>{sizePickerProd.name}</div>
                <div style={{fontFamily:"'Inter',sans-serif",color:D.muted,fontSize:".8rem",marginBottom:16}}>{getDisplayDescEtab(sizePickerProd.desc||"")}</div>

                {/* — Tailles — */}
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:".7rem",fontWeight:700,color:D.muted,letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>Choisir la taille *</div>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                  {sizes.map((size:{label:string;price:number}) => {
                    const isChosen = sizePickerChosenSize?.label === size.label;
                    return (
                      <button key={size.label} onClick={() => { setSizePickerChosenSize(size); setHalfHalfProd2(null); setHalfHalfMode(false); }}
                        style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                          padding:"13px 16px",borderRadius:12,cursor:"pointer",textAlign:"left",transition:"all .15s",
                          border: isChosen ? `2px solid ${D.pink}` : `1px solid ${D.border}`,
                          background: isChosen ? `rgba(255,45,120,.06)` : D.cardDark}}>
                        <div>
                          <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,color:D.text,fontSize:".95rem"}}>{size.label}</div>
                          <div style={{fontFamily:"'Inter',sans-serif",fontSize:".7rem",color:D.muted,marginTop:1}}>
                            {size.label==="Petite"?"~1 pers.":size.label==="Grande"?"~2-3 pers.":"~4-6 pers."}
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontFamily:"'Inter',sans-serif",fontWeight:800,color:D.pink,fontSize:".95rem"}}>{size.price.toFixed(2)}€</span>
                          <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${isChosen?D.pink:D.border}`,background:isChosen?D.pink:"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {isChosen && <div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* — Moitié-Moitié — */}
                {pizzasWithSizes.length > 0 && sizePickerChosenSize && (
                  <div style={{marginBottom:16}}>
                    <button onClick={() => { setHalfHalfMode(m => !m); setHalfHalfProd2(null); }}
                      style={{width:"100%",padding:"11px 16px",borderRadius:12,cursor:"pointer",textAlign:"left",
                        border: halfHalfMode ? `2px solid ${D.cyan}` : `1px solid ${D.border}`,
                        background: halfHalfMode ? `rgba(58,191,248,.06)` : D.cardDark,
                        fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".88rem",
                        color: halfHalfMode ? D.cyan : D.text,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:"1.1rem"}}>½</span> Moitié-Moitié
                      <span style={{marginLeft:"auto",fontSize:".72rem",fontWeight:500,color:D.muted}}>2 saveurs sur 1 pizza</span>
                    </button>
                    {halfHalfMode && (
                      <div style={{marginTop:8,borderRadius:12,border:`1px solid ${D.border}`,overflow:"hidden"}}>
                        <div style={{padding:"10px 14px",background:D.cardDark,fontFamily:"'Inter',sans-serif",fontSize:".7rem",color:D.muted,fontWeight:600}}>
                          Choisir la 2e moitié :
                        </div>
                        {pizzasWithSizes.slice(0,8).map((pp:any) => (
                          <button key={pp.id} onClick={() => setHalfHalfProd2(halfHalfProd2?.id===pp.id ? null : pp)}
                            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                              background: halfHalfProd2?.id===pp.id ? `rgba(58,191,248,.07)` : D.card,
                              border:"none",borderTop:`1px solid ${D.border}`,cursor:"pointer",textAlign:"left",
                              borderLeft: halfHalfProd2?.id===pp.id ? `3px solid ${D.cyan}` : "3px solid transparent"}}>
                            {pp.image && <img src={pp.image} alt={pp.name} style={{width:36,height:36,borderRadius:6,objectFit:"cover",flexShrink:0}} />}
                            <span style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".88rem",color:D.text,flex:1,textAlign:"left"}}>{pp.name}</span>
                            {halfHalfProd2?.id===pp.id && <span style={{color:D.cyan,fontSize:".8rem"}}>✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* — Suppléments — */}
                {etabSupps.length > 0 && (
                  <div style={{marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <div style={{fontFamily:"'Inter',sans-serif",fontSize:".7rem",fontWeight:700,color:D.muted,letterSpacing:".1em",textTransform:"uppercase"}}>Suppléments</div>
                      {!sizePickerChosenSize && <div style={{fontFamily:"'Inter',sans-serif",fontSize:".65rem",color:D.muted,fontStyle:"italic"}}>prix selon la taille</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {etabSupps.map(s => {
                        const isOn = sizePickerSelectedSupps.some(x => x.id===s.id);
                        const effPrice = getSuppPrice(s, sizePickerChosenSize?.label);
                        return (
                          <button key={s.id} onClick={() => setSizePickerSelectedSupps(prev => isOn ? prev.filter(x=>x.id!==s.id) : [...prev,s])}
                            style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,cursor:"pointer",
                              border: isOn ? `2px solid ${D.pink}` : `1px solid ${D.border}`,
                              background: isOn ? `rgba(255,45,120,.05)` : D.cardDark}}>
                            {s.emoji && <span style={{fontSize:"1.1rem"}}>{s.emoji}</span>}
                            <span style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".9rem",color:D.text,flex:1,textAlign:"left"}}>{s.name}</span>
                            <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".88rem",color:D.pink}}>
                              {effPrice > 0 ? `+${effPrice.toFixed(2)}€` : "Gratuit"}
                            </span>
                            <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${isOn?D.pink:D.border}`,background:isOn?D.pink:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {isOn && <span style={{color:"#fff",fontSize:".7rem",fontWeight:900}}>✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* — Note / Instruction — */}
                <div style={{marginBottom:20}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontSize:".7rem",fontWeight:700,color:D.muted,letterSpacing:".1em",textTransform:"uppercase",marginBottom:8}}>Instructions spéciales (optionnel)</div>
                  <input
                    value={sizePickerNote}
                    onChange={e => setSizePickerNote(e.target.value)}
                    placeholder="Ex: sans oignon, bien cuit, avec du miel…"
                    style={{width:"100%",background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:10,
                      padding:"11px 14px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:".88rem",
                      boxSizing:"border-box",outline:"none"}}
                  />
                </div>

                {/* — Bouton Ajouter — */}
                <div style={{position:"sticky",bottom:0,background:D.card,paddingBottom:28,paddingTop:8}}>
                  <button onClick={confirmAdd} disabled={!sizePickerChosenSize || (halfHalfMode && !halfHalfProd2)}
                    style={{width:"100%",padding:"16px",borderRadius:14,border:"none",cursor:(!sizePickerChosenSize||(halfHalfMode&&!halfHalfProd2))?"not-allowed":"pointer",
                      background:(!sizePickerChosenSize||(halfHalfMode&&!halfHalfProd2))?"rgba(0,0,0,.1)":D.pink,
                      color:"#fff",fontFamily:"'Inter',sans-serif",fontWeight:800,fontSize:"1rem",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s"}}>
                    {!sizePickerChosenSize ? "Choisir une taille" : (halfHalfMode && !halfHalfProd2) ? "Choisir la 2e moitié" : `Ajouter · ${chosenPrice.toFixed(2)}€`}
                  </button>
                </div>
              </div>
            </div>
            );
          })()}
        </>
      )}

      {/* LIVRAISON GRATUITE BANNER */}
      <div style={{margin:"0 28px 44px",border:`1px solid ${D.border}`,borderRadius:18,padding:"24px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,flexWrap:"wrap",background:D.card,boxShadow:D.shadow}}>
        <div>
          <strong style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.4rem",color:D.pink,display:"block",marginBottom:4}}>Livraison gratuite</strong>
          <p style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".78rem",color:D.muted}}>Pour toute commande à partir de {deliveryConfig.free_delivery_threshold}€</p>
        </div>
        <button onClick={() => document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})}
          style={{padding:"14px 28px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".88rem",letterSpacing:".04em",textTransform:"uppercase",border:"none",cursor:"pointer",borderRadius:14,background:D.pink,color:"#fff"}}>
          Commander
        </button>
      </div>

      {/* PACKS */}
      {packs.length > 0 && (
      <section id="packs" style={{padding:"48px 28px",position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.5rem",letterSpacing:".01em",color:D.text}}>
            Packs <span style={{color:D.pink}}>du jour</span>
          </div>
          <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",color:D.cyan,letterSpacing:".02em",cursor:"pointer"}}>Voir tout →</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:14}}>
          {packs.map(pk => (
            <div key={pk.id} style={{background:D.card,border: pk.star ? `1px solid ${D.pink}` : `1px solid ${D.border}`,borderRadius:18,padding:22,position:"relative",overflow:"hidden",cursor:"pointer",boxShadow:D.shadow}}>
              {pk.star && (
                <div style={{position:"absolute",top:0,right:0,background:D.pink,color:"#fff",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".6rem",letterSpacing:".06em",padding:"5px 12px",borderRadius:"0 18px 0 12px"}}>Populaire</div>
              )}
              <span style={{fontSize:"2.2rem",marginBottom:12,display:"block"}}>{pk.emoji}</span>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.3rem",color:D.text,marginBottom:4}}>{pk.name}</div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",color:D.cyan,letterSpacing:".12em",marginBottom:10}}>{pk.tag}</div>
              <div style={{fontSize:".72rem",color:D.muted,lineHeight:1.8,marginBottom:18,borderLeft:`2px solid rgba(255,45,120,.2)`,paddingLeft:10,fontFamily:"'Inter',system-ui,sans-serif"}}>
                {pk.items.split('\n').map((item,i) => <div key={i}>{item}</div>)}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.6rem",color:D.pink,lineHeight:1}}>{Number(pk.price).toFixed(2)}€</div>
                  <small style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:D.muted,textDecoration:"line-through"}}>valeur : {pk.real}€</small>
                </div>
                <button onClick={() => addToCart(pk.id, pk.name, pk.price)}
                  style={{background:"transparent",border:`1px solid ${D.pink}`,color:D.pink,padding:"10px 20px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".82rem",letterSpacing:".04em",textTransform:"uppercase",cursor:"pointer",borderRadius:12}}>
                  Ajouter
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* FOOTER */}
      <footer style={{borderTop:`1px solid ${D.border}`,padding:"28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16,position:"relative",zIndex:1,background:D.cardDark}}>
        <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.2rem",color:D.pink,letterSpacing:".04em"}}>YASSALA DAY</div>
        <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,letterSpacing:".02em",textAlign:"center",lineHeight:1.8}}>
          Ouvert {settings.hours} · {settings.zone}<br/>© 2025 Yassala Shop — Tous droits réservés
        </div>
        <button onClick={() => setShowHistory(true)}
          style={{background:"transparent",border:`1px solid ${D.border}`,color:D.muted,borderRadius:12,padding:"10px 18px",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",cursor:"pointer",letterSpacing:".02em"}}>
          Mes commandes
        </button>
      </footer>

      {/* TOAST */}
      <div style={{position:"fixed",top:18,right:18,background:"#fff",borderLeft:`4px solid ${D.pink}`,borderTop:`1px solid rgba(255,45,120,.15)`,borderRight:`1px solid rgba(255,45,120,.15)`,borderBottom:`1px solid rgba(255,45,120,.15)`,borderRadius:10,padding:"12px 18px",display:"flex",alignItems:"center",gap:10,zIndex:9998,maxWidth:280,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".82rem",color:D.text,boxShadow:"0 4px 24px rgba(255,45,120,.12), 0 1px 4px rgba(0,0,0,.06)",transform: toast.show ? "translateX(0)" : "translateX(130%)",transition:"transform .4s cubic-bezier(.34,1.56,.64,1)"}}>
        <span style={{color:D.pink,fontSize:"1rem",flexShrink:0}}>✓</span>
        {toast.msg}
      </div>

      {/* ORDER CONFIRMATION */}
      {orderConfirmId && (
        <div style={{position:"fixed",inset:0,background:D.overlay,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
          <div style={{background:D.card,border:`1px solid ${lastConfirmPickup ? "rgba(58,191,248,.3)" : "rgba(255,45,120,.3)"}`,borderRadius:12,padding:"36px 28px",maxWidth:440,width:"100%",textAlign:"center",animation:"fadeUp .4s both",boxShadow:"0 8px 40px rgba(0,0,0,.1)"}}>
            <div style={{fontSize:"3rem",marginBottom:12}}>{lastConfirmPickup ? "🏪" : "✅"}</div>
            {lastConfirmPickup && (
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(58,191,248,.08)",border:"1px solid rgba(58,191,248,.25)",borderRadius:20,padding:"4px 14px",marginBottom:12}}>
                <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",color:D.cyan,letterSpacing:".1em"}}>🏪 CLICK & COLLECT</span>
              </div>
            )}
            <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.5rem",color: lastConfirmPickup ? D.cyan : D.pink,marginBottom:6}}>COMMANDE CONFIRMÉE</div>
            <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",color:D.muted,marginBottom:16}}>
              {orderConfirmNum ? `#${orderConfirmNum}` : orderConfirmId.slice(-8).toUpperCase()}
            </div>
            {lastConfirmPickup && (
              <div style={{background:"rgba(58,191,248,.04)",border:"1px solid rgba(58,191,248,.12)",borderRadius:8,padding:"14px 16px",marginBottom:16,textAlign:"left"}}>
                <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:D.cyan,letterSpacing:".1em",marginBottom:8}}>🏠 RETRAIT STOCK</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".95rem",color:D.text,marginBottom:2}}>{lastConfirmPickup.snapshot?.name}</div>
                <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,marginBottom:6}}>{lastConfirmPickup.snapshot?.address}{lastConfirmPickup.snapshot?.city ? `, ${lastConfirmPickup.snapshot.city}` : ""}</div>
                {lastConfirmPickup.snapshot?.instructions && <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",color:D.cyan,marginBottom:6}}>ℹ️ {lastConfirmPickup.snapshot.instructions}</div>}
                <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted}}>🕐 {lastConfirmPickup.time === 'asap' ? 'Dès que possible' : lastConfirmPickup.time}</div>
                <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.pink,marginTop:8,letterSpacing:".06em"}}>Présente ton numéro de commande au retrait.</div>
              </div>
            )}
            <a href={`/suivi?id=${orderConfirmId}`}
              style={{display:"block",background: lastConfirmPickup ? D.cyan : D.pink,color:"#fff",borderRadius:4,padding:"13px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".1em",textDecoration:"none",textTransform:"uppercase",marginBottom:12}}>
              🔎 SUIVRE MA COMMANDE
            </a>
            <button onClick={() => { setOrderConfirmId(null); setLastConfirmPickup(null); }}
              style={{background:"transparent",border:`1px solid ${D.border}`,color:D.muted,borderRadius:4,padding:"10px",width:"100%",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",cursor:"pointer",letterSpacing:".08em"}}>
              FERMER
            </button>
          </div>
        </div>
      )}


      {/* ── CART MODAL ── */}
      {showCart && (
        <div onClick={() => setShowCart(false)} style={{position:"fixed",inset:0,background:D.overlay,zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:16,paddingLeft:16,paddingRight:16,paddingBottom:80,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:D.card,border:`1px solid rgba(255,45,120,.2)`,borderRadius:10,width:"100%",maxWidth:500,animation:"fadeUp .3s both",maxHeight:"calc(100vh - 96px)",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,.1)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px 16px",flexShrink:0,borderBottom:`1px solid rgba(255,45,120,.12)`,background:D.card,position:"sticky",top:0,zIndex:10}}>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.5rem",color:D.pink,letterSpacing:".04em"}}>🛒 MON PANIER</div>
              <button onClick={() => setShowCart(false)} style={{background:D.cardDark,border:`1px solid ${D.border}`,color:D.text,fontSize:"1rem",cursor:"pointer",borderRadius:6,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{overflowY:"auto",padding:"20px 24px 24px",flex:1}}>
              {cart.length === 0 ? (
                <div style={{textAlign:"center",padding:"40px",color:D.muted,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".8rem"}}>// panier vide</div>
              ) : (
                <>
                  <div style={{marginBottom:20}}>
                    {cart.map(item => (
                      <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px",background:D.cardDark,borderRadius:6,marginBottom:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:"1rem",fontFamily:"'Inter',sans-serif",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",color:D.text,whiteSpace:"nowrap"}}>{item.name}</div>
                          {item.note && <div style={{fontSize:".72rem",color:D.muted,fontFamily:"'Inter',sans-serif",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.note}</div>}
                          <div style={{fontSize:".88rem",color:D.pink,fontFamily:"'Inter',sans-serif",fontWeight:700}}>{item.price.toFixed(2)}€</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                          <button onClick={e => { e.stopPropagation(); updateQty(item.id,-1); }} style={{width:30,height:30,border:`1px solid ${D.pink}`,background:"transparent",color:D.pink,borderRadius:4,cursor:"pointer",fontSize:"1.2rem",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                          <span style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:"1rem",minWidth:20,textAlign:"center",color:D.text}}>{item.qty}</span>
                          <button onClick={e => { e.stopPropagation(); updateQty(item.id,1); }} style={{width:30,height:30,border:`1px solid ${D.pink}`,background:"transparent",color:D.pink,borderRadius:4,cursor:"pointer",fontSize:"1.2rem",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                          <button onClick={e => { e.stopPropagation(); setCart(prev => prev.filter(i => i.id !== item.id)); }} style={{width:30,height:30,border:`1px solid ${D.border}`,background:"transparent",color:D.muted,borderRadius:4,cursor:"pointer",fontSize:".9rem",display:"flex",alignItems:"center",justifyContent:"center"}}>🗑</button>
                        </div>
                        <div style={{fontFamily:"'Inter',sans-serif",fontWeight:800,fontSize:"1.05rem",color:D.pink,minWidth:60,textAlign:"right",flexShrink:0}}>{(item.price * item.qty).toFixed(2)}€</div>
                      </div>
                    ))}
                  </div>

                  <UpsellCarousel source="cart" cartItems={cart} allProducts={products} onAddToCart={p => addToCart(p.id, p.name, p.price)} cartTotal={cartTotal} deliveryMin={deliveryConfig.minimum_order_amount} />
                  <SmartThresholdSuggestions cartItems={cart} allProducts={products} cartTotal={cartTotal} threshold={deliveryConfig.free_delivery_threshold} onAddToCart={p => addToCart(p.id, p.name, p.price)} />

                  {/* Coupon */}
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <input placeholder="Code promo" value={couponInput} onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }} onKeyDown={e => e.key==="Enter" && applyCoupon()}
                      style={{flex:1,background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:4,padding:"9px 12px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:".85rem",outline:"none"}} />
                    <button onClick={applyCoupon} style={{background:"rgba(58,191,248,.08)",border:`1px solid rgba(58,191,248,.3)`,color:D.cyan,padding:"0 14px",borderRadius:4,cursor:"pointer",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",letterSpacing:".06em",whiteSpace:"nowrap"}}>APPLIQUER</button>
                  </div>
                  {couponError && <div style={{color:D.pink,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",marginBottom:8}}>{couponError}</div>}
                  {coupon && <div style={{color:"#22c55e",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",marginBottom:8}}>
                    ✓ Code «{coupon.code}» : -{coupon.type==="percent" ? `${coupon.value}%` : `${coupon.value.toFixed(2)}€`}
                    <button onClick={() => { setCoupon(null); setCouponInput(""); }} style={{marginLeft:8,background:"transparent",border:"none",color:D.muted,cursor:"pointer",fontSize:".8rem"}}>✕</button>
                  </div>}

                  {/* FULFILLMENT TOGGLE */}
                  {(settings.fulfillmentDeliveryEnabled !== false || settings.fulfillmentPickupEnabled !== false) && (
                  <div style={{marginBottom:18}}>
                    <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:D.muted,letterSpacing:".12em",marginBottom:8}}>// MODE DE RÉCEPTION</div>
                    {settings.fulfillmentDeliveryEnabled !== false && settings.fulfillmentPickupEnabled !== false ? (
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div onClick={() => setFulfillmentType('delivery')} style={{padding:"10px 8px",borderRadius:6,cursor:"pointer",textAlign:"center",border: fulfillmentType==='delivery' ? `2px solid ${D.pink}` : `1px solid ${D.border}`,background: fulfillmentType==='delivery' ? "rgba(255,45,120,.06)" : D.cardDark,transition:"all .2s"}}>
                          <div style={{fontSize:"1.3rem",marginBottom:3}}>🚗</div>
                          <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".82rem",color: fulfillmentType==='delivery' ? D.pink : D.muted,letterSpacing:".05em"}}>LIVRAISON</div>
                        </div>
                        <div onClick={() => setFulfillmentType('pickup')} style={{padding:"10px 8px",borderRadius:6,cursor:"pointer",textAlign:"center",border: fulfillmentType==='pickup' ? `2px solid ${D.cyan}` : `1px solid ${D.border}`,background: fulfillmentType==='pickup' ? "rgba(58,191,248,.06)" : D.cardDark,transition:"all .2s"}}>
                          <div style={{fontSize:"1.3rem",marginBottom:3}}>🏪</div>
                          <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".82rem",color: fulfillmentType==='pickup' ? D.cyan : D.muted,letterSpacing:".05em"}}>CLICK & COLLECT</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{padding:"12px",borderRadius:6,textAlign:"center",border:`2px solid ${settings.fulfillmentDeliveryEnabled !== false ? D.pink : D.cyan}`,background:`rgba(${settings.fulfillmentDeliveryEnabled !== false ? "255,45,120" : "0,153,204"},.06)`}}>
                        <div style={{fontSize:"1.3rem",marginBottom:3}}>{settings.fulfillmentDeliveryEnabled !== false ? "🚗" : "🏪"}</div>
                        <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".82rem",color: settings.fulfillmentDeliveryEnabled !== false ? D.pink : D.cyan,letterSpacing:".05em"}}>{settings.fulfillmentDeliveryEnabled !== false ? "LIVRAISON" : "CLICK & COLLECT"}</div>
                      </div>
                    )}
                  </div>
                  )}

                  {activePromo && <FlashDealBanner promo={activePromo} products={products} source="cart" />}

                  {/* TOTALS */}
                  <div style={{borderTop:`1px solid rgba(255,45,120,.15)`,paddingTop:16,marginBottom:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                      <span style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".75rem",color:D.muted}}>SOUS-TOTAL</span>
                      <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,color:D.text}}>{cartTotal.toFixed(2)}€</span>
                    </div>
                    {coupon && <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                      <span style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".75rem",color:"#22c55e"}}>RÉDUCTION</span>
                      <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,color:"#22c55e"}}>-{getDiscount().toFixed(2)}€</span>
                    </div>}
                    {activePromo && promoDiscount > 0 && (
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".75rem",color:"#ff6b35"}}>🔥 PROMO FLASH</span>
                        <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,color:"#ff6b35"}}>-{promoDiscount.toFixed(2)}€</span>
                      </div>
                    )}
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom: feeResult&&feeResult.supplements.length>0 ? 4 : 8}}>
                      <span style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".75rem",color:D.muted}}>{fulfillmentType==='pickup' ? 'RETRAIT' : 'LIVRAISON'}</span>
                      <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,color:"#22c55e"}}>{fulfillmentType==='pickup' ? 'GRATUIT' : feeResult?.isFree ? 'GRATUITE' : `${deliveryFeeDisplay.toFixed(2)}€`}</span>
                    </div>
                    {feeResult && !feeResult.isFree && feeResult.supplements.length > 0 && (
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                        {feeResult.supplements.map((s,i) => (
                          <span key={i} style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",background:"rgba(58,191,248,.08)",border:`1px solid rgba(58,191,248,.2)`,color:D.cyan,borderRadius:4,padding:"2px 7px",letterSpacing:".06em"}}>{s}</span>
                        ))}
                      </div>
                    )}
                    {feeResult && !feeResult.isFree && distanceKm > 0 && (
                      <div style={{marginBottom:6,opacity:.6}}>
                        <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:D.muted}}>
                          {distanceKm.toFixed(1)} km · base {feeResult.breakdown.base.toFixed(2)}€{feeResult.breakdown.distance > 0 && ` + dist ${feeResult.breakdown.distance.toFixed(2)}€`}{feeResult.breakdown.rain > 0 && ` + pluie ${feeResult.breakdown.rain.toFixed(2)}€`}{feeResult.breakdown.rush > 0 && ` + rush ${feeResult.breakdown.rush.toFixed(2)}€`}
                        </span>
                      </div>
                    )}
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:12,borderTop:`1px solid rgba(255,45,120,.15)`}}>
                      <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.1rem",color:D.pink}}>TOTAL</span>
                      <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.3rem",color:D.pink}}>{finalTotal.toFixed(2)}€</span>
                    </div>
                  </div>

                  {/* ORDER FORM */}
                  <div style={{display:"grid",gap:12,marginBottom:20}}>
                    <input placeholder="Nom complet" value={orderForm.name} onChange={e => setOrderForm(f => ({...f, name:e.target.value}))}
                      style={{width:"100%",background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:4,padding:"12px",color:D.text,fontSize:".9rem",fontFamily:"'Inter',sans-serif"}} />
                    <div style={{display:"flex",gap:6}}>
                      <select value={phoneCountry} onChange={e => setPhoneCountry(e.target.value)} style={{background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:4,padding:"12px 8px",color:D.text,fontSize:".9rem",fontFamily:"'Inter',sans-serif",cursor:"pointer",flexShrink:0,width:90}}>
                        <option value="+594">🇬🇫 +594</option>
                        <option value="+33">🇫🇷 +33</option>
                      </select>
                      <input placeholder={phoneCountry==="+594" ? "694 00 00 00" : "6 00 00 00 00"} value={orderForm.phone} onChange={e => setOrderForm(f => ({...f, phone:e.target.value}))} type="tel"
                        style={{flex:1,background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:4,padding:"12px",color:D.text,fontSize:".9rem",fontFamily:"'Inter',sans-serif"}} />
                    </div>
                    <input placeholder="Email * (obligatoire pour les notifications)" value={orderForm.email} onChange={e => setOrderForm(f => ({...f, email:e.target.value}))} type="email"
                      style={{width:"100%",background:D.cardDark,border: orderForm.email ? `1px solid rgba(34,197,94,.4)` : `1px solid rgba(255,45,120,.3)`,borderRadius:4,padding:"12px",color:D.text,fontSize:".9rem",fontFamily:"'Inter',sans-serif"}} />

                    {fulfillmentType === 'delivery' && (
                      <div style={{position:"relative"}}>
                        <div style={{position:"relative"}}>
                          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:"1rem",pointerEvents:"none"}}>📍</span>
                          <input placeholder="Tape ton adresse (ex: Rue Schoelcher, Cayenne)" value={orderForm.address}
                            onChange={e => { const v=e.target.value; setOrderForm(f => ({...f, address:v, lat:0, lng:0})); searchAddress(v); }}
                            onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            style={{width:"100%",background:D.cardDark,border: orderForm.lat ? `1px solid rgba(34,197,94,.4)` : `1px solid ${D.border}`,borderRadius:4,padding:"12px 12px 12px 36px",color:D.text,fontSize:".9rem",fontFamily:"'Inter',sans-serif"}} />
                          {orderForm.lat !== 0 && <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#22c55e",fontSize:".78rem",fontFamily:"'Inter',system-ui,sans-serif"}}>✓ localisé</span>}
                        </div>
                        {showSuggestions && addressSuggestions.length > 0 && (
                          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:D.card,border:`1px solid rgba(58,191,248,.2)`,borderRadius:"0 0 6px 6px",maxHeight:200,overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,.12)"}}>
                            {addressSuggestions.map((s,i) => (
                              <div key={i} onMouseDown={() => { setOrderForm(f => ({...f, address:s.display, lat:s.lat, lng:s.lng})); setShowSuggestions(false); showToast("Adresse localisée ✓"); }}
                                style={{padding:"10px 14px",cursor:"pointer",fontSize:".82rem",color:D.text,borderBottom:`1px solid ${D.border}`,fontFamily:"'Inter',sans-serif",transition:"background .15s",display:"flex",alignItems:"center",gap:8}}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(58,191,248,.06)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                <span style={{color:D.cyan,flexShrink:0}}>📍</span>{s.display}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Click & Collect — STOCK SEULEMENT (pas de relay) */}
                    {fulfillmentType === 'pickup' && (
                      <div style={{display:"grid",gap:10}}>
                        <div style={{background:"rgba(58,191,248,.04)",border:`1px solid rgba(58,191,248,.15)`,borderRadius:8,padding:"14px 16px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                            <span style={{fontSize:"1.4rem"}}>🏠</span>
                            <div>
                              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",color:D.text}}>Retrait Yassala Day Stock</div>
                              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",color:D.muted}}>Retrait chez Yassala Day, Cayenne</div>
                            </div>
                          </div>
                          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:D.cyan}}>ℹ️ Présente ton numéro de commande à l&apos;accueil</div>
                        </div>
                        <div>
                          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:D.muted,letterSpacing:".1em",marginBottom:8}}>// HEURE DE RETRAIT</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                            <div onClick={() => setPickupTimeMode('asap')} style={{padding:"10px",borderRadius:6,cursor:"pointer",textAlign:"center",border: pickupTimeMode==='asap' ? `2px solid ${D.pink}` : `1px solid ${D.border}`,background: pickupTimeMode==='asap' ? "rgba(255,45,120,.06)" : D.cardDark,transition:"all .2s"}}>
                              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".8rem",color: pickupTimeMode==='asap' ? D.pink : D.muted}}>⚡ DÈS QUE POSSIBLE</div>
                            </div>
                            <div onClick={() => setPickupTimeMode('scheduled')} style={{padding:"10px",borderRadius:6,cursor:"pointer",textAlign:"center",border: pickupTimeMode==='scheduled' ? `2px solid ${D.cyan}` : `1px solid ${D.border}`,background: pickupTimeMode==='scheduled' ? "rgba(58,191,248,.06)" : D.cardDark,transition:"all .2s"}}>
                              <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".8rem",color: pickupTimeMode==='scheduled' ? D.cyan : D.muted}}>🕐 CHOISIR L&apos;HEURE</div>
                            </div>
                          </div>
                          {pickupTimeMode === 'scheduled' && (
                            <input type="time" value={pickupTimeValue} onChange={e => setPickupTimeValue(e.target.value)}
                              style={{width:"100%",background:D.cardDark,border:`1px solid rgba(58,191,248,.25)`,borderRadius:4,padding:"12px",color:D.text,fontSize:".9rem",fontFamily:"'Inter',sans-serif",cursor:"pointer"}} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {cartTotal < deliveryConfig.minimum_order_amount && (
                    <div style={{background:"rgba(255,45,120,.06)",border:`1px solid rgba(255,45,120,.2)`,borderRadius:6,padding:"12px",marginBottom:16,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",color:D.pink,textAlign:"center"}}>
                      ⚠️ Commande minimum : {deliveryConfig.minimum_order_amount}€ (il te manque {(deliveryConfig.minimum_order_amount - cartTotal).toFixed(2)}€)
                    </div>
                  )}

                  {/* ETA */}
                  {etaResult && (
                    <div style={{display:"flex",alignItems:"center",gap:12,background: etaResult.isBusy ? "rgba(255,107,53,.06)" : "rgba(34,197,94,.06)",border:`1px solid ${etaResult.isBusy ? "rgba(255,107,53,.25)" : "rgba(34,197,94,.2)"}`,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                      <span style={{fontSize:"1.4rem",flexShrink:0}}>⏱️</span>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:D.muted,letterSpacing:".1em",marginBottom:3}}>LIVRAISON ESTIMÉE</div>
                        <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.25rem",color: etaResult.isBusy ? "#ff6b35" : "#22c55e",lineHeight:1}}>{formatETA(etaResult.minutes)}</div>
                        <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".62rem",color:D.muted,marginTop:4}}>
                          {distanceKm > 0 ? `${distanceKm.toFixed(1)} km · base 10 min + route ${Math.round(etaResult.distanceTime)} min${etaResult.loadTime > 0 ? ` + charge ${Math.round(etaResult.loadTime)} min` : ""}` : "Entrez votre adresse pour affiner l'estimation"}
                        </div>
                      </div>
                      {etaResult.isBusy && <div style={{flexShrink:0,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".6rem",color:"#ff6b35",textAlign:"center",background:"rgba(255,107,53,.1)",borderRadius:6,padding:"4px 8px"}}>🔥<br/>FORTE<br/>DEMANDE</div>}
                    </div>
                  )}

                  {/* STRIPE */}
                  {stripeClientSecret && stripePromise ? (
                    <div style={{animation:"fadeUp .3s both"}}>
                      <div style={{background:"rgba(58,191,248,.04)",border:`1px solid rgba(58,191,248,.12)`,borderRadius:8,padding:"16px",marginBottom:4}}>
                        <Elements stripe={stripePromise} options={{ clientSecret:stripeClientSecret, appearance:STRIPE_APPEARANCE_DAY }}>
                          <CheckoutPaymentFormDay onSuccess={handlePaymentSuccess} onCancel={handlePaymentCancel} />
                        </Elements>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{marginBottom:16}}>
                        <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",color:D.muted,letterSpacing:".12em",marginBottom:10,textTransform:"uppercase"}}>// MODE DE PAIEMENT</div>
                        <div style={{display:"grid",gridTemplateColumns:`${settings.paymentOnlineEnabled !== false && settings.paymentCashEnabled !== false ? "1fr 1fr" : "1fr"}`,gap:8}}>
                          {settings.paymentOnlineEnabled !== false && (
                          <div onClick={() => setPaymentMethod('online')} style={{padding:"12px 8px",borderRadius:6,cursor: settings.paymentCashEnabled !== false ? "pointer" : "default",textAlign:"center",border: paymentMethod==='online' ? `2px solid ${D.cyan}` : `1px solid ${D.border}`,background: paymentMethod==='online' ? "rgba(58,191,248,.06)" : D.cardDark,transition:"all .2s"}}>
                            <div style={{fontSize:"1.4rem",marginBottom:4}}>💳</div>
                            <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".8rem",color: paymentMethod==='online' ? D.cyan : D.text,letterSpacing:".05em"}}>PAYER EN LIGNE</div>
                            <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".6rem",color:D.muted,marginTop:2}}>Carte · Apple Pay</div>
                          </div>
                          )}
                          {settings.paymentCashEnabled !== false && (
                          <div onClick={() => setPaymentMethod('cash')} style={{padding:"12px 8px",borderRadius:6,cursor: settings.paymentOnlineEnabled !== false ? "pointer" : "default",textAlign:"center",border: paymentMethod==='cash' ? `2px solid ${D.pink}` : `1px solid ${D.border}`,background: paymentMethod==='cash' ? "rgba(255,45,120,.06)" : D.cardDark,transition:"all .2s"}}>
                            <div style={{fontSize:"1.4rem",marginBottom:4}}>💵</div>
                            <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".8rem",color: paymentMethod==='cash' ? D.pink : D.text,letterSpacing:".05em"}}>{fulfillmentType==='pickup' ? 'CASH AU RETRAIT' : 'CASH LIVRAISON'}</div>
                            <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".6rem",color:D.muted,marginTop:2}}>Payer à la réception</div>
                          </div>
                          )}
                        </div>
                      </div>
                      <button onClick={submitOrder} disabled={submitting || cartTotal < deliveryConfig.minimum_order_amount || (settings.paymentOnlineEnabled === false && settings.paymentCashEnabled === false) || (settings.fulfillmentDeliveryEnabled === false && settings.fulfillmentPickupEnabled === false)}
                        style={{width:"100%",background: submitting ? D.muted : paymentMethod==='online' ? D.cyan : D.pink,color: submitting ? "#fff" : "#fff",border:"none",borderRadius:4,padding:"16px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".1em",textTransform:"uppercase",cursor: submitting ? "not-allowed" : "pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        {submitting ? "TRAITEMENT EN COURS..." : paymentMethod==='online' ? "💳 PAYER EN LIGNE" : fulfillmentType==='pickup' ? "🏪 CONFIRMER LE RETRAIT" : "💵 COMMANDER — CASH À LA LIVRAISON"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── PRODUCT DETAIL MODAL ── */}
      {selectedProduct && (
        <div onClick={() => setSelectedProduct(null)} style={{position:"fixed",inset:0,background:D.overlay,zIndex:1500,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:D.card,border:`1px solid rgba(255,45,120,.2)`,borderRadius:12,width:"100%",maxWidth:480,overflow:"hidden",animation:"fadeUp .3s both",margin:"20px 0",boxShadow:"0 8px 40px rgba(0,0,0,.1)"}}>
            <div style={{width:"100%",height:260,background:"linear-gradient(135deg,rgba(255,45,120,.06),rgba(58,191,248,.04))",position:"relative",overflow:"hidden"}}>
              {selectedProduct.image ? (
                <img src={selectedProduct.image} alt={selectedProduct.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
              ) : (
                <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"5rem"}}>📷</div>
              )}
              <button onClick={() => setSelectedProduct(null)} style={{position:"absolute",top:12,right:12,background:"rgba(255,255,255,.85)",border:`1px solid ${D.border}`,color:D.text,borderRadius:4,padding:"6px 12px",cursor:"pointer",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem"}}>
                ✕ FERMER
              </button>
              {selectedProduct.badge && (
                <span style={{position:"absolute",top:12,left:12,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".62rem",letterSpacing:".1em",textTransform:"uppercase",padding:"4px 10px",borderRadius:2,background: getBadgeType(selectedProduct.badge)==="hot" ? D.pink : getBadgeType(selectedProduct.badge)==="new" ? "#22c55e" : D.cyan,color:"#fff"}}>
                  {selectedProduct.badge}
                </span>
              )}
            </div>
            <div style={{padding:"24px"}}>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:catColor(selectedProduct.cat),letterSpacing:".15em",textTransform:"uppercase",marginBottom:8}}>{catLabel(selectedProduct.cat)}</div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.7rem",letterSpacing:".03em",color:D.text,marginBottom:10}}>{selectedProduct.name}</div>
              <div style={{fontSize:".9rem",color:D.muted,lineHeight:1.7,marginBottom:16}}>{selectedProduct.desc || "Aucune description disponible."}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"2rem",color:D.pink}}>{Number(selectedProduct.price).toFixed(2)}€</div>
                  {selectedProduct.stock > 0 && selectedProduct.stock < 10 && <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:"#ff6b35",marginTop:4}}>⚠️ Plus que {selectedProduct.stock} en stock !</div>}
                  {selectedProduct.stock === 0 && <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:D.muted,marginTop:4}}>Rupture de stock</div>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={() => shareProduct(selectedProduct)} style={{background:"transparent",border:`1px solid ${D.border}`,color:D.muted,borderRadius:4,padding:"10px 14px",cursor:"pointer",fontSize:".85rem"}}>↗</button>
                  <button onClick={() => { addToCart(selectedProduct.id, selectedProduct.name, selectedProduct.price); setSelectedProduct(null); }} disabled={selectedProduct.stock === 0}
                    style={{background: selectedProduct.stock === 0 ? D.muted : D.pink,color:"#fff",border:"none",borderRadius:4,padding:"10px 24px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".9rem",letterSpacing:".08em",cursor: selectedProduct.stock === 0 ? "not-allowed" : "pointer",textTransform:"uppercase"}}>
                    {selectedProduct.stock === 0 ? "RUPTURE" : "+ AJOUTER"}
                  </button>
                </div>
              </div>
              {/* Combos IA */}
              {(aiRecsLoading || aiRecs.length > 0) && (
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:"#22c55e",letterSpacing:".1em",marginBottom:10,textTransform:"uppercase",display:"flex",alignItems:"center",gap:6}}>
                    ✨ combo idéal ia {aiRecsLoading && <span style={{opacity:.5,animation:"pulse 1s infinite"}}>…</span>}
                  </div>
                  {!aiRecsLoading && aiRecs.length > 0 && (
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {(aiRecs as any[]).map((rec:any,i:number) => rec.product && (
                        <div key={i} onClick={() => openProductModal(rec.product)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"rgba(34,197,94,.04)",border:"1px solid rgba(34,197,94,.15)",borderRadius:8,cursor:"pointer",flex:1,minWidth:180,transition:"all .2s"}}>
                          <div style={{width:44,height:44,borderRadius:6,overflow:"hidden",flexShrink:0,background:"rgba(255,45,120,.04)"}}>
                            {rec.product.image ? <img src={rec.product.image} alt={rec.product.name} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem"}}>📷</div>}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".84rem",textOverflow:"ellipsis",overflow:"hidden",whiteSpace:"nowrap",color:D.text}}>{rec.product.name}</div>
                            <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:D.pink}}>{Number(rec.product.price).toFixed(2)}€</div>
                            <div style={{fontFamily:"'Inter',sans-serif",fontSize:".7rem",color:D.muted,fontStyle:"italic",textOverflow:"ellipsis",overflow:"hidden",whiteSpace:"nowrap"}}>{rec.why}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {suggestions.length > 0 && (
                <div>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:D.muted,letterSpacing:".1em",marginBottom:10,textTransform:"uppercase"}}>// Vous aimerez aussi</div>
                  <div style={{display:"flex",gap:8,overflowX:"auto"}}>
                    {suggestions.map(s => (
                      <div key={s.id} onClick={() => openProductModal(s)} style={{flexShrink:0,width:90,cursor:"pointer",background:D.cardDark,borderRadius:6,overflow:"hidden",border:`1px solid ${D.border}`}}>
                        <div style={{height:60,background:"rgba(255,45,120,.03)"}}>
                          {s.image ? <img src={s.image} alt={s.name} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem"}}>📷</div>}
                        </div>
                        <div style={{padding:"6px 8px"}}>
                          <div style={{fontSize:".68rem",fontWeight:700,letterSpacing:".03em",textOverflow:"ellipsis",overflow:"hidden",whiteSpace:"nowrap",color:D.text}}>{s.name}</div>
                          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:".75rem",color:D.pink}}>{Number(s.price).toFixed(2)}€</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AUTH MODAL ── */}
      {showAuthModal && (
        <div onClick={() => { setShowAuthModal(false); setAuthError(""); setPhoneAuthStep("input"); setPhoneInput(""); setPhoneAuthCode(""); setPhoneAuthError(""); setShowForgotPassword(false); setForgotSuccess(false); setForgotEmail(""); setForgotError(""); }}
          style={{position:"fixed",inset:0,background:"rgba(17,24,39,.2)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:1600,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:20,paddingLeft:16,paddingRight:16,paddingBottom:90,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:D.card,border:`1px solid rgba(255,45,120,.2)`,borderRadius:14,width:"100%",maxWidth:420,animation:"fadeUp .3s both",overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,.1)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 24px 18px",borderBottom:`1px solid ${D.border}`}}>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.3rem",color:D.pink,letterSpacing:".04em"}}>🔑 CONNEXION</div>
              <button onClick={() => { setShowAuthModal(false); setAuthError(""); setPhoneAuthStep("input"); setPhoneInput(""); setPhoneAuthCode(""); setPhoneAuthError(""); setShowForgotPassword(false); setForgotSuccess(false); setForgotEmail(""); setForgotError(""); }}
                style={{background:D.cardDark,border:`1px solid ${D.border}`,color:D.text,fontSize:".9rem",cursor:"pointer",borderRadius:6,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>

            {showForgotPassword ? (
              <div style={{padding:"22px 24px 28px",display:"flex",flexDirection:"column",gap:14}}>
                {forgotSuccess ? (
                  <>
                    <div style={{textAlign:"center",fontSize:"2.5rem",lineHeight:1}}>✉️</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.1rem",color:D.cyan,textAlign:"center",letterSpacing:".04em"}}>Email envoyé !</div>
                    <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,textAlign:"center",lineHeight:1.6}}>Vérifie ta boîte mail (et les spams).<br/>Le lien expire dans 1 heure.</div>
                    <button onClick={() => { setShowForgotPassword(false); setForgotSuccess(false); setForgotEmail(""); }}
                      style={{background:D.pink,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                      RETOUR À LA CONNEXION
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",color:D.muted,letterSpacing:".06em",lineHeight:1.6}}>Entre ton email et on t&apos;envoie un lien pour réinitialiser ton mot de passe.</div>
                    <input type="email" placeholder="Ton email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} onKeyDown={e => e.key==="Enter" && handleForgotPassword()}
                      style={{background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:8,padding:"12px 14px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:"1rem",outline:"none",width:"100%"}} />
                    {forgotError && <div style={{background:"rgba(255,45,120,.06)",border:`1px solid rgba(255,45,120,.2)`,borderRadius:6,padding:"10px 14px",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",color:D.pink}}>{forgotError}</div>}
                    <button onClick={handleForgotPassword} disabled={forgotLoading}
                      style={{background: forgotLoading ? D.muted : D.pink,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".08em",textTransform:"uppercase",cursor: forgotLoading ? "not-allowed" : "pointer"}}>
                      {forgotLoading ? "..." : "ENVOYER LE LIEN"}
                    </button>
                    <button onClick={() => { setShowForgotPassword(false); setForgotError(""); setForgotEmail(""); }}
                      style={{background:"transparent",border:"none",color:D.muted,cursor:"pointer",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",letterSpacing:".06em",textDecoration:"underline",padding:4}}>
                      ← Retour à la connexion
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{padding:"22px 24px 0",display:"flex",flexDirection:"column",gap:14}}>
                {authMode === "signup" && (
                  <input placeholder="Ton prénom" value={authName} onChange={e => setAuthName(e.target.value)}
                    style={{background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:8,padding:"12px 14px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:"1rem",outline:"none",width:"100%"}} />
                )}
                <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                  style={{background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:8,padding:"12px 14px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:"1rem",outline:"none",width:"100%"}} />
                <input type="password" placeholder="Mot de passe" value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key==="Enter" && (authMode==="login" ? handleLogin() : handleSignup())}
                  style={{background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:8,padding:"12px 14px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:"1rem",outline:"none",width:"100%"}} />
                {authMode === "login" && (
                  <button onClick={() => { setShowForgotPassword(true); setForgotEmail(authEmail); setForgotError(""); setForgotSuccess(false); }}
                    style={{background:"transparent",border:"none",color:D.muted,cursor:"pointer",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".68rem",letterSpacing:".06em",textDecoration:"underline",padding:0,textAlign:"right",alignSelf:"flex-end"}}>
                    Mot de passe oublié ?
                  </button>
                )}
                {authError && <div style={{background:"rgba(255,45,120,.06)",border:`1px solid rgba(255,45,120,.2)`,borderRadius:6,padding:"10px 14px",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",color:D.pink}}>{authError}</div>}
                <button onClick={authMode==="login" ? handleLogin : handleSignup} disabled={authLoading}
                  style={{background: authLoading ? D.muted : D.pink,color:"#fff",border:"none",borderRadius:10,padding:"14px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".08em",textTransform:"uppercase",cursor: authLoading ? "not-allowed" : "pointer"}}>
                  {authLoading ? "..." : authMode==="login" ? "SE CONNECTER" : "CRÉER MON COMPTE"}
                </button>
                <button onClick={() => { setAuthMode(authMode==="login" ? "signup" : "login"); setAuthError(""); }}
                  style={{background:"transparent",border:"none",color:D.muted,cursor:"pointer",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",letterSpacing:".06em",textDecoration:"underline",padding:4}}>
                  {authMode==="login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
                </button>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,height:1,background:D.border}} />
                  <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:D.muted,letterSpacing:".1em"}}>OU</span>
                  <div style={{flex:1,height:1,background:D.border}} />
                </div>
                <button onClick={handleGoogleLogin} disabled={authLoading}
                  style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#fff",color:"#111",border:`1px solid ${D.border}`,borderRadius:10,padding:"14px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",cursor: authLoading ? "not-allowed" : "pointer",letterSpacing:".04em",boxShadow:"0 1px 4px rgba(0,0,0,.08)"}}>
                  <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
                  {authLoading ? "..." : "Continuer avec Google"}
                </button>
              </div>
            )}

            {/* Espace professionnel */}
            <div style={{margin:"22px 24px 28px",background:"rgba(58,191,248,.04)",border:`1px solid rgba(58,191,248,.15)`,borderRadius:12,padding:"16px 18px"}}>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".62rem",color:"rgba(58,191,248,.5)",letterSpacing:".14em",marginBottom:10,textAlign:"center"}}>— ESPACE PROFESSIONNEL —</div>
              <a href="/livreur" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"linear-gradient(135deg,rgba(58,191,248,.12) 0%,rgba(0,80,200,.08) 100%)",border:`1px solid rgba(58,191,248,.3)`,borderRadius:10,padding:"14px",textDecoration:"none",color:D.cyan,fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".06em"}}>
                <span style={{fontSize:"1.3rem"}}>🏍️</span>
                ESPACE LIVREUR
                <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",color:"rgba(58,191,248,.5)",marginLeft:4}}>→</span>
              </a>
              <a href="/etablissement/login" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"linear-gradient(135deg,rgba(255,165,0,.14) 0%,rgba(200,100,0,.08) 100%)",border:"1px solid rgba(255,165,0,.3)",borderRadius:10,padding:"14px",textDecoration:"none",marginTop:8,color:"#ffa500",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".06em"}}>
                <span style={{fontSize:"1.3rem"}}>🏪</span>
                ESPACE PRO
                <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",color:"rgba(255,165,0,.5)",marginLeft:4}}>→</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── PROFIL / HISTORIQUE ── */}
      {showHistory && currentUser && (
        <div onClick={() => { setShowHistory(false); setHistoryOrders(null); }} style={{position:"fixed",inset:0,background:"rgba(17,24,39,.2)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",zIndex:1500,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:16,paddingLeft:16,paddingRight:16,paddingBottom:90,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:D.card,border:`1px solid rgba(58,191,248,.15)`,borderRadius:14,width:"100%",maxWidth:480,animation:"fadeUp .3s both",maxHeight:"calc(100vh - 106px)",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,.1)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px 16px",flexShrink:0,borderBottom:`1px solid ${D.border}`,background:D.card}}>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.3rem",color:D.cyan,letterSpacing:".04em"}}>👤 MON PROFIL</div>
              <button onClick={() => { setShowHistory(false); setHistoryOrders(null); }} style={{background:D.cardDark,border:`1px solid ${D.border}`,color:D.text,fontSize:".9rem",cursor:"pointer",borderRadius:6,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{overflowY:"auto",padding:"18px 24px 24px",flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,background:"rgba(58,191,248,.04)",border:`1px solid rgba(58,191,248,.1)`,borderRadius:12,padding:"16px"}}>
                <div style={{width:48,height:48,borderRadius:"50%",background:`linear-gradient(135deg,${D.pink},${D.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.3rem",color:"#fff",flexShrink:0}}>
                  {(currentUser.displayName||currentUser.email||"?")[0].toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.1rem",color:D.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{currentUser.displayName||"Mon compte"}</div>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:D.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{currentUser.email}</div>
                </div>
                <button onClick={handleSignout} style={{background:"rgba(255,45,120,.06)",border:`1px solid rgba(255,45,120,.15)`,color:D.pink,borderRadius:8,padding:"6px 12px",cursor:"pointer",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".6rem",letterSpacing:".08em",whiteSpace:"nowrap"}}>DÉCO</button>
              </div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1rem",color:D.cyan,letterSpacing:".06em",marginBottom:12}}>📋 MES COMMANDES</div>
              {historyLoading && <div style={{textAlign:"center",color:D.muted,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",padding:"28px"}}>chargement...</div>}
              {!historyLoading && historyOrders !== null && historyOrders.length === 0 && <div style={{textAlign:"center",color:D.muted,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",padding:"28px 0"}}>Aucune commande pour l&apos;instant.</div>}
              {!historyLoading && historyOrders && historyOrders.length > 0 && (
                <div style={{display:"grid",gap:10}}>
                  {historyOrders.map((o:any) => (
                    <div key={o.id} style={{background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:8,padding:"14px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div>
                          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".6rem",color:D.muted,marginBottom:2}}>{new Date(o.createdAt).toLocaleString("fr-FR")}</div>
                          <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".65rem",color:D.muted}}>#{(o.id||"").slice(-6).toUpperCase()}</div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                          <span style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1rem",color:D.pink}}>{Number(o.total).toFixed(2)}€</span>
                          <span style={{fontSize:".6rem",padding:"2px 8px",borderRadius:10,fontFamily:"'Inter',system-ui,sans-serif",background: o.status==="nouveau" ? "rgba(255,45,120,.1)" : o.status==="en_cours" ? "rgba(255,149,0,.1)" : o.status==="livre" ? "rgba(34,197,94,.1)" : "rgba(0,0,0,.06)",color: o.status==="nouveau" ? D.pink : o.status==="en_cours" ? "#ff9500" : o.status==="livre" ? "#22c55e" : D.muted}}>{o.status}</span>
                        </div>
                      </div>
                      <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".63rem",color:D.muted,lineHeight:1.7,borderLeft:`2px solid rgba(58,191,248,.15)`,paddingLeft:8}}>
                        {(o.items||"").split("\n").map((l:string,i:number) => <div key={i}>{l}</div>)}
                      </div>
                      <a href={`/suivi?id=${o.id}`} style={{display:"inline-block",marginTop:8,fontFamily:"'Inter',system-ui,sans-serif",fontSize:".62rem",color:D.cyan,textDecoration:"none",letterSpacing:".06em"}}>🔎 Suivre cette commande →</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:`rgba(255,255,255,0.97)`,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",paddingTop:10,paddingBottom:"max(14px, env(safe-area-inset-bottom))",paddingLeft:12,paddingRight:12,borderTop:`1px solid ${D.border}`,boxShadow:"0 -4px 20px rgba(17,24,39,.06)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-evenly",maxWidth:520,margin:"0 auto"}}>
          <button onClick={() => window.scrollTo({top:0,behavior:"smooth"})} style={{width:54,height:54,borderRadius:"50%",background:"rgba(58,191,248,.06)",border:`1px solid rgba(58,191,248,.2)`,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:D.cyan}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
          </button>
          <button onClick={() => document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})} style={{width:54,height:54,borderRadius:"50%",background:"rgba(58,191,248,.06)",border:`1px solid rgba(58,191,248,.2)`,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:D.cyan}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          <button onClick={openCart} style={{width:54,height:54,borderRadius:"50%",background:"rgba(255,45,120,.06)",border:`1px solid rgba(255,45,120,.25)`,cursor:"pointer",flexShrink:0,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",color:D.pink}}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/></svg>
            {cartCount > 0 && (
              <span style={{position:"absolute",top:5,right:5,background:`linear-gradient(135deg,${D.pink},#ff6b9d)`,color:"#fff",borderRadius:"50%",minWidth:16,height:16,fontSize:".5rem",fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid rgba(244,246,250,.8)",lineHeight:1}}>
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </button>
          <button onClick={() => { if (currentUser) { setShowHistory(true); fetchHistory(); } else { if (!authEmail && orderForm.email) setAuthEmail(orderForm.email); setShowAuthModal(true); } }}
            style={{width:54,height:54,borderRadius:"50%",background: currentUser ? "rgba(255,45,120,.06)" : "rgba(58,191,248,.06)",border: currentUser ? `1px solid rgba(255,45,120,.3)` : `1px solid rgba(58,191,248,.2)`,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color: currentUser ? D.pink : D.cyan}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
        </div>
      </nav>

      {/* ── DRIVER FORM ── */}
      {showDriverForm && (
        <div style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(244,246,250,.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeUp .2s both"}}
          onClick={e => e.target === e.currentTarget && setShowDriverForm(false)}>
          <div style={{width:"100%",maxWidth:440,background:D.card,border:`1px solid rgba(58,191,248,.15)`,borderRadius:16,padding:0,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px rgba(0,0,0,.1)"}}>
            <div style={{padding:"28px 28px 0",textAlign:"center"}}>
              <div style={{fontSize:"2.8rem",marginBottom:8}}>🏍️</div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.5rem",background:`linear-gradient(135deg,${D.cyan},${D.pink})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:".04em"}}>DEVENIR LIVREUR</div>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".78rem",color:D.muted,letterSpacing:".1em",marginTop:6}}>Rejoins l&apos;équipe YASSALA Day</div>
            </div>
            {driverSuccess ? (
              <div style={{padding:"40px 28px",textAlign:"center"}}>
                <div style={{fontSize:"3rem",marginBottom:12}}>✅</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.2rem",color:"#22c55e",marginBottom:6}}>CANDIDATURE ENVOYÉE !</div>
                <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".82rem",color:D.muted}}>On te recontacte très vite.</div>
              </div>
            ) : (
              <div style={{padding:"20px 28px 28px",display:"grid",gap:14}}>
                {[{label:"NOM COMPLET *",field:"name",placeholder:"Ton nom",type:"text"},{label:"TÉLÉPHONE *",field:"phone",placeholder:"+594 6XX XXX XXX",type:"tel"},{label:"EMAIL",field:"email",placeholder:"ton@email.com",type:"email"},{label:"ZONE DE LIVRAISON",field:"zone",placeholder:"Cayenne, Rémire, Matoury...",type:"text"}].map(f => (
                  <div key={f.field}>
                    <label style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,letterSpacing:".12em",display:"block",marginBottom:6}}>{f.label}</label>
                    <input value={(driverForm as any)[f.field]} onChange={e => setDriverForm(prev => ({...prev, [f.field]:e.target.value}))} placeholder={f.placeholder} type={f.type}
                      style={{width:"100%",background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:8,padding:"12px 14px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:".95rem"}} />
                  </div>
                ))}
                <div>
                  <label style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,letterSpacing:".12em",display:"block",marginBottom:6}}>VÉHICULE</label>
                  <div style={{display:"flex",gap:8}}>
                    {([{val:"moto",label:"🏍️ Moto"},{val:"voiture",label:"🚗 Voiture"},{val:"velo",label:"🚲 Vélo"}] as const).map(v => (
                      <button key={v.val} onClick={() => setDriverForm(f => ({...f, vehicle:v.val}))}
                        style={{flex:1,padding:"10px 8px",borderRadius:8,cursor:"pointer",background: driverForm.vehicle===v.val ? "rgba(58,191,248,.08)" : D.cardDark,border: driverForm.vehicle===v.val ? `1px solid rgba(58,191,248,.35)` : `1px solid ${D.border}`,color: driverForm.vehicle===v.val ? D.cyan : D.muted,fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".85rem",transition:"all .2s"}}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,letterSpacing:".12em",display:"block",marginBottom:6}}>MESSAGE (optionnel)</label>
                  <textarea value={driverForm.message} onChange={e => setDriverForm(f => ({...f, message:e.target.value}))} placeholder="Parle-nous de toi, tes disponibilités..." rows={3}
                    style={{width:"100%",background:D.cardDark,border:`1px solid ${D.border}`,borderRadius:8,padding:"12px 14px",color:D.text,fontFamily:"'Inter',sans-serif",fontSize:".95rem",resize:"vertical"}} />
                </div>
                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <button onClick={() => setShowDriverForm(false)} style={{flex:1,padding:"13px",borderRadius:10,border:`1px solid ${D.border}`,background:"transparent",color:D.muted,fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".95rem",cursor:"pointer",letterSpacing:".06em"}}>ANNULER</button>
                  <button onClick={submitDriverApplication} disabled={driverSubmitting}
                    style={{flex:2,padding:"13px",borderRadius:10,border:"none",background: driverSubmitting ? D.muted : `linear-gradient(135deg,${D.cyan},#0070aa)`,color:"#fff",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".95rem",cursor: driverSubmitting ? "wait" : "pointer",letterSpacing:".06em"}}>
                    {driverSubmitting ? "ENVOI..." : "ENVOYER MA CANDIDATURE →"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCROLL TO TOP */}
      {showScrollTop && (
        <button onClick={() => window.scrollTo({top:0,behavior:"smooth"})} style={{position:"fixed",bottom:90,right:18,width:40,height:40,borderRadius:"50%",background:D.pink,border:"none",color:"#fff",fontSize:"1.1rem",cursor:"pointer",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 18px rgba(255,45,120,.3)`,transition:"opacity .3s",animation:"fadeUp .3s both"}}>↑</button>
      )}

      {/* CASH SMS */}
      {showSmsVerify && (
        <div onClick={() => { setShowSmsVerify(false); setCashSmsStep("send"); setCashSmsCode(""); setCashSmsError(""); }}
          style={{position:"fixed",inset:0,background:D.overlay,zIndex:1700,display:"flex",alignItems:"center",justifyContent:"center",paddingLeft:16,paddingRight:16}}>
          <div onClick={e => e.stopPropagation()} style={{background:D.card,border:`1px solid rgba(255,45,120,.25)`,borderRadius:14,width:"100%",maxWidth:400,animation:"fadeUp .3s both",overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,.1)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 22px 16px",borderBottom:`1px solid ${D.border}`}}>
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontWeight:800,fontSize:"1.15rem",color:D.pink,letterSpacing:".04em"}}>📱 VÉRIFICATION TÉLÉPHONE</div>
              <button onClick={() => { setShowSmsVerify(false); setCashSmsStep("send"); setCashSmsCode(""); setCashSmsError(""); }} style={{background:D.cardDark,border:`1px solid ${D.border}`,color:D.text,fontSize:".9rem",cursor:"pointer",borderRadius:6,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{padding:"22px 22px 26px",display:"flex",flexDirection:"column",gap:16}}>
              {cashSmsStep === "send" ? (
                <>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,letterSpacing:".05em",lineHeight:1.6}}>
                    Pour confirmer ta commande <span style={{color:D.pink}}>cash</span>, nous envoyons un code SMS au numéro :<div style={{color:D.text,fontSize:".9rem",marginTop:8,letterSpacing:".08em"}}>📞 {orderForm.phone.startsWith("+") ? orderForm.phone : `${phoneCountry} ${orderForm.phone}`}</div>
                  </div>
                  <div id="recaptcha-cash-sms-day" />
                  <button onClick={handleCashSmsSend} disabled={cashSmsLoading} style={{background: cashSmsLoading ? D.muted : D.pink,color:"#fff",border:"none",borderRadius:10,padding:"15px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".08em",textTransform:"uppercase",cursor: cashSmsLoading ? "not-allowed" : "pointer"}}>
                    {cashSmsLoading ? "ENVOI EN COURS..." : "ENVOYER LE CODE SMS"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".72rem",color:D.muted,letterSpacing:".05em",lineHeight:1.6}}>Code envoyé ! Saisis les 6 chiffres reçus par SMS.</div>
                  <input type="number" placeholder="• • • • • •" maxLength={6} value={cashSmsCode} onChange={e => setCashSmsCode(e.target.value)} onKeyDown={e => e.key==="Enter" && handleCashSmsVerify()} autoFocus
                    style={{background:D.cardDark,border:`1px solid rgba(255,45,120,.25)`,borderRadius:8,padding:"16px",color:D.pink,fontFamily:"'Inter',system-ui,sans-serif",fontSize:"2rem",letterSpacing:".6em",textAlign:"center",outline:"none",width:"100%"}} />
                  <button onClick={handleCashSmsVerify} disabled={cashSmsLoading || cashSmsCode.length < 6} style={{background: cashSmsLoading ? D.muted : D.pink,color:"#fff",border:"none",borderRadius:10,padding:"15px",fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".08em",textTransform:"uppercase",cursor: cashSmsLoading ? "not-allowed" : "pointer",opacity: cashSmsCode.length < 6 ? .5 : 1}}>
                    {cashSmsLoading ? "VÉRIFICATION..." : "✓ CONFIRMER LA COMMANDE"}
                  </button>
                  <button onClick={() => { setCashSmsStep("send"); setCashSmsCode(""); setCashSmsError(""); }} style={{background:"transparent",border:"none",color:D.muted,cursor:"pointer",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".7rem",textDecoration:"underline"}}>Renvoyer un code</button>
                </>
              )}
              {cashSmsError && <div style={{background:"rgba(255,45,120,.06)",border:`1px solid rgba(255,45,120,.2)`,borderRadius:6,padding:"10px 14px",fontFamily:"'Inter',system-ui,sans-serif",fontSize:".75rem",color:D.pink}}>{cashSmsError}</div>}
              <div style={{fontFamily:"'Inter',system-ui,sans-serif",fontSize:".62rem",color:D.muted,letterSpacing:".04em",textAlign:"center",lineHeight:1.5}}>Protégé par reCAPTCHA invisible — anti-spam & sécurité</div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

// ── ProductCard composant interne (réutilisable pour éviter la répétition) ──
function ProductCard({ p, D, lastAddedId, likes, activePromo, catColor, catLabel, getBadgeType, getProductPromoPrice, openProductModal, toggleLike, shareProduct, addToCart }: {
  p: { id:string; name:string; desc:string; price:number; image:string; cat:string; badge:string; stock:number; isActive?:boolean; };
  D: any; lastAddedId:string|null; likes:Set<string>; activePromo:any;
  catColor:(c:string)=>string; catLabel:(c:string)=>string; getBadgeType:(b:string)=>string|null;
  getProductPromoPrice:(id:string,price:number,promo:any)=>number|null;
  openProductModal:(p:any)=>void; toggleLike:(id:string)=>void;
  shareProduct:(p:any)=>void; addToCart:(id:string,name:string,price:number)=>void;
}) {
  const pp = getProductPromoPrice(p.id, p.price, activePromo);
  return (
    <div onClick={() => openProductModal(p)}
      style={{background:"#fff",borderRadius:18,overflow:"hidden",cursor:"pointer",position:"relative",opacity: p.stock===0 ? 0.6 : 1,transition:"transform .2s, box-shadow .2s",boxShadow: lastAddedId===p.id ? "0 4px 20px rgba(34,197,94,.18)" : D.shadow,border: lastAddedId===p.id ? "2px solid #22c55e" : `1px solid ${D.border}`}}>

      {/* Image */}
      <div style={{position:"relative",height:160,overflow:"hidden",background:"#f5f5f7"}}>
        {p.image ? (
          <img src={p.image} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
        ) : (
          <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"3rem",opacity:.25}}>🍽️</div>
        )}

        {/* Bouton like */}
        <button onClick={e => { e.stopPropagation(); toggleLike(p.id); }}
          style={{position:"absolute",top:10,right:10,width:34,height:34,background:"rgba(255,255,255,.92)",backdropFilter:"blur(8px)",border:"none",borderRadius:"50%",cursor:"pointer",fontSize:"1rem",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,.1)",zIndex:3}}>
          <span style={{color: likes.has(p.id) ? D.pink : "#aaa",lineHeight:1}}>{likes.has(p.id) ? "♥" : "♡"}</span>
        </button>

        {/* Badge */}
        {p.stock === 0 ? (
          <span style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,.65)",color:"#fff",fontSize:".65rem",fontFamily:"'Inter',sans-serif",fontWeight:700,padding:"3px 10px",borderRadius:20,zIndex:4}}>ÉPUISÉ</span>
        ) : activePromo && activePromo.productIds.includes(p.id) ? (
          <span style={{position:"absolute",top:10,left:10,background:D.pink,color:"#fff",fontSize:".65rem",fontFamily:"'Inter',sans-serif",fontWeight:700,padding:"3px 10px",borderRadius:20,zIndex:4}}>FLASH</span>
        ) : p.badge ? (
          <span style={{position:"absolute",top:10,left:10,background: getBadgeType(p.badge)==="hot" ? D.pink : getBadgeType(p.badge)==="new" ? "#22c55e" : getBadgeType(p.badge)==="best" ? "#ffb400" : D.cyan,color:"#fff",fontSize:".65rem",fontFamily:"'Inter',sans-serif",fontWeight:700,padding:"3px 10px",borderRadius:20,zIndex:4}}>
            {p.badge === "BEST" ? "⭐ BEST" : p.badge}
          </span>
        ) : null}
      </div>

      {/* Infos */}
      <div style={{padding:"14px 16px 16px"}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",color:D.text,marginBottom:4,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{p.name}</div>
        <div style={{fontSize:".81rem",color:D.muted,lineHeight:1.5,marginBottom:10,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",fontFamily:"'Inter',sans-serif"}}>{p.desc}</div>
        {p.stock > 0 && p.stock < 10 && <div style={{fontSize:".75rem",color:"#ff6b35",fontWeight:700,marginBottom:8}}>Plus que {p.stock} !</div>}

        {/* Prix + bouton + */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            {pp !== null && <div style={{fontSize:".72rem",color:D.muted,textDecoration:"line-through",fontFamily:"'Inter',sans-serif"}}>{Number(p.price).toFixed(2)}€</div>}
            <div style={{fontWeight:800,fontSize:"1.15rem",color:D.text,fontFamily:"'Inter',sans-serif",lineHeight:1}}>{(pp ?? Number(p.price)).toFixed(2)}€</div>
          </div>
          <button onClick={e => { e.stopPropagation(); addToCart(p.id, p.name, p.price); }} disabled={p.stock === 0}
            style={{width:42,height:42,background: p.stock===0 ? "#e5e5e5" : lastAddedId===p.id ? "#22c55e" : D.pink,border:"none",borderRadius:"50%",color:"#fff",fontSize: lastAddedId===p.id ? "1rem" : "1.4rem",display:"flex",alignItems:"center",justifyContent:"center",cursor: p.stock===0 ? "not-allowed" : "pointer",boxShadow: p.stock===0 ? "none" : lastAddedId===p.id ? "0 2px 8px rgba(34,197,94,.25)" : `0 2px 8px rgba(255,45,120,.2)`,transition:"all .25s",fontFamily:"'Inter',sans-serif",fontWeight:700}}>
            {p.stock===0 ? "✕" : lastAddedId===p.id ? "✓" : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CARTE PRODUIT ÉTABLISSEMENT (layout horizontal Deliveroo) ──────────────
function EtabProductRow({ p, D, lastAddedId, addToCart, openProductModal, activePromo, getProductPromoPrice }: {
  p: { id:string; name:string; desc:string; price:number; image:string; cat:string; badge:string; stock:number; isActive?:boolean; };
  D: any; lastAddedId: string|null;
  addToCart:(p:any)=>void;
  openProductModal:(p:any)=>void;
  activePromo:any; getProductPromoPrice:(id:string,price:number,promo:any)=>number|null;
}) {
  const pp = getProductPromoPrice(p.id, p.price, activePromo);
  const isAdded = lastAddedId === p.id;
  const hasPromo = activePromo && activePromo.productIds?.includes(p.id);
  const badgeLabel = hasPromo ? "PROMO" : p.badge;
  const badgeBg = hasPromo ? D.pink : p.badge==="HOT" ? D.pink : p.badge==="BEST" ? "#ffb400" : p.badge==="NEW" ? "#22c55e" : D.cyan;
  const sizes = parseSizesEtab(p.desc || '');
  const displayDesc = getDisplayDescEtab(p.desc || '');
  return (
    <>{p.image ? (
      /* ── Avec image (Deliveroo) ── */
      <div onClick={() => openProductModal(p)}
        style={{display:"flex",alignItems:"stretch",gap:0,margin:"0 12px 10px",
          borderRadius:16,overflow:"hidden",cursor:"pointer",
          background: isAdded ? "rgba(34,197,94,.06)" : D.card,
          border: isAdded ? "1px solid rgba(34,197,94,.3)" : `1px solid ${D.border}`,
          boxShadow: isAdded ? "0 4px 16px rgba(34,197,94,.1)" : D.shadow,
          transition:"all .25s"}}>
        <div style={{flex:1,minWidth:0,padding:"14px 14px 14px 16px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          {badgeLabel && <span style={{display:"inline-block",background:badgeBg,color:"#fff",fontSize:".6rem",fontWeight:700,padding:"2px 9px",borderRadius:10,marginBottom:6,alignSelf:"flex-start"}}>{badgeLabel}</span>}
          <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1rem",color:p.stock===0?D.muted:D.text,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{p.name}</div>
          {displayDesc && <div style={{fontFamily:"'Inter',sans-serif",fontSize:".78rem",color:D.muted,lineHeight:1.45,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",marginTop:4}}>{displayDesc}</div>}
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
            {pp!==null&&<span style={{fontSize:".75rem",color:D.muted,textDecoration:"line-through"}}>{p.price.toFixed(2)}€</span>}
            <span style={{fontFamily:"'Inter',sans-serif",fontWeight:800,fontSize:"1rem",color:p.stock===0?D.muted:D.pink}}>{(pp??p.price).toFixed(2)}€</span>
            {sizes && <span style={{fontSize:".68rem",color:D.pink,fontWeight:600}}>{sizes.length} taille{sizes.length>1?"s":""}</span>}
            {p.stock>0&&p.stock<10&&<span style={{fontSize:".68rem",color:"#ff6b35",fontWeight:600}}>· {p.stock} restant{p.stock>1?"s":""}</span>}
          </div>
        </div>
        <div style={{position:"relative",flexShrink:0,width:110,height:110}}>
          <img src={p.image} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover",opacity:p.stock===0?0.35:1}} />
          <button onClick={e=>{e.stopPropagation();if(p.stock>0)addToCart(p);}} disabled={p.stock===0}
            style={{position:"absolute",bottom:7,right:7,width:34,height:34,borderRadius:"50%",
              background:p.stock===0?"rgba(0,0,0,.12)":isAdded?"#22c55e":D.pink,
              border:"2.5px solid #fff",color:"#fff",fontSize:isAdded?".85rem":"1.25rem",
              display:"flex",alignItems:"center",justifyContent:"center",
              cursor:p.stock===0?"not-allowed":"pointer",
              boxShadow:"0 3px 12px rgba(0,0,0,.18)",transition:"all .2s",fontFamily:"'Inter',sans-serif",fontWeight:700}}>
            {p.stock===0?"✕":isAdded?"✓":sizes?"›":"+"}
          </button>
        </div>
      </div>
    ) : (
      /* ── Sans image — style menu texte ── */
      <div onClick={() => addToCart(p)}
        style={{display:"flex",alignItems:"center",gap:12,margin:"0 12px 6px",
          padding:"13px 14px 13px 16px",borderRadius:14,cursor:"pointer",
          background: isAdded ? `rgba(34,197,94,.05)` : D.card,
          borderLeft:`3px solid ${isAdded?"#22c55e":D.pink}`,
          border: isAdded ? "1px solid rgba(34,197,94,.2)" : `1px solid ${D.border}`,
          borderLeftWidth:3, boxShadow:D.shadow, transition:"all .2s"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
            {badgeLabel&&<span style={{background:badgeBg,color:"#fff",fontSize:".55rem",fontWeight:700,padding:"1px 7px",borderRadius:8}}>{badgeLabel}</span>}
            <span style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:".95rem",color:p.stock===0?D.muted:D.text,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{p.name}</span>
          </div>
          {displayDesc&&<div style={{fontFamily:"'Inter',sans-serif",fontSize:".73rem",color:D.muted,lineHeight:1.45,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{displayDesc}</div>}
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}>
            {pp!==null&&<span style={{fontSize:".73rem",color:D.muted,textDecoration:"line-through"}}>{p.price.toFixed(2)}€</span>}
            <span style={{fontFamily:"'Inter',sans-serif",fontWeight:800,fontSize:".9rem",color:p.stock===0?D.muted:D.pink}}>
              {sizes ? `À partir de ${Math.min(...sizes.map(s=>s.price))}€` : `${(pp??p.price).toFixed(2)}€`}
            </span>
            {sizes && <span style={{fontSize:".68rem",color:D.pink,fontWeight:600}}>· {sizes.length} taille{sizes.length>1?"s":""}</span>}
            {!sizes&&p.stock>0&&p.stock<10&&<span style={{fontSize:".68rem",color:"#ff6b35",fontWeight:600}}>· {p.stock} restant{p.stock>1?"s":""}</span>}
          </div>
        </div>
        <button onClick={e=>{e.stopPropagation();if(p.stock>0)addToCart(p);}} disabled={p.stock===0}
          style={{flexShrink:0,width:34,height:34,borderRadius:"50%",
            background:p.stock===0?"rgba(0,0,0,.08)":isAdded?"#22c55e":D.pink,
            border:`1.5px solid ${p.stock===0?"rgba(0,0,0,.08)":isAdded?"#22c55e":D.pink}`,
            color:"#fff",fontSize:isAdded?".85rem":"1.2rem",
            display:"flex",alignItems:"center",justifyContent:"center",
            cursor:p.stock===0?"not-allowed":"pointer",
            boxShadow:isAdded?"0 0 0 3px rgba(34,197,94,.2)":`0 0 0 3px ${D.pink}22`,
            transition:"all .2s",fontFamily:"'Inter',sans-serif",fontWeight:700}}>
          {p.stock===0?"✕":isAdded?"✓":"+"}
        </button>
      </div>
    )}</>
  );
}

