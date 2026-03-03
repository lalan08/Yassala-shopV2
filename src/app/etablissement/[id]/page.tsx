"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, doc, onSnapshot, updateDoc,
  collection, query, where, getCountFromServer,
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

const PINK = "#ff2d78";
const GOLD = "#fbbf24";
const BG = "#08050f";
const CARD = "#0c0918";
const MONO = { fontFamily: "'Share Tech Mono',monospace" } as const;

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
  isOpen?: boolean;
  closeTime?: string;
  deliveryMin?: number;
  deliveryMax?: number;
  deliveryFee?: number;
};

type EtabAuth = { id: string; name: string; slug: string };

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: ok ? "#0a2e1a" : "#2e0a14",
      border: `1px solid ${ok ? "rgba(184,255,0,.3)" : "rgba(255,45,120,.35)"}`,
      color: ok ? "#b8ff00" : PINK,
      padding: "12px 20px", borderRadius: 8,
      ...MONO, fontSize: ".82rem",
    }}>
      {msg}
    </div>
  );
}

export default function EtablissementDashboard() {
  const { id: etabId } = useParams() as { id: string };
  const router = useRouter();

  const [auth, setAuth] = useState<EtabAuth | null>(null);
  const [etab, setEtab] = useState<Etablissement | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [catCount, setCatCount] = useState(0);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true, show: false });

  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const showMsg = (msg: string, ok = true) => {
    setToast({ msg, ok, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  // ── Auth check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("yassala_etab_auth");
    if (!raw) { router.replace("/etablissement/login"); return; }
    try {
      const parsed: EtabAuth = JSON.parse(raw);
      if (parsed.id !== etabId) {
        router.replace("/etablissement/login");
        return;
      }
      setAuth(parsed);
    } catch {
      router.replace("/etablissement/login");
    }
  }, [etabId, router]);

  // ── Firestore listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    return onSnapshot(doc(db, "day_etablissements", etabId), snap => {
      if (snap.exists()) setEtab({ id: snap.id, ...snap.data() } as Etablissement);
    });
  }, [auth, etabId]);

  // Counts
  useEffect(() => {
    if (!auth) return;
    const q = (col: string) => query(collection(db, col), where("etablissementId", "==", etabId));
    getCountFromServer(q("day_products")).then(s => setProductCount(s.data().count)).catch(() => {});
    getCountFromServer(q("day_categories")).then(s => setCatCount(s.data().count)).catch(() => {});
  }, [auth, etabId]);

  // ── Open/Close toggle ─────────────────────────────────────────────────
  const toggleOpen = async () => {
    if (!etab) return;
    const newVal = !etab.isOpen;
    setEtab(e => e ? { ...e, isOpen: newVal } : e);
    await updateDoc(doc(db, "day_etablissements", etabId), {
      isOpen: newVal,
      updatedAt: new Date().toISOString(),
    });
    showMsg(newVal ? "Établissement ouvert ✓" : "Établissement fermé");
  };

  // ── Image uploads ─────────────────────────────────────────────────────
  const uploadImage = async (file: File, type: "logo" | "cover") => {
    if (!file.type.startsWith("image/")) { showMsg("Fichier image requis", false); return; }
    setUploading(type);
    try {
      const r = ref(storage, `day_etablissements/${Date.now()}_${type}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const field = type === "logo" ? "logoUrl" : "coverUrl";
      await updateDoc(doc(db, "day_etablissements", etabId), { [field]: url, updatedAt: new Date().toISOString() });
      setEtab(e => e ? { ...e, [field]: url } : e);
      showMsg(type === "logo" ? "Logo mis à jour ✓" : "Photo de couverture mise à jour ✓");
    } catch { showMsg("Erreur lors de l'upload", false); }
    finally { setUploading(null); }
  };

  // ── Update delivery info ──────────────────────────────────────────────
  const saveDelivery = async () => {
    if (!etab) return;
    setSaving(true);
    await updateDoc(doc(db, "day_etablissements", etabId), {
      openHours: etab.openHours,
      closeTime: etab.closeTime,
      deliveryMin: etab.deliveryMin,
      deliveryMax: etab.deliveryMax,
      deliveryFee: etab.deliveryFee,
      updatedAt: new Date().toISOString(),
    });
    setSaving(false);
    showMsg("Informations sauvegardées ✓");
  };

  const logout = () => {
    localStorage.removeItem("yassala_etab_auth");
    router.replace("/etablissement/login");
  };

  // ── Guards ────────────────────────────────────────────────────────────
  if (!auth || !etab) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ ...MONO, color: "#5a5470", fontSize: ".85rem" }}>Chargement...</span>
      </div>
    );
  }

  const isOpen = etab.isOpen !== false;

  const inp = (extra?: object) => ({
    width: "100%", background: "#08050f",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 8, padding: "10px 13px",
    color: "#f0eeff", fontSize: ".88rem",
    fontFamily: "'Inter',sans-serif",
    boxSizing: "border-box" as const, ...extra,
  });

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#f0eeff", fontFamily: "'Inter',sans-serif" }}>
      {toast.show && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* ── Topbar ── */}
      <div style={{
        background: "rgba(12,9,24,.97)",
        borderBottom: "1px solid rgba(255,45,120,.15)",
        padding: "0 20px", height: 54,
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          {etab.logoUrl && (
            <img src={etab.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
          )}
          <span style={{ ...MONO, fontSize: ".88rem", color: PINK, fontWeight: 700, letterSpacing: ".05em" }}>
            {etab.name}
          </span>
          <span style={{
            ...MONO, fontSize: ".65rem", padding: "2px 9px", borderRadius: 20,
            background: isOpen ? "rgba(184,255,0,.1)" : "rgba(255,45,120,.1)",
            color: isOpen ? "#b8ff00" : PINK,
          }}>
            {isOpen ? "OUVERT" : "FERMÉ"}
          </span>
        </div>
        <a href={`/etablissement/${etabId}/menu`}
          style={{ ...MONO, fontSize: ".72rem", color: "#f0eeff", textDecoration: "none", padding: "6px 14px", background: "rgba(255,45,120,.12)", border: "1px solid rgba(255,45,120,.25)", borderRadius: 6 }}>
          🍽️ MON MENU
        </a>
        <button onClick={logout}
          style={{ ...MONO, fontSize: ".72rem", color: "#5a5470", background: "transparent", border: "1px solid rgba(255,255,255,.08)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
          DÉCONNEXION
        </button>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div>
          <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 4 }}>
            // TABLEAU DE BORD
          </div>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>{etab.name}</h1>
          {etab.description && (
            <p style={{ margin: "4px 0 0", color: "#7a7490", fontSize: ".85rem" }}>{etab.description}</p>
          )}
        </div>

        {/* ── Open/Close toggle — BIG ── */}
        <div style={{
          background: isOpen ? "rgba(184,255,0,.06)" : "rgba(255,45,120,.06)",
          border: `2px solid ${isOpen ? "rgba(184,255,0,.25)" : "rgba(255,45,120,.25)"}`,
          borderRadius: 16, padding: "28px 24px",
          display: "flex", alignItems: "center", gap: 20,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 8 }}>
              STATUT EN TEMPS RÉEL
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: isOpen ? "#b8ff00" : PINK, marginBottom: 4 }}>
              {isOpen ? "☀️ OUVERT" : "🌙 FERMÉ"}
            </div>
            <div style={{ ...MONO, fontSize: ".75rem", color: "#5a5470" }}>
              {isOpen
                ? "Les clients peuvent passer commande maintenant"
                : "Votre établissement n'accepte pas de commandes"}
            </div>
          </div>
          {/* Big toggle */}
          <div
            onClick={toggleOpen}
            style={{
              width: 72, height: 38, borderRadius: 19, position: "relative", cursor: "pointer", flexShrink: 0,
              background: isOpen ? "#b8ff00" : "rgba(255,255,255,.12)",
              transition: "background .25s", boxShadow: isOpen ? "0 0 20px rgba(184,255,0,.3)" : "none",
            }}>
            <div style={{
              position: "absolute", top: 4, left: isOpen ? 36 : 4,
              width: 30, height: 30, borderRadius: "50%",
              background: isOpen ? "#000" : "#5a5470",
              transition: "left .25s",
            }} />
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { label: "PRODUITS AU MENU", value: productCount, icon: "🛍️", link: `/etablissement/${etabId}/menu` },
            { label: "CATÉGORIES", value: catCount, icon: "🗂️", link: `/etablissement/${etabId}/menu` },
          ].map(s => (
            <a key={s.label} href={s.link} style={{ textDecoration: "none" }}>
              <div style={{
                background: CARD, border: "1px solid rgba(255,255,255,.06)",
                borderRadius: 12, padding: "18px 20px",
                transition: "border-color .15s",
              }}>
                <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: "1.8rem", fontWeight: 800, color: PINK, ...MONO }}>{s.value}</div>
                <div style={{ ...MONO, fontSize: ".65rem", color: "#5a5470", marginTop: 4, letterSpacing: ".1em" }}>{s.label}</div>
              </div>
            </a>
          ))}
        </div>

        {/* ── Images : Logo + Cover ── */}
        <div style={{ background: CARD, border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "22px 20px" }}>
          <div style={{ ...MONO, fontSize: ".68rem", color: PINK, letterSpacing: ".12em", marginBottom: 18 }}>
            // IMAGES DE L'ÉTABLISSEMENT
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            {/* Logo */}
            <div>
              <div style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", marginBottom: 10 }}>
                LOGO
              </div>
              <div
                onClick={() => logoRef.current?.click()}
                style={{
                  height: 120, borderRadius: 10, cursor: "pointer", overflow: "hidden",
                  border: "2px dashed rgba(255,45,120,.25)",
                  background: "rgba(255,255,255,.02)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}>
                {etab.logoUrl ? (
                  <>
                    <img src={etab.logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{
                      position: "absolute", inset: 0, background: "rgba(0,0,0,.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: 0,
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}>
                      <span style={{ ...MONO, color: "#fff", fontSize: ".75rem" }}>
                        {uploading === "logo" ? "⏳ UPLOAD..." : "📷 CHANGER"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "2rem", marginBottom: 6 }}>{uploading === "logo" ? "⏳" : "🏪"}</div>
                    <div style={{ ...MONO, fontSize: ".7rem", color: "#5a5470", textAlign: "center" }}>
                      {uploading === "logo" ? "Upload..." : "Cliquer pour ajouter"}
                    </div>
                  </>
                )}
              </div>
              <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) uploadImage(e.target.files[0], "logo"); }} />
            </div>

            {/* Cover */}
            <div>
              <div style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", marginBottom: 10 }}>
                PHOTO DE COUVERTURE
              </div>
              <div
                onClick={() => coverRef.current?.click()}
                style={{
                  height: 120, borderRadius: 10, cursor: "pointer", overflow: "hidden",
                  border: "2px dashed rgba(255,45,120,.25)",
                  background: "rgba(255,255,255,.02)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}>
                {etab.coverUrl ? (
                  <>
                    <img src={etab.coverUrl} alt="cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{
                      position: "absolute", inset: 0, background: "rgba(0,0,0,.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: 0,
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "0"; }}>
                      <span style={{ ...MONO, color: "#fff", fontSize: ".75rem" }}>
                        {uploading === "cover" ? "⏳ UPLOAD..." : "📷 CHANGER"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "2rem", marginBottom: 6 }}>{uploading === "cover" ? "⏳" : "🖼️"}</div>
                    <div style={{ ...MONO, fontSize: ".7rem", color: "#5a5470", textAlign: "center" }}>
                      {uploading === "cover" ? "Upload..." : "Cliquer pour ajouter"}
                    </div>
                  </>
                )}
              </div>
              <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) uploadImage(e.target.files[0], "cover"); }} />
            </div>
          </div>
        </div>

        {/* ── Infos pratiques ── */}
        <div style={{ background: CARD, border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "22px 20px" }}>
          <div style={{ ...MONO, fontSize: ".68rem", color: GOLD, letterSpacing: ".12em", marginBottom: 18 }}>
            // INFORMATIONS PRATIQUES
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                  HORAIRES D'OUVERTURE
                </label>
                <input
                  value={etab.openHours || ""}
                  onChange={e => setEtab(v => v && ({ ...v, openHours: e.target.value }))}
                  placeholder="08:00 – 21:00"
                  style={inp()}
                />
              </div>
              <div>
                <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                  HEURE DE FERMETURE AUTO
                </label>
                <input
                  value={etab.closeTime || ""}
                  onChange={e => setEtab(v => v && ({ ...v, closeTime: e.target.value }))}
                  placeholder="21:00"
                  style={inp({ ...MONO })}
                />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                  DÉLAI MIN (min)
                </label>
                <input
                  type="number" min={0}
                  value={etab.deliveryMin ?? 20}
                  onChange={e => setEtab(v => v && ({ ...v, deliveryMin: parseInt(e.target.value) || 0 }))}
                  style={inp({ ...MONO })}
                />
              </div>
              <div>
                <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                  DÉLAI MAX (min)
                </label>
                <input
                  type="number" min={0}
                  value={etab.deliveryMax ?? 35}
                  onChange={e => setEtab(v => v && ({ ...v, deliveryMax: parseInt(e.target.value) || 0 }))}
                  style={inp({ ...MONO })}
                />
              </div>
              <div>
                <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                  FRAIS LIVRAISON (€)
                </label>
                <input
                  type="number" min={0} step={0.5}
                  value={etab.deliveryFee ?? 2}
                  onChange={e => setEtab(v => v && ({ ...v, deliveryFee: parseFloat(e.target.value) || 0 }))}
                  style={inp({ ...MONO, color: PINK })}
                />
              </div>
            </div>
            <div>
              <button
                onClick={saveDelivery}
                disabled={saving}
                style={{
                  background: GOLD, color: "#000", border: "none", borderRadius: 8,
                  padding: "11px 22px", ...MONO, fontSize: ".8rem",
                  cursor: saving ? "default" : "pointer", fontWeight: 700, letterSpacing: ".06em",
                }}>
                {saving ? "⏳ SAUVEGARDE..." : "☀️ SAUVEGARDER"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Quick link to menu ── */}
        <a href={`/etablissement/${etabId}/menu`} style={{ textDecoration: "none" }}>
          <div style={{
            background: "rgba(255,45,120,.06)",
            border: "1px solid rgba(255,45,120,.2)",
            borderRadius: 14, padding: "20px 22px",
            display: "flex", alignItems: "center", gap: 16, cursor: "pointer",
            transition: "border-color .15s",
          }}>
            <div style={{ fontSize: "2.2rem" }}>🍽️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>Gérer mon menu</div>
              <div style={{ ...MONO, fontSize: ".72rem", color: "#7a7490" }}>
                Catégories · produits · images · prix · stock
              </div>
            </div>
            <div style={{ ...MONO, fontSize: ".8rem", color: PINK }}>→</div>
          </div>
        </a>

      </div>
    </div>
  );
}
