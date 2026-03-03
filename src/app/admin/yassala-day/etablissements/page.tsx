"use client";

import { useEffect, useState, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp,
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

type Etablissement = {
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  coverUrl?: string;
  openHours?: string;
  isActive: boolean;
  createdAt?: string;
  // Champs d'affichage carte
  category?: string;
  tags?: string;
  emoji?: string;
  bgColor?: string;
  promo?: string;
  isOpen?: boolean;
  closeTime?: string;
  isComingSoon?: boolean;
  deliveryMin?: number;
  deliveryMax?: number;
  deliveryFee?: number;
  rating?: number;
  reviewCount?: number;
};

const blankForm: Omit<Etablissement, "id"> = {
  name: "", slug: "", description: "", address: "", phone: "",
  logoUrl: "", coverUrl: "", openHours: "08:00–21:00", isActive: true,
  category: "", tags: "", emoji: "🏪", bgColor: "#FEF3C7",
  promo: "", isOpen: true, closeTime: "", isComingSoon: false,
  deliveryMin: 20, deliveryMax: 35, deliveryFee: 2,
  rating: 4.5, reviewCount: 0,
};

const S = {
  page: { minHeight: "100vh", background: "#080514", color: "#f0eeff", fontFamily: "'Inter',sans-serif" },
  topbar: { background: "rgba(12,9,24,.95)", borderBottom: "1px solid rgba(251,191,36,.12)", padding: "0 28px", height: 56, display: "flex" as const, alignItems: "center" as const, gap: 16, position: "sticky" as const, top: 0, zIndex: 40 },
  content: { maxWidth: 1000, margin: "0 auto", padding: "32px 24px" },
  card: { background: "#0c0918", border: "1px solid rgba(251,191,36,.15)", borderRadius: 10, padding: "24px 28px" },
  label: { fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#7a7490", letterSpacing: ".1em", marginBottom: 6, display: "block" as const },
  input: { width: "100%", background: "#080514", border: "1px solid rgba(255,255,255,.12)", borderRadius: 6, padding: "10px 14px", color: "#f0eeff", fontSize: ".9rem", fontFamily: "'Inter',sans-serif", boxSizing: "border-box" as const },
  btnPrimary: { background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#000", border: "none", borderRadius: 6, padding: "11px 24px", fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem", letterSpacing: ".08em", cursor: "pointer", fontWeight: 700 },
  btnGhost: { background: "transparent", border: "1px solid rgba(255,255,255,.12)", color: "#7a7490", borderRadius: 6, padding: "11px 18px", fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem", cursor: "pointer" },
  btnDanger: { background: "transparent", border: "1px solid rgba(255,45,120,.25)", color: "#ff2d78", borderRadius: 6, padding: "8px 14px", fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", cursor: "pointer" },
  badge: (active: boolean) => ({ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4, fontSize: ".7rem", fontFamily: "'Share Tech Mono',monospace", letterSpacing: ".08em", background: active ? "rgba(184,255,0,.12)" : "rgba(255,255,255,.06)", color: active ? "#b8ff00" : "#5a5470" }),
};

export default function EtablissementsPage() {
  const [auth, setAuth] = useState(false);
  const [etablissements, setEtablissements] = useState<Etablissement[]>([]);
  const [form, setForm] = useState<Omit<Etablissement, "id">>(blankForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState({ msg: "", show: false, ok: true });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const quickLogoRef = useRef<HTMLInputElement>(null);
  const [quickLogoEtabId, setQuickLogoEtabId] = useState<string | null>(null);
  const [quickLogoLoading, setQuickLogoLoading] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setAuth(!!localStorage.getItem("yassala_admin_auth"));
  }, []);

  useEffect(() => {
    if (!auth) return;
    return onSnapshot(collection(db, "day_etablissements"), snap => {
      setEtablissements(
        snap.docs.map(d => ({ id: d.id, ...d.data() } as Etablissement))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      );
    });
  }, [auth]);

  const showMsg = (msg: string, ok = true) => {
    setToast({ msg, show: true, ok });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const r = ref(storage, `day_etablissements/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setForm(f => ({ ...f, logoUrl: url }));
      showMsg("Logo uploadé ✓");
    } catch { showMsg("Erreur upload logo", false); }
    finally { setUploading(false); }
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const r = ref(storage, `day_etablissements/covers/${Date.now()}_${file.name}`);
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
      const r = ref(storage, `day_etablissements/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, "day_etablissements", etabId), { logoUrl: url });
      showMsg("Logo mis à jour ✓");
    } catch { showMsg("Erreur upload logo", false); }
    finally { setQuickLogoLoading(null); setQuickLogoEtabId(null); }
  };

  const save = async () => {
    if (!form.name.trim()) { showMsg("Nom requis", false); return; }
    const data = {
      ...form,
      slug: form.slug?.trim() || slugify(form.name),
      updatedAt: new Date().toISOString(),
    };
    if (editId) {
      await updateDoc(doc(db, "day_etablissements", editId), data);
      showMsg("Établissement mis à jour ✓");
    } else {
      await addDoc(collection(db, "day_etablissements"), { ...data, createdAt: new Date().toISOString() });
      showMsg("Établissement créé ✓");
    }
    setForm(blankForm);
    setEditId(null);
    setShowForm(false);
  };

  const toggleStatus = async (etab: Etablissement) => {
    if (!etab.id) return;
    await updateDoc(doc(db, "day_etablissements", etab.id), { isActive: !etab.isActive });
    showMsg(etab.isActive ? "Établissement désactivé" : "Établissement activé ✓");
  };

  const remove = async (etab: Etablissement) => {
    if (!etab.id) return;
    if (!confirm(`Supprimer "${etab.name}" ? Cette action est irréversible.`)) return;
    await deleteDoc(doc(db, "day_etablissements", etab.id));
    showMsg("Établissement supprimé");
  };

  const startEdit = (etab: Etablissement) => {
    setForm({ name: etab.name, slug: etab.slug || "", description: etab.description || "", address: etab.address || "", phone: etab.phone || "", logoUrl: etab.logoUrl || "", coverUrl: etab.coverUrl || "", openHours: etab.openHours || "08:00–21:00", isActive: etab.isActive });
    setEditId(etab.id!);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!auth) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", fontFamily: "'Share Tech Mono',monospace", color: "#5a5470", fontSize: ".85rem" }}>
          Accès non autorisé. <a href="/admin" style={{ color: "#fbbf24" }}>→ Admin</a>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {/* Input caché pour changement rapide de logo depuis la liste */}
      <input ref={quickLogoRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && quickLogoEtabId) handleQuickLogo(file, quickLogoEtabId);
          e.target.value = "";
        }} />
      {/* Input caché pour upload de la cover */}
      <input ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => { if (e.target.files?.[0]) handleCoverUpload(e.target.files[0]); e.target.value = ""; }} />

      {/* Toast */}
      {toast.show && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: toast.ok ? "#0f5132" : "#5c0a1f", border: `1px solid ${toast.ok ? "rgba(184,255,0,.3)" : "rgba(255,45,120,.3)"}`, color: toast.ok ? "#b8ff00" : "#ff2d78", padding: "12px 20px", borderRadius: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: ".82rem", letterSpacing: ".08em" }}>
          {toast.msg}
        </div>
      )}

      {/* Topbar */}
      <div style={S.topbar}>
        <a href="/admin/yassala-day" style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#5a5470", textDecoration: "none" }}>← DASHBOARD</a>
        <span style={{ color: "#3a3450" }}>|</span>
        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem", color: "#fbbf24", letterSpacing: ".1em", fontWeight: 700 }}>
          🏪 ÉTABLISSEMENTS
        </span>
        <button onClick={() => { setForm(blankForm); setEditId(null); setShowForm(v => !v); }}
          style={{ ...S.btnPrimary, marginLeft: "auto", padding: "8px 18px", fontSize: ".78rem" }}>
          {showForm && !editId ? "✕ FERMER" : "+ NOUVEL ÉTABLISSEMENT"}
        </button>
      </div>

      <div style={S.content}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: "1.6rem", margin: 0, marginBottom: 4 }}>
            🏪 <span style={{ color: "#fbbf24" }}>ÉTABLISSEMENTS YASSALA DAY</span>
          </h1>
          <p style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", margin: 0 }}>
            {etablissements.length} établissement{etablissements.length !== 1 ? "s" : ""} · {etablissements.filter(e => e.isActive).length} actif{etablissements.filter(e => e.isActive).length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Formulaire création/édition */}
        {showForm && (
          <div style={{ ...S.card, marginBottom: 28 }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#fbbf24", letterSpacing: ".12em", marginBottom: 20 }}>
              {editId ? "// MODIFIER L'ÉTABLISSEMENT" : "// NOUVEL ÉTABLISSEMENT"}
            </div>
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={S.label}>NOM *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Boulangerie Soleil" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>SLUG (URL)</label>
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="boulangerie-soleil" style={{ ...S.input, fontFamily: "'Share Tech Mono',monospace" }} />
                </div>
              </div>
              <div>
                <label style={S.label}>DESCRIPTION</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Courte description affichée aux clients" style={S.input} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={S.label}>ADRESSE</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Ex: 12 rue des Flamboyants, Cayenne" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>TÉLÉPHONE</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+594 XXX XXX" style={S.input} />
                </div>
              </div>
              {/* ── IMAGES : Logo + Cover ── */}
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#fbbf24", letterSpacing: ".1em", marginBottom: -4 }}>// IMAGES</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "16px 18px", background: "rgba(251,191,36,.04)", border: "1px solid rgba(251,191,36,.12)", borderRadius: 10 }}>
                {/* Logo */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <label style={S.label}>LOGO</label>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); e.target.value = ""; }} />
                  <div onClick={() => !uploading && logoInputRef.current?.click()}
                    style={{ width: 80, height: 80, borderRadius: 14, border: `2px dashed ${form.logoUrl ? "rgba(251,191,36,.45)" : "rgba(255,255,255,.18)"}`, background: form.logoUrl ? "#000" : "rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", opacity: uploading ? 0.6 : 1 }}>
                    {uploading ? <span style={{ fontSize: "1.5rem" }}>⏳</span> : form.logoUrl ? <img src={form.logoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "2rem" }}>{form.emoji || "🏪"}</span>}
                  </div>
                  <span onClick={() => !uploading && logoInputRef.current?.click()} style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".62rem", color: "#5a5470", cursor: "pointer", textAlign: "center" as const }}>
                    {uploading ? "UPLOAD..." : form.logoUrl ? "CHANGER" : "AJOUTER LOGO"}
                  </span>
                  <input value={form.logoUrl} onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="URL logo..." style={{ ...S.input, fontSize: ".72rem", marginTop: 4 }} />
                </div>
                {/* Cover */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <label style={S.label}>COVER (BANNIÈRE)</label>
                  <div onClick={() => !uploadingCover && coverInputRef.current?.click()}
                    style={{ width: "100%", height: 80, borderRadius: 10, border: `2px dashed ${form.coverUrl ? "rgba(251,191,36,.45)" : "rgba(255,255,255,.18)"}`, background: form.coverUrl ? "#000" : form.bgColor || "rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", opacity: uploadingCover ? 0.6 : 1, position: "relative" as const }}>
                    {uploadingCover ? <span style={{ fontSize: "1.5rem" }}>⏳</span> : form.coverUrl ? <img src={form.coverUrl} alt="Cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: "2rem", opacity: 0.4 }}>{form.emoji || "🖼️"}</span>}
                  </div>
                  <span onClick={() => !uploadingCover && coverInputRef.current?.click()} style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".62rem", color: "#5a5470", cursor: "pointer", textAlign: "center" as const }}>
                    {uploadingCover ? "UPLOAD..." : form.coverUrl ? "CHANGER" : "AJOUTER COVER"}
                  </span>
                  <input value={form.coverUrl} onChange={e => setForm(f => ({ ...f, coverUrl: e.target.value }))} placeholder="URL cover..." style={{ ...S.input, fontSize: ".72rem", marginTop: 4 }} />
                </div>
              </div>

              {/* ── AFFICHAGE CARTE ── */}
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#fbbf24", letterSpacing: ".1em", marginBottom: -4 }}>// AFFICHAGE CARTE</div>
              <div style={{ display: "grid", gap: 14, padding: "16px 18px", background: "rgba(255,45,120,.03)", border: "1px solid rgba(255,45,120,.12)", borderRadius: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={S.label}>CATÉGORIE</label>
                    <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ex: restauration, epicerie" style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>TAGS (séparés par virgule)</label>
                    <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Ex: Créole, Fait maison" style={S.input} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 14 }}>
                  <div>
                    <label style={S.label}>EMOJI</label>
                    <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🍲" style={{ ...S.input, fontSize: "1.2rem", textAlign: "center" as const }} />
                  </div>
                  <div>
                    <label style={S.label}>COULEUR FOND (si pas de cover)</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="color" value={form.bgColor || "#FEF3C7"} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} style={{ width: 40, height: 38, borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", cursor: "pointer", padding: 2, background: "transparent" }} />
                      <input value={form.bgColor} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} placeholder="#FEF3C7" style={{ ...S.input, flex: 1 }} />
                    </div>
                  </div>
                </div>
                <div>
                  <label style={S.label}>BADGE PROMO (affiché sur la carte)</label>
                  <input value={form.promo} onChange={e => setForm(f => ({ ...f, promo: e.target.value }))} placeholder="Ex: -10€ dès 35€ · 1 acheté = 1 offert · Livraison 0€" style={S.input} />
                </div>
              </div>

              {/* ── LIVRAISON & NOTE ── */}
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#fbbf24", letterSpacing: ".1em", marginBottom: -4 }}>// LIVRAISON & NOTE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={S.label}>DÉLAI MIN (min)</label>
                  <input type="number" value={form.deliveryMin ?? ""} onChange={e => setForm(f => ({ ...f, deliveryMin: Number(e.target.value) }))} placeholder="20" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>DÉLAI MAX (min)</label>
                  <input type="number" value={form.deliveryMax ?? ""} onChange={e => setForm(f => ({ ...f, deliveryMax: Number(e.target.value) }))} placeholder="35" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>FRAIS LIVRAISON (€)</label>
                  <input type="number" step="0.5" value={form.deliveryFee ?? ""} onChange={e => setForm(f => ({ ...f, deliveryFee: Number(e.target.value) }))} placeholder="2" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>NOTE (/5)</label>
                  <input type="number" step="0.1" min="0" max="5" value={form.rating ?? ""} onChange={e => setForm(f => ({ ...f, rating: Number(e.target.value) }))} placeholder="4.5" style={S.input} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={S.label}>NB AVIS</label>
                  <input type="number" value={form.reviewCount ?? ""} onChange={e => setForm(f => ({ ...f, reviewCount: Number(e.target.value) }))} placeholder="0" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>HORAIRES D'OUVERTURE</label>
                  <input value={form.openHours} onChange={e => setForm(f => ({ ...f, openHours: e.target.value }))} placeholder="08:00–21:00" style={S.input} />
                </div>
              </div>

              {/* ── STATUTS ── */}
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#fbbf24", letterSpacing: ".1em", marginBottom: -4 }}>// STATUTS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, padding: "16px 18px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10 }}>
                {/* isActive */}
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  <label style={{ ...S.label, margin: 0 }}>VISIBLE (actif)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                      style={{ width: 44, height: 24, borderRadius: 12, position: "relative" as const, cursor: "pointer", background: form.isActive ? "#fbbf24" : "rgba(255,255,255,.1)", transition: "background .2s", flexShrink: 0 }}>
                      <div style={{ position: "absolute" as const, top: 3, left: form.isActive ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                    </div>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: form.isActive ? "#fbbf24" : "#5a5470" }}>
                      {form.isActive ? "ACTIF" : "INACTIF"}
                    </span>
                  </div>
                </div>
                {/* isOpen */}
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  <label style={{ ...S.label, margin: 0 }}>OUVERT MAINTENANT</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div onClick={() => setForm(f => ({ ...f, isOpen: !f.isOpen }))}
                      style={{ width: 44, height: 24, borderRadius: 12, position: "relative" as const, cursor: "pointer", background: form.isOpen ? "#22c55e" : "rgba(255,255,255,.1)", transition: "background .2s", flexShrink: 0 }}>
                      <div style={{ position: "absolute" as const, top: 3, left: form.isOpen ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                    </div>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: form.isOpen ? "#22c55e" : "#5a5470" }}>
                      {form.isOpen ? "OUVERT" : "FERMÉ"}
                    </span>
                  </div>
                  {!form.isOpen && (
                    <input value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} placeholder="Fermé à... (ex: 23:00)" style={{ ...S.input, fontSize: ".8rem" }} />
                  )}
                </div>
                {/* isComingSoon */}
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  <label style={{ ...S.label, margin: 0 }}>PROCHAINEMENT</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div onClick={() => setForm(f => ({ ...f, isComingSoon: !f.isComingSoon }))}
                      style={{ width: 44, height: 24, borderRadius: 12, position: "relative" as const, cursor: "pointer", background: form.isComingSoon ? "#a855f7" : "rgba(255,255,255,.1)", transition: "background .2s", flexShrink: 0 }}>
                      <div style={{ position: "absolute" as const, top: 3, left: form.isComingSoon ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                    </div>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: form.isComingSoon ? "#a855f7" : "#5a5470" }}>
                      {form.isComingSoon ? "BIENTÔT" : "NORMAL"}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button onClick={save} style={S.btnPrimary}>
                  {editId ? "✓ METTRE À JOUR" : "✓ CRÉER"}
                </button>
                <button onClick={() => { setForm(blankForm); setEditId(null); setShowForm(false); }} style={S.btnGhost}>
                  ANNULER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Liste */}
        {etablissements.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", border: "1px dashed rgba(251,191,36,.15)", borderRadius: 12 }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>🏪</div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".85rem", color: "#5a5470", marginBottom: 16 }}>
              // Aucun établissement configuré
            </div>
            <button onClick={() => setShowForm(true)} style={S.btnPrimary}>
              + CRÉER LE PREMIER ÉTABLISSEMENT
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {etablissements.map(etab => (
              <div key={etab.id} style={{ background: "rgba(255,255,255,.02)", border: `1px solid ${etab.isActive ? "rgba(251,191,36,.18)" : "rgba(255,255,255,.05)"}`, borderRadius: 12, padding: "16px 22px", display: "flex", alignItems: "center", gap: 18, opacity: etab.isActive ? 1 : 0.65, transition: "all .15s" }}>
                {/* Logo — cliquable pour changer */}
                <div title="Cliquer pour changer le logo" onClick={() => { setQuickLogoEtabId(etab.id!); setTimeout(() => quickLogoRef.current?.click(), 10); }}
                  style={{ width: 52, height: 52, borderRadius: 10, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", flexShrink: 0, overflow: "hidden", cursor: "pointer", position: "relative" }}>
                  {quickLogoLoading === etab.id ? (
                    <span style={{ fontSize: "1.2rem" }}>⏳</span>
                  ) : etab.logoUrl ? (
                    <img src={etab.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : "🏪"}
                </div>

                {/* Infos */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                    {etab.name}
                    <span style={S.badge(etab.isActive)}>{etab.isActive ? "ACTIF" : "INACTIF"}</span>
                  </div>
                  {etab.description && (
                    <div style={{ fontSize: ".8rem", color: "#7a7490", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {etab.description}
                    </div>
                  )}
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#4b4468", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" as const }}>
                    {etab.address && <span>📍 {etab.address}</span>}
                    {etab.phone && <span>📞 {etab.phone}</span>}
                    {etab.openHours && <span>🕐 {etab.openHours}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" as const }}>
                  {/* Toggle statut */}
                  <button onClick={() => toggleStatus(etab)}
                    style={{ background: "transparent", border: etab.isActive ? "1px solid rgba(255,255,255,.1)" : "1px solid rgba(184,255,0,.3)", color: etab.isActive ? "#5a5470" : "#b8ff00", padding: "8px 14px", borderRadius: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", cursor: "pointer" }}>
                    {etab.isActive ? "⏸ DÉSACTIVER" : "✓ ACTIVER"}
                  </button>
                  {/* Modifier */}
                  <button onClick={() => startEdit(etab)}
                    style={{ background: "transparent", border: "1px solid rgba(251,191,36,.3)", color: "#fbbf24", padding: "8px 14px", borderRadius: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", cursor: "pointer" }}>
                    ✏️ MODIFIER
                  </button>
                  {/* Gérer menu (raccourci) */}
                  <a href={`/admin/yassala-day/etablissements/${etab.id}/menu`}
                    style={{ background: "linear-gradient(135deg,#ff2d78,#e01060)", color: "#fff", padding: "8px 16px", borderRadius: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                    📋 MENU
                  </a>
                  {/* Gérer (fiche complète) */}
                  <a href={`/admin/yassala-day/etablissements/${etab.id}`}
                    style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#000", padding: "8px 16px", borderRadius: 6, fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                    ⚙ OPTIONS
                  </a>
                  {/* Supprimer */}
                  <button onClick={() => remove(etab)} style={S.btnDanger}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
