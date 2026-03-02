"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, where, setDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

// ── Types ─────────────────────────────────────────────────────────────────
type Etablissement = {
  id?: string; name: string; slug?: string; description?: string;
  address?: string; phone?: string; logoUrl?: string; coverUrl?: string;
  openHours?: string; isActive: boolean; createdAt?: string;
};
type DayCategory = { id?: string; key: string; label: string; emoji: string; order: number; etablissementId?: string; };
type DayProduct = { id?: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; order?: number; isActive?: boolean; etablissementId?: string; };
type DayOffer = { id?: string; title: string; desc: string; emoji: string; discount: string; active: boolean; order: number; etablissementId?: string; };
type DayPack = { id?: string; name: string; tag: string; emoji: string; items: string; price: number; real: number; star: boolean; etablissementId?: string; };

type Tab = "profil" | "produits" | "categories" | "offres" | "packs";

// ── Style helpers ──────────────────────────────────────────────────────────
const base = { fontFamily: "'Inter',sans-serif" };
const mono = { fontFamily: "'Share Tech Mono',monospace" };
const S = {
  page: { ...base, minHeight: "100vh", background: "#080514", color: "#f0eeff" },
  topbar: { background: "rgba(12,9,24,.95)", borderBottom: "1px solid rgba(251,191,36,.12)", padding: "0 28px", height: 56, display: "flex" as const, alignItems: "center" as const, gap: 16, position: "sticky" as const, top: 0, zIndex: 40 },
  content: { maxWidth: 1000, margin: "0 auto", padding: "28px 24px" },
  card: { background: "#0c0918", border: "1px solid rgba(251,191,36,.15)", borderRadius: 10, padding: "22px 26px", marginBottom: 24 },
  label: { ...mono, fontSize: ".72rem", color: "#7a7490", letterSpacing: ".1em", marginBottom: 6, display: "block" as const },
  input: { width: "100%", background: "#080514", border: "1px solid rgba(255,255,255,.12)", borderRadius: 6, padding: "10px 14px", color: "#f0eeff", fontSize: ".9rem", ...base, boxSizing: "border-box" as const },
  btnPrimary: { background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#000", border: "none", borderRadius: 6, padding: "10px 22px", ...mono, fontSize: ".82rem", letterSpacing: ".08em", cursor: "pointer", fontWeight: 700 },
  btnGhost: { background: "transparent", border: "1px solid rgba(255,255,255,.12)", color: "#7a7490", borderRadius: 6, padding: "10px 18px", ...mono, fontSize: ".82rem", cursor: "pointer" },
  btnDanger: { background: "transparent", border: "1px solid rgba(255,45,120,.25)", color: "#ff2d78", borderRadius: 6, padding: "8px 12px", ...mono, fontSize: ".75rem", cursor: "pointer" },
  badge: (active: boolean) => ({ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4, fontSize: ".7rem", ...mono, letterSpacing: ".08em", background: active ? "rgba(184,255,0,.12)" : "rgba(255,255,255,.06)", color: active ? "#b8ff00" : "#5a5470" }),
};

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: ok ? "#0f5132" : "#5c0a1f", border: `1px solid ${ok ? "rgba(184,255,0,.3)" : "rgba(255,45,120,.3)"}`, color: ok ? "#b8ff00" : "#ff2d78", padding: "12px 20px", borderRadius: 8, ...mono, fontSize: ".82rem", letterSpacing: ".08em" }}>
      {msg}
    </div>
  );
}

// ── Subcomponent: Product Form ─────────────────────────────────────────────
function ProductForm({ prod, cats, onSave, onClose }: { prod: DayProduct; cats: DayCategory[]; onSave: (p: DayProduct) => Promise<void>; onClose: () => void; }) {
  const [form, setForm] = useState<DayProduct>(prod);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);

  const handleImg = async (file: File) => {
    setUploading(true);
    try {
      const r = ref(storage, `day_products/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      setForm(f => ({ ...f, image: "" }));
      const url = await getDownloadURL(r);
      setForm(f => ({ ...f, image: url }));
    } finally { setUploading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0c0918", border: "1px solid rgba(251,191,36,.2)", borderRadius: 12, padding: 28, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ ...mono, fontSize: ".72rem", color: "#fbbf24", letterSpacing: ".12em", marginBottom: 20 }}>
          {form.id ? "// MODIFIER LE PRODUIT" : "// NOUVEAU PRODUIT"}
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={S.label}>NOM *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} placeholder="Ex: Sandwich poulet" />
          </div>
          <div>
            <label style={S.label}>DESCRIPTION</label>
            <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} style={S.input} placeholder="Courte description" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>PRIX (€) *</label>
              <input type="number" min={0} step={0.01} value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>STOCK</label>
              <input type="number" min={0} value={form.stock} onChange={e => setForm(f => ({ ...f, stock: parseInt(e.target.value) || 0 }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>BADGE</label>
              <input value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} style={S.input} placeholder="NEW · PROMO" />
            </div>
          </div>
          <div>
            <label style={S.label}>CATÉGORIE</label>
            <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}
              style={{ ...S.input, cursor: "pointer" }}>
              <option value="">— choisir —</option>
              {cats.map(c => <option key={c.id} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>IMAGE URL</label>
            <input value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} style={S.input} placeholder="https://..." />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) handleImg(e.target.files[0]); }} />
            <button onClick={() => imgRef.current?.click()} disabled={uploading} style={{ ...S.btnGhost, padding: "8px 14px", fontSize: ".75rem" }}>
              {uploading ? "⏳" : "📷 UPLOADER"}
            </button>
            {form.image && <img src={form.image} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }} />}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isActive !== false} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 16, height: 16 }} />
            <span style={{ ...mono, fontSize: ".78rem", color: "#7a7490" }}>ACTIF (visible par les clients)</span>
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onSave(form)} style={S.btnPrimary}>{form.id ? "✓ METTRE À JOUR" : "+ AJOUTER"}</button>
            <button onClick={onClose} style={S.btnGhost}>ANNULER</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function EtablissementDetailPage() {
  const params = useParams();
  const etabId = params?.id as string;

  const [auth, setAuth] = useState(false);
  const [tab, setTab] = useState<Tab>("profil");
  const [etab, setEtab] = useState<Etablissement | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  // Data
  const [categories, setCategories] = useState<DayCategory[]>([]);
  const [products, setProducts] = useState<DayProduct[]>([]);
  const [offers, setOffers] = useState<DayOffer[]>([]);
  const [packs, setPacks] = useState<DayPack[]>([]);

  // Forms
  const [catForm, setCatForm] = useState<DayCategory>({ key: "", label: "", emoji: "🛒", order: 0 });
  const [editCat, setEditCat] = useState<DayCategory | null>(null);
  const [offerForm, setOfferForm] = useState<DayOffer>({ title: "", desc: "", emoji: "🌟", discount: "", active: true, order: 0 });
  const [editOffer, setEditOffer] = useState<DayOffer | null>(null);
  const [packForm, setPackForm] = useState<DayPack>({ name: "", tag: "", emoji: "☀️", items: "", price: 0, real: 0, star: false });
  const [editPack, setEditPack] = useState<DayPack | null>(null);
  const [editProduct, setEditProduct] = useState<DayProduct | null>(null);
  const [showProdForm, setShowProdForm] = useState(false);
  const [prodCatFilter, setProdCatFilter] = useState("all");

  const [toast, setToast] = useState({ msg: "", show: false, ok: true });

  useEffect(() => {
    if (typeof window !== "undefined") setAuth(!!localStorage.getItem("yassala_admin_auth"));
  }, []);

  // Load etablissement
  useEffect(() => {
    if (!auth || !etabId) return;
    return onSnapshot(doc(db, "day_etablissements", etabId), snap => {
      if (snap.exists()) setEtab({ id: snap.id, ...snap.data() } as Etablissement);
    });
  }, [auth, etabId]);

  // Load sub-collections filtered by etablissementId
  useEffect(() => {
    if (!auth || !etabId) return;
    const q = (col: string) => query(collection(db, col), where("etablissementId", "==", etabId));

    const unsubCats = onSnapshot(q("day_categories"), snap =>
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as DayCategory)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
    const unsubProds = onSnapshot(q("day_products"), snap =>
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as DayProduct)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
    const unsubOffers = onSnapshot(q("day_offers"), snap =>
      setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() } as DayOffer)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
    const unsubPacks = onSnapshot(q("day_packs"), snap =>
      setPacks(snap.docs.map(d => ({ id: d.id, ...d.data() } as DayPack))));

    return () => { unsubCats(); unsubProds(); unsubOffers(); unsubPacks(); };
  }, [auth, etabId]);

  const showMsg = (msg: string, ok = true) => {
    setToast({ msg, show: true, ok });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  // ── Profil save ────────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!etab || !etabId) return;
    setSaving(true);
    await updateDoc(doc(db, "day_etablissements", etabId), { ...etab, updatedAt: new Date().toISOString() });
    setSaving(false);
    showMsg("Profil sauvegardé ✓");
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const r = ref(storage, `day_etablissements/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setEtab(e => e ? { ...e, logoUrl: url } : e);
      showMsg("Logo uploadé ✓");
    } catch { showMsg("Erreur upload", false); }
    finally { setUploading(false); }
  };

  // ── Catégories ─────────────────────────────────────────────────────────
  const saveCat = async () => {
    const data = editCat ?? catForm;
    if (!data.key || !data.label) { showMsg("Clé et libellé requis", false); return; }
    if (editCat?.id) {
      await updateDoc(doc(db, "day_categories", editCat.id), { ...data, etablissementId: etabId });
      showMsg("Catégorie mise à jour ✓");
    } else {
      await addDoc(collection(db, "day_categories"), { ...data, etablissementId: etabId });
      showMsg("Catégorie ajoutée ✓");
    }
    setCatForm({ key: "", label: "", emoji: "🛒", order: 0 });
    setEditCat(null);
  };

  const deleteCat = async (id: string) => {
    if (!confirm("Supprimer cette catégorie ?")) return;
    await deleteDoc(doc(db, "day_categories", id));
    showMsg("Catégorie supprimée");
  };

  // ── Produits ───────────────────────────────────────────────────────────
  const saveProduct = async (p: DayProduct) => {
    if (!p.name) { showMsg("Nom requis", false); return; }
    const data = { ...p, etablissementId: etabId, updatedAt: new Date().toISOString() };
    if (p.id) {
      await updateDoc(doc(db, "day_products", p.id), data);
      showMsg("Produit mis à jour ✓");
    } else {
      await addDoc(collection(db, "day_products"), data);
      showMsg("Produit ajouté ✓");
    }
    setShowProdForm(false);
    setEditProduct(null);
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    await deleteDoc(doc(db, "day_products", id));
    showMsg("Produit supprimé");
  };

  const toggleProduct = async (p: DayProduct) => {
    if (!p.id) return;
    await updateDoc(doc(db, "day_products", p.id), { isActive: p.isActive === false ? true : false });
  };

  // ── Offres ─────────────────────────────────────────────────────────────
  const saveOffer = async () => {
    const data = editOffer ?? offerForm;
    if (!data.title) { showMsg("Titre requis", false); return; }
    if (editOffer?.id) {
      await updateDoc(doc(db, "day_offers", editOffer.id), { ...data, etablissementId: etabId });
      showMsg("Offre mise à jour ✓");
    } else {
      await addDoc(collection(db, "day_offers"), { ...data, etablissementId: etabId });
      showMsg("Offre ajoutée ✓");
    }
    setOfferForm({ title: "", desc: "", emoji: "🌟", discount: "", active: true, order: 0 });
    setEditOffer(null);
  };

  const deleteOffer = async (id: string) => {
    if (!confirm("Supprimer cette offre ?")) return;
    await deleteDoc(doc(db, "day_offers", id));
    showMsg("Offre supprimée");
  };

  // ── Packs ──────────────────────────────────────────────────────────────
  const savePack = async () => {
    const data = editPack ?? packForm;
    if (!data.name) { showMsg("Nom requis", false); return; }
    if (editPack?.id) {
      await updateDoc(doc(db, "day_packs", editPack.id), { ...data, etablissementId: etabId });
      showMsg("Pack mis à jour ✓");
    } else {
      await addDoc(collection(db, "day_packs"), { ...data, etablissementId: etabId });
      showMsg("Pack ajouté ✓");
    }
    setPackForm({ name: "", tag: "", emoji: "☀️", items: "", price: 0, real: 0, star: false });
    setEditPack(null);
  };

  const deletePack = async (id: string) => {
    if (!confirm("Supprimer ce pack ?")) return;
    await deleteDoc(doc(db, "day_packs", id));
    showMsg("Pack supprimé");
  };

  if (!auth) {
    return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...mono, color: "#5a5470" }}>Accès non autorisé. <a href="/admin" style={{ color: "#fbbf24" }}>→ Admin</a></span>
    </div>;
  }

  if (!etab) {
    return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...mono, color: "#5a5470", fontSize: ".85rem" }}>Chargement...</span>
    </div>;
  }

  const filteredProducts = prodCatFilter === "all" ? products : products.filter(p => p.cat === prodCatFilter);

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: "profil", label: "PROFIL", icon: "🏪" },
    { key: "produits", label: "PRODUITS", icon: "🛍️", count: products.length },
    { key: "categories", label: "CATÉGORIES", icon: "🗂️", count: categories.length },
    { key: "offres", label: "OFFRES", icon: "🎁", count: offers.length },
    { key: "packs", label: "PACKS", icon: "📦", count: packs.length },
  ];

  return (
    <div style={S.page}>
      {toast.show && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* Topbar */}
      <div style={S.topbar}>
        <a href="/admin/yassala-day/etablissements" style={{ ...mono, fontSize: ".78rem", color: "#5a5470", textDecoration: "none" }}>← ÉTABLISSEMENTS</a>
        <span style={{ color: "#3a3450" }}>|</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {etab.logoUrl && <img src={etab.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 4, objectFit: "cover" }} />}
          <span style={{ ...mono, fontSize: ".85rem", color: "#fbbf24", letterSpacing: ".08em", fontWeight: 700 }}>{etab.name}</span>
          <span style={S.badge(etab.isActive)}>{etab.isActive ? "ACTIF" : "INACTIF"}</span>
        </div>
      </div>

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg,rgba(251,191,36,.06),rgba(251,191,36,.02))", borderBottom: "1px solid rgba(251,191,36,.1)", padding: "24px 28px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", overflow: "hidden", flexShrink: 0 }}>
            {etab.logoUrl ? <img src={etab.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: "1.5rem", letterSpacing: ".02em" }}>{etab.name}</h1>
            {etab.description && <p style={{ margin: "4px 0 0", color: "#7a7490", fontSize: ".85rem" }}>{etab.description}</p>}
            <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" as const }}>
              {etab.address && <span style={{ ...mono, fontSize: ".7rem", color: "#4b4468" }}>📍 {etab.address}</span>}
              {etab.phone && <span style={{ ...mono, fontSize: ".7rem", color: "#4b4468" }}>📞 {etab.phone}</span>}
              {etab.openHours && <span style={{ ...mono, fontSize: ".7rem", color: "#4b4468" }}>🕐 {etab.openHours}</span>}
            </div>
          </div>
          <div style={{ ...mono, fontSize: ".72rem", color: "#5a5470", textAlign: "right" as const, flexShrink: 0 }}>
            <div>{products.length} produits</div>
            <div>{categories.length} catégories</div>
            <div>{offers.length} offres · {packs.length} packs</div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,.06)", background: "rgba(12,9,24,.6)", padding: "0 28px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", gap: 0 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ background: "transparent", border: "none", borderBottom: tab === t.key ? "2px solid #fbbf24" : "2px solid transparent", color: tab === t.key ? "#fbbf24" : "#5a5470", padding: "14px 18px", cursor: "pointer", ...mono, fontSize: ".78rem", letterSpacing: ".1em", display: "flex", alignItems: "center", gap: 6, transition: "color .15s" }}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span style={{ background: tab === t.key ? "rgba(251,191,36,.2)" : "rgba(255,255,255,.07)", color: tab === t.key ? "#fbbf24" : "#5a5470", borderRadius: 10, padding: "1px 7px", fontSize: ".68rem" }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={S.content}>

        {/* ── PROFIL ── */}
        {tab === "profil" && (
          <div>
            <div style={{ ...mono, fontSize: ".72rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 20 }}>
              // FICHE ÉTABLISSEMENT — INFORMATIONS GÉNÉRALES
            </div>
            <div style={S.card}>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={S.label}>NOM *</label>
                    <input value={etab.name} onChange={e => setEtab(v => v && ({ ...v, name: e.target.value }))} style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>SLUG (URL)</label>
                    <input value={etab.slug || ""} onChange={e => setEtab(v => v && ({ ...v, slug: e.target.value }))} style={{ ...S.input, ...mono }} placeholder="ex: boulangerie-soleil" />
                  </div>
                </div>
                <div>
                  <label style={S.label}>DESCRIPTION</label>
                  <input value={etab.description || ""} onChange={e => setEtab(v => v && ({ ...v, description: e.target.value }))} style={S.input} placeholder="Courte description affichée aux clients" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={S.label}>ADRESSE</label>
                    <input value={etab.address || ""} onChange={e => setEtab(v => v && ({ ...v, address: e.target.value }))} style={S.input} placeholder="Ex: 12 rue des Flamboyants, Cayenne" />
                  </div>
                  <div>
                    <label style={S.label}>TÉLÉPHONE</label>
                    <input value={etab.phone || ""} onChange={e => setEtab(v => v && ({ ...v, phone: e.target.value }))} style={S.input} placeholder="+594 XXX XXX" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={S.label}>HORAIRES D'OUVERTURE</label>
                    <input value={etab.openHours || ""} onChange={e => setEtab(v => v && ({ ...v, openHours: e.target.value }))} style={S.input} placeholder="08:00–21:00" />
                  </div>
                  <div>
                    <label style={S.label}>URL LOGO</label>
                    <input value={etab.logoUrl || ""} onChange={e => setEtab(v => v && ({ ...v, logoUrl: e.target.value }))} style={S.input} placeholder="https://..." />
                  </div>
                </div>

                {/* Logo upload */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]); }} />
                  <button onClick={() => logoRef.current?.click()} disabled={uploading} style={{ ...S.btnGhost, padding: "8px 16px", fontSize: ".78rem" }}>
                    {uploading ? "⏳ UPLOAD..." : "📷 UPLOADER LOGO"}
                  </button>
                  {etab.logoUrl && <img src={etab.logoUrl} alt="logo" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(251,191,36,.2)" }} />}
                </div>

                {/* Statut */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(251,191,36,.04)", border: "1px solid rgba(251,191,36,.15)", borderRadius: 8, padding: "14px 16px" }}>
                  <span style={{ ...mono, fontSize: ".82rem", color: "#fbbf24", flex: 1 }}>☀️ ÉTABLISSEMENT ACTIF</span>
                  <div onClick={() => setEtab(v => v && ({ ...v, isActive: !v.isActive }))}
                    style={{ width: 44, height: 24, borderRadius: 12, position: "relative", cursor: "pointer", background: etab.isActive ? "#fbbf24" : "rgba(255,255,255,.1)", transition: "background .2s" }}>
                    <div style={{ position: "absolute", top: 3, left: etab.isActive ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                  </div>
                </div>

                <div>
                  <button onClick={saveProfile} disabled={saving} style={S.btnPrimary}>
                    {saving ? "⏳ SAUVEGARDE..." : "☀️ SAUVEGARDER LE PROFIL"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CATÉGORIES ── */}
        {tab === "categories" && (
          <div>
            <div style={{ ...mono, fontSize: ".72rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 20 }}>
              // CATÉGORIES DE {etab.name.toUpperCase()}
            </div>
            <div style={S.card}>
              <div style={{ ...mono, fontSize: ".72rem", color: "#fbbf24", letterSpacing: ".1em", marginBottom: 16 }}>
                {editCat ? "// MODIFIER LA CATÉGORIE" : "// NOUVELLE CATÉGORIE"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 80px auto", gap: 12, alignItems: "end" }}>
                {[
                  { label: "EMOJI", field: "emoji" as const, placeholder: "🛒", w: "70px" },
                ].map(() => (
                  <div key="emoji">
                    <label style={S.label}>EMOJI</label>
                    <input value={editCat ? editCat.emoji : catForm.emoji}
                      onChange={e => editCat ? setEditCat(c => c && ({ ...c, emoji: e.target.value })) : setCatForm(c => ({ ...c, emoji: e.target.value }))}
                      style={{ ...S.input, textAlign: "center", fontSize: "1.4rem" }} />
                  </div>
                ))}
                <div>
                  <label style={S.label}>CLÉ (ex: alimentation)</label>
                  <input value={editCat ? editCat.key : catForm.key}
                    onChange={e => editCat ? setEditCat(c => c && ({ ...c, key: e.target.value })) : setCatForm(c => ({ ...c, key: e.target.value }))}
                    style={{ ...S.input, ...mono }} placeholder="alimentation" />
                </div>
                <div>
                  <label style={S.label}>LIBELLÉ AFFICHÉ</label>
                  <input value={editCat ? editCat.label : catForm.label}
                    onChange={e => editCat ? setEditCat(c => c && ({ ...c, label: e.target.value })) : setCatForm(c => ({ ...c, label: e.target.value }))}
                    style={S.input} placeholder="🛒 ALIMENTATION" />
                </div>
                <div>
                  <label style={S.label}>ORDRE</label>
                  <input type="number" value={editCat ? editCat.order : catForm.order}
                    onChange={e => editCat ? setEditCat(c => c && ({ ...c, order: +e.target.value })) : setCatForm(c => ({ ...c, order: +e.target.value }))}
                    style={{ ...S.input, ...mono, textAlign: "center" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveCat} style={S.btnPrimary}>{editCat ? "✓ MODIFIER" : "✓ AJOUTER"}</button>
                  {editCat && <button onClick={() => setEditCat(null)} style={S.btnGhost}>✕</button>}
                </div>
              </div>
            </div>

            {categories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", border: "1px dashed rgba(251,191,36,.15)", borderRadius: 10, ...mono, color: "#5a5470", fontSize: ".8rem" }}>
                // Aucune catégorie — ajoutez-en une ci-dessus
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {categories.map(c => (
                  <div key={c.id} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: "1.6rem", minWidth: 36, textAlign: "center" as const }}>{c.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: ".95rem" }}>{c.label}</div>
                      <div style={{ ...mono, fontSize: ".7rem", color: "#5a5470" }}>clé: <span style={{ color: "#fbbf24" }}>{c.key}</span> · ordre: {c.order}</div>
                    </div>
                    <button onClick={() => setEditCat(c)} style={{ ...S.btnGhost, padding: "7px 14px", fontSize: ".75rem", color: "#fbbf24", borderColor: "rgba(251,191,36,.3)" }}>✏️</button>
                    <button onClick={() => deleteCat(c.id!)} style={S.btnDanger}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PRODUITS ── */}
        {tab === "produits" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 }}>
              <div style={{ ...mono, fontSize: ".72rem", color: "#5a5470", letterSpacing: ".12em" }}>
                // PRODUITS DE {etab.name.toUpperCase()} ({products.length})
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
                {/* Filtre catégorie */}
                <select value={prodCatFilter} onChange={e => setProdCatFilter(e.target.value)}
                  style={{ background: "#0c0918", border: "1px solid rgba(255,255,255,.12)", borderRadius: 6, padding: "8px 14px", color: "#f0eeff", ...mono, fontSize: ".75rem", cursor: "pointer" }}>
                  <option value="all">Toutes catégories</option>
                  {categories.map(c => <option key={c.id} value={c.key}>{c.emoji} {c.label}</option>)}
                </select>
                <button onClick={() => { setEditProduct({ name: "", desc: "", price: 0, image: "", cat: categories[0]?.key || "", badge: "", stock: 10, isActive: true }); setShowProdForm(true); }}
                  style={S.btnPrimary}>
                  + AJOUTER
                </button>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", border: "1px dashed rgba(251,191,36,.15)", borderRadius: 10, ...mono, color: "#5a5470", fontSize: ".8rem" }}>
                {products.length === 0 ? "// Aucun produit — ajoutez-en un !" : `// Aucun produit dans cette catégorie`}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredProducts.map(p => (
                  <div key={p.id} style={{ background: "rgba(255,255,255,.02)", border: `1px solid ${p.isActive === false ? "rgba(255,255,255,.04)" : "rgba(251,191,36,.12)"}`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, opacity: p.isActive === false ? 0.5 : 1 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 8, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", flexShrink: 0, overflow: "hidden" }}>
                      {p.image ? <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🌅"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: ".95rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                        {p.name}
                        {p.badge && <span style={{ background: "#fbbf24", color: "#000", fontSize: ".68rem", padding: "2px 7px", borderRadius: 2, ...mono }}>{p.badge}</span>}
                        {p.isActive === false && <span style={S.badge(false)}>INACTIF</span>}
                      </div>
                      <div style={{ ...mono, fontSize: ".72rem", color: "#5a5470", marginTop: 3 }}>
                        {categories.find(c => c.key === p.cat)?.emoji} {categories.find(c => c.key === p.cat)?.label || p.cat} · {Number(p.price).toFixed(2)} € · stock: {p.stock}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => toggleProduct(p)}
                        style={{ ...S.btnGhost, padding: "7px 12px", fontSize: ".72rem", color: p.isActive === false ? "#b8ff00" : "#5a5470", borderColor: p.isActive === false ? "rgba(184,255,0,.3)" : "rgba(255,255,255,.1)" }}>
                        {p.isActive === false ? "✓ ACTIVER" : "⏸"}
                      </button>
                      <button onClick={() => { setEditProduct(p); setShowProdForm(true); }}
                        style={{ ...S.btnGhost, padding: "7px 14px", fontSize: ".75rem", color: "#fbbf24", borderColor: "rgba(251,191,36,.3)" }}>
                        ✏️ ÉDITER
                      </button>
                      <button onClick={() => deleteProduct(p.id!)} style={S.btnDanger}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showProdForm && editProduct && (
              <ProductForm
                prod={editProduct}
                cats={categories}
                onSave={saveProduct}
                onClose={() => { setShowProdForm(false); setEditProduct(null); }}
              />
            )}
          </div>
        )}

        {/* ── OFFRES ── */}
        {tab === "offres" && (
          <div>
            <div style={{ ...mono, fontSize: ".72rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 20 }}>
              // OFFRES DE {etab.name.toUpperCase()}
            </div>
            <div style={S.card}>
              <div style={{ ...mono, fontSize: ".72rem", color: "#fbbf24", letterSpacing: ".1em", marginBottom: 16 }}>
                {editOffer ? "// MODIFIER L'OFFRE" : "// NOUVELLE OFFRE"}
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 10 }}>
                  <div>
                    <label style={S.label}>EMOJI</label>
                    <input value={editOffer ? editOffer.emoji : offerForm.emoji}
                      onChange={e => editOffer ? setEditOffer(o => o && ({ ...o, emoji: e.target.value })) : setOfferForm(f => ({ ...f, emoji: e.target.value }))}
                      style={{ ...S.input, textAlign: "center", fontSize: "1.3rem" }} />
                  </div>
                  <div>
                    <label style={S.label}>TITRE *</label>
                    <input value={editOffer ? editOffer.title : offerForm.title}
                      onChange={e => editOffer ? setEditOffer(o => o && ({ ...o, title: e.target.value })) : setOfferForm(f => ({ ...f, title: e.target.value }))}
                      style={S.input} placeholder="Ex: Pack Apéro Plage" />
                  </div>
                </div>
                <div>
                  <label style={S.label}>DESCRIPTION</label>
                  <input value={editOffer ? editOffer.desc : offerForm.desc}
                    onChange={e => editOffer ? setEditOffer(o => o && ({ ...o, desc: e.target.value })) : setOfferForm(f => ({ ...f, desc: e.target.value }))}
                    style={S.input} placeholder="Ex: Sélection de spécialités fraîches" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
                  <div>
                    <label style={S.label}>RÉDUCTION / PROMO</label>
                    <input value={editOffer ? editOffer.discount : offerForm.discount}
                      onChange={e => editOffer ? setEditOffer(o => o && ({ ...o, discount: e.target.value })) : setOfferForm(f => ({ ...f, discount: e.target.value }))}
                      style={S.input} placeholder="Ex: -10% · 2 achetés 1 offert" />
                  </div>
                  <div>
                    <label style={S.label}>ORDRE</label>
                    <input type="number" value={editOffer ? editOffer.order : offerForm.order}
                      onChange={e => editOffer ? setEditOffer(o => o && ({ ...o, order: +e.target.value })) : setOfferForm(f => ({ ...f, order: +e.target.value }))}
                      style={{ ...S.input, ...mono, textAlign: "center" }} />
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={editOffer ? editOffer.active : offerForm.active}
                    onChange={e => editOffer ? setEditOffer(o => o && ({ ...o, active: e.target.checked })) : setOfferForm(f => ({ ...f, active: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  <span style={{ ...mono, fontSize: ".78rem", color: "#7a7490" }}>ACTIVE (visible par les clients)</span>
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={saveOffer} style={S.btnPrimary}>{editOffer ? "✓ METTRE À JOUR" : "+ AJOUTER"}</button>
                  {editOffer && <button onClick={() => setEditOffer(null)} style={S.btnGhost}>ANNULER</button>}
                </div>
              </div>
            </div>

            {offers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", border: "1px dashed rgba(251,191,36,.15)", borderRadius: 10, ...mono, color: "#5a5470", fontSize: ".8rem" }}>
                // Aucune offre — ajoutez-en une ci-dessus
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {offers.map(o => (
                  <div key={o.id} style={{ background: "rgba(255,255,255,.02)", border: `1px solid ${o.active ? "rgba(251,191,36,.18)" : "rgba(255,255,255,.05)"}`, borderRadius: 8, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: "1.4rem" }}>{o.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: ".95rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                        {o.title}
                        <span style={S.badge(o.active)}>{o.active ? "ACTIVE" : "INACTIVE"}</span>
                        {o.discount && <span style={{ background: "rgba(255,45,120,.12)", color: "#ff2d78", padding: "2px 8px", borderRadius: 3, ...mono, fontSize: ".68rem" }}>{o.discount}</span>}
                      </div>
                      {o.desc && <div style={{ fontSize: ".8rem", color: "#7a7490", marginTop: 2 }}>{o.desc}</div>}
                    </div>
                    <button onClick={() => setEditOffer(o)} style={{ ...S.btnGhost, padding: "7px 14px", fontSize: ".75rem", color: "#fbbf24", borderColor: "rgba(251,191,36,.3)" }}>✏️</button>
                    <button onClick={() => deleteOffer(o.id!)} style={S.btnDanger}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PACKS ── */}
        {tab === "packs" && (
          <div>
            <div style={{ ...mono, fontSize: ".72rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 20 }}>
              // PACKS DE {etab.name.toUpperCase()}
            </div>
            <div style={S.card}>
              <div style={{ ...mono, fontSize: ".72rem", color: "#fbbf24", letterSpacing: ".1em", marginBottom: 16 }}>
                {editPack ? "// MODIFIER LE PACK" : "// NOUVEAU PACK"}
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={S.label}>EMOJI</label>
                    <input value={editPack ? editPack.emoji : packForm.emoji}
                      onChange={e => editPack ? setEditPack(p => p && ({ ...p, emoji: e.target.value })) : setPackForm(f => ({ ...f, emoji: e.target.value }))}
                      style={{ ...S.input, textAlign: "center", fontSize: "1.3rem" }} />
                  </div>
                  <div>
                    <label style={S.label}>NOM *</label>
                    <input value={editPack ? editPack.name : packForm.name}
                      onChange={e => editPack ? setEditPack(p => p && ({ ...p, name: e.target.value })) : setPackForm(f => ({ ...f, name: e.target.value }))}
                      style={S.input} placeholder="Ex: Pack Famille" />
                  </div>
                  <div>
                    <label style={S.label}>TAG</label>
                    <input value={editPack ? editPack.tag : packForm.tag}
                      onChange={e => editPack ? setEditPack(p => p && ({ ...p, tag: e.target.value })) : setPackForm(f => ({ ...f, tag: e.target.value }))}
                      style={S.input} placeholder="Ex: BEST VALUE" />
                  </div>
                </div>
                <div>
                  <label style={S.label}>CONTENU (articles)</label>
                  <input value={editPack ? editPack.items : packForm.items}
                    onChange={e => editPack ? setEditPack(p => p && ({ ...p, items: e.target.value })) : setPackForm(f => ({ ...f, items: e.target.value }))}
                    style={S.input} placeholder="Ex: 2x Sandwich + 1x Boisson + 1x Dessert" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={S.label}>PRIX PACK (€)</label>
                    <input type="number" min={0} step={0.01} value={editPack ? editPack.price : packForm.price}
                      onChange={e => editPack ? setEditPack(p => p && ({ ...p, price: parseFloat(e.target.value) || 0 })) : setPackForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                      style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>PRIX RÉEL (€) — barré</label>
                    <input type="number" min={0} step={0.01} value={editPack ? editPack.real : packForm.real}
                      onChange={e => editPack ? setEditPack(p => p && ({ ...p, real: parseFloat(e.target.value) || 0 })) : setPackForm(f => ({ ...f, real: parseFloat(e.target.value) || 0 }))}
                      style={S.input} />
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={editPack ? editPack.star : packForm.star}
                    onChange={e => editPack ? setEditPack(p => p && ({ ...p, star: e.target.checked })) : setPackForm(f => ({ ...f, star: e.target.checked }))}
                    style={{ width: 16, height: 16 }} />
                  <span style={{ ...mono, fontSize: ".78rem", color: "#7a7490" }}>⭐ PACK VEDETTE (mis en avant)</span>
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={savePack} style={S.btnPrimary}>{editPack ? "✓ METTRE À JOUR" : "+ AJOUTER"}</button>
                  {editPack && <button onClick={() => setEditPack(null)} style={S.btnGhost}>ANNULER</button>}
                </div>
              </div>
            </div>

            {packs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", border: "1px dashed rgba(251,191,36,.15)", borderRadius: 10, ...mono, color: "#5a5470", fontSize: ".8rem" }}>
                // Aucun pack — ajoutez-en un ci-dessus
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {packs.map(p => (
                  <div key={p.id} style={{ background: "rgba(255,255,255,.02)", border: `1px solid ${p.star ? "rgba(251,191,36,.25)" : "rgba(255,255,255,.06)"}`, borderRadius: 10, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: "1.8rem" }}>{p.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: ".95rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                        {p.name}
                        {p.star && <span style={{ background: "rgba(251,191,36,.2)", color: "#fbbf24", padding: "2px 8px", borderRadius: 3, ...mono, fontSize: ".68rem" }}>⭐ VEDETTE</span>}
                        {p.tag && <span style={{ background: "rgba(168,85,247,.15)", color: "#a78bfa", padding: "2px 8px", borderRadius: 3, ...mono, fontSize: ".68rem" }}>{p.tag}</span>}
                      </div>
                      <div style={{ fontSize: ".8rem", color: "#7a7490", marginTop: 3 }}>{p.items}</div>
                      <div style={{ ...mono, fontSize: ".72rem", color: "#fbbf24", marginTop: 4 }}>
                        {p.price.toFixed(2)} €
                        {p.real > 0 && <span style={{ color: "#5a5470", textDecoration: "line-through", marginLeft: 8 }}>{p.real.toFixed(2)} €</span>}
                      </div>
                    </div>
                    <button onClick={() => setEditPack(p)} style={{ ...S.btnGhost, padding: "7px 14px", fontSize: ".75rem", color: "#fbbf24", borderColor: "rgba(251,191,36,.3)" }}>✏️</button>
                    <button onClick={() => deletePack(p.id!)} style={S.btnDanger}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
