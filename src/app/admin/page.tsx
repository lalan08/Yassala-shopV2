"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
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
type Product = { id?: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; order?: number; };
type Pack = { id?: string; name: string; tag: string; emoji: string; items: string; price: number; real: number; star: boolean; };
type Order = { id?: string; items: string; total: number; status: string; createdAt: string; phone: string; orderNumber?: number; name?: string; address?: string; paidOnline?: boolean; };
type Settings = { shopOpen: boolean; deliveryMin: number; freeDelivery: number; hours: string; zone: string; whatsapp: string; };
type Banner = { id?: string; title: string; subtitle: string; desc: string; cta: string; link: string; gradient: string; image: string; brightness: number; active: boolean; order: number; };
type Coupon = { id?: string; code: string; type: "percent"|"fixed"; value: number; active: boolean; };
type Category = { id?: string; key: string; label: string; emoji: string; order: number; };

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
  hours: "22:00–06:00", zone: "Cayenne & alentours", whatsapp: "+594 XXX XXX"
};

export default function AdminPage() {
  const [auth, setAuth]           = useState(false);
  const [pwd, setPwd]             = useState("");
  const [pwdError, setPwdError]   = useState(false);
  const [tab, setTab]             = useState<"dashboard"|"products"|"categories"|"packs"|"orders"|"settings"|"banners"|"coupons"|"users"|"drivers">("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [products, setProducts]   = useState<Product[]>([]);
  const [packs, setPacks]         = useState<Pack[]>([]);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [settings, setSettings]   = useState<Settings>(defaultSettings);
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
  const [orderFilter, setOrderFilter] = useState<"all"|"nouveau"|"en_cours"|"livre"|"annule">("all");
  const [adminHash, setAdminHash] = useState<string|null>(null);
  const [usersCount, setUsersCount]           = useState(0);
  const [usersWithOrders, setUsersWithOrders] = useState(0);
  const [usersList, setUsersList]             = useState<{id:string;name:string;email:string;createdAt?:string;lastLoginAt?:string}[]>([]);
  const [usersSearch, setUsersSearch]         = useState("");
  const [driverApps, setDriverApps]           = useState<{id:string;name:string;phone:string;email:string;zone:string;vehicle:string;message:string;status:string;createdAt:string;password?:string}[]>([]);
  const [driverFilter, setDriverFilter]       = useState<"all"|"nouveau"|"accepte"|"refuse">("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string,boolean>>({"OPÉRATIONS":true,"CATALOGUE":true,"MARKETING":true,"CONFIGURATION":true});
  const [dashPeriod, setDashPeriod] = useState<"24h"|"7j"|"30j">("7j");
  const [pwdWarning, setPwdWarning] = useState(false);
  const [newPwd,  setNewPwd]  = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdFormErr, setPwdFormErr] = useState("");
  const prevOrderIdsRef  = useRef<Set<string>>(new Set());
  const dragRef          = useRef<number | null>(null);
  const isFirstLoadRef   = useRef(true);

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
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } else { setPwdError(true); }
  };

  const showToast = (msg: string, type = "ok") => {
    setToast({ msg, show: true, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  // Load admin hash on mount (before login)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "adminAuth"), snap => {
      if (snap.exists()) setAdminHash(snap.data().hash ?? null);
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
        prevOrderIdsRef.current = new Set(allOrders.map(o => o.id!));
      } else {
        prevOrderIdsRef.current = new Set(allOrders.map(o => o.id!));
        isFirstLoadRef.current = false;
      }

      setNewOrdersCount(allOrders.filter(o => o.status === "nouveau").length);
      setOrders(allOrders);
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "main"), snap => {
      if (snap.exists()) setSettings(snap.data() as Settings);
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

    return () => { unsubProducts(); unsubPacks(); unsubOrders(); unsubSettings(); unsubBanners(); unsubCoupons(); unsubUsers(); unsubCats(); unsubDrivers(); };
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
      if (b.id) { await updateDoc(doc(db, "banners", b.id), { ...b }); showToast("Bannière mise à jour ✓"); }
      else { await addDoc(collection(db, "banners"), b); showToast("Bannière ajoutée ✓"); }
      setShowBannerForm(false); setEditBanner(null);
    } catch { showToast("Erreur lors de la sauvegarde", "err"); }
  };

  const deleteBanner = async (id: string) => {
    if (!confirm("Supprimer cette bannière ?")) return;
    await deleteDoc(doc(db, "banners", id));
    showToast("Bannière supprimée");
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
    if (!confirm("Supprimer cette commande ?")) return;
    await deleteDoc(doc(db, "orders", id));
    showToast("Commande supprimée");
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
    const src = orderFilter === "all" ? orders : orders.filter(o => o.status === orderFilter);
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
          <button className="admin-disconnect-btn" onClick={() => setAuth(false)} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
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
        <span style={{color:"#00f5ff"}}>{{dashboard:"Tableau de bord",orders:"Commandes",products:"Produits",categories:"Catégories",packs:"Packs",coupons:"Coupons",banners:"Bannières",users:"Clients",settings:"Paramètres"}[tab]}</span>
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
              { key:"dashboard",  label:"TABLEAU DE BORD", icon:"📊" },
              { key:"orders",     label:"COMMANDES",       icon:"📦" },
              { key:"users",      label:"CLIENTS",         icon:"👥" },
              { key:"drivers",    label:"LIVREURS",        icon:"🏍️" },
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
              { key:"settings",   label:"PARAMÈTRES",      icon:"⚙️" },
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
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main className="admin-main" style={{flex:1,padding:"28px",overflowY:"auto",animation:"fadeUp .3s both"}}>

          {tab === "dashboard" && (() => {
            const now   = new Date();
            const todayStr  = now.toISOString().slice(0, 10);
            const monthStr  = now.toISOString().slice(0, 7);

            const todayOrders  = orders.filter(o => o.createdAt.slice(0,10) === todayStr);
            const monthOrders  = orders.filter(o => o.createdAt.slice(0,7) === monthStr);
            const weekOrders   = orders.filter(o => new Date(o.createdAt) >= new Date(now.getTime() - 7*24*60*60*1000));
            const periodOrders = dashPeriod === "24h" ? todayOrders : dashPeriod === "7j" ? weekOrders : monthOrders;
            const periodLabel  = dashPeriod === "24h" ? "AUJOURD'HUI" : dashPeriod === "7j" ? "7 DERNIERS JOURS" : "CE MOIS";
            const pending      = orders.filter(o => o.status === "nouveau");
            const inProgress   = orders.filter(o => o.status === "en_cours");

            const sum = (list: Order[]) => list.reduce((acc, o) => acc + Number(o.total), 0);

            // Top products by mention in items text
            const prodCount: Record<string, number> = {};
            orders.forEach(o => {
              o.items.split("\n").forEach(line => {
                const name = line.replace(/x\d+.*/, "").trim();
                if (name) prodCount[name] = (prodCount[name] || 0) + 1;
              });
            });
            const topProd = Object.entries(prodCount).sort((a,b) => b[1]-a[1])[0];

            const card = (icon: string, label: string, value: string, sub?: string, color = "#00f5ff") => (
              <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:12,padding:"22px 26px",
                borderLeft:`3px solid ${color}`,minWidth:180,flex:1,boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
                <div style={{fontSize:"1.6rem",marginBottom:8}}>{icon}</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:500,fontSize:".78rem",color:"#6b7280",
                  letterSpacing:".1em",textTransform:"uppercase" as const,marginBottom:4}}>{label}</div>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.6rem",color}}>{value}</div>
                {sub && <div style={{fontSize:".88rem",color:"#5a5470",marginTop:4,fontFamily:"'Share Tech Mono',monospace"}}>{sub}</div>}
              </div>
            );

            return (
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.5rem",letterSpacing:".04em"}}>
                    <span style={{color:"#ff2d78"}}>Tableau de bord</span>
                    <span className="admin-dash-date" style={{fontFamily:"'Inter',sans-serif",fontWeight:400,fontSize:".82rem",color:"#5a5470",
                      marginLeft:16,letterSpacing:".1em"}}>{now.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</span>
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

                <div className="admin-kpi-grid" style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:24}}>
                  {card("🗓️", `COMMANDES ${periodLabel}`, String(periodOrders.length), `CA : ${sum(periodOrders).toFixed(2)} €`, "#00f5ff")}
                  {card("📅", "COMMANDES CE MOIS", String(monthOrders.length), `CA : ${sum(monthOrders).toFixed(2)} €`, "#b8ff00")}
                  {card("🔔", "EN ATTENTE", String(pending.length), "statut : nouveau", "#ff2d78")}
                  {card("🚚", "EN COURS", String(inProgress.length), "statut : en_cours", "#ff9500")}
                </div>

                <div className="admin-kpi-grid" style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:24}}>
                  {card("📦", "TOTAL COMMANDES", String(orders.length), `CA total : ${sum(orders).toFixed(2)} €`, "#a855f7")}
                  {topProd && card("🏆", "PRODUIT POPULAIRE", topProd[0].slice(0,18), `${topProd[1]} mention(s)`, "#b8ff00")}
                </div>

                {/* Stats clients */}
                {(() => {
                  const activeUids = new Set(orders.map((o:any) => o.uid).filter(Boolean));
                  return (
                    <div className="admin-kpi-grid" style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:24}}>
                      {card("👥", "CLIENTS INSCRITS", String(usersCount), "comptes créés sur la boutique", "#00f5ff")}
                      {card("🛒", "CLIENTS ACTIFS", String(activeUids.size), "ont passé au moins 1 commande", "#ff2d78")}
                      {usersCount > 0 && card("📈", "TAUX D'ADOPTION", `${Math.round(activeUids.size/usersCount*100)}%`, "inscrits ayant commandé", "#b8ff00")}
                    </div>
                  );
                })()}

                {/* 7-day chart */}
                {(() => {
                  const last7 = Array.from({length:7}, (_,i) => {
                    const d = new Date(); d.setDate(d.getDate() - (6-i));
                    const str = d.toISOString().slice(0,10);
                    const dayOrders = orders.filter(o => o.createdAt.slice(0,10) === str);
                    return {
                      label: d.toLocaleDateString("fr-FR",{weekday:"short"}),
                      count: dayOrders.length,
                      ca: dayOrders.reduce((s,o) => s+Number(o.total), 0),
                    };
                  });
                  const maxCa = Math.max(...last7.map(d => d.ca), 1);
                  return (
                    <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,
                      padding:"20px 24px",marginBottom:24}}>
                      <div style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".85rem",
                        letterSpacing:".08em",color:"#5a5470",marginBottom:16}}>CA 7 DERNIERS JOURS</div>
                      <div style={{display:"flex",alignItems:"flex-end",gap:8,height:80}}>
                        {last7.map((d, i) => (
                          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#b8ff00"}}>
                              {d.ca > 0 ? d.ca.toFixed(0) : ""}
                            </div>
                            <div style={{
                              width:"100%",
                              height: d.ca === 0 ? 4 : Math.max(6, Math.round((d.ca/maxCa)*60)),
                              background: i === 6 ? "#ff2d78" : "#b8ff00",
                              borderRadius:"3px 3px 0 0",
                              opacity: d.ca === 0 ? .2 : 1,
                              transition:"height .4s",
                              boxShadow: d.ca > 0 ? (i === 6 ? "0 0 8px rgba(255,45,120,.4)" : "0 0 8px rgba(184,255,0,.3)") : "none"
                            }} />
                            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",color:"#5a5470"}}>
                              {d.label}
                            </div>
                            {d.count > 0 && <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".55rem",color:"#5a5470"}}>
                              {d.count}cmd
                            </div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",borderRadius:10,padding:"20px 24px"}}>
                  <div style={{fontFamily:"'Inter',sans-serif",fontWeight:600,fontSize:".85rem",
                    letterSpacing:".08em",color:"#5a5470",marginBottom:16}}>DERNIÈRES COMMANDES</div>
                  {orders.slice(0,5).map(o => (
                    <div key={o.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",
                      borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                      <span style={{fontFamily:"'Black Ops One',cursive",fontSize:".85rem",color:"#ff2d78",minWidth:40}}>
                        #{(o as any).orderNumber ?? o.id.slice(-4).toUpperCase()}
                      </span>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",color:"#5a5470",minWidth:72}}>
                        {new Date(o.createdAt).toLocaleDateString("fr-FR")}
                      </span>
                      <span style={{flex:1,fontSize:".85rem"}}>{(o as any).name || o.phone}</span>
                      <span style={{fontFamily:"'Black Ops One',cursive",fontSize:"1rem",color:"#b8ff00"}}>
                        {Number(o.total).toFixed(2)} €
                      </span>
                      <span style={{fontSize:".88rem",padding:"4px 10px",borderRadius:20,fontFamily:"'Share Tech Mono',monospace",
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
            );
          })()}

          {tab === "products" && (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
                <div style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:"1.4rem",letterSpacing:".04em"}}>
                  🍺 <span style={{color:"#ff2d78"}}>PRODUITS</span>
                </div>
                <button onClick={() => { setEditProd({name:"",desc:"",price:0,image:"",cat:"biere",badge:"",stock:0}); setShowProdForm(true); }}
                  style={{background:"#ff2d78",color:"#000",border:"none",borderRadius:8,
                    padding:"10px 20px",fontFamily:"'Inter',sans-serif",fontWeight:600,
                    fontSize:".85rem",letterSpacing:".08em",textTransform:"uppercase",cursor:"pointer"}}>
                  + AJOUTER
                </button>
              </div>

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
                      className="admin-product-row row" style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
                        borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",
                        gap:14,transition:"all .15s ease",cursor:"grab"}}>
                      {/* poignée drag */}
                      <span style={{color:"#3a3450",fontSize:"1.1rem",lineHeight:1,flexShrink:0,cursor:"grab"}}
                        title="Glisser pour réordonner">⠿</span>
                      {p.image ? (
                        <img src={p.image} alt={p.name} style={{width:60,height:60,objectFit:"cover",borderRadius:4}} />
                      ) : (
                        <div style={{width:60,height:60,background:"#080514",borderRadius:4,
                          display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem"}}>
                          📷
                        </div>
                      )}
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:"1rem",letterSpacing:".04em",display:"flex",alignItems:"center",gap:8}}>
                          {p.name}
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
                      <div className="admin-prod-actions" style={{display:"flex",gap:8}}>
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
                <div style={{display:"grid",gap:10}}>
                  {dbCats.map(c => (
                    <div key={c.id} style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.06)",
                      borderRadius:10,padding:"16px 22px",display:"flex",alignItems:"center",gap:16,transition:"all .15s ease"}}>
                      <span style={{fontSize:"2rem",minWidth:44,textAlign:"center"}}>{c.emoji}</span>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:"1.05rem",letterSpacing:".04em"}}>{c.label}</div>
                        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".82rem",color:"#5a5470",marginTop:3}}>
                          clé : <span style={{color:"#00f5ff"}}>{c.key}</span>
                        </div>
                      </div>
                      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".8rem",color:"#5a5470",minWidth:40,textAlign:"right"}}>
                        #{c.order ?? 0}
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={() => setEditCat(c)}
                          style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                            padding:"8px 18px",borderRadius:6,fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                            fontSize:".9rem",cursor:"pointer"}}>
                          ✏️ ÉDITER
                        </button>
                        <button onClick={() => deleteCat(c.id!)}
                          style={{background:"transparent",border:"1px solid rgba(255,45,120,.3)",color:"#ff2d78",
                            padding:"8px 14px",borderRadius:6,fontFamily:"'Rajdhani',sans-serif",fontWeight:700,
                            fontSize:".9rem",cursor:"pointer"}}>
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
                  <button onClick={purgeArchivedOrders}
                    style={{background:"rgba(255,45,120,.08)",border:"1px solid rgba(255,45,120,.25)",
                      color:"#ff2d78",padding:"7px 14px",borderRadius:4,cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",letterSpacing:".08em"}}>
                    🗑 PURGER ARCHIVÉES
                  </button>
                  <button onClick={exportCSV}
                    style={{background:"rgba(184,255,0,.1)",border:"1px solid rgba(184,255,0,.35)",
                      color:"#b8ff00",padding:"7px 14px",borderRadius:4,cursor:"pointer",
                      fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",letterSpacing:".08em"}}>
                    ⬇ EXPORT CSV
                  </button>
                </div>
              </div>

              {/* Filtres par statut */}
              <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                {([
                  { val:"all",       label:"TOUTES",    color:"#5a5470" },
                  { val:"nouveau",   label:"NOUVEAU",   color:"#ff2d78" },
                  { val:"en_cours",  label:"EN COURS",  color:"#ff9500" },
                  { val:"livre",     label:"LIVRÉ",     color:"#b8ff00" },
                  { val:"annule",    label:"ANNULÉ",    color:"#5a5470" },
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

              {orders.length === 0 ? (
                <div style={{textAlign:"center",color:"#5a5470",fontFamily:"'Share Tech Mono',monospace",
                  padding:"40px",fontSize:".8rem",border:"1px dashed rgba(255,255,255,.1)",borderRadius:8}}>
                  // aucune commande pour l'instant
                </div>
              ) : (
                <div style={{display:"grid",gap:10}}>
                  {(orderFilter === "all" ? orders : orders.filter(o => o.status === orderFilter)).map(o => (
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
                              #{(o as any).orderNumber ?? o.id.slice(-6).toUpperCase()}
                            </span>
                            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".88rem",
                              color:"#5a5470",letterSpacing:".06em"}}>
                              {new Date(o.createdAt).toLocaleString("fr-FR")}
                            </span>
                            {(o as any).paidOnline && (
                              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:".78rem",
                                background:"rgba(184,255,0,.15)",color:"#b8ff00",borderRadius:3,
                                padding:"2px 7px",letterSpacing:".08em"}}>✅ STRIPE</span>
                            )}
                          </div>
                          {/* Client */}
                          <div style={{fontWeight:700,fontSize:"1rem",marginBottom:2}}>{(o as any).name || o.phone}</div>
                          {(o as any).name && <div style={{fontSize:".78rem",color:"#7a7490",fontFamily:"'Share Tech Mono',monospace"}}>{o.phone}</div>}
                          {(o as any).address && <div style={{fontSize:".78rem",color:"#7a7490",marginTop:3}}>📍 {(o as any).address}</div>}
                        </div>

                        {/* Actions */}
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,flexShrink:0}}>
                          <div style={{fontFamily:"'Black Ops One',cursive",fontSize:"1.4rem",
                            color:"#b8ff00",textShadow:"0 0 10px rgba(184,255,0,.4)"}}>
                            {Number(o.total).toFixed(2)}€
                          </div>
                          <select value={o.status} onChange={e => updateOrderStatus(o.id!, e.target.value)}
                            style={{background:"#080514",border:"1px solid rgba(255,45,120,.4)",
                              color:"#ff2d78",padding:"7px 12px",borderRadius:4,
                              fontFamily:"'Share Tech Mono',monospace",fontSize:".9rem",
                              letterSpacing:".06em",cursor:"pointer",minWidth:130}}>
                            <option value="nouveau">🔴 NOUVEAU</option>
                            <option value="en_cours">🟠 EN COURS</option>
                            <option value="livre">🟢 LIVRÉ</option>
                            <option value="annule">⚫ ANNULÉ</option>
                          </select>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={() => printOrder(o)}
                              style={{background:"transparent",border:"1px solid rgba(0,245,255,.3)",color:"#00f5ff",
                                padding:"6px 14px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                fontSize:".88rem",letterSpacing:".06em",cursor:"pointer"}}>
                              🖨 TICKET
                            </button>
                            <button onClick={() => deleteOrder(o.id!)}
                              style={{background:"transparent",border:"1px solid rgba(255,45,120,.2)",color:"#5a5470",
                                padding:"6px 12px",borderRadius:4,fontFamily:"'Share Tech Mono',monospace",
                                fontSize:".88rem",letterSpacing:".06em",cursor:"pointer"}}>
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Driver Assignment */}
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

                        <div style={{display:"flex",gap:8,flexShrink:0}}>
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
                <Field label="COMMANDE MINIMUM (€)" value={String(settings.deliveryMin)} type="number"
                  onChange={v => setSettings(s => ({...s, deliveryMin: Number(v)}))} />
                <Field label="LIVRAISON GRATUITE À PARTIR DE (€)" value={String(settings.freeDelivery)} type="number"
                  onChange={v => setSettings(s => ({...s, freeDelivery: Number(v)}))} />

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

        </main>
      </div>
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

function ProductForm({ prod, cats, onSave, onClose, showToast }: { prod:Product; cats:Category[]; onSave:(p:Product)=>void; onClose:()=>void; showToast:(msg:string,type?:string)=>void }) {
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
          <Field label="DESCRIPTION" value={p.desc} onChange={v => setP(s=>({...s,desc:v}))} />
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

function BannerForm({ banner, onSave, onClose, showToast }: { banner:Banner; onSave:(b:Banner)=>void; onClose:()=>void; showToast:(msg:string,type?:string)=>void }) {
  const [b, setB] = useState<Banner>({ brightness: 0.28, ...banner });
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
