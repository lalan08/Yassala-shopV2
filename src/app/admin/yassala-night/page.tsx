"use client";

import { useEffect, useState, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, where, getDocs,
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const storage = getStorage(app);

// ── Types ─────────────────────────────────────────────────────────────────────
type View = "list" | "menu";
type NightPartenaire = {
  id?: string; name: string; slug?: string; description?: string;
  address?: string; phone?: string; logoUrl?: string; coverUrl?: string;
  openHours?: string; isActive: boolean; createdAt?: string;
};
type Cat  = { id?: string; key: string; label: string; emoji: string; order: number };
type Prod = { id?: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; isActive?: boolean };

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractSizePrices(desc: string) {
  const idx = desc.indexOf(" • ");
  if (idx === -1) return { baseDesc: desc, petite: "", grande: "", familiale: "" };
  const base = desc.slice(0, idx);
  const parts = desc.slice(idx + 3).split(/\s*·\s*/);
  const res: Record<string, string> = {};
  for (const p of parts) {
    const m = p.trim().match(/^(Petite|Grande|Familiale)\s+([\d.,]+)\s*€/);
    if (m) res[m[1].toLowerCase()] = m[2];
  }
  return { baseDesc: base, petite: res["petite"] || "", grande: res["grande"] || "", familiale: res["familiale"] || "" };
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const PINK       = "#ff2d78";
const BG         = "#080514";
const CARD       = "#0c0918";
const MONO       = { fontFamily: "'Share Tech Mono',monospace" } as const;
const BORDER     = "rgba(255,45,120,.18)";
const BORDER_DIM = "rgba(255,255,255,.07)";

const S = {
  page:       { minHeight: "100vh", background: BG, color: "#f0eeff", fontFamily: "'Inter',sans-serif" },
  topbar:     { background: "rgba(12,9,24,.97)", borderBottom: `1px solid ${BORDER}`, padding: "0 24px", height: 54, display: "flex" as const, alignItems: "center" as const, gap: 14, position: "sticky" as const, top: 0, zIndex: 40 },
  content:    { maxWidth: 1000, margin: "0 auto", padding: "28px 24px" },
  card:       { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "24px 28px" },
  label:      { ...MONO, fontSize: ".72rem", color: "#7a7490", letterSpacing: ".1em", marginBottom: 6, display: "block" as const },
  input:      { width: "100%", background: BG, border: "1px solid rgba(255,255,255,.12)", borderRadius: 6, padding: "10px 14px", color: "#f0eeff", fontSize: ".9rem", fontFamily: "'Inter',sans-serif", boxSizing: "border-box" as const },
  btnPrimary: { background: `linear-gradient(135deg,${PINK},#e01060)`, color: "#fff", border: "none", borderRadius: 6, padding: "11px 24px", ...MONO, fontSize: ".85rem", letterSpacing: ".08em", cursor: "pointer", fontWeight: 700 },
  btnGhost:   { background: "transparent", border: "1px solid rgba(255,255,255,.12)", color: "#7a7490", borderRadius: 6, padding: "11px 18px", ...MONO, fontSize: ".85rem", cursor: "pointer" },
  btnDanger:  { background: "transparent", border: "1px solid rgba(255,45,120,.25)", color: PINK, borderRadius: 6, padding: "8px 14px", ...MONO, fontSize: ".78rem", cursor: "pointer" },
  badge:      (active: boolean) => ({ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4, fontSize: ".7rem", ...MONO, letterSpacing: ".08em", background: active ? "rgba(184,255,0,.12)" : "rgba(255,255,255,.06)", color: active ? "#b8ff00" : "#5a5470" }),
};

const blankForm: Omit<NightPartenaire, "id"> = {
  name: "", slug: "", description: "", address: "", phone: "",
  logoUrl: "", coverUrl: "", openHours: "21:00–06:00", isActive: true,
};

const blankProd: Omit<Prod, "id"> = {
  name: "", desc: "", price: 0, image: "", cat: "", badge: "", stock: 10, isActive: true,
};

const inp = (extra?: object) => ({
  width: "100%", background: BG, border: `1px solid ${BORDER_DIM}`,
  borderRadius: 8, padding: "10px 13px", color: "#f0eeff",
  fontSize: ".88rem", fontFamily: "'Inter',sans-serif", boxSizing: "border-box" as const,
  ...extra,
});

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: ok ? "#0a2e1a" : "#2e0a14", border: `1px solid ${ok ? "rgba(184,255,0,.3)" : "rgba(255,45,120,.35)"}`, color: ok ? "#b8ff00" : PINK, padding: "12px 20px", borderRadius: 8, ...MONO, fontSize: ".82rem" }}>
      {msg}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function NightAdminPage() {
  // ── View state
  const [view,          setView]         = useState<View>("list");
  const [selectedEtab,  setSelectedEtab] = useState<NightPartenaire | null>(null);

  // ── Auth
  const [auth, setAuth] = useState(false);

  // ── Toast
  const [toast, setToast] = useState({ msg: "", ok: true, show: false });
  const showMsg = (msg: string, ok = true) => {
    setToast({ msg, ok, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  // ── Stats
  const [catCount,  setCatCount]  = useState(0);
  const [prodCount, setProdCount] = useState(0);
  const [packCount, setPackCount] = useState(0);
  const [offerCount, setOfferCount] = useState(0);
  const [dayCatCount,  setDayCatCount]  = useState(0);
  const [dayProdCount, setDayProdCount] = useState(0);
  const [dayPackCount, setDayPackCount] = useState(0);
  const [dayOfferCount, setDayOfferCount] = useState(0);

  // ── List view state (partner management)
  const [etablissements,    setEtablissements]    = useState<NightPartenaire[]>([]);
  const [form,              setForm]              = useState<Omit<NightPartenaire, "id">>(blankForm);
  const [editId,            setEditId]            = useState<string | null>(null);
  const [showForm,          setShowForm]          = useState(false);
  const [uploadingLogo,     setUploadingLogo]     = useState(false);
  const [uploadingCover,    setUploadingCover]    = useState(false);
  const [quickLogoEtabId,   setQuickLogoEtabId]   = useState<string | null>(null);
  const [quickLogoLoading,  setQuickLogoLoading]  = useState<string | null>(null);
  const logoInputRef  = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const quickLogoRef  = useRef<HTMLInputElement>(null);

  // ── Menu view state (categories + products)
  const [cats,     setCats]     = useState<Cat[]>([]);
  const [prods,    setProds]    = useState<Prod[]>([]);
  const [catForm,  setCatForm]  = useState({ emoji: "🍹", label: "", key: "" });
  const [editCat,  setEditCat]  = useState<Cat | null>(null);
  const [drawer,       setDrawer]      = useState<(Prod & { id?: string }) | null>(null);
  const [drawerSizes,  setDrawerSizes] = useState({ petite: "", grande: "", familiale: "" });
  const [catFilter,    setCatFilter]   = useState("all");
  const [showImport,   setShowImport]  = useState(false);
  const [storeProds,   setStoreProds]  = useState<Prod[]>([]);
  const [storeSearch,  setStoreSearch] = useState("");
  const [importing,    setImporting]   = useState(false);
  const [importSel,    setImportSel]   = useState<Set<string>>(new Set());
  const [uploading,    setUploading]   = useState(false);
  const [dragOver,     setDragOver]    = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") setAuth(!!localStorage.getItem("yassala_admin_auth"));
  }, []);

  // ── Stats & partner list ────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    const u1 = onSnapshot(collection(db, "night_categories"),     s => setCatCount(s.size));
    const u2 = onSnapshot(collection(db, "night_products"),       s => setProdCount(s.size));
    const u3 = onSnapshot(collection(db, "night_packs"),          s => setPackCount(s.size));
    const u4 = onSnapshot(collection(db, "night_offers"),         s => setOfferCount(s.size));
    const u5 = onSnapshot(collection(db, "day_categories"),       s => setDayCatCount(s.size));
    const u6 = onSnapshot(collection(db, "day_products"),         s => setDayProdCount(s.size));
    const u7 = onSnapshot(collection(db, "day_packs"),            s => setDayPackCount(s.size));
    const u8 = onSnapshot(collection(db, "day_offers"),           s => setDayOfferCount(s.size));
    const u9 = onSnapshot(collection(db, "night_etablissements"), snap => {
      setEtablissements(snap.docs.map(d => ({ id: d.id, ...d.data() } as NightPartenaire)).sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    });
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); };
  }, [auth]);

  // ── Menu data (categories + products for selected partner) ──────────────────
  useEffect(() => {
    if (!auth || !selectedEtab?.id || view !== "menu") return;
    const etabId = selectedEtab.id!;
    const byEtab = (col: string) => query(collection(db, col), where("etablissementId", "==", etabId));
    const u1 = onSnapshot(byEtab("night_categories"), snap =>
      setCats(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cat)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    );
    const u2 = onSnapshot(byEtab("night_products"), snap =>
      setProds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Prod)))
    );
    return () => { u1(); u2(); };
  }, [auth, selectedEtab?.id, view]);

  // ── Partner CRUD ────────────────────────────────────────────────────────────
  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const r = ref(storage, `night_etablissements/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setForm(f => ({ ...f, logoUrl: url }));
      showMsg("Logo uploadé ✓");
    } catch { showMsg("Erreur upload logo", false); }
    finally { setUploadingLogo(false); }
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const r = ref(storage, `night_etablissements/covers/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setForm(f => ({ ...f, coverUrl: url }));
      showMsg("Cover uploadée ✓");
    } catch { showMsg("Erreur upload cover", false); }
    finally { setUploadingCover(false); }
  };

  const handleQuickLogo = async (file: File, etabId: string) => {
    setQuickLogoLoading(etabId);
    try {
      const r = ref(storage, `night_etablissements/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, "night_etablissements", etabId), { logoUrl: url });
      showMsg("Logo mis à jour ✓");
    } catch { showMsg("Erreur upload logo", false); }
    finally { setQuickLogoLoading(null); setQuickLogoEtabId(null); }
  };

  const savePartner = async () => {
    if (!form.name.trim()) { showMsg("Nom requis", false); return; }
    const data: Record<string, unknown> = { ...form, slug: form.slug?.trim() || slugify(form.name), updatedAt: new Date().toISOString() };
    if (editId) {
      await updateDoc(doc(db, "night_etablissements", editId), data);
      showMsg("Partenaire mis à jour ✓");
    } else {
      await addDoc(collection(db, "night_etablissements"), { ...data, createdAt: new Date().toISOString() });
      showMsg("Partenaire créé ✓");
    }
    setForm(blankForm); setEditId(null); setShowForm(false);
  };

  const toggleStatus = async (etab: NightPartenaire) => {
    if (!etab.id) return;
    await updateDoc(doc(db, "night_etablissements", etab.id), { isActive: !etab.isActive });
    showMsg(etab.isActive ? "Partenaire désactivé" : "Partenaire activé ✓");
  };

  const removePartner = async (etab: NightPartenaire) => {
    if (!etab.id || !confirm(`Supprimer "${etab.name}" ?`)) return;
    await deleteDoc(doc(db, "night_etablissements", etab.id));
    showMsg("Partenaire supprimé");
  };

  const startEdit = (etab: NightPartenaire) => {
    setForm({ name: etab.name, slug: etab.slug || "", description: etab.description || "", address: etab.address || "", phone: etab.phone || "", logoUrl: etab.logoUrl || "", coverUrl: etab.coverUrl || "", openHours: etab.openHours || "21:00–06:00", isActive: etab.isActive });
    setEditId(etab.id!); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Category CRUD ───────────────────────────────────────────────────────────
  const slugKey = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const saveCat = async () => {
    const etabId = selectedEtab?.id!;
    const f = editCat ?? catForm;
    if (!f.label.trim()) { showMsg("Nom requis", false); return; }
    const key = f.key.trim() || slugKey(f.label);
    if (editCat?.id) {
      await updateDoc(doc(db, "night_categories", editCat.id), { ...f, key, etablissementId: etabId });
      setEditCat(null); showMsg("Catégorie mise à jour ✓");
    } else {
      await addDoc(collection(db, "night_categories"), { ...f, key, order: cats.length, etablissementId: etabId });
      setCatForm({ emoji: "🍹", label: "", key: "" }); showMsg("Catégorie ajoutée ✓");
    }
  };

  const deleteCat = async (id: string) => {
    if (!confirm("Supprimer cette catégorie ?")) return;
    await deleteDoc(doc(db, "night_categories", id));
    if (catFilter === cats.find(c => c.id === id)?.key) setCatFilter("all");
    showMsg("Catégorie supprimée");
  };

  // ── Product CRUD ────────────────────────────────────────────────────────────
  const saveProd = async () => {
    if (!drawer?.name.trim()) { showMsg("Nom requis", false); return; }
    const etabId = selectedEtab?.id!;
    const { id, ...data } = { ...drawer, etablissementId: etabId, updatedAt: new Date().toISOString() };
    const sizeParts: string[] = [];
    if (drawerSizes.petite)    sizeParts.push(`Petite ${drawerSizes.petite}€`);
    if (drawerSizes.grande)    sizeParts.push(`Grande ${drawerSizes.grande}€`);
    if (drawerSizes.familiale) sizeParts.push(`Familiale ${drawerSizes.familiale}€`);
    if (sizeParts.length > 0) data.desc = `${data.desc} • ${sizeParts.join(" · ")}`;
    if (id) { await updateDoc(doc(db, "night_products", id), data); showMsg("Produit mis à jour ✓"); }
    else    { await addDoc(collection(db, "night_products"), data);  showMsg("Produit ajouté ✓"); }
    setDrawer(null);
  };

  const deleteProd = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    await deleteDoc(doc(db, "night_products", id)); showMsg("Produit supprimé");
  };

  const toggleProd = async (p: Prod & { id?: string }) => {
    if (!p.id) return;
    await updateDoc(doc(db, "night_products", p.id), { isActive: p.isActive === false });
  };

  // ── Import from Yassala Store ───────────────────────────────────────────────
  const openImport = async () => {
    setShowImport(true); setImportSel(new Set()); setStoreSearch("");
    const snap = await getDocs(collection(db, "night_products"));
    setStoreProds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Prod)).filter(p => !(p as any).etablissementId));
  };

  const toggleImportSel = (id: string) =>
    setImportSel(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const doImport = async () => {
    if (importSel.size === 0) return;
    setImporting(true);
    try {
      for (const pid of importSel) {
        const prod = storeProds.find(p => p.id === pid);
        if (!prod) continue;
        const { id: _id, ...data } = prod as Prod & { id?: string };
        await addDoc(collection(db, "night_products"), { ...data, etablissementId: selectedEtab?.id, importedFrom: pid, updatedAt: new Date().toISOString() });
      }
      showMsg(`${importSel.size} produit(s) importé(s) ✓`); setShowImport(false);
    } catch { showMsg("Erreur lors de l'import", false); }
    finally { setImporting(false); }
  };

  // ── Image upload ────────────────────────────────────────────────────────────
  const uploadImg = async (file: File) => {
    if (!file.type.startsWith("image/")) { showMsg("Fichier image requis", false); return; }
    setUploading(true);
    try {
      const r = ref(storage, `night_products/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setDrawer(d => d ? { ...d, image: url } : d); showMsg("Image uploadée ✓");
    } catch { showMsg("Erreur upload image", false); }
    finally { setUploading(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadImg(file);
  };

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (!auth) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", ...MONO, color: "#5a5470" }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>🌙</div>
        <div>Accès refusé — <a href="/admin" style={{ color: "#a78bfa" }}>retour admin</a></div>
      </div>
    </div>
  );

  const catActive = editCat ?? catForm;
  const setCatActive = editCat
    ? (fn: (c: Cat) => Cat) => setEditCat(c => c && fn(c))
    : (fn: (c: typeof catForm) => typeof catForm) => setCatForm(fn);
  const filtered = catFilter === "all" ? prods : prods.filter(p => p.cat === catFilter);

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW : LIST — Stats + Partner management
  // ════════════════════════════════════════════════════════════════════════════
  if (view === "list") return (
    <div style={S.page}>
      {/* Hidden inputs */}
      <input ref={quickLogoRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f && quickLogoEtabId) handleQuickLogo(f, quickLogoEtabId); e.target.value = ""; }} />
      <input ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { if (e.target.files?.[0]) handleCoverUpload(e.target.files[0]); e.target.value = ""; }} />

      {toast.show && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* Topbar */}
      <div style={S.topbar}>
        <a href="/admin" style={{ ...MONO, fontSize: ".78rem", color: "#5a5470", textDecoration: "none" }}>← ADMIN</a>
        <span style={{ color: "#3a3450" }}>|</span>
        <span style={{ ...MONO, fontSize: ".85rem", color: PINK, letterSpacing: ".1em", fontWeight: 700 }}>🌙 YASSALA NIGHT</span>
        <button onClick={() => { setForm(blankForm); setEditId(null); setShowForm(v => !v); }}
          style={{ ...S.btnPrimary, marginLeft: "auto", padding: "8px 18px", fontSize: ".78rem" }}>
          {showForm && !editId ? "✕ FERMER" : "+ NOUVEAU PARTENAIRE"}
        </button>
      </div>

      <div style={S.content}>
        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Catégories", count: catCount, emoji: "🗂️" },
            { label: "Produits",   count: prodCount, emoji: "🍔" },
            { label: "Packs",      count: packCount, emoji: "📦" },
            { label: "Offres",     count: offerCount, emoji: "🏷️" },
          ].map(c => (
            <div key={c.label} style={{ background: CARD, border: `1px solid ${BORDER_DIM}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>{c.emoji}</div>
              <div style={{ fontWeight: 700, fontSize: ".9rem" }}>{c.label} <span style={{ color: PINK }}>NIGHT</span></div>
              <div style={{ ...MONO, fontSize: ".75rem", color: "#5a5470", marginTop: 4 }}>{c.count} éléments</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: "1.5rem", margin: 0, marginBottom: 4 }}>
            🌙 <span style={{ color: PINK }}>PARTENAIRES YASSALA NIGHT</span>
          </h1>
          <p style={{ color: "#5a5470", ...MONO, fontSize: ".75rem", margin: 0 }}>
            {etablissements.length} partenaire{etablissements.length !== 1 ? "s" : ""} · {etablissements.filter(e => e.isActive).length} actif{etablissements.filter(e => e.isActive).length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Create / Edit form */}
        {showForm && (
          <div style={{ ...S.card, marginBottom: 28 }}>
            <div style={{ ...MONO, fontSize: ".72rem", color: PINK, letterSpacing: ".12em", marginBottom: 20 }}>
              {editId ? "// MODIFIER LE PARTENAIRE" : "// NOUVEAU PARTENAIRE"}
            </div>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={S.label}>NOM *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Bar Le Nocturne" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>SLUG (URL)</label>
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="bar-le-nocturne" style={{ ...S.input, ...MONO }} />
                </div>
              </div>
              <div>
                <label style={S.label}>DESCRIPTION</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Courte description" style={S.input} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={S.label}>ADRESSE</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="12 rue des Flamboyants" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>TÉLÉPHONE</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+594 XXX XXX" style={S.input} />
                </div>
              </div>
              <div>
                <label style={S.label}>HORAIRES</label>
                <input value={form.openHours} onChange={e => setForm(f => ({ ...f, openHours: e.target.value }))} placeholder="21:00–06:00" style={S.input} />
              </div>
              {/* Images */}
              <div style={{ ...MONO, fontSize: ".7rem", color: PINK, letterSpacing: ".1em" }}>// IMAGES</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "16px 18px", background: `rgba(255,45,120,.04)`, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <label style={S.label}>LOGO</label>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); e.target.value = ""; }} />
                  <div onClick={() => !uploadingLogo && logoInputRef.current?.click()}
                    style={{ width: 80, height: 80, borderRadius: 14, border: `2px dashed ${form.logoUrl ? BORDER : "rgba(255,255,255,.18)"}`, background: form.logoUrl ? "#000" : "rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", opacity: uploadingLogo ? 0.6 : 1 }}>
                    {uploadingLogo ? <span style={{ fontSize: "1.5rem" }}>⏳</span> : form.logoUrl ? <img src={form.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "2rem" }}>🏪</span>}
                  </div>
                  <input value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="URL logo..." style={{ ...S.input, fontSize: ".72rem" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <label style={S.label}>COVER</label>
                  <div onClick={() => !uploadingCover && coverInputRef.current?.click()}
                    style={{ width: "100%", height: 80, borderRadius: 10, border: `2px dashed ${form.coverUrl ? BORDER : "rgba(255,255,255,.18)"}`, background: form.coverUrl ? "#000" : "rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", opacity: uploadingCover ? 0.6 : 1 }}>
                    {uploadingCover ? <span style={{ fontSize: "1.5rem" }}>⏳</span> : form.coverUrl ? <img src={form.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "2rem", opacity: 0.4 }}>🖼️</span>}
                  </div>
                  <input value={form.coverUrl} onChange={e => setForm(f => ({ ...f, coverUrl: e.target.value }))} placeholder="URL cover..." style={{ ...S.input, fontSize: ".72rem" }} />
                </div>
              </div>
              {/* Statut */}
              <div style={{ padding: "14px 18px", background: "rgba(255,255,255,.02)", border: `1px solid ${BORDER_DIM}`, borderRadius: 10 }}>
                <label style={{ ...S.label, margin: 0, marginBottom: 8 }}>VISIBLE (actif)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                    style={{ width: 44, height: 24, borderRadius: 12, position: "relative", cursor: "pointer", background: form.isActive ? PINK : "rgba(255,255,255,.1)", transition: "background .2s" }}>
                    <div style={{ position: "absolute", top: 3, left: form.isActive ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                  </div>
                  <span style={{ ...MONO, fontSize: ".78rem", color: form.isActive ? PINK : "#5a5470" }}>{form.isActive ? "ACTIF" : "INACTIF"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={savePartner} style={S.btnPrimary}>{editId ? "✓ METTRE À JOUR" : "✓ CRÉER"}</button>
                <button onClick={() => { setForm(blankForm); setEditId(null); setShowForm(false); }} style={S.btnGhost}>ANNULER</button>
              </div>
            </div>
          </div>
        )}

        {/* Partner list */}
        {etablissements.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", border: `1px dashed ${BORDER}`, borderRadius: 12 }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>🌙</div>
            <div style={{ ...MONO, fontSize: ".85rem", color: "#5a5470", marginBottom: 16 }}>// Aucun partenaire configuré</div>
            <button onClick={() => setShowForm(true)} style={S.btnPrimary}>+ CRÉER LE PREMIER PARTENAIRE</button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {etablissements.map(etab => (
              <div key={etab.id} style={{ background: "rgba(255,255,255,.02)", border: `1px solid ${etab.isActive ? BORDER : "rgba(255,255,255,.05)"}`, borderRadius: 12, padding: "16px 22px", display: "flex", alignItems: "center", gap: 18, opacity: etab.isActive ? 1 : 0.65 }}>
                {/* Logo */}
                <div title="Cliquer pour changer le logo" onClick={() => { setQuickLogoEtabId(etab.id!); setTimeout(() => quickLogoRef.current?.click(), 10); }}
                  style={{ width: 52, height: 52, borderRadius: 10, background: `rgba(255,45,120,.08)`, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", flexShrink: 0, overflow: "hidden", cursor: "pointer" }}>
                  {quickLogoLoading === etab.id ? "⏳" : etab.logoUrl ? <img src={etab.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {etab.name}
                    <span style={S.badge(etab.isActive)}>{etab.isActive ? "ACTIF" : "INACTIF"}</span>
                  </div>
                  {etab.description && <div style={{ fontSize: ".8rem", color: "#7a7490", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etab.description}</div>}
                  <div style={{ ...MONO, fontSize: ".7rem", color: "#4b4468", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {etab.address  && <span>📍 {etab.address}</span>}
                    {etab.phone    && <span>📞 {etab.phone}</span>}
                    {etab.openHours && <span>🕐 {etab.openHours}</span>}
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <button
                    onClick={() => { setSelectedEtab(etab); setCats([]); setProds([]); setCatFilter("all"); setView("menu"); }}
                    style={{ background: `rgba(255,45,120,.12)`, border: `1px solid ${BORDER}`, color: PINK, padding: "8px 14px", borderRadius: 6, ...MONO, fontSize: ".75rem", cursor: "pointer", fontWeight: 700 }}>
                    📋 GÉRER LE MENU
                  </button>
                  <button onClick={() => toggleStatus(etab)}
                    style={{ background: "transparent", border: etab.isActive ? `1px solid rgba(255,255,255,.1)` : "1px solid rgba(184,255,0,.3)", color: etab.isActive ? "#5a5470" : "#b8ff00", padding: "8px 14px", borderRadius: 6, ...MONO, fontSize: ".75rem", cursor: "pointer" }}>
                    {etab.isActive ? "⏸ DÉSACTIVER" : "✓ ACTIVER"}
                  </button>
                  <button onClick={() => startEdit(etab)}
                    style={{ background: "transparent", border: `1px solid ${BORDER}`, color: PINK, padding: "8px 14px", borderRadius: 6, ...MONO, fontSize: ".75rem", cursor: "pointer" }}>
                    ✏️ MODIFIER
                  </button>
                  <button onClick={() => removePartner(etab)} style={S.btnDanger}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Service DAY preview */}
        <div style={{ marginTop: 32, background: "#fff", border: "2px solid #fef3c7", borderRadius: 14, padding: "24px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: "1.2rem" }}>☀️</span>
            <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: "1rem", color: "#1a1740", margin: 0 }}>
              Service <span style={{ color: "#d97706" }}>DAY</span>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {[
              { label: "Catégories", count: dayCatCount },
              { label: "Produits",   count: dayProdCount },
              { label: "Packs",      count: dayPackCount },
              { label: "Offres",     count: dayOfferCount },
            ].map(c => (
              <a key={c.label} href="/admin/yassala-day" style={{ textDecoration: "none" }}>
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px" }}>
                  <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#1a1740" }}>{c.label} <span style={{ color: "#d97706" }}>DAY</span></div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#92400e", marginTop: 4 }}>{c.count} éléments</div>
                </div>
              </a>
            ))}
          </div>
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <a href="/admin/yassala-day" style={{ color: "#d97706", fontSize: ".82rem", textDecoration: "none", fontWeight: 500 }}>Gérer le Service DAY →</a>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW : MENU — Categories + Products for selected partner
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#f0eeff", fontFamily: "'Inter',sans-serif" }}>
      {toast.show && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* Topbar */}
      <div style={{ background: "rgba(12,9,24,.97)", borderBottom: `1px solid ${BORDER}`, padding: "0 20px", height: 54, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 40 }}>
        <button onClick={() => { setView("list"); setSelectedEtab(null); }}
          style={{ background: "transparent", border: "none", ...MONO, fontSize: ".72rem", color: "#5a5470", cursor: "pointer", padding: 0 }}>
          ← PARTENAIRES
        </button>
        <span style={{ color: "#2a1e38" }}>|</span>
        {selectedEtab?.logoUrl && <img src={selectedEtab.logoUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />}
        <span style={{ ...MONO, fontSize: ".88rem", color: PINK, fontWeight: 700, letterSpacing: ".05em" }}>
          🌙 {selectedEtab?.name}
        </span>
        <span style={{ ...MONO, fontSize: ".68rem", background: `rgba(255,45,120,.1)`, color: PINK, padding: "2px 9px", borderRadius: 20 }}>
          {prods.length} produits · {cats.length} catégories
        </span>
        <div style={{ marginLeft: "auto" }}>
          <a href="/" style={{ ...MONO, fontSize: ".72rem", color: "#f0eeff", textDecoration: "none", padding: "6px 13px", border: `1px solid rgba(255,255,255,.12)`, borderRadius: 6 }}>
            👁 APP →
          </a>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 54px)" }}>

        {/* LEFT: Categories */}
        <div style={{ width: 270, flexShrink: 0, borderRight: `1px solid ${BORDER_DIM}`, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...MONO, fontSize: ".68rem", color: PINK, letterSpacing: ".12em" }}>// CATÉGORIES</div>

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={catActive.emoji} onChange={e => setCatActive((c: any) => ({ ...c, emoji: e.target.value }))} style={{ width: 44, textAlign: "center", fontSize: "1.2rem", ...inp(), padding: "7px 4px" }} />
              <input value={catActive.label} placeholder="Nom de catégorie" onChange={e => setCatActive((c: any) => ({ ...c, label: e.target.value }))} onKeyDown={e => e.key === "Enter" && saveCat()} style={{ ...inp(), flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={saveCat} style={{ flex: 1, background: PINK, color: "#fff", border: "none", borderRadius: 6, padding: "8px", ...MONO, fontSize: ".75rem", cursor: "pointer", fontWeight: 700 }}>
                {editCat ? "✓ MODIFIER" : "+ AJOUTER"}
              </button>
              {editCat && <button onClick={() => setEditCat(null)} style={{ background: "transparent", border: `1px solid ${BORDER_DIM}`, color: "#5a5470", borderRadius: 6, padding: "8px 10px", ...MONO, fontSize: ".75rem", cursor: "pointer" }}>✕</button>}
            </div>
          </div>

          <button onClick={() => setCatFilter("all")}
            style={{ background: catFilter === "all" ? `rgba(255,45,120,.1)` : "transparent", border: catFilter === "all" ? `1px solid ${BORDER}` : "1px solid transparent", borderRadius: 8, padding: "9px 12px", color: catFilter === "all" ? PINK : "#7a7490", textAlign: "left", cursor: "pointer", ...MONO, fontSize: ".75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>📋 TOUS</span>
            <span style={{ background: "rgba(255,255,255,.08)", padding: "1px 7px", borderRadius: 10, fontSize: ".68rem" }}>{prods.length}</span>
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {cats.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, background: catFilter === c.key ? `rgba(255,45,120,.08)` : "transparent", border: catFilter === c.key ? `1px solid ${BORDER}` : "1px solid transparent", borderRadius: 8 }}>
                <button onClick={() => setCatFilter(c.key)} style={{ flex: 1, background: "transparent", border: "none", padding: "9px 10px", color: catFilter === c.key ? "#f0eeff" : "#a098b8", textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: ".87rem", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{c.emoji}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                  <span style={{ ...MONO, fontSize: ".65rem", color: "#5a5470", flexShrink: 0 }}>{prods.filter(p => p.cat === c.key).length}</span>
                </button>
                <button onClick={() => setEditCat(c)} style={{ background: "transparent", border: "none", color: "#4a4060", cursor: "pointer", padding: "6px 5px", fontSize: ".75rem" }}>✏️</button>
                <button onClick={() => deleteCat(c.id!)} style={{ background: "transparent", border: "none", color: "#3a2850", cursor: "pointer", padding: "6px 8px", fontSize: ".78rem" }}>✕</button>
              </div>
            ))}
          </div>

          {cats.length === 0 && (
            <div style={{ ...MONO, fontSize: ".7rem", color: "#3a2850", textAlign: "center", padding: "18px 12px", border: `1px dashed rgba(255,45,120,.1)`, borderRadius: 8, lineHeight: 1.8 }}>
              ① Ajoutez vos catégories<br /><span style={{ color: "#5a4468" }}>(ex: 🍹 Cocktails, 🍺 Bières)</span><br />② Puis ajoutez les produits
            </div>
          )}
        </div>

        {/* RIGHT: Products grid */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
            <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470", letterSpacing: ".1em" }}>
              // PRODUITS
              {catFilter !== "all" && <span style={{ color: PINK, marginLeft: 8 }}>→ {cats.find(c => c.key === catFilter)?.label?.toUpperCase()}</span>}
              <span style={{ color: "#3a2850", marginLeft: 8 }}>({filtered.length})</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={openImport} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: PINK, borderRadius: 8, padding: "9px 16px", ...MONO, fontSize: ".75rem", cursor: "pointer" }}>
                📥 IMPORTER
              </button>
              <button onClick={() => { setDrawer({ ...blankProd, cat: catFilter !== "all" ? catFilter : (cats[0]?.key ?? "") }); setDrawerSizes({ petite: "", grande: "", familiale: "" }); }}
                style={{ background: PINK, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", ...MONO, fontSize: ".78rem", cursor: "pointer", fontWeight: 700 }}>
                + NOUVEAU PRODUIT
              </button>
            </div>
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 24px", border: `1px dashed rgba(255,45,120,.1)`, borderRadius: 14 }}>
              <div style={{ fontSize: "3.5rem", marginBottom: 12 }}>🌙</div>
              <div style={{ ...MONO, fontSize: ".8rem", color: "#5a5470", marginBottom: 20, lineHeight: 1.7 }}>
                {prods.length === 0 ? "// Aucun produit\nCommencez par créer des catégories" : "// Aucun produit dans cette catégorie"}
              </div>
              {prods.length === 0 && (
                <button onClick={() => { setDrawer({ ...blankProd, cat: cats[0]?.key ?? "" }); setDrawerSizes({ petite: "", grande: "", familiale: "" }); }}
                  style={{ background: PINK, color: "#fff", border: "none", borderRadius: 8, padding: "11px 24px", ...MONO, fontSize: ".8rem", cursor: "pointer", fontWeight: 700 }}>
                  + AJOUTER LE 1ER PRODUIT
                </button>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
            {filtered.map(p => {
              const catLabel = cats.find(c => c.key === p.cat);
              return (
                <div key={p.id} style={{ background: CARD, border: `1px solid ${p.isActive === false ? BORDER_DIM : BORDER}`, borderRadius: 12, overflow: "hidden", opacity: p.isActive === false ? 0.55 : 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ height: 125, background: `rgba(255,45,120,.04)`, position: "relative", overflow: "hidden" }}>
                    {p.image ? <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", color: "#2a1838" }}>🌙</div>}
                    {p.badge && <span style={{ position: "absolute", top: 7, left: 7, background: PINK, color: "#fff", padding: "2px 8px", borderRadius: 4, ...MONO, fontSize: ".62rem" }}>{p.badge}</span>}
                    {p.isActive === false && <span style={{ position: "absolute", top: 7, right: 7, background: "rgba(0,0,0,.7)", color: "#7a7490", padding: "2px 8px", borderRadius: 4, ...MONO, fontSize: ".62rem" }}>MASQUÉ</span>}
                  </div>
                  <div style={{ padding: "10px 12px", flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>{p.name || "—"}</div>
                    <div style={{ color: PINK, fontWeight: 800, fontSize: ".9rem", ...MONO }}>{Number(p.price).toFixed(2)} €</div>
                    <div style={{ ...MONO, fontSize: ".65rem", color: "#5a5470", marginTop: 4 }}>{catLabel ? `${catLabel.emoji} ${catLabel.label}` : p.cat || "—"} · stock {p.stock}</div>
                  </div>
                  <div style={{ padding: "8px 10px", borderTop: `1px solid ${BORDER_DIM}`, display: "flex", gap: 5 }}>
                    <button onClick={() => { const { baseDesc, petite, grande, familiale } = extractSizePrices(p.desc || ""); setDrawer({ ...(p as Prod & { id?: string }), desc: baseDesc }); setDrawerSizes({ petite, grande, familiale }); }}
                      style={{ flex: 1, background: `rgba(255,45,120,.08)`, border: `1px solid ${BORDER}`, color: PINK, borderRadius: 6, padding: "6px", ...MONO, fontSize: ".7rem", cursor: "pointer" }}>✏️ ÉDITER</button>
                    <button onClick={() => toggleProd(p as Prod & { id?: string })} title={p.isActive === false ? "Activer" : "Masquer"}
                      style={{ background: "transparent", border: `1px solid ${BORDER_DIM}`, color: p.isActive === false ? "#b8ff00" : "#4a4060", borderRadius: 6, padding: "6px 8px", ...MONO, fontSize: ".7rem", cursor: "pointer" }}>
                      {p.isActive === false ? "ON" : "OFF"}
                    </button>
                    <button onClick={() => deleteProd(p.id!)} style={{ background: "transparent", border: "none", color: "#3a2850", cursor: "pointer", fontSize: ".8rem", padding: "6px 5px", borderRadius: 6 }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Import Modal ── */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 110, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowImport(false); }}>
          <div style={{ width: "100%", maxWidth: 600, background: "#0c0918", borderTop: `1px solid ${BORDER}`, borderRadius: "18px 18px 0 0", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${BORDER_DIM}`, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ ...MONO, fontSize: ".85rem", color: PINK, fontWeight: 700 }}>📥 IMPORTER DEPUIS YASSALA STORE</span>
                <button onClick={() => setShowImport(false)} style={{ background: "transparent", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem" }}>✕</button>
              </div>
              <input value={storeSearch} onChange={e => setStoreSearch(e.target.value)} placeholder="🔍 Rechercher..." style={{ width: "100%", background: BG, border: `1px solid ${BORDER_DIM}`, borderRadius: 8, padding: "9px 13px", color: "#f0eeff", fontSize: ".88rem", boxSizing: "border-box" }} />
              <div style={{ ...MONO, fontSize: ".65rem", color: "#5a5470", marginTop: 8 }}>
                {importSel.size > 0 ? `${importSel.size} sélectionné(s)` : `${storeProds.length} disponibles`}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 22px" }}>
              {storeProds.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", ...MONO, fontSize: ".8rem", color: "#5a5470" }}>// Aucun produit dans le Store</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {storeProds.filter(p => !storeSearch || p.name.toLowerCase().includes(storeSearch.toLowerCase())).map(p => {
                    const sel = importSel.has(p.id!);
                    return (
                      <div key={p.id} onClick={() => toggleImportSel(p.id!)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: sel ? `rgba(255,45,120,.08)` : "rgba(255,255,255,.02)", border: `1px solid ${sel ? BORDER : BORDER_DIM}`, borderRadius: 10, cursor: "pointer" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${sel ? PINK : "#5a5470"}`, background: sel ? PINK : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {sel && <span style={{ color: "#fff", fontSize: ".75rem", fontWeight: 700 }}>✓</span>}
                        </div>
                        {p.image && <img src={p.image} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: ".9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                          <div style={{ ...MONO, fontSize: ".7rem", color: PINK, marginTop: 2 }}>{Number(p.price).toFixed(2)} €</div>
                        </div>
                        {p.badge && <span style={{ ...MONO, fontSize: ".6rem", background: PINK, color: "#fff", padding: "2px 7px", borderRadius: 4 }}>{p.badge}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ padding: "14px 22px", borderTop: `1px solid ${BORDER_DIM}`, display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={doImport} disabled={importSel.size === 0 || importing}
                style={{ flex: 1, background: importSel.size === 0 ? `rgba(255,45,120,.3)` : PINK, color: "#fff", border: "none", borderRadius: 8, padding: "12px", ...MONO, fontSize: ".82rem", cursor: importSel.size === 0 ? "not-allowed" : "pointer", fontWeight: 700 }}>
                {importing ? "Import..." : importSel.size === 0 ? "Sélectionnez des produits" : `✓ IMPORTER ${importSel.size} PRODUIT(S)`}
              </button>
              <button onClick={() => setShowImport(false)} style={{ background: "transparent", border: `1px solid ${BORDER_DIM}`, color: "#5a5470", borderRadius: 8, padding: "12px 16px", ...MONO, fontSize: ".8rem", cursor: "pointer" }}>ANNULER</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Drawer ── */}
      {drawer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 100, display: "flex", justifyContent: "flex-end" }}
          onClick={e => { if (e.target === e.currentTarget) setDrawer(null); }}>
          <div style={{ width: "100%", maxWidth: 440, background: "#0c0918", borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: `1px solid ${BORDER_DIM}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ ...MONO, fontSize: ".8rem", color: PINK, letterSpacing: ".08em" }}>{drawer.id ? "// MODIFIER PRODUIT" : "// NOUVEAU PRODUIT"}</span>
              <button onClick={() => setDrawer(null)} style={{ background: "transparent", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem", padding: 4 }}>✕</button>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
              {/* Image */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 8 }}>IMAGE DU PRODUIT</label>
                <div onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onClick={() => imgRef.current?.click()}
                  style={{ height: 155, background: dragOver ? `rgba(255,45,120,.1)` : "rgba(255,255,255,.02)", border: `2px dashed ${dragOver ? PINK : "rgba(255,45,120,.25)"}`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", position: "relative" }}>
                  {drawer.image ? (
                    <><img src={drawer.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity .2s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = "0"; }}>
                        <span style={{ ...MONO, color: "#fff", fontSize: ".78rem" }}>📷 CHANGER</span>
                      </div></>
                  ) : (
                    <><div style={{ fontSize: "2.2rem", marginBottom: 8 }}>{uploading ? "⏳" : "📷"}</div>
                      <div style={{ ...MONO, fontSize: ".73rem", color: "#5a5470", textAlign: "center", lineHeight: 1.7 }}>{uploading ? "Upload..." : "Glisser ou cliquer"}</div></>
                  )}
                </div>
                <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) uploadImg(e.target.files[0]); }} />
              </div>
              {/* Name */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>NOM *</label>
                <input value={drawer.name} onChange={e => setDrawer(d => d && ({ ...d, name: e.target.value }))} placeholder="Ex: Mojito..." style={inp()} />
              </div>
              {/* Description */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>DESCRIPTION</label>
                <input value={drawer.desc} onChange={e => setDrawer(d => d && ({ ...d, desc: e.target.value }))} placeholder="Courte description" style={inp()} />
              </div>
              {/* Tailles */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>TAILLES & PRIX <span style={{ color: "#4a4060" }}>(optionnel)</span></label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {(["petite", "grande", "familiale"] as const).map(size => (
                    <div key={size}>
                      <div style={{ ...MONO, fontSize: ".62rem", color: "#5a5470", marginBottom: 4, textTransform: "uppercase" }}>{size}</div>
                      <div style={{ position: "relative" }}>
                        <input type="number" min={0} step={0.5} value={drawerSizes[size]} onChange={e => setDrawerSizes(s => ({ ...s, [size]: e.target.value }))} placeholder="0" style={inp({ paddingRight: "26px" })} />
                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#5a5470", fontSize: ".82rem", pointerEvents: "none" }}>€</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Price & Stock */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>PRIX (€) *</label>
                  <input type="number" min={0} step={0.01} value={drawer.price} onChange={e => setDrawer(d => d && ({ ...d, price: parseFloat(e.target.value) || 0 }))} style={inp({ color: PINK, fontWeight: 700, ...MONO })} />
                </div>
                <div>
                  <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>STOCK</label>
                  <input type="number" min={0} value={drawer.stock} onChange={e => setDrawer(d => d && ({ ...d, stock: parseInt(e.target.value) || 0 }))} style={inp()} />
                </div>
              </div>
              {/* Category */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>CATÉGORIE</label>
                {cats.length === 0
                  ? <div style={{ padding: "10px 13px", background: `rgba(255,45,120,.06)`, border: `1px solid ${BORDER}`, borderRadius: 8, ...MONO, fontSize: ".73rem", color: PINK }}>⚠️ Créez d'abord une catégorie</div>
                  : <select value={drawer.cat} onChange={e => setDrawer(d => d && ({ ...d, cat: e.target.value }))} style={inp({ cursor: "pointer" })}>
                      <option value="">— Choisir —</option>
                      {cats.map(c => <option key={c.id} value={c.key}>{c.emoji} {c.label}</option>)}
                    </select>
                }
              </div>
              {/* Badge */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>BADGE <span style={{ color: "#4a4060" }}>(optionnel)</span></label>
                <input value={drawer.badge} onChange={e => setDrawer(d => d && ({ ...d, badge: e.target.value }))} placeholder="NEW · PROMO · BEST" style={inp()} />
              </div>
              {/* Visibility */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "rgba(255,255,255,.02)", border: `1px solid ${BORDER_DIM}`, borderRadius: 8, cursor: "pointer" }}
                onClick={() => setDrawer(d => d && ({ ...d, isActive: d.isActive === false ? true : false }))}>
                <div style={{ width: 40, height: 22, borderRadius: 11, position: "relative", background: drawer.isActive !== false ? PINK : "rgba(255,255,255,.1)", transition: "background .2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: drawer.isActive !== false ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                </div>
                <span style={{ ...MONO, fontSize: ".75rem", color: drawer.isActive !== false ? PINK : "#5a5470" }}>{drawer.isActive !== false ? "VISIBLE PAR LES CLIENTS" : "MASQUÉ"}</span>
              </div>
            </div>
            <div style={{ padding: "14px 22px", borderTop: `1px solid ${BORDER_DIM}`, display: "flex", gap: 8 }}>
              <button onClick={saveProd} style={{ flex: 1, background: PINK, color: "#fff", border: "none", borderRadius: 8, padding: "12px", ...MONO, fontSize: ".82rem", cursor: "pointer", fontWeight: 700 }}>
                {drawer.id ? "✓ METTRE À JOUR" : "✓ AJOUTER AU MENU"}
              </button>
              <button onClick={() => setDrawer(null)} style={{ background: "transparent", border: `1px solid ${BORDER_DIM}`, color: "#5a5470", borderRadius: 8, padding: "12px 16px", ...MONO, fontSize: ".8rem", cursor: "pointer" }}>ANNULER</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
