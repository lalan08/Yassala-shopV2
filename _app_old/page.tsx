"use client";

import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, doc, addDoc, runTransaction, getDocs, query, where, setDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, updateProfile } from "firebase/auth";
import type { User } from "firebase/auth";

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
const db  = getFirestore(app);
const auth = getAuth(app);

const translateAuthError = (code: string) => {
  switch(code) {
    case "auth/email-already-in-use":  return "Cet email est déjà utilisé.";
    case "auth/wrong-password":        return "Mot de passe incorrect.";
    case "auth/invalid-credential":    return "Email ou mot de passe incorrect.";
    case "auth/user-not-found":        return "Aucun compte avec cet email.";
    case "auth/weak-password":         return "Mot de passe trop court (6 caractères min).";
    case "auth/invalid-email":         return "Adresse email invalide.";
    case "auth/popup-closed-by-user":  return "Connexion annulée.";
    case "auth/cancelled-popup-request": return "";
    default: return "Une erreur est survenue, réessaie.";
  }
};

// ── TYPES ──
type Product = { id: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; };
type Category = { id?: string; key: string; label: string; emoji: string; order: number; };
type Pack = { id: string; name: string; tag: string; emoji: string; items: string; price: number; real: number; star: boolean; };
type Settings = { shopOpen: boolean; deliveryMin: number; freeDelivery: number; hours: string; zone: string; whatsapp: string; promoBanner?: { text: string; emoji: string; active: boolean; color: string }; };
type CartItem = { id: string; name: string; price: number; qty: number; };
type Banner   = { id: string; title: string; subtitle: string; desc: string; cta: string; link: string; gradient: string; image: string; brightness?: number; active: boolean; order: number; };

// Catégories par défaut si Firestore est vide
const DEFAULT_CATS: Category[] = [
  { key: "biere",      label: "🍺 BIÈRES",    emoji: "🍺", order: 1 },
  { key: "cocktail",   label: "🍹 COCKTAILS", emoji: "🍹", order: 2 },
  { key: "spiritueux", label: "🥃 SPIRITUEUX",emoji: "🥃", order: 3 },
  { key: "snack",      label: "🍟 SNACKS",    emoji: "🍟", order: 4 },
];

const defaultSettings: Settings = {
  shopOpen: true, deliveryMin: 15, freeDelivery: 50,
  hours: "22:00–06:00", zone: "Cayenne & alentours", whatsapp: "+594 XXX XXX"
};

export default function Home() {
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
  const [orderForm, setOrderForm] = useState({ name: "", phone: "", address: "" });
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'whatsapp' | 'online'>('whatsapp');
  const [banners, setBanners]         = useState<Banner[]>([]);
  const [bannerIdx, setBannerIdx]     = useState(0);
  const [bannerPaused, setBannerPaused] = useState(false);
  const [cartReady, setCartReady]     = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon]           = useState<{code:string; type:"percent"|"fixed"; value:number}|null>(null);
  const [couponError, setCouponError] = useState("");
  const [orderConfirmId,  setOrderConfirmId]  = useState<string|null>(null);
  const [orderConfirmNum, setOrderConfirmNum] = useState<number|null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product|null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [historyPhone, setHistoryPhone]   = useState("");
  const [historyOrders, setHistoryOrders] = useState<any[]|null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // ── AUTH ──
  const [currentUser, setCurrentUser]     = useState<User|null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode]           = useState<"login"|"signup">("login");
  const [authName, setAuthName]           = useState("");
  const [authEmail, setAuthEmail]         = useState("");
  const [authPassword, setAuthPassword]   = useState("");
  const [authError, setAuthError]         = useState("");
  const [authLoading, setAuthLoading]     = useState(false);
  const [lastAddedId, setLastAddedId]     = useState<string|null>(null);
  const [likes, setLikes]                 = useState<Set<string>>(new Set());

  const toggleLike = (id: string) => {
    setLikes(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      try { localStorage.setItem("yassala_likes", JSON.stringify([...n])); } catch {}
      return n;
    });
  };

  // Catégories : Firestore si disponibles, sinon valeurs par défaut
  const cats = [
    { key: "all", label: "TOUT", emoji: "", order: 0 },
    ...(dbCats.length > 0 ? dbCats : DEFAULT_CATS),
  ];

  // ── LOAD DATA FROM FIREBASE ──
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    });
    const unsubPacks = onSnapshot(collection(db, "packs"), snap => {
      setPacks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Pack)));
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "main"), snap => {
      if (snap.exists()) setSettings(snap.data() as Settings);
    });
    const unsubBanners = onSnapshot(collection(db, "banners"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner))
        .filter(b => b.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setBanners(all);
      setBannerIdx(0);
    });
    const unsubCats = onSnapshot(collection(db, "categories"), snap => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setDbCats(loaded);
    });
    const unsubAuth = onAuthStateChanged(auth, user => setCurrentUser(user));
    return () => { unsubProducts(); unsubPacks(); unsubSettings(); unsubBanners(); unsubCats(); unsubAuth(); };
  }, []);

  // ── CART PERSISTENCE ──
  useEffect(() => {
    try { const s = localStorage.getItem("yassala_cart"); if (s) setCart(JSON.parse(s)); } catch {}
    try { const l = localStorage.getItem("yassala_likes"); if (l) setLikes(new Set(JSON.parse(l))); } catch {}
    setCartReady(true);
  }, []);
  useEffect(() => {
    if (!cartReady) return;
    localStorage.setItem("yassala_cart", JSON.stringify(cart));
  }, [cart, cartReady]);

  // ── SCROLL TO TOP ──
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (banners.length <= 1 || bannerPaused) return;
    const id = setInterval(() => setBannerIdx(i => (i + 1) % banners.length), 4500);
    return () => clearInterval(id);
  }, [banners.length, bannerPaused]);

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  const addToCart = (id: string, name: string, price: number) => {
    const product = products.find(p => p.id === id);
    if (product && product.stock === 0) {
      showToast("Produit en rupture de stock !");
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      const currentQty = existing ? existing.qty : 0;
      
      if (product && currentQty >= product.stock) {
        showToast(`Stock limité à ${product.stock} unité(s) !`);
        return prev;
      }

      if (existing) {
        return prev.map(item => item.id === id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { id, name, price, qty: 1 }];
    });
    setLastAddedId(id);
    setTimeout(() => setLastAddedId(null), 600);
    showToast(`${name} ajouté · ${price.toFixed(2)}€`);
  };

  const updateQty = (id: string, change: number) => {
    const product = products.find(p => p.id === id);
    
    setCart(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          const newQty = item.qty + change;
          if (product && newQty > product.stock) {
            showToast(`Stock limité à ${product.stock} unité(s) !`);
            return item;
          }
          return { ...item, qty: Math.max(0, newQty) };
        }
        return item;
      }).filter(item => item.qty > 0);
      return updated;
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const openCart = () => {
    if (cart.length === 0) { showToast("Panier vide — commande quelque chose !"); return; }
    setShowCart(true);
  };

  // ── COUPON ──
  const getDiscount = () => {
    if (!coupon) return 0;
    if (coupon.type === "percent") return Math.round(cartTotal * coupon.value) / 100;
    return Math.min(coupon.value, cartTotal);
  };
  const discountedTotal = cartTotal - getDiscount();
  const finalTotal = discountedTotal + (discountedTotal >= settings.freeDelivery ? 0 : 3);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const snap = await getDocs(query(collection(db, "coupons"), where("code","==",code), where("active","==",true)));
    if (snap.empty) { setCouponError("Code invalide ou expiré."); setCoupon(null); return; }
    const d = snap.docs[0].data();
    setCoupon({ code, type: d.type as "percent"|"fixed", value: d.value });
    setCouponError(""); showToast(`Coupon "${code}" appliqué ✓`);
  };

  const submitOrder = async () => {
    if (!orderForm.name || !orderForm.phone || !orderForm.address) {
      showToast("Remplis tous les champs !");
      return;
    }

    if (cartTotal < settings.deliveryMin) {
      showToast(`Commande minimum : ${settings.deliveryMin}€`);
      return;
    }

    setSubmitting(true);

    try {
      const orderRef = doc(collection(db, "orders"));
      const orderItems = cart.map(item => `${item.qty}× ${item.name} (${item.price.toFixed(2)}€)`).join("\n");
      const deliveryFee = discountedTotal >= settings.freeDelivery ? 0 : 3;
      const totalWithDelivery = discountedTotal + deliveryFee;
      const discount = getDiscount();

      // Numéro de commande séquentiel (compteur atomique)
      let orderNum = 1;
      const counterRef = doc(db, "settings", "orderCounter");

      // Vérifier le stock, décrémenter, incrémenter le compteur (transaction atomique)
      await runTransaction(db, async (transaction) => {
        // ── Lectures ──
        const prodRefs = cart.map(item => doc(db, "products", item.id));
        const prodDocs = await Promise.all(prodRefs.map(ref => transaction.get(ref)));
        const counterSnap = await transaction.get(counterRef);
        orderNum = (counterSnap.exists() ? (counterSnap.data().count as number) : 0) + 1;

        // Vérifier stock
        for (let i = 0; i < cart.length; i++) {
          const item = cart[i];
          const prodDoc = prodDocs[i];
          if (!prodDoc.exists()) throw new Error(`Produit ${item.name} introuvable`);
          const currentStock = prodDoc.data().stock || 0;
          if (currentStock < item.qty) throw new Error(`Stock insuffisant pour ${item.name} (${currentStock} restant)`);
        }

        // ── Écritures ──
        for (let i = 0; i < cart.length; i++) {
          transaction.update(prodRefs[i], { stock: (prodDocs[i].data().stock || 0) - cart[i].qty });
        }
        transaction.set(counterRef, { count: orderNum });
        transaction.set(orderRef, {
          items: orderItems,
          total: totalWithDelivery,
          subtotal: cartTotal,
          discount: discount,
          coupon: coupon?.code || null,
          deliveryFee,
          status: "nouveau",
          createdAt: new Date().toISOString(),
          phone: orderForm.phone,
          name: orderForm.name,
          address: orderForm.address,
          uid: currentUser?.uid || null,
          orderNumber: orderNum,
        });
      });

      if (paymentMethod === 'online') {
        // Paiement en ligne via Stripe — notification Telegram envoyée par webhook après confirmation
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart.map(item => ({ product: { name: item.name, price: item.price, description: '' }, quantity: item.qty })),
            customerName: orderForm.name,
            customerPhone: orderForm.phone,
            customerAddress: orderForm.address,
            deliveryFee,
            orderNum,
            orderId: orderRef.id,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error || 'Erreur paiement');
        window.location.href = data.url;
      } else {
        // ── Telegram notification (cash confirmé) ──
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber: orderNum,
            name: orderForm.name,
            phone: orderForm.phone,
            address: orderForm.address,
            items: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
            subtotal: cartTotal,
            deliveryFee,
            total: totalWithDelivery,
            method: 'cash',
          }),
        }).catch(() => {});

        // Commander via WhatsApp
        const message = `🛒 *COMMANDE #${orderNum} — YASSALA*\n\n` +
          `👤 *Client:* ${orderForm.name}\n` +
          `📱 *Tél:* ${orderForm.phone}\n` +
          `📍 *Adresse:* ${orderForm.address}\n\n` +
          `*COMMANDE:*\n${orderItems}\n\n` +
          (discount > 0 ? `🏷️ *Réduction (${coupon?.code}): -${discount.toFixed(2)}€*\n` : "") +
          `💰 *TOTAL: ${totalWithDelivery.toFixed(2)}€*\n` +
          `${deliveryFee === 0 ? "🎉 Livraison GRATUITE" : `📦 Livraison: 3€`}\n` +
          `💵 Paiement: Cash à la livraison\n` +
          `🔎 Suivi: https://yassalashop.gf/suivi?id=${orderRef.id}`;
        const whatsappUrl = `https://wa.me/${settings.whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');

        setCart([]);
        setOrderForm({ name: "", phone: "", address: "" });
        setCoupon(null); setCouponInput("");
        setShowCart(false);
        setOrderConfirmId(orderRef.id);
        setOrderConfirmNum(orderNum);
      }

    } catch (err: any) {
      showToast(err.message || "Erreur lors de l'envoi");
    }

    setSubmitting(false);
  };

  const filtered = products.filter(p =>
    activeCat === "all" || p.cat === activeCat
  );

  const suggestions = selectedProduct
    ? products.filter(p => p.cat === selectedProduct.cat && p.id !== selectedProduct.id && p.stock > 0).slice(0, 4)
    : [];

  const fetchHistory = async () => {
    setHistoryLoading(true);
    if (currentUser) {
      // Connecté → récupère par uid
      const snap = await getDocs(query(collection(db, "orders"), where("uid","==",currentUser.uid)));
      const list = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a:any,b:any) => b.createdAt.localeCompare(a.createdAt));
      setHistoryOrders(list);
    } else if (historyPhone.trim()) {
      // Non connecté → récupère par téléphone (ancien mode)
      const snap = await getDocs(query(collection(db, "orders"), where("phone","==",historyPhone.trim())));
      const list = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a:any,b:any) => b.createdAt.localeCompare(a.createdAt));
      setHistoryOrders(list);
    }
    setHistoryLoading(false);
  };

  const handleSignup = async () => {
    if (!authName.trim() || !authEmail.trim() || !authPassword.trim()) {
      setAuthError("Remplis tous les champs."); return;
    }
    setAuthLoading(true); setAuthError("");
    try {
      const { user } = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      await updateProfile(user, { displayName: authName.trim() });
      // Firestore écrit séparément : si la règle de sécurité bloque, le compte est quand même créé
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid, name: authName.trim(), email: authEmail.trim(),
          createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(),
        });
      } catch {}
      setShowAuthModal(false);
      showToast("Compte créé ! Bienvenue 🎉");
    } catch (e: any) { setAuthError(translateAuthError(e.code)); }
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Remplis tous les champs."); return;
    }
    setAuthLoading(true); setAuthError("");
    try {
      const { user } = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      await setDoc(doc(db, "users", user.uid), { lastLoginAt: new Date().toISOString() }, { merge: true });
      setShowAuthModal(false);
      showToast("Connecté !");
    } catch (e: any) { setAuthError(translateAuthError(e.code)); }
    setAuthLoading(false);
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      const { user } = await signInWithPopup(auth, provider);
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid, name: user.displayName || "", email: user.email || "",
        lastLoginAt: new Date().toISOString(),
      }, { merge: true });
      setShowAuthModal(false);
      showToast("Connecté avec Google !");
    } catch (e: any) {
      const msg = translateAuthError(e.code);
      if (msg) setAuthError(msg);
    }
    setAuthLoading(false);
  };

  const handleSignout = async () => {
    await signOut(auth);
    setShowHistory(false);
    setHistoryOrders(null);
    showToast("Déconnecté");
  };

  const shareProduct = (p: Product) => {
    const text = `${p.name} — ${Number(p.price).toFixed(2)}€ 🍺\nCommande sur Yassala Night Shop : https://yassalashop.gf`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: p.name, text, url: "https://yassalashop.gf" }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => showToast("Lien copié !")).catch(() => showToast("Copie non supportée"));
    }
  };

  const catLabel = (cat: string) => cats.find(c => c.key === cat)?.label ?? cat.toUpperCase();
  const catColor = (cat: string) => cat === "snack_peyi" ? "#ff8c00" : "#00f5ff";

  const getBadgeType = (badge: string) => {
    if (badge === "HOT")  return "hot";
    if (badge === "NEW")  return "new";
    if (badge === "COOL") return "cool";
    if (badge === "BEST") return "best";
    return null;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        :root {
          --bg:#04020a; --card:#0c0918;
          --pink:#ff2d78; --cyan:#00f5ff; --lime:#b8ff00;
          --white:#f0eeff; --muted:#5a5470;
        }
        *{margin:0;padding:0;box-sizing:border-box;}
        html{scroll-behavior:smooth;}
        body{
          background:#04020a !important;
          color:#f0eeff !important;
          font-family:'Rajdhani',sans-serif !important;
          font-weight:500;
          min-height:100vh;
          overflow-x:hidden;
        }
        body::before{
          content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.08) 2px,rgba(0,0,0,.08) 4px);
        }
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.4);}}
        @keyframes flicker{0%,95%,100%{opacity:1;}96%{opacity:.7;}97%{opacity:1;}98%{opacity:.5;}99%{opacity:1;}}
        @keyframes gridScroll{from{background-position:0 0;}to{background-position:50px 50px;}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}
        @keyframes bannerIn{from{opacity:0;transform:translateX(22px);}to{opacity:1;transform:translateX(0);}}
        @keyframes bgShift{from{opacity:.7;}to{opacity:1;}}
        .flicker{animation:flicker 6s infinite;}
        .fade1{animation:fadeUp .5s .0s both;}
        .fade2{animation:fadeUp .5s .1s both;}
        .fade3{animation:fadeUp .5s .2s both;}
        .fade4{animation:fadeUp .5s .3s both;}
        .fade5{animation:fadeUp .5s .4s both;}

        /* ── RESPONSIVE MOBILE ── */
        @media (max-width:640px){
          .nav-main{padding:10px 14px !important;}
          .nav-logo{font-size:1.4rem !important;}
          .nav-status{display:none !important;}
          .nav-cart-btn{padding:7px 12px !important;font-size:.78rem !important;gap:5px !important;}
          .hero-content{padding:36px 16px 72px !important;max-width:100% !important;}
          .hero-content h1{font-size:clamp(2.6rem,14vw,4.5rem) !important;}
          .clock-hero{display:none !important;}
          .info-bar{flex-wrap:wrap !important;}
          .info-bar-item{flex:0 0 50% !important;border-right:none !important;border-bottom:1px solid rgba(255,255,255,.04);}
          .info-bar-item:nth-child(odd){border-right:1px solid rgba(255,255,255,.04) !important;}
          .cat-bar{gap:6px !important;padding:12px 12px !important;}
          .cat-btn{padding:9px 16px !important;font-size:.8rem !important;}
          .section-title{font-size:1.4rem !important;}
          .products-grid{grid-template-columns:1fr !important;}
        }
        @media (max-width:400px){
          .nav-logo{font-size:1.2rem !important;}
          .hero-content h1{font-size:clamp(2.2rem,12vw,3.5rem) !important;}
          .info-bar-item{flex:0 0 100% !important;border-right:none !important;}
        }
        /* Pills catégories : scroll horizontal sans scrollbar visible */
        .cat-bar{overflow-x:auto;flex-wrap:nowrap !important;scrollbar-width:none;-ms-overflow-style:none;}
        .cat-bar::-webkit-scrollbar{display:none;}
        .cat-btn{flex-shrink:0;}
        /* Padding body pour la barre de navigation fixe en bas */
        body{padding-bottom:90px;}
      `}</style>

      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        background:"radial-gradient(ellipse 50% 50% at 10% 20%,rgba(255,45,120,.07) 0%,transparent 60%),radial-gradient(ellipse 40% 60% at 90% 70%,rgba(0,245,255,.06) 0%,transparent 60%)",
        animation:"bgShift 8s ease-in-out infinite alternate"}} />

      <div style={{background: settings.shopOpen ? "#ff2d78" : "#5a5470",color:"#000",textAlign:"center",padding:"8px",
        fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",letterSpacing:".15em",
        position:"relative",zIndex:10}}>
        {settings.shopOpen 
          ? `// LIVRAISON NOCTURNE · ${settings.zone.toUpperCase()} · MIN. ${settings.deliveryMin}€ · ${settings.hours} //`
          : "// SHOP FERMÉ · REVENEZ PLUS TARD //"
        }
      </div>

      <nav className="nav-main" style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"16px 28px",borderBottom:"1px solid rgba(255,45,120,.25)",
        position:"sticky",top:0,zIndex:100,
        background:"rgba(4,2,10,.9)",backdropFilter:"blur(20px)"}}>
        <div className="flicker nav-logo" style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.8rem",
          letterSpacing:".08em",color:"#ff2d78",textShadow:"0 0 20px rgba(255,45,120,.6)",lineHeight:1}}>
          YASSALA
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#00f5ff",
            letterSpacing:".2em",display:"block",marginTop:"-4px"}}>
            Night Shop
          </span>
        </div>
        <div className="nav-status" style={{display:"flex",alignItems:"center",gap:"8px",
          border: settings.shopOpen ? "1px solid #b8ff00" : "1px solid #5a5470",
          color: settings.shopOpen ? "#b8ff00" : "#5a5470",
          padding:"6px 14px",borderRadius:"3px",
          fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".12em"}}>
          <div style={{width:6,height:6,
            background: settings.shopOpen ? "#b8ff00" : "#5a5470",
            borderRadius:"50%",
            animation: settings.shopOpen ? "pulse 1.5s infinite" : "none"}} />
          {settings.shopOpen ? `OPEN · ${settings.hours}` : "FERMÉ"}
        </div>
        <button className="nav-cart-btn" onClick={openCart} style={{background:"transparent",border:"1px solid #ff2d78",
          color:"#ff2d78",padding:"8px 18px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
          fontSize:".85rem",letterSpacing:".1em",textTransform:"uppercase",cursor:"pointer",
          display:"flex",alignItems:"center",gap:"8px",borderRadius:"3px"}}>
          🛒 PANIER
          <span style={{background:"#ff2d78",color:"#000",borderRadius:"2px",
            width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:".72rem",fontWeight:900}}>
            {cartCount}
          </span>
        </button>
      </nav>

      {/* ── HERO / CAROUSEL BANNIÈRES ── */}
      <section
        style={{position:"relative",minHeight:420,overflow:"hidden",zIndex:1,display:"flex",alignItems:"center"}}
        onMouseEnter={() => banners.length > 1 && setBannerPaused(true)}
        onMouseLeave={() => banners.length > 1 && setBannerPaused(false)}
      >
        {/* Grille animée */}
        <div style={{position:"absolute",inset:0,
          backgroundImage:"linear-gradient(rgba(255,45,120,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,45,120,.07) 1px,transparent 1px)",
          backgroundSize:"50px 50px",animation:"gridScroll 20s linear infinite"}} />

        {/* Gradient de la bannière active */}
        {banners.length > 0 && (
          <div key={`grad-${bannerIdx}`} style={{
            position:"absolute",inset:0,
            background: banners[bannerIdx]?.gradient || "linear-gradient(135deg,rgba(255,45,120,.4) 0%,rgba(4,2,10,.85) 100%)",
            animation:"bannerIn .7s both",zIndex:1}} />
        )}

        {/* Image de fond de la bannière */}
        {banners.length > 0 && banners[bannerIdx]?.image && (
          <div key={`img-${bannerIdx}`} style={{
            position:"absolute",inset:0,
            backgroundImage:`url(${banners[bannerIdx].image})`,
            backgroundSize:"cover",backgroundPosition:"center",
            opacity: banners[bannerIdx].brightness ?? .28,animation:"bannerIn .7s both",zIndex:1}} />
        )}

        {/* Contenu texte */}
        <div
          key={banners.length > 0 ? `banner-${bannerIdx}` : "static"}
          className="hero-content"
          style={{position:"relative",zIndex:2,maxWidth:580,padding:"60px 28px 70px",
            animation: banners.length > 0 ? "bannerIn .5s .12s both" : undefined}}
        >
          <div className={banners.length === 0 ? "fade1" : undefined}
            style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",
              color:"#00f5ff",letterSpacing:".2em",textTransform:"uppercase",marginBottom:18}}>
            &gt; {banners.length > 0 ? (banners[bannerIdx]?.subtitle || "livraison nocturne — guyane") : "livraison nocturne — guyane"}
          </div>

          <h1 className={banners.length === 0 ? "fade2" : undefined}
            style={{fontFamily:"'Black Ops One',cursive",
              fontSize:"clamp(3.5rem,9vw,6.5rem)",lineHeight:.9,letterSpacing:".03em",marginBottom:22}}>
            {banners.length > 0 ? (
              <span style={{color:"#fff",textShadow:"0 0 30px rgba(255,255,255,.22),0 0 80px rgba(255,45,120,.3)",display:"block"}}>
                {banners[bannerIdx]?.title || "YASSALA NIGHT SHOP"}
              </span>
            ) : (<>
              <span style={{color:"#ff2d78",textShadow:"0 0 20px rgba(255,45,120,.6),0 0 60px rgba(255,45,120,.2)",display:"block"}}>YASSALA</span>
              <span style={{color:"#00f5ff",textShadow:"0 0 20px rgba(0,245,255,.6),0 0 60px rgba(0,245,255,.2)",display:"block"}}>NIGHT</span>
              <span style={{WebkitTextStroke:"2px #bf00ff",color:"transparent",display:"block",
                filter:"drop-shadow(0 0 12px rgba(191,0,255,.5))"}}>SHOP</span>
            </>)}
          </h1>

          {banners.length > 0 && banners[bannerIdx]?.desc ? (
            <p style={{fontSize:"1rem",color:"rgba(240,238,255,.78)",lineHeight:1.65,maxWidth:400,marginBottom:32}}>
              {banners[bannerIdx].desc}
            </p>
          ) : banners.length === 0 ? (
            <p className="fade3" style={{fontSize:"1rem",color:"#5a5470",lineHeight:1.65,maxWidth:400,marginBottom:32}}>
              Boissons, snacks et bonne humeur livrés chez toi en moins de 30 minutes. Partout à Cayenne, toute la nuit.
            </p>
          ) : <div style={{marginBottom:32}} />}

          <div className={banners.length === 0 ? "fade4" : undefined} style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <button onClick={() => {
              const link = banners.length > 0 ? (banners[bannerIdx]?.link || "catalogue") : "catalogue";
              if (link === "catalogue" || link === "") document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"});
              else if (link === "packs") document.getElementById("packs")?.scrollIntoView({behavior:"smooth"});
              else window.open(link, "_blank");
            }} style={{padding:"13px 26px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
              fontSize:".9rem",letterSpacing:".12em",textTransform:"uppercase",border:"none",
              cursor:"pointer",borderRadius:3,background:"#ff2d78",color:"#000"}}>
              {banners.length > 0 ? (banners[bannerIdx]?.cta || "COMMANDER →") : "COMMANDER →"}
            </button>
            {banners.length === 0 && (
              <button onClick={() => document.getElementById("packs")?.scrollIntoView({behavior:"smooth"})}
                style={{padding:"13px 26px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                  fontSize:".9rem",letterSpacing:".12em",textTransform:"uppercase",
                  background:"transparent",color:"#00f5ff",border:"1px solid #00f5ff",
                  cursor:"pointer",borderRadius:3}}>
                VOIR LES PACKS
              </button>
            )}
          </div>
        </div>

        {/* Horloge */}
        <div className={`clock-hero${banners.length === 0 ? " fade5" : ""}`}
          style={{position:"absolute",right:28,top:"50%",transform:"translateY(-50%)",zIndex:3,textAlign:"center"}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:"5rem",
            color:"#00f5ff",textShadow:"0 0 20px rgba(0,245,255,.6)",letterSpacing:".05em",lineHeight:1}}>
            {clock}
          </div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",
            color:"#5a5470",letterSpacing:".2em",textTransform:"uppercase",marginTop:6}}>
            heure locale
          </div>
        </div>

        {/* Dots + flèches navigation */}
        {banners.length > 1 && (
          <div style={{position:"absolute",bottom:16,left:0,right:0,
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,zIndex:3}}>
            <button
              onClick={() => { setBannerIdx(i => (i - 1 + banners.length) % banners.length); setBannerPaused(true); setTimeout(()=>setBannerPaused(false),8000); }}
              style={{background:"rgba(0,0,0,.55)",border:"1px solid rgba(255,255,255,.2)",color:"#fff",
                width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:"1.1rem",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>‹</button>
            {banners.map((_,i) => (
              <button key={i}
                onClick={() => { setBannerIdx(i); setBannerPaused(true); setTimeout(()=>setBannerPaused(false),8000); }}
                style={{width:i===bannerIdx?24:8,height:8,borderRadius:4,border:"none",cursor:"pointer",
                  background:i===bannerIdx?"#ff2d78":"rgba(255,255,255,.3)",
                  transition:"all .3s",padding:0,flexShrink:0}} />
            ))}
            <button
              onClick={() => { setBannerIdx(i => (i + 1) % banners.length); setBannerPaused(true); setTimeout(()=>setBannerPaused(false),8000); }}
              style={{background:"rgba(0,0,0,.55)",border:"1px solid rgba(255,255,255,.2)",color:"#fff",
                width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:"1.1rem",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>›</button>
          </div>
        )}
      </section>

      <div className="info-bar" style={{display:"flex",borderTop:"1px solid rgba(255,45,120,.25)",
        borderBottom:"1px solid rgba(0,245,255,.2)",position:"relative",zIndex:1}}>
        {[
          {icon:"⚡",title:"Ultra rapide",     sub:"– 30 minutes"},
          {icon:"🔥",title:"Livraison offerte",sub:`dès ${settings.freeDelivery}€`},
          {icon:"📡",title:settings.zone,      sub:"couverture totale"},
          {icon:"🌙",title:settings.hours,     sub:"7j/7"},
        ].map((item,i) => (
          <div key={i} className="info-bar-item" style={{flex:1,padding:"14px 18px",display:"flex",alignItems:"center",
            gap:10,borderRight:"1px solid rgba(255,255,255,.04)",background:"#080514"}}>
            <span style={{fontSize:"1.2rem"}}>{item.icon}</span>
            <div>
              <strong style={{display:"block",fontWeight:700,fontSize:".82rem",
                letterSpacing:".06em",color:"#f0eeff",textTransform:"uppercase"}}>
                {item.title}
              </strong>
              <small style={{fontSize:".72rem",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace"}}>
                {item.sub}
              </small>
            </div>
          </div>
        ))}
      </div>

      <section id="catalogue" style={{padding:"48px 16px 48px 16px",position:"relative",zIndex:1}}>
        {/* ── Header titre + compteur ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"0 12px"}}>
          <div className="section-title" style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.8rem",letterSpacing:".05em"}}>
            🛒 <span style={{color:"#ff2d78",textShadow:"0 0 20px rgba(255,45,120,.6)"}}>CATALOGUE</span>
          </div>
          {!loading && (
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#00f5ff",
              letterSpacing:".1em",textTransform:"uppercase",
              background:"rgba(0,245,255,.06)",border:"1px solid rgba(0,245,255,.2)",
              borderRadius:12,padding:"4px 10px"}}>
              {products.filter(p => p.stock > 0).length} dispo
            </span>
          )}
        </div>

        {/* ── Bannière promo ── */}
        {settings.promoBanner?.active && settings.promoBanner.text && (
          <div style={{margin:"0 12px 20px",padding:"12px 18px",borderRadius:8,
            background: settings.promoBanner.color === "pink"
              ? "rgba(255,45,120,.12)"
              : settings.promoBanner.color === "cyan"
              ? "rgba(0,245,255,.1)"
              : settings.promoBanner.color === "green"
              ? "rgba(184,255,0,.1)"
              : "rgba(255,180,0,.1)",
            border: settings.promoBanner.color === "pink"
              ? "1px solid rgba(255,45,120,.35)"
              : settings.promoBanner.color === "cyan"
              ? "1px solid rgba(0,245,255,.3)"
              : settings.promoBanner.color === "green"
              ? "1px solid rgba(184,255,0,.3)"
              : "1px solid rgba(255,180,0,.35)",
            fontFamily:"'Rajdhani',sans-serif",fontWeight:600,fontSize:"1rem",letterSpacing:".04em",
            color: settings.promoBanner.color === "pink"
              ? "#ff2d78"
              : settings.promoBanner.color === "cyan"
              ? "#00f5ff"
              : settings.promoBanner.color === "green"
              ? "#b8ff00"
              : "#ffb400",
            display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:"1.3rem"}}>{settings.promoBanner.emoji || "🎉"}</span>
            {settings.promoBanner.text}
          </div>
        )}

        {/* ── À la une (produits HOT / BEST) ── */}
        {(() => {
          const featured = products.filter(p => (p.badge === "HOT" || p.badge === "BEST") && p.stock > 0);
          if (!featured.length) return null;
          return (
            <div style={{marginBottom:28}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#888",
                letterSpacing:".12em",textTransform:"uppercase",padding:"0 12px",marginBottom:10}}>
                ★ À LA UNE
              </div>
              <div style={{display:"flex",gap:12,overflowX:"auto",padding:"0 12px 6px",
                scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
                {featured.map(p => (
                  <div key={p.id} onClick={() => setSelectedProduct(p)}
                    style={{flexShrink:0,width:140,background:"#0c0918",
                      border: p.badge==="HOT" ? "1px solid rgba(255,45,120,.4)" : "1px solid rgba(255,180,0,.4)",
                      borderRadius:8,overflow:"hidden",cursor:"pointer",position:"relative"}}>
                    {p.image && (
                      <img src={p.image} alt={p.name}
                        style={{width:"100%",height:90,objectFit:"cover",display:"block"}} />
                    )}
                    <div style={{padding:"8px 10px"}}>
                      <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".85rem",
                        color:"#e0d9ff",letterSpacing:".03em",
                        overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                        {p.name}
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",
                        color: p.badge==="HOT" ? "#ff2d78" : "#ffb400",marginTop:2}}>
                        {p.price.toFixed(2)}€
                      </div>
                    </div>
                    <span style={{position:"absolute",top:6,right:6,
                      background: p.badge==="HOT" ? "rgba(255,45,120,.9)" : "rgba(255,180,0,.95)",
                      color:"#000",fontSize:".6rem",fontFamily:"'Share Tech Mono',monospace",
                      fontWeight:700,padding:"2px 6px",borderRadius:3,letterSpacing:".08em"}}>
                      {p.badge==="HOT" ? "🔥 HOT" : "⭐ BEST"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Filtres catégories */}
        <div className="cat-bar" style={{display:"flex",gap:8,marginBottom:14,padding:"0 12px 6px"}}>
          {cats.map(c => (
            <button key={c.key} className="cat-btn" onClick={() => setActiveCat(c.key)}
              style={{padding:"12px 24px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                fontSize:"1rem",letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",
                borderRadius:24,whiteSpace:"nowrap",transition:"all .2s",
                border: activeCat===c.key ? "1px solid #ff2d78" : "1px solid rgba(255,255,255,.18)",
                background: activeCat===c.key
                  ? "rgba(255,45,120,.15)"
                  : "rgba(255,255,255,.05)",
                color: activeCat===c.key ? "#ff2d78" : "#c8c2e0",
                boxShadow: activeCat===c.key ? "0 0 12px rgba(255,45,120,.25)" : "none"}}>
              {c.label}
            </button>
          ))}
        </div>


        {loading ? (
          <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
            padding:"60px",fontSize:".85rem"}}>
            // chargement des produits...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
              padding:"60px",fontSize:".85rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
              // aucun produit pour le moment — revenez plus tard !
            </div>
        ) : (
          <div className="products-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:14}}>
            {filtered.map(p => (
              <div key={p.id} onClick={() => setSelectedProduct(p)}
                style={{background:"#0c0918",
                  border: lastAddedId===p.id ? "1px solid #b8ff00" : p.cat === "snack_peyi" ? "1px solid rgba(255,140,0,.25)" : "1px solid rgba(255,255,255,.06)",
                  borderRadius:8,overflow:"hidden",cursor:"pointer",position:"relative",
                  opacity: p.stock === 0 ? 0.55 : 1,
                  transition:"border-color .3s, box-shadow .3s",
                  boxShadow: lastAddedId===p.id ? "0 0 14px rgba(184,255,0,.35)" : "none"}}>

                {/* ── IMAGE avec overlays ── */}
                <div style={{position:"relative",aspectRatio:"16/9",overflow:"hidden",
                  background:"linear-gradient(135deg,rgba(255,45,120,.05),rgba(0,245,255,.04))"}}>
                  {p.image ? (
                    <img src={p.image} alt={p.name}
                      style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
                  ) : (
                    <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
                      justifyContent:"center",fontSize:"3.5rem",opacity:.4}}>📷</div>
                  )}

                  {/* Gradient sombre en bas de l'image */}
                  <div style={{position:"absolute",bottom:0,left:0,right:0,height:"55%",
                    background:"linear-gradient(to top,rgba(12,9,24,.96),transparent)",
                    pointerEvents:"none"}} />

                  {/* Prix en overlay bas-gauche */}
                  <div style={{position:"absolute",bottom:10,left:12,
                    fontFamily:"'Black Ops One',cursive",fontSize:"1.35rem",
                    color:"#b8ff00",textShadow:"0 0 14px rgba(184,255,0,.55)",lineHeight:1}}>
                    {Number(p.price).toFixed(2)}€
                  </div>

                  {/* Boutons haut-droite : like + partage */}
                  <div style={{position:"absolute",top:8,right:8,zIndex:3,display:"flex",flexDirection:"column",gap:5}}>
                    <button onClick={e => { e.stopPropagation(); toggleLike(p.id); }}
                      style={{width:32,height:32,background:"rgba(4,2,10,.72)",backdropFilter:"blur(6px)",
                        border: likes.has(p.id) ? "1px solid rgba(255,45,120,.55)" : "1px solid rgba(255,255,255,.15)",
                        borderRadius:6,cursor:"pointer",fontSize:".95rem",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        transition:"all .2s"}}>
                      <span style={{color: likes.has(p.id) ? "#ff2d78" : "#5a5470",
                        filter: likes.has(p.id) ? "drop-shadow(0 0 5px rgba(255,45,120,.8))" : "none",
                        lineHeight:1}}>
                        {likes.has(p.id) ? "♥" : "♡"}
                      </span>
                    </button>
                    <button onClick={e => { e.stopPropagation(); shareProduct(p); }}
                      style={{width:32,height:32,background:"rgba(4,2,10,.72)",backdropFilter:"blur(6px)",
                        border:"1px solid rgba(255,255,255,.15)",borderRadius:6,
                        cursor:"pointer",fontSize:".72rem",color:"#5a5470",
                        display:"flex",alignItems:"center",justifyContent:"center"}}>
                      ↗
                    </button>
                  </div>

                  {/* Badge haut-gauche */}
                  {p.stock === 0 ? (
                    <span style={{position:"absolute",top:8,left:8,
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",letterSpacing:".12em",
                      textTransform:"uppercase",padding:"3px 9px",borderRadius:3,zIndex:4,
                      background:"rgba(90,84,112,.9)",color:"#f0eeff",fontWeight:700,
                      backdropFilter:"blur(4px)",border:"1px solid rgba(255,255,255,.15)"}}>
                      RUPTURE
                    </span>
                  ) : p.badge ? (
                    <span style={{position:"absolute",top:8,left:8,
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",letterSpacing:".12em",
                      textTransform:"uppercase",padding:"3px 9px",borderRadius:3,zIndex:4,fontWeight:700,
                      backdropFilter:"blur(4px)",
                      background: getBadgeType(p.badge)==="hot"
                        ? "rgba(255,45,120,.9)"
                        : getBadgeType(p.badge)==="new"
                        ? "rgba(184,255,0,.9)"
                        : getBadgeType(p.badge)==="best"
                        ? "rgba(255,180,0,.95)"
                        : "rgba(0,245,255,.9)",
                      color:"#000",
                      boxShadow: getBadgeType(p.badge)==="hot"
                        ? "0 0 10px rgba(255,45,120,.6)"
                        : getBadgeType(p.badge)==="new"
                        ? "0 0 10px rgba(184,255,0,.5)"
                        : getBadgeType(p.badge)==="best"
                        ? "0 0 12px rgba(255,180,0,.6)"
                        : "0 0 10px rgba(0,245,255,.5)"}}>
                      {p.badge === "BEST" ? "⭐ BEST" : p.badge}
                    </span>
                  ) : null}
                </div>

                {/* ── INFOS ── */}
                <div style={{padding:"12px 14px 14px"}}>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",
                    color:catColor(p.cat),letterSpacing:".15em",textTransform:"uppercase",marginBottom:5}}>
                    {catLabel(p.cat)}
                  </div>
                  <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",
                    letterSpacing:".04em",textTransform:"uppercase",color:"#f0eeff",marginBottom:4}}>
                    {p.name}
                  </div>
                  <div style={{fontSize:".78rem",color:"#5a5470",lineHeight:1.5,marginBottom:10,
                    display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                    {p.desc}
                  </div>
                  {p.stock > 0 && p.stock < 10 && (
                    <div style={{fontSize:".68rem",color:"#b8ff00",fontFamily:"'Share Tech Mono',monospace",marginBottom:8}}>
                      Plus que {p.stock} en stock !
                    </div>
                  )}
                  <button onClick={e => { e.stopPropagation(); addToCart(p.id, p.name, p.price); }}
                    disabled={p.stock === 0}
                    style={{width:"100%",padding:"10px 0",borderRadius:3,
                      fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".85rem",
                      letterSpacing:".12em",textTransform:"uppercase",
                      border: p.stock === 0 ? "1px solid #5a5470" : lastAddedId===p.id ? "1px solid #b8ff00" : "1px solid #ff2d78",
                      background: p.stock === 0 ? "transparent" : lastAddedId===p.id ? "rgba(184,255,0,.08)" : "rgba(255,45,120,.08)",
                      color: p.stock === 0 ? "#5a5470" : lastAddedId===p.id ? "#b8ff00" : "#ff2d78",
                      cursor: p.stock === 0 ? "not-allowed" : "pointer",
                      transition:"all .3s"}}>
                    {p.stock === 0 ? "ÉPUISÉ" : lastAddedId===p.id ? "✓ AJOUTÉ" : "AJOUTER →"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{margin:"0 28px 44px",border:"1px solid rgba(255,45,120,.25)",borderRadius:6,
        padding:"24px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",
        gap:20,flexWrap:"wrap",
        background:"linear-gradient(135deg,rgba(255,45,120,.06),rgba(191,0,255,.04))"}}>
        <div>
          <strong style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.6rem",
            color:"#ff2d78",display:"block",marginBottom:4}}>
            🚀 LIVRAISON GRATUITE
          </strong>
          <p style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470"}}>
            // pour toute commande à partir de {settings.freeDelivery}€
          </p>
        </div>
        <button onClick={() => document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})}
          style={{padding:"13px 26px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
            fontSize:".9rem",letterSpacing:".12em",textTransform:"uppercase",border:"none",
            cursor:"pointer",borderRadius:3,background:"#ff2d78",color:"#000"}}>
          COMMANDER
        </button>
      </div>

      <section id="packs" style={{padding:"48px 28px",position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.8rem",letterSpacing:".05em"}}>
            🎊 PACKS <span style={{color:"#ff2d78",textShadow:"0 0 20px rgba(255,45,120,.6)"}}>SOIRÉE</span>
          </div>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",color:"#00f5ff",
            letterSpacing:".1em",textTransform:"uppercase",cursor:"pointer"}}>VOIR TOUT &gt;</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:14}}>
          {packs.map(pk => (
            <div key={pk.id} style={{background:"#0c0918",
              border: pk.star ? "1px solid #ff2d78" : "1px solid rgba(255,255,255,.06)",
              borderRadius:6,padding:22,position:"relative",overflow:"hidden",cursor:"pointer"}}>
              {pk.star && (
                <div style={{position:"absolute",top:0,right:0,background:"#ff2d78",color:"#000",
                  fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",letterSpacing:".12em",
                  padding:"5px 12px",borderRadius:"0 6px 0 8px"}}>
                  ★ POPULAIRE
                </div>
              )}
              <span style={{fontSize:"2.2rem",marginBottom:12,display:"block"}}>{pk.emoji}</span>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.5rem",
                color:"#f0eeff",marginBottom:4}}>{pk.name}</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",
                color:"#00f5ff",letterSpacing:".12em",marginBottom:10}}>{pk.tag}</div>
              <div style={{fontSize:".72rem",color:"#5a5470",lineHeight:1.8,marginBottom:18,
                borderLeft:"2px solid rgba(255,45,120,.3)",paddingLeft:10,
                fontFamily:"'Share Tech Mono',monospace"}}>
                {pk.items.split('\n').map((item,i) => <div key={i}>{item}</div>)}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.9rem",
                    color:"#b8ff00",textShadow:"0 0 20px rgba(184,255,0,.6)",lineHeight:1}}>
                    {Number(pk.price).toFixed(2)}€
                  </div>
                  <small style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",
                    color:"#5a5470",textDecoration:"line-through"}}>
                    valeur : {pk.real}€
                  </small>
                </div>
                <button onClick={() => addToCart(pk.id, pk.name, pk.price)}
                  style={{background:"transparent",border:"1px solid #ff2d78",color:"#ff2d78",
                    padding:"9px 18px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                    fontSize:".8rem",letterSpacing:".1em",textTransform:"uppercase",
                    cursor:"pointer",borderRadius:3}}>
                  AJOUTER
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{borderTop:"1px solid rgba(255,45,120,.25)",padding:"28px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        flexWrap:"wrap",gap:16,position:"relative",zIndex:1}}>
        <div className="flicker" style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",
          color:"#ff2d78",textShadow:"0 0 20px rgba(255,45,120,.6)",letterSpacing:".06em"}}>
          YASSALA NIGHT
        </div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",
          color:"#5a5470",letterSpacing:".1em",textAlign:"center",lineHeight:1.8}}>
          🌙 OUVERT {settings.hours} · {settings.zone.toUpperCase()}<br/>
          © 2025 YASSALA SHOP — TOUS DROITS RÉSERVÉS
        </div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#00f5ff"}}>
          📲 WHATSAPP : {settings.whatsapp}
        </div>
        <button onClick={() => setShowHistory(true)}
          style={{background:"transparent",border:"1px solid rgba(255,255,255,.1)",color:"#5a5470",
            borderRadius:4,padding:"8px 16px",fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",
            cursor:"pointer",letterSpacing:".08em",textTransform:"uppercase"}}>
          📋 MES COMMANDES
        </button>
      </footer>

      {/* TOAST */}
      <div style={{
        position:"fixed",top:18,right:18,background:"#0c0918",
        border:"1px solid #ff2d78",borderRadius:4,padding:"12px 18px",
        display:"flex",alignItems:"center",gap:10,zIndex:9998,maxWidth:270,
        fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#ff2d78",
        transform: toast.show ? "translateX(0)" : "translateX(130%)",
        transition:"transform .4s cubic-bezier(.34,1.56,.64,1)"}}>
        ⚡ {toast.msg}
      </div>

      {/* ORDER CONFIRMATION OVERLAY */}
      {orderConfirmId && (
        <div style={{position:"fixed",inset:0,background:"rgba(4,2,10,.97)",zIndex:2000,
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#0c0918",border:"1px solid rgba(184,255,0,.4)",borderRadius:12,
            padding:"40px 32px",maxWidth:420,width:"100%",textAlign:"center",animation:"fadeUp .4s both"}}>
            <div style={{fontSize:"3rem",marginBottom:16}}>✅</div>
            <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.6rem",color:"#b8ff00",
              textShadow:"0 0 20px rgba(184,255,0,.5)",marginBottom:8}}>
              COMMANDE CONFIRMÉE
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470",marginBottom:24}}>
              {orderConfirmNum ? `Commande #${orderConfirmNum}` : `Réf : ${orderConfirmId.slice(-8).toUpperCase()}`}
            </div>
            <a href={`/suivi?id=${orderConfirmId}`}
              style={{display:"block",background:"#ff2d78",color:"#000",borderRadius:4,padding:"13px",
                fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",letterSpacing:".1em",
                textDecoration:"none",textTransform:"uppercase",marginBottom:12}}>
              🔎 SUIVRE MA COMMANDE
            </a>
            <button onClick={() => setOrderConfirmId(null)}
              style={{background:"transparent",border:"1px solid rgba(255,255,255,.1)",color:"#5a5470",
                borderRadius:4,padding:"10px",width:"100%",fontFamily:"'Share Tech Mono',monospace",
                fontSize:".75rem",cursor:"pointer",letterSpacing:".08em"}}>
              FERMER
            </button>
          </div>
        </div>
      )}

      {/* CART MODAL */}
      {showCart && (
        <div onClick={() => setShowCart(false)} style={{position:"fixed",inset:0,background:"rgba(4,2,10,.95)",
          zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",
          paddingTop:16,paddingLeft:16,paddingRight:16,paddingBottom:80,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#0c0918",
            border:"1px solid rgba(255,45,120,.3)",borderRadius:10,width:"100%",
            maxWidth:500,animation:"fadeUp .3s both",
            maxHeight:"calc(100vh - 96px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

            {/* Header sticky — toujours visible */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"20px 24px 16px",flexShrink:0,
              borderBottom:"1px solid rgba(255,45,120,.15)",
              background:"#0c0918",position:"sticky",top:0,zIndex:10}}>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.5rem",color:"#ff2d78",
                letterSpacing:".04em"}}>
                🛒 MON PANIER
              </div>
              <button onClick={() => setShowCart(false)}
                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",
                  color:"#f0eeff",fontSize:"1rem",cursor:"pointer",borderRadius:6,
                  width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center"}}>
                ✕
              </button>
            </div>

            {/* Contenu scrollable */}
            <div style={{overflowY:"auto",padding:"20px 24px 24px",flex:1}}>

            {cart.length === 0 ? (
              <div style={{textAlign:"center",padding:"40px",color:"#5a5470",
                fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem"}}>
                // panier vide
              </div>
            ) : (
              <>
                <div style={{marginBottom:20,maxHeight:250,overflowY:"auto"}}>
                  {cart.map(item => (
                    <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,
                      padding:"12px",background:"#080514",borderRadius:6,marginBottom:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:".95rem",marginBottom:4}}>{item.name}</div>
                        <div style={{fontSize:".78rem",color:"#b8ff00",fontFamily:"'Black Ops One',cursive"}}>
                          {item.price.toFixed(2)}€
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <button onClick={() => updateQty(item.id, -1)}
                          style={{width:28,height:28,border:"1px solid #ff2d78",background:"transparent",
                            color:"#ff2d78",borderRadius:3,cursor:"pointer",fontSize:"1.2rem"}}>−</button>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",
                          minWidth:20,textAlign:"center"}}>{item.qty}</span>
                        <button onClick={() => updateQty(item.id, 1)}
                          style={{width:28,height:28,border:"1px solid #ff2d78",background:"transparent",
                            color:"#ff2d78",borderRadius:3,cursor:"pointer",fontSize:"1.2rem"}}>+</button>
                      </div>
                      <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",color:"#b8ff00",
                        minWidth:70,textAlign:"right"}}>
                        {(item.price * item.qty).toFixed(2)}€
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coupon */}
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input placeholder="Code promo" value={couponInput}
                    onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                    onKeyDown={e => e.key === "Enter" && applyCoupon()}
                    style={{flex:1,background:"#080514",border:"1px solid rgba(255,255,255,.12)",borderRadius:4,
                      padding:"9px 12px",color:"#f0eeff",fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",outline:"none"}} />
                  <button onClick={applyCoupon}
                    style={{background:"rgba(0,245,255,.1)",border:"1px solid rgba(0,245,255,.35)",
                      color:"#00f5ff",padding:"0 14px",borderRadius:4,cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",letterSpacing:".06em",whiteSpace:"nowrap"}}>
                    APPLIQUER
                  </button>
                </div>
                {couponError && <div style={{color:"#ff2d78",fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",marginBottom:8}}>{couponError}</div>}
                {coupon && <div style={{color:"#b8ff00",fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",marginBottom:8}}>
                  ✓ Code «{coupon.code}» : -{coupon.type==="percent" ? `${coupon.value}%` : `${coupon.value.toFixed(2)}€`}
                  <button onClick={() => { setCoupon(null); setCouponInput(""); }}
                    style={{marginLeft:8,background:"transparent",border:"none",color:"#5a5470",cursor:"pointer",fontSize:".8rem"}}>✕</button>
                </div>}

                <div style={{borderTop:"1px solid rgba(255,45,120,.2)",paddingTop:16,marginBottom:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470"}}>SOUS-TOTAL</span>
                    <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700}}>{cartTotal.toFixed(2)}€</span>
                  </div>
                  {coupon && <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#b8ff00"}}>RÉDUCTION</span>
                    <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,color:"#b8ff00"}}>-{getDiscount().toFixed(2)}€</span>
                  </div>}
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".75rem",color:"#5a5470"}}>LIVRAISON</span>
                    <span style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                      color: discountedTotal >= settings.freeDelivery ? "#b8ff00" : "#f0eeff"}}>
                      {discountedTotal >= settings.freeDelivery ? "GRATUITE" : "3.00€"}
                    </span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",paddingTop:12,
                    borderTop:"1px solid rgba(255,45,120,.2)"}}>
                    <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.1rem",color:"#ff2d78"}}>TOTAL</span>
                    <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#b8ff00",
                      textShadow:"0 0 15px rgba(184,255,0,.5)"}}>
                      {finalTotal.toFixed(2)}€
                    </span>
                  </div>
                </div>

                <div style={{display:"grid",gap:12,marginBottom:20}}>
                  <input placeholder="Nom complet" value={orderForm.name}
                    onChange={e => setOrderForm(f => ({...f, name: e.target.value}))}
                    style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
                      borderRadius:4,padding:"12px",color:"#f0eeff",fontSize:".9rem",
                      fontFamily:"'Rajdhani',sans-serif"}} />
                  <input placeholder="Téléphone" value={orderForm.phone}
                    onChange={e => setOrderForm(f => ({...f, phone: e.target.value}))}
                    style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
                      borderRadius:4,padding:"12px",color:"#f0eeff",fontSize:".9rem",
                      fontFamily:"'Rajdhani',sans-serif"}} />
                  <textarea placeholder="Adresse de livraison complète" rows={3} value={orderForm.address}
                    onChange={e => setOrderForm(f => ({...f, address: e.target.value}))}
                    style={{width:"100%",background:"#080514",border:"1px solid rgba(255,255,255,.1)",
                      borderRadius:4,padding:"12px",color:"#f0eeff",fontSize:".9rem",
                      fontFamily:"'Rajdhani',sans-serif",resize:"vertical"}} />
                </div>

                {cartTotal < settings.deliveryMin && (
                  <div style={{background:"rgba(255,45,120,.1)",border:"1px solid rgba(255,45,120,.3)",
                    borderRadius:6,padding:"12px",marginBottom:16,fontFamily:"'Share Tech Mono',monospace",
                    fontSize:".75rem",color:"#ff2d78",textAlign:"center"}}>
                    ⚠️ Commande minimum : {settings.deliveryMin}€ (il te manque {(settings.deliveryMin - cartTotal).toFixed(2)}€)
                  </div>
                )}

                {/* Choix du mode de paiement */}
                <div style={{marginBottom:16}}>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".7rem",color:"#5a5470",
                    letterSpacing:".12em",marginBottom:10,textTransform:"uppercase"}}>
                    // MODE DE PAIEMENT
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div onClick={() => setPaymentMethod('online')}
                      style={{padding:"12px 8px",borderRadius:6,cursor:"pointer",textAlign:"center",
                        border: paymentMethod === 'online' ? "2px solid #00f5ff" : "1px solid rgba(255,255,255,.1)",
                        background: paymentMethod === 'online' ? "rgba(0,245,255,.08)" : "#080514",
                        transition:"all .2s"}}>
                      <div style={{fontSize:"1.4rem",marginBottom:4}}>💳</div>
                      <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".8rem",
                        color: paymentMethod === 'online' ? "#00f5ff" : "#f0eeff",letterSpacing:".05em"}}>
                        PAYER EN LIGNE
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#5a5470",marginTop:2}}>
                        Carte · Apple Pay
                      </div>
                    </div>
                    <div onClick={() => setPaymentMethod('whatsapp')}
                      style={{padding:"12px 8px",borderRadius:6,cursor:"pointer",textAlign:"center",
                        border: paymentMethod === 'whatsapp' ? "2px solid #ff2d78" : "1px solid rgba(255,255,255,.1)",
                        background: paymentMethod === 'whatsapp' ? "rgba(255,45,120,.08)" : "#080514",
                        transition:"all .2s"}}>
                      <div style={{fontSize:"1.4rem",marginBottom:4}}>📲</div>
                      <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:".8rem",
                        color: paymentMethod === 'whatsapp' ? "#ff2d78" : "#f0eeff",letterSpacing:".05em"}}>
                        CASH LIVRAISON
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#5a5470",marginTop:2}}>
                        Via WhatsApp
                      </div>
                    </div>
                  </div>
                </div>

                <button onClick={submitOrder} disabled={submitting || cartTotal < settings.deliveryMin}
                  style={{width:"100%",
                    background: submitting ? "#5a5470" : paymentMethod === 'online' ? "#00f5ff" : "#ff2d78",
                    color: submitting ? "#f0eeff" : "#000",
                    border:"none",borderRadius:4,padding:"16px",fontFamily:"'Rajdhani',sans-serif",
                    fontWeight:700,fontSize:"1rem",letterSpacing:".1em",textTransform:"uppercase",
                    cursor: submitting ? "not-allowed" : "pointer",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  {submitting
                    ? "TRAITEMENT EN COURS..."
                    : paymentMethod === 'online'
                    ? "💳 PAYER EN LIGNE"
                    : "📲 COMMANDER VIA WHATSAPP"}
                </button>
              </>
            )}
          </div>{/* fin scrollable */}
          </div>{/* fin modal container */}
        </div>
      )}

      {/* ── PRODUCT DETAIL MODAL ── */}
      {selectedProduct && (
        <div onClick={() => setSelectedProduct(null)} style={{position:"fixed",inset:0,background:"rgba(4,2,10,.95)",
          zIndex:1500,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#0c0918",
            border:"1px solid rgba(255,45,120,.25)",borderRadius:12,width:"100%",maxWidth:480,
            overflow:"hidden",animation:"fadeUp .3s both",margin:"20px 0"}}>
            {/* Image */}
            <div style={{width:"100%",height:260,background:"linear-gradient(135deg,rgba(255,45,120,.08),rgba(0,245,255,.05))",
              position:"relative",overflow:"hidden"}}>
              {selectedProduct.image ? (
                <img src={selectedProduct.image} alt={selectedProduct.name}
                  style={{width:"100%",height:"100%",objectFit:"cover"}} />
              ) : (
                <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:"5rem"}}>📷</div>
              )}
              <button onClick={() => setSelectedProduct(null)}
                style={{position:"absolute",top:12,right:12,background:"rgba(4,2,10,.8)",
                  border:"1px solid rgba(255,255,255,.15)",color:"#f0eeff",borderRadius:4,
                  padding:"6px 12px",cursor:"pointer",fontFamily:"'Share Tech Mono',monospace",
                  fontSize:".7rem"}}>
                ✕ FERMER
              </button>
              {selectedProduct.badge && (
                <span style={{position:"absolute",top:12,left:12,
                  fontFamily:"'Share Tech Mono',monospace",fontSize:".62rem",letterSpacing:".1em",
                  textTransform:"uppercase",padding:"4px 10px",borderRadius:2,
                  background: getBadgeType(selectedProduct.badge)==="hot" ? "#ff2d78" : getBadgeType(selectedProduct.badge)==="new" ? "#b8ff00" : "#00f5ff",
                  color:"#000"}}>
                  {selectedProduct.badge}
                </span>
              )}
            </div>
            {/* Info */}
            <div style={{padding:"24px"}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",
                color:catColor(selectedProduct.cat),letterSpacing:".15em",textTransform:"uppercase",marginBottom:8}}>
                {catLabel(selectedProduct.cat)}
              </div>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.7rem",
                letterSpacing:".03em",color:"#f0eeff",marginBottom:10}}>
                {selectedProduct.name}
              </div>
              <div style={{fontSize:".9rem",color:"#a09ab8",lineHeight:1.7,marginBottom:16}}>
                {selectedProduct.desc || "Aucune description disponible."}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"2rem",
                    color:"#b8ff00",textShadow:"0 0 20px rgba(184,255,0,.5)"}}>
                    {Number(selectedProduct.price).toFixed(2)}€
                  </div>
                  {selectedProduct.stock > 0 && selectedProduct.stock < 10 && (
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#b8ff00",marginTop:4}}>
                      ⚠️ Plus que {selectedProduct.stock} en stock !
                    </div>
                  )}
                  {selectedProduct.stock === 0 && (
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".68rem",color:"#5a5470",marginTop:4}}>
                      Rupture de stock
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={() => shareProduct(selectedProduct)}
                    style={{background:"transparent",border:"1px solid rgba(255,255,255,.15)",color:"#5a5470",
                      borderRadius:4,padding:"10px 14px",cursor:"pointer",fontSize:".85rem"}}>
                    ↗
                  </button>
                  <button
                    onClick={() => { addToCart(selectedProduct.id, selectedProduct.name, selectedProduct.price); setSelectedProduct(null); }}
                    disabled={selectedProduct.stock === 0}
                    style={{background: selectedProduct.stock === 0 ? "#5a5470" : "#ff2d78",color:"#000",
                      border:"none",borderRadius:4,padding:"10px 24px",fontFamily:"'Rajdhani',sans-serif",
                      fontWeight:700,fontSize:".9rem",letterSpacing:".08em",cursor: selectedProduct.stock === 0 ? "not-allowed" : "pointer",
                      textTransform:"uppercase"}}>
                    {selectedProduct.stock === 0 ? "RUPTURE" : "+ AJOUTER"}
                  </button>
                </div>
              </div>
              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470",
                    letterSpacing:".1em",marginBottom:10,textTransform:"uppercase"}}>
                    // Vous aimerez aussi
                  </div>
                  <div style={{display:"flex",gap:8,overflowX:"auto"}}>
                    {suggestions.map(s => (
                      <div key={s.id} onClick={() => setSelectedProduct(s)}
                        style={{flexShrink:0,width:90,cursor:"pointer",background:"#080514",
                          borderRadius:6,overflow:"hidden",border:"1px solid rgba(255,255,255,.06)"}}>
                        <div style={{height:60,background:"rgba(255,45,120,.04)"}}>
                          {s.image ? <img src={s.image} alt={s.name} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                            : <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem"}}>📷</div>}
                        </div>
                        <div style={{padding:"6px 8px"}}>
                          <div style={{fontSize:".68rem",fontWeight:700,letterSpacing:".03em",
                            textOverflow:"ellipsis",overflow:"hidden",whiteSpace:"nowrap"}}>{s.name}</div>
                          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:".75rem",color:"#b8ff00"}}>
                            {Number(s.price).toFixed(2)}€
                          </div>
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

      {/* ── AUTH MODAL (Login / Signup) ── */}
      {showAuthModal && (
        <div onClick={() => { setShowAuthModal(false); setAuthError(""); }}
          style={{position:"fixed",inset:0,background:"rgba(4,2,10,.96)",zIndex:1600,
            display:"flex",alignItems:"flex-start",justifyContent:"center",
            paddingTop:20,paddingLeft:16,paddingRight:16,paddingBottom:90,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#0c0918",
            border:"1px solid rgba(255,45,120,.25)",borderRadius:14,width:"100%",maxWidth:420,
            animation:"fadeUp .3s both",overflow:"hidden"}}>

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"22px 24px 18px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#ff2d78",letterSpacing:".04em"}}>
                {authMode === "login" ? "🔑 CONNEXION" : "✨ CRÉER UN COMPTE"}
              </div>
              <button onClick={() => { setShowAuthModal(false); setAuthError(""); }}
                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                  color:"#f0eeff",fontSize:".9rem",cursor:"pointer",borderRadius:6,
                  width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>

            <div style={{padding:"22px 24px 28px",display:"flex",flexDirection:"column",gap:14}}>
              {/* Google */}
              <button onClick={handleGoogleLogin} disabled={authLoading}
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                  background:"#fff",color:"#111",border:"none",borderRadius:10,padding:"13px",
                  fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1rem",
                  cursor:"pointer",letterSpacing:".04em"}}>
                <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
                Continuer avec Google
              </button>

              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470"}}>ou</span>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
              </div>

              {/* Nom (signup seulement) */}
              {authMode === "signup" && (
                <input placeholder="Ton prénom" value={authName} onChange={e => setAuthName(e.target.value)}
                  style={{background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,
                    padding:"12px 14px",color:"#f0eeff",fontFamily:"'Rajdhani',sans-serif",
                    fontSize:"1rem",outline:"none",width:"100%"}} />
              )}
              <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                style={{background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,
                  padding:"12px 14px",color:"#f0eeff",fontFamily:"'Rajdhani',sans-serif",
                  fontSize:"1rem",outline:"none",width:"100%"}} />
              <input type="password" placeholder="Mot de passe" value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (authMode === "login" ? handleLogin() : handleSignup())}
                style={{background:"#080514",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,
                  padding:"12px 14px",color:"#f0eeff",fontFamily:"'Rajdhani',sans-serif",
                  fontSize:"1rem",outline:"none",width:"100%"}} />

              {authError && (
                <div style={{background:"rgba(255,45,120,.1)",border:"1px solid rgba(255,45,120,.2)",
                  borderRadius:6,padding:"10px 14px",fontFamily:"'Share Tech Mono',monospace",
                  fontSize:".75rem",color:"#ff2d78"}}>
                  {authError}
                </div>
              )}

              <button onClick={authMode === "login" ? handleLogin : handleSignup} disabled={authLoading}
                style={{background: authLoading ? "#5a5470" : "#ff2d78",color:"#000",border:"none",
                  borderRadius:10,padding:"14px",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                  fontSize:"1rem",letterSpacing:".08em",textTransform:"uppercase",
                  cursor: authLoading ? "not-allowed" : "pointer"}}>
                {authLoading ? "..." : authMode === "login" ? "SE CONNECTER" : "CRÉER MON COMPTE"}
              </button>

              <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}
                style={{background:"transparent",border:"none",color:"#5a5470",cursor:"pointer",
                  fontFamily:"'Share Tech Mono',monospace",fontSize:".72rem",letterSpacing:".06em",
                  textDecoration:"underline",padding:4}}>
                {authMode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PROFIL / HISTORIQUE COMMANDES ── */}
      {showHistory && currentUser && (
        <div onClick={() => { setShowHistory(false); setHistoryOrders(null); }}
          style={{position:"fixed",inset:0,background:"rgba(4,2,10,.96)",zIndex:1500,
            display:"flex",alignItems:"flex-start",justifyContent:"center",
            paddingTop:16,paddingLeft:16,paddingRight:16,paddingBottom:90,overflowY:"auto"}}>
          <div onClick={e => e.stopPropagation()} style={{background:"#0c0918",
            border:"1px solid rgba(0,245,255,.2)",borderRadius:14,width:"100%",
            maxWidth:480,animation:"fadeUp .3s both",
            maxHeight:"calc(100vh - 106px)",display:"flex",flexDirection:"column",overflow:"hidden"}}>

            {/* Header sticky */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"20px 24px 16px",flexShrink:0,
              borderBottom:"1px solid rgba(0,245,255,.1)",background:"#0c0918"}}>
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",
                color:"#00f5ff",letterSpacing:".04em"}}>
                👤 MON PROFIL
              </div>
              <button onClick={() => { setShowHistory(false); setHistoryOrders(null); }}
                style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
                  color:"#f0eeff",fontSize:".9rem",cursor:"pointer",borderRadius:6,
                  width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>

            {/* Contenu scrollable */}
            <div style={{overflowY:"auto",padding:"18px 24px 24px",flex:1}}>
              {/* Infos utilisateur */}
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,
                background:"rgba(0,245,255,.04)",border:"1px solid rgba(0,245,255,.1)",
                borderRadius:12,padding:"16px"}}>
                <div style={{width:48,height:48,borderRadius:"50%",
                  background:"linear-gradient(135deg,#ff2d78,#00f5ff)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'Black Ops One',cursive",fontSize:"1.3rem",color:"#000",flexShrink:0}}>
                  {(currentUser.displayName || currentUser.email || "?")[0].toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:"1.1rem",
                    color:"#f0eeff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {currentUser.displayName || "Mon compte"}
                  </div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {currentUser.email}
                  </div>
                </div>
                <button onClick={handleSignout}
                  style={{background:"rgba(255,45,120,.1)",border:"1px solid rgba(255,45,120,.2)",
                    color:"#ff2d78",borderRadius:8,padding:"6px 12px",cursor:"pointer",
                    fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",
                    letterSpacing:".08em",whiteSpace:"nowrap"}}>
                  DÉCO
                </button>
              </div>

              {/* Commandes */}
              <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",color:"#00f5ff",
                letterSpacing:".06em",marginBottom:12}}>
                📋 MES COMMANDES
              </div>

              {historyLoading && (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  fontSize:".75rem",padding:"28px"}}>chargement...</div>
              )}
              {!historyLoading && historyOrders !== null && historyOrders.length === 0 && (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  fontSize:".75rem",padding:"28px 0"}}>
                  Aucune commande pour l&apos;instant.
                </div>
              )}
              {!historyLoading && historyOrders && historyOrders.length > 0 && (
                <div style={{display:"grid",gap:10}}>
                  {historyOrders.map((o:any) => (
                    <div key={o.id} style={{background:"#080514",border:"1px solid rgba(255,255,255,.06)",
                      borderRadius:8,padding:"14px 16px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".6rem",color:"#5a5470",marginBottom:2}}>
                            {new Date(o.createdAt).toLocaleString("fr-FR")}
                          </div>
                          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".65rem",color:"#5a5470"}}>
                            #{(o.id||"").slice(-6).toUpperCase()}
                          </div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                          <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",color:"#b8ff00"}}>
                            {Number(o.total).toFixed(2)}€
                          </span>
                          <span style={{fontSize:".6rem",padding:"2px 8px",borderRadius:10,
                            fontFamily:"'Share Tech Mono',monospace",
                            background: o.status==="nouveau" ? "rgba(255,45,120,.15)" : o.status==="en_cours" ? "rgba(255,149,0,.15)" : o.status==="livre" ? "rgba(184,255,0,.15)" : "rgba(90,84,112,.2)",
                            color: o.status==="nouveau" ? "#ff2d78" : o.status==="en_cours" ? "#ff9500" : o.status==="livre" ? "#b8ff00" : "#5a5470"}}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".63rem",
                        color:"#5a5470",lineHeight:1.7,borderLeft:"2px solid rgba(0,245,255,.15)",paddingLeft:8}}>
                        {(o.items||"").split("\n").map((l:string,i:number)=><div key={i}>{l}</div>)}
                      </div>
                      <a href={`/suivi?id=${o.id}`}
                        style={{display:"inline-block",marginTop:8,fontFamily:"'Share Tech Mono',monospace",
                          fontSize:".62rem",color:"#00f5ff",textDecoration:"none",letterSpacing:".06em"}}>
                        🔎 Suivre cette commande →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV BAR ── */}
      <nav style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:800,
        background:"rgba(4,2,10,0.97)",
        backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
        paddingTop:10,
        paddingBottom:"max(14px, env(safe-area-inset-bottom))",
        paddingLeft:12, paddingRight:12,
        borderTop:"1px solid rgba(0,245,255,.12)",
        boxShadow:"0 -8px 40px rgba(0,0,0,.8), 0 -1px 0 rgba(0,245,255,.08)",
      }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-evenly",maxWidth:520,margin:"0 auto"}}>

          {/* Accueil */}
          <button onClick={() => window.scrollTo({top:0,behavior:"smooth"})}
            style={{width:54,height:54,borderRadius:"50%",
              background:"rgba(0,245,255,.05)",
              border:"1px solid rgba(0,245,255,.25)",
              boxShadow:"0 0 14px rgba(0,245,255,.1), inset 0 1px 0 rgba(255,255,255,.04)",
              cursor:"pointer",flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",color:"#00f5ff"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
          </button>

          {/* Catalogue */}
          <button onClick={() => document.getElementById("catalogue")?.scrollIntoView({behavior:"smooth"})}
            style={{width:54,height:54,borderRadius:"50%",
              background:"rgba(0,245,255,.05)",
              border:"1px solid rgba(0,245,255,.25)",
              boxShadow:"0 0 14px rgba(0,245,255,.1), inset 0 1px 0 rgba(255,255,255,.04)",
              cursor:"pointer",flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",color:"#00f5ff"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>

          {/* Panier */}
          <button onClick={openCart}
            style={{width:54,height:54,borderRadius:"50%",
              background:"rgba(0,245,255,.05)",
              border:"1px solid rgba(0,245,255,.25)",
              boxShadow:"0 0 14px rgba(0,245,255,.1), inset 0 1px 0 rgba(255,255,255,.04)",
              cursor:"pointer",flexShrink:0,position:"relative",
              display:"flex",alignItems:"center",justifyContent:"center",color:"#00f5ff"}}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
            </svg>
            {cartCount > 0 && (
              <span style={{position:"absolute",top:5,right:5,
                background:"linear-gradient(135deg,#ff2d78,#ff6b9d)",
                color:"#000",borderRadius:"50%",
                minWidth:16,height:16,fontSize:".5rem",fontWeight:900,
                display:"flex",alignItems:"center",justifyContent:"center",
                border:"1.5px solid rgba(4,2,10,.8)",lineHeight:1,
                boxShadow:"0 0 8px rgba(255,45,120,.7)"}}>
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            )}
          </button>

          {/* Compte / Connexion */}
          <button onClick={() => currentUser ? (setShowHistory(true), fetchHistory()) : setShowAuthModal(true)}
            style={{width:54,height:54,borderRadius:"50%",
              background: currentUser ? "rgba(255,45,120,.08)" : "rgba(0,245,255,.05)",
              border: currentUser ? "1px solid rgba(255,45,120,.4)" : "1px solid rgba(0,245,255,.25)",
              boxShadow: currentUser ? "0 0 18px rgba(255,45,120,.2), inset 0 1px 0 rgba(255,255,255,.04)" : "0 0 14px rgba(0,245,255,.1), inset 0 1px 0 rgba(255,255,255,.04)",
              cursor:"pointer",flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",
              color: currentUser ? "#ff2d78" : "#00f5ff"}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </button>

        </div>
      </nav>

      {/* ── SCROLL TO TOP ── */}
      {showScrollTop && (
        <button onClick={() => window.scrollTo({top:0,behavior:"smooth"})}
          style={{position:"fixed",bottom:90,right:18,width:40,height:40,borderRadius:"50%",
            background:"#ff2d78",border:"none",color:"#000",fontSize:"1.1rem",
            cursor:"pointer",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 0 18px rgba(255,45,120,.5)",transition:"opacity .3s",
            animation:"fadeUp .3s both"}}>
          ↑
        </button>
      )}
    </>
  );
}

