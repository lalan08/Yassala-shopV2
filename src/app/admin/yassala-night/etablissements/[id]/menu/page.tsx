"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, where,
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

// ── Types ───────────────────────────────────────────────────────────────────
type Etab = { id?: string; name: string; logoUrl?: string; isActive: boolean };
type Cat  = { id?: string; key: string; label: string; emoji: string; order: number };
type Prod = { id?: string; name: string; desc: string; price: number; image: string; cat: string; badge: string; stock: number; isActive?: boolean };

function extractSizePrices(desc: string) {
  const idx = desc.indexOf(' • ');
  if (idx === -1) return { baseDesc: desc, petite: '', grande: '', familiale: '' };
  const base = desc.slice(0, idx);
  const parts = desc.slice(idx + 3).split(/\s*·\s*/);
  const res: Record<string, string> = {};
  for (const p of parts) {
    const m = p.trim().match(/^(Petite|Grande|Familiale)\s+([\d,]+)\s*€/);
    if (m) res[m[1].toLowerCase()] = m[2];
  }
  return { baseDesc: base, petite: res['petite'] || '', grande: res['grande'] || '', familiale: res['familiale'] || '' };
}

// ── Design tokens ────────────────────────────────────────────────────────────
const PINK       = "#ff2d78";
const BG         = "#080514";
const CARD       = "#0c0918";
const MONO       = { fontFamily: "'Share Tech Mono',monospace" } as const;
const BORDER     = "rgba(255,45,120,.18)";
const BORDER_DIM = "rgba(255,255,255,.07)";

const inp = (extra?: object) => ({
  width: "100%", background: "#080514", border: `1px solid ${BORDER_DIM}`,
  borderRadius: 8, padding: "10px 13px", color: "#f0eeff",
  fontSize: ".88rem", fontFamily: "'Inter',sans-serif", boxSizing: "border-box" as const,
  ...extra,
});

const blankProd: Omit<Prod, "id"> = {
  name: "", desc: "", price: 0, image: "", cat: "", badge: "", stock: 10, isActive: true,
};

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: ok ? "#0a2e1a" : "#2e0a14",
      border: `1px solid ${ok ? "rgba(184,255,0,.3)" : "rgba(255,45,120,.35)"}`,
      color: ok ? "#b8ff00" : PINK,
      padding: "12px 20px", borderRadius: 8, ...MONO, fontSize: ".82rem",
    }}>
      {msg}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function NightMenuPage() {
  const { id: etabId } = useParams() as { id: string };

  const [auth,  setAuth]  = useState(false);
  const [etab,  setEtab]  = useState<Etab | null>(null);
  const [cats,  setCats]  = useState<Cat[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);

  // Category inline form
  const [catForm, setCatForm] = useState({ emoji: "🍹", label: "", key: "" });
  const [editCat, setEditCat] = useState<Cat | null>(null);

  // Product drawer
  const [drawer,      setDrawer]      = useState<(Prod & { id?: string }) | null>(null);
  const [drawerSizes, setDrawerSizes] = useState({ petite: '', grande: '', familiale: '' });
  const [catFilter,   setCatFilter]   = useState("all");

  // Upload
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState({ msg: "", ok: true, show: false });
  const showMsg = (msg: string, ok = true) => {
    setToast({ msg, ok, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined")
      setAuth(!!localStorage.getItem("yassala_admin_auth"));
  }, []);

  // ── Firestore listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!auth || !etabId) return;
    return onSnapshot(doc(db, "night_etablissements", etabId), snap => {
      if (snap.exists()) setEtab({ id: snap.id, ...snap.data() } as Etab);
    });
  }, [auth, etabId]);

  useEffect(() => {
    if (!auth || !etabId) return;
    const byEtab = (col: string) =>
      query(collection(db, col), where("etablissementId", "==", etabId));

    const u1 = onSnapshot(byEtab("night_categories"), snap =>
      setCats(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Cat))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      )
    );
    const u2 = onSnapshot(byEtab("night_products"), snap =>
      setProds(snap.docs.map(d => ({ id: d.id, ...d.data() } as Prod)))
    );
    return () => { u1(); u2(); };
  }, [auth, etabId]);

  // ── Category CRUD ─────────────────────────────────────────────────────────
  const slugKey = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const saveCat = async () => {
    const f = editCat ?? catForm;
    if (!f.label.trim()) { showMsg("Nom requis", false); return; }
    const key = f.key.trim() || slugKey(f.label);
    if (editCat?.id) {
      await updateDoc(doc(db, "night_categories", editCat.id), { ...f, key, etablissementId: etabId });
      setEditCat(null);
      showMsg("Catégorie mise à jour ✓");
    } else {
      await addDoc(collection(db, "night_categories"), { ...f, key, order: cats.length, etablissementId: etabId });
      setCatForm({ emoji: "🍹", label: "", key: "" });
      showMsg("Catégorie ajoutée ✓");
    }
  };

  const deleteCat = async (id: string) => {
    if (!confirm("Supprimer cette catégorie ?")) return;
    await deleteDoc(doc(db, "night_categories", id));
    if (catFilter === cats.find(c => c.id === id)?.key) setCatFilter("all");
    showMsg("Catégorie supprimée");
  };

  // ── Product CRUD ──────────────────────────────────────────────────────────
  const saveProd = async () => {
    if (!drawer?.name.trim()) { showMsg("Nom requis", false); return; }
    const { id, ...data } = { ...drawer, etablissementId: etabId, updatedAt: new Date().toISOString() };
    const sizeParts: string[] = [];
    if (drawerSizes.petite)    sizeParts.push(`Petite ${drawerSizes.petite}€`);
    if (drawerSizes.grande)    sizeParts.push(`Grande ${drawerSizes.grande}€`);
    if (drawerSizes.familiale) sizeParts.push(`Familiale ${drawerSizes.familiale}€`);
    if (sizeParts.length > 0) data.desc = `${data.desc} • ${sizeParts.join(' · ')}`;
    if (id) {
      await updateDoc(doc(db, "night_products", id), data);
      showMsg("Produit mis à jour ✓");
    } else {
      await addDoc(collection(db, "night_products"), data);
      showMsg("Produit ajouté ✓");
    }
    setDrawer(null);
  };

  const deleteProd = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    await deleteDoc(doc(db, "night_products", id));
    showMsg("Produit supprimé");
  };

  const toggleProd = async (p: Prod & { id?: string }) => {
    if (!p.id) return;
    await updateDoc(doc(db, "night_products", p.id), { isActive: p.isActive === false ? true : false });
  };

  // ── Image upload ──────────────────────────────────────────────────────────
  const uploadImg = async (file: File) => {
    if (!file.type.startsWith("image/")) { showMsg("Fichier image requis", false); return; }
    setUploading(true);
    try {
      const r = ref(storage, `night_products/${Date.now()}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setDrawer(d => d ? { ...d, image: url } : d);
      showMsg("Image uploadée ✓");
    } catch { showMsg("Erreur upload image", false); }
    finally { setUploading(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadImg(file);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = catFilter === "all" ? prods : prods.filter(p => p.cat === catFilter);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!auth) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...MONO, color: "#5a5470" }}>Accès non autorisé. <a href="/admin" style={{ color: PINK }}>→ Admin</a></span>
    </div>
  );

  if (!etab) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...MONO, color: "#5a5470", fontSize: ".85rem" }}>Chargement...</span>
    </div>
  );

  const catActive = editCat ?? catForm;
  const setCatActive = editCat
    ? (fn: (c: Cat) => Cat) => setEditCat(c => c && fn(c))
    : (fn: (c: typeof catForm) => typeof catForm) => setCatForm(fn);

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#f0eeff", fontFamily: "'Inter',sans-serif" }}>
      {toast.show && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* ── Topbar ── */}
      <div style={{
        background: "rgba(12,9,24,.97)", borderBottom: `1px solid ${BORDER}`,
        padding: "0 20px", height: 54, display: "flex", alignItems: "center",
        gap: 12, position: "sticky", top: 0, zIndex: 40,
      }}>
        <a href="/admin/yassala-night/etablissements"
          style={{ ...MONO, fontSize: ".72rem", color: "#5a5470", textDecoration: "none" }}>
          ← LISTE
        </a>
        <span style={{ color: "#2a1e38" }}>|</span>
        {etab.logoUrl && (
          <img src={etab.logoUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />
        )}
        <span style={{ ...MONO, fontSize: ".88rem", color: PINK, fontWeight: 700, letterSpacing: ".05em" }}>
          🌙 {etab.name}
        </span>
        <span style={{ ...MONO, fontSize: ".68rem", background: "rgba(255,45,120,.1)", color: PINK, padding: "2px 9px", borderRadius: 20 }}>
          {prods.length} produits · {cats.length} catégories
        </span>
        <div style={{ marginLeft: "auto" }}>
          <a href="/"
            style={{ ...MONO, fontSize: ".72rem", color: "#f0eeff", textDecoration: "none", padding: "6px 13px", border: `1px solid rgba(255,255,255,.12)`, borderRadius: 6 }}>
            👁 APP →
          </a>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 54px)" }}>

        {/* ── LEFT: Categories ── */}
        <div style={{
          width: 270, flexShrink: 0, borderRight: `1px solid ${BORDER_DIM}`,
          padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ ...MONO, fontSize: ".68rem", color: PINK, letterSpacing: ".12em" }}>
            // CATÉGORIES
          </div>

          {/* Add / Edit form */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={catActive.emoji}
                onChange={e => setCatActive((c: any) => ({ ...c, emoji: e.target.value }))}
                style={{ width: 44, textAlign: "center", fontSize: "1.2rem", ...inp(), padding: "7px 4px" }}
              />
              <input
                value={catActive.label}
                placeholder="Nom de catégorie"
                onChange={e => setCatActive((c: any) => ({ ...c, label: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveCat()}
                style={{ ...inp(), flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={saveCat}
                style={{ flex: 1, background: PINK, color: "#fff", border: "none", borderRadius: 6, padding: "8px", ...MONO, fontSize: ".75rem", cursor: "pointer", fontWeight: 700 }}>
                {editCat ? "✓ MODIFIER" : "+ AJOUTER"}
              </button>
              {editCat && (
                <button onClick={() => setEditCat(null)}
                  style={{ background: "transparent", border: `1px solid ${BORDER_DIM}`, color: "#5a5470", borderRadius: 6, padding: "8px 10px", ...MONO, fontSize: ".75rem", cursor: "pointer" }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filter: All */}
          <button onClick={() => setCatFilter("all")}
            style={{
              background: catFilter === "all" ? "rgba(255,45,120,.1)" : "transparent",
              border: catFilter === "all" ? `1px solid ${BORDER}` : "1px solid transparent",
              borderRadius: 8, padding: "9px 12px", color: catFilter === "all" ? PINK : "#7a7490",
              textAlign: "left", cursor: "pointer", ...MONO, fontSize: ".75rem",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
            <span>📋 TOUS</span>
            <span style={{ background: "rgba(255,255,255,.08)", padding: "1px 7px", borderRadius: 10, fontSize: ".68rem" }}>{prods.length}</span>
          </button>

          {/* Category list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {cats.map(c => (
              <div key={c.id}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: catFilter === c.key ? "rgba(255,45,120,.08)" : "transparent",
                  border: catFilter === c.key ? `1px solid ${BORDER}` : "1px solid transparent",
                  borderRadius: 8,
                }}>
                <button onClick={() => setCatFilter(c.key)}
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    padding: "9px 10px", color: catFilter === c.key ? "#f0eeff" : "#a098b8",
                    textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: ".87rem",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  <span>{c.emoji}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                  <span style={{ ...MONO, fontSize: ".65rem", color: "#5a5470", flexShrink: 0 }}>
                    {prods.filter(p => p.cat === c.key).length}
                  </span>
                </button>
                <button onClick={() => setEditCat(c)}
                  title="Modifier"
                  style={{ background: "transparent", border: "none", color: "#4a4060", cursor: "pointer", padding: "6px 5px", fontSize: ".75rem" }}>
                  ✏️
                </button>
                <button onClick={() => deleteCat(c.id!)}
                  title="Supprimer"
                  style={{ background: "transparent", border: "none", color: "#3a2850", cursor: "pointer", padding: "6px 8px", fontSize: ".78rem" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {cats.length === 0 && (
            <div style={{
              ...MONO, fontSize: ".7rem", color: "#3a2850", textAlign: "center",
              padding: "18px 12px", border: "1px dashed rgba(255,45,120,.1)", borderRadius: 8, lineHeight: 1.8,
            }}>
              ① Ajoutez vos catégories<br />
              <span style={{ color: "#5a4468" }}>(ex: 🍹 Cocktails, 🍺 Bières)</span><br />
              ② Puis ajoutez les produits
            </div>
          )}
        </div>

        {/* ── RIGHT: Products grid ── */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
            <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470", letterSpacing: ".1em" }}>
              // PRODUITS
              {catFilter !== "all" && (
                <span style={{ color: PINK, marginLeft: 8 }}>
                  → {cats.find(c => c.key === catFilter)?.label?.toUpperCase()}
                </span>
              )}
              <span style={{ color: "#3a2850", marginLeft: 8 }}>({filtered.length})</span>
            </div>
            <button
              onClick={() => { setDrawer({ ...blankProd, cat: catFilter !== "all" ? catFilter : (cats[0]?.key ?? "") }); setDrawerSizes({ petite: '', grande: '', familiale: '' }); }}
              style={{
                background: PINK, color: "#fff", border: "none", borderRadius: 8,
                padding: "9px 20px", ...MONO, fontSize: ".78rem", cursor: "pointer", fontWeight: 700,
                letterSpacing: ".04em",
              }}>
              + NOUVEAU PRODUIT
            </button>
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{
              textAlign: "center", padding: "60px 24px",
              border: "1px dashed rgba(255,45,120,.1)", borderRadius: 14,
            }}>
              <div style={{ fontSize: "3.5rem", marginBottom: 12 }}>🌙</div>
              <div style={{ ...MONO, fontSize: ".8rem", color: "#5a5470", marginBottom: 20, lineHeight: 1.7 }}>
                {prods.length === 0
                  ? "// Aucun produit\nCommencez par créer des catégories\npuis ajoutez vos premiers produits"
                  : "// Aucun produit dans cette catégorie"}
              </div>
              {prods.length === 0 && (
                <button
                  onClick={() => { setDrawer({ ...blankProd, cat: cats[0]?.key ?? "" }); setDrawerSizes({ petite: '', grande: '', familiale: '' }); }}
                  style={{ background: PINK, color: "#fff", border: "none", borderRadius: 8, padding: "11px 24px", ...MONO, fontSize: ".8rem", cursor: "pointer", fontWeight: 700 }}>
                  + AJOUTER LE 1ER PRODUIT
                </button>
              )}
            </div>
          )}

          {/* Product cards grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
            {filtered.map(p => {
              const catLabel = cats.find(c => c.key === p.cat);
              return (
                <div key={p.id}
                  style={{
                    background: CARD, border: `1px solid ${p.isActive === false ? BORDER_DIM : BORDER}`,
                    borderRadius: 12, overflow: "hidden", opacity: p.isActive === false ? 0.55 : 1,
                    display: "flex", flexDirection: "column", transition: "border-color .15s",
                  }}>
                  {/* Image */}
                  <div style={{ height: 125, background: "rgba(255,45,120,.04)", position: "relative", overflow: "hidden" }}>
                    {p.image
                      ? <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem", color: "#2a1838" }}>🌙</div>
                    }
                    {p.badge && (
                      <span style={{ position: "absolute", top: 7, left: 7, background: PINK, color: "#fff", padding: "2px 8px", borderRadius: 4, ...MONO, fontSize: ".62rem", letterSpacing: ".06em" }}>
                        {p.badge}
                      </span>
                    )}
                    {p.isActive === false && (
                      <span style={{ position: "absolute", top: 7, right: 7, background: "rgba(0,0,0,.7)", color: "#7a7490", padding: "2px 8px", borderRadius: 4, ...MONO, fontSize: ".62rem" }}>
                        MASQUÉ
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ padding: "10px 12px", flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
                      {p.name || "—"}
                    </div>
                    <div style={{ color: PINK, fontWeight: 800, fontSize: ".9rem", ...MONO }}>
                      {Number(p.price).toFixed(2)} €
                    </div>
                    <div style={{ ...MONO, fontSize: ".65rem", color: "#5a5470", marginTop: 4 }}>
                      {catLabel ? `${catLabel.emoji} ${catLabel.label}` : p.cat || "—"} · stock {p.stock}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ padding: "8px 10px", borderTop: `1px solid ${BORDER_DIM}`, display: "flex", gap: 5 }}>
                    <button onClick={() => {
                      const { baseDesc, petite, grande, familiale } = extractSizePrices(p.desc || '');
                      setDrawer({ ...(p as Prod & { id?: string }), desc: baseDesc });
                      setDrawerSizes({ petite, grande, familiale });
                    }}
                      style={{ flex: 1, background: "rgba(255,45,120,.08)", border: `1px solid ${BORDER}`, color: PINK, borderRadius: 6, padding: "6px", ...MONO, fontSize: ".7rem", cursor: "pointer" }}>
                      ✏️ ÉDITER
                    </button>
                    <button onClick={() => toggleProd(p as Prod & { id?: string })}
                      title={p.isActive === false ? "Activer" : "Masquer"}
                      style={{ background: "transparent", border: `1px solid ${BORDER_DIM}`, color: p.isActive === false ? "#b8ff00" : "#4a4060", borderRadius: 6, padding: "6px 8px", ...MONO, fontSize: ".7rem", cursor: "pointer" }}>
                      {p.isActive === false ? "ON" : "OFF"}
                    </button>
                    <button onClick={() => deleteProd(p.id!)}
                      style={{ background: "transparent", border: "none", color: "#3a2850", cursor: "pointer", fontSize: ".8rem", padding: "6px 5px", borderRadius: 6 }}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Product Drawer ── */}
      {drawer && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 100, display: "flex", justifyContent: "flex-end" }}
          onClick={e => { if (e.target === e.currentTarget) setDrawer(null); }}>
          <div style={{
            width: "100%", maxWidth: 440, background: "#0c0918",
            borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}>
            {/* Header */}
            <div style={{ padding: "16px 22px", borderBottom: `1px solid ${BORDER_DIM}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ ...MONO, fontSize: ".8rem", color: PINK, letterSpacing: ".08em" }}>
                {drawer.id ? "// MODIFIER PRODUIT" : "// NOUVEAU PRODUIT"}
              </span>
              <button onClick={() => setDrawer(null)}
                style={{ background: "transparent", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem", padding: 4 }}>
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>

              {/* Image drag zone */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 8 }}>
                  IMAGE DU PRODUIT
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onClick={() => imgRef.current?.click()}
                  style={{
                    height: 155, background: dragOver ? "rgba(255,45,120,.1)" : "rgba(255,255,255,.02)",
                    border: `2px dashed ${dragOver ? PINK : "rgba(255,45,120,.25)"}`,
                    borderRadius: 12, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", cursor: "pointer",
                    transition: "all .2s", overflow: "hidden", position: "relative",
                  }}>
                  {drawer.image ? (
                    <>
                      <img src={drawer.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{
                        position: "absolute", inset: 0, background: "rgba(0,0,0,.45)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: 0, transition: "opacity .2s",
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = "0"; }}>
                        <span style={{ ...MONO, color: "#fff", fontSize: ".78rem" }}>📷 CHANGER</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>{uploading ? "⏳" : "📷"}</div>
                      <div style={{ ...MONO, fontSize: ".73rem", color: "#5a5470", textAlign: "center", lineHeight: 1.7 }}>
                        {uploading ? "Upload en cours..." : "Glisser une image ici\nou cliquer pour choisir"}
                      </div>
                    </>
                  )}
                </div>
                <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) uploadImg(e.target.files[0]); }} />
              </div>

              {/* Name */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>NOM *</label>
                <input
                  value={drawer.name}
                  onChange={e => setDrawer(d => d && ({ ...d, name: e.target.value }))}
                  placeholder="Ex: Mojito, Assiette charcuterie..."
                  style={inp()}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>DESCRIPTION</label>
                <input
                  value={drawer.desc}
                  onChange={e => setDrawer(d => d && ({ ...d, desc: e.target.value }))}
                  placeholder="Courte description"
                  style={inp()}
                />
              </div>

              {/* Tailles */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>
                  TAILLES & PRIX <span style={{ color: "#4a4060" }}>(optionnel)</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {(["petite", "grande", "familiale"] as const).map(size => (
                    <div key={size}>
                      <div style={{ ...MONO, fontSize: ".62rem", color: "#5a5470", marginBottom: 4, textTransform: "uppercase" }}>{size}</div>
                      <div style={{ position: "relative" }}>
                        <input
                          type="number" min={0} step={0.5}
                          value={drawerSizes[size]}
                          onChange={e => setDrawerSizes(s => ({ ...s, [size]: e.target.value }))}
                          placeholder="0"
                          style={inp({ paddingRight: "26px" })}
                        />
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
                  <input
                    type="number" min={0} step={0.01}
                    value={drawer.price}
                    onChange={e => setDrawer(d => d && ({ ...d, price: parseFloat(e.target.value) || 0 }))}
                    style={inp({ color: PINK, fontWeight: 700, ...MONO })}
                  />
                </div>
                <div>
                  <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>STOCK</label>
                  <input
                    type="number" min={0}
                    value={drawer.stock}
                    onChange={e => setDrawer(d => d && ({ ...d, stock: parseInt(e.target.value) || 0 }))}
                    style={inp()}
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>CATÉGORIE</label>
                {cats.length === 0 ? (
                  <div style={{ padding: "10px 13px", background: "rgba(255,45,120,.06)", border: `1px solid ${BORDER}`, borderRadius: 8, ...MONO, fontSize: ".73rem", color: PINK }}>
                    ⚠️ Créez d'abord une catégorie (panneau gauche)
                  </div>
                ) : (
                  <select
                    value={drawer.cat}
                    onChange={e => setDrawer(d => d && ({ ...d, cat: e.target.value }))}
                    style={inp({ cursor: "pointer" })}>
                    <option value="">— Choisir —</option>
                    {cats.map(c => <option key={c.id} value={c.key}>{c.emoji} {c.label}</option>)}
                  </select>
                )}
              </div>

              {/* Badge */}
              <div>
                <label style={{ ...MONO, fontSize: ".68rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>BADGE <span style={{ color: "#4a4060" }}>(optionnel)</span></label>
                <input
                  value={drawer.badge}
                  onChange={e => setDrawer(d => d && ({ ...d, badge: e.target.value }))}
                  placeholder="NEW · PROMO · BEST"
                  style={inp()}
                />
              </div>

              {/* Visibility toggle */}
              <div
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "rgba(255,255,255,.02)", border: `1px solid ${BORDER_DIM}`, borderRadius: 8, cursor: "pointer" }}
                onClick={() => setDrawer(d => d && ({ ...d, isActive: d.isActive === false ? true : false }))}>
                <div style={{
                  width: 40, height: 22, borderRadius: 11, position: "relative",
                  background: drawer.isActive !== false ? PINK : "rgba(255,255,255,.1)",
                  transition: "background .2s", flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: 2, left: drawer.isActive !== false ? 20 : 2,
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#fff", transition: "left .2s",
                  }} />
                </div>
                <span style={{ ...MONO, fontSize: ".75rem", color: drawer.isActive !== false ? PINK : "#5a5470" }}>
                  {drawer.isActive !== false ? "VISIBLE PAR LES CLIENTS" : "MASQUÉ"}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 22px", borderTop: `1px solid ${BORDER_DIM}`, display: "flex", gap: 8 }}>
              <button onClick={saveProd}
                style={{ flex: 1, background: PINK, color: "#fff", border: "none", borderRadius: 8, padding: "12px", ...MONO, fontSize: ".82rem", cursor: "pointer", fontWeight: 700 }}>
                {drawer.id ? "✓ METTRE À JOUR" : "✓ AJOUTER AU MENU"}
              </button>
              <button onClick={() => setDrawer(null)}
                style={{ background: "transparent", border: `1px solid ${BORDER_DIM}`, color: "#5a5470", borderRadius: 8, padding: "12px 16px", ...MONO, fontSize: ".8rem", cursor: "pointer" }}>
                ANNULER
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
