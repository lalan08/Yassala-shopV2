"use client";
import { useEffect, useState, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseConfig, sha256, ADMIN_PASS, ADMIN_STORAGE_KEY } from "@/lib/firebase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

// ─── Types ────────────────────────────────────────────────────
type Promotion = {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  startAt: string;
  endAt: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  productIds: string[];
  maxUses?: number;
  usesCount: number;
  createdAt: string;
  updatedAt: string;
};

type Product = { id: string; name: string; price: number; image?: string };

const EMPTY_FORM = {
  title: "Flash Deal 🔥",
  description: "",
  discountType: "percent" as "percent" | "fixed",
  discountValue: 10,
  productIds: [] as string[],
  maxUses: "",
  durationMinutes: 15,
};

// ─── AuthGate ─────────────────────────────────────────────────
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(false);

  const attempt = async () => {
    const h = await sha256(pwd);
    const expected = await sha256(ADMIN_PASS);
    if (h === expected) {
      localStorage.setItem(ADMIN_STORAGE_KEY, h);
      onAuth();
    } else {
      setErr(true);
      setTimeout(() => setErr(false), 1500);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a12" }}>
      <div style={{ width: 320 }}>
        <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem", color: "#ff2d78", textAlign: "center", marginBottom: 8 }}>YASSALA</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#5a5470", textAlign: "center", marginBottom: 28 }}>PROMOTIONS · ADMIN</div>
        <input
          type="password" value={pwd} placeholder="Mot de passe admin"
          onChange={e => setPwd(e.target.value)}
          onKeyDown={e => e.key === "Enter" && attempt()}
          style={{
            width: "100%", background: "rgba(255,255,255,.06)",
            border: `1px solid ${err ? "#ff2d78" : "rgba(255,255,255,.12)"}`,
            borderRadius: 8, padding: "12px 14px", color: "#f0eeff",
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".9rem", outline: "none", marginBottom: 12,
          }}
        />
        <button onClick={attempt} style={{
          width: "100%", background: "#ff2d78", color: "#000", border: "none", borderRadius: 8,
          padding: "12px", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: ".9rem",
        }}>
          {err ? "❌ Incorrect" : "Accéder"}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────
function isPromoLive(p: Promotion): boolean {
  if (!p.isActive) return false;
  const now = Date.now();
  return now >= new Date(p.startAt).getTime() && now <= new Date(p.endAt).getTime();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function RemainingTimer({ endAt }: { endAt: string }) {
  const calc = () => {
    const diff = Math.max(0, new Date(endAt).getTime() - Date.now());
    const mm = String(Math.floor(diff / 60000)).padStart(2, "0");
    const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    return { mm, ss, expired: diff === 0 };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const i = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(i);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt]);
  if (t.expired) return <span style={{ color: "#5a5470" }}>Expirée</span>;
  return <span style={{ color: "#ff2d78", fontFamily: "'Black Ops One',cursive" }}>{t.mm}:{t.ss}</span>;
}

// ─── Main Page ────────────────────────────────────────────────
export default function AdminPromotionsPage() {
  const [authed, setAuthed]         = useState(false);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts]     = useState<Product[]>([]);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [prodSearch, setProdSearch] = useState("");
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState("");

  // Check stored auth
  useEffect(() => {
    sha256(ADMIN_PASS).then(expected => {
      if (localStorage.getItem(ADMIN_STORAGE_KEY) === expected) setAuthed(true);
    });
  }, []);

  // Load data once authed
  useEffect(() => {
    if (!authed) return;
    const unsubPromos = onSnapshot(
      query(collection(db, "promotions"), orderBy("createdAt", "desc")),
      snap => setPromotions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Promotion)))
    );
    getDocs(collection(db, "products")).then(snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    return () => unsubPromos();
  }, [authed]);

  const showMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // ── Toggle active ──────────────────────────────────────────
  const toggleActive = async (promo: Promotion) => {
    await updateDoc(doc(db, "promotions", promo.id), {
      isActive: !promo.isActive,
      updatedAt: new Date().toISOString(),
    });
    showMsg(promo.isActive ? "Promo désactivée." : "Promo activée !");
  };

  // ── Stop now ──────────────────────────────────────────────
  const stopNow = async (promo: Promotion) => {
    await updateDoc(doc(db, "promotions", promo.id), {
      isActive: false,
      endAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    showMsg("Promo stoppée.");
  };

  // ── Create promo ──────────────────────────────────────────
  const createPromo = async () => {
    if (!form.title.trim()) { showMsg("Titre requis"); return; }
    if (form.productIds.length === 0) { showMsg("Sélectionne au moins 1 produit"); return; }
    if (form.discountValue <= 0) { showMsg("Remise invalide"); return; }
    setSaving(true);
    const now = new Date();
    const endAt = new Date(now.getTime() + form.durationMinutes * 60 * 1000);
    await addDoc(collection(db, "promotions"), {
      title:         form.title.trim(),
      description:   form.description.trim(),
      isActive:      true,
      startAt:       now.toISOString(),
      endAt:         endAt.toISOString(),
      discountType:  form.discountType,
      discountValue: Number(form.discountValue),
      productIds:    form.productIds,
      maxUses:       form.maxUses !== "" ? Number(form.maxUses) : null,
      usesCount:     0,
      createdAt:     now.toISOString(),
      updatedAt:     now.toISOString(),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
    showMsg("✅ Promo créée et activée !");
  };

  const toggleProduct = (id: string) => {
    setForm(f => {
      const has = f.productIds.includes(id);
      if (has) return { ...f, productIds: f.productIds.filter(p => p !== id) };
      if (f.productIds.length >= 3) { showMsg("Maximum 3 produits"); return f; }
      return { ...f, productIds: [...f.productIds, id] };
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(prodSearch.toLowerCase())
  );

  if (!authed) return <AuthGate onAuth={() => setAuthed(true)} />;

  // ─── UI ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#04020a", color: "#f0eeff", fontFamily: "'Inter',sans-serif", padding: "0 0 80px" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "#ff2d78", color: "#000", padding: "10px 22px",
          borderRadius: 8, fontWeight: 700, zIndex: 9999, fontSize: ".88rem",
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: "rgba(4,2,10,.95)", borderBottom: "1px solid rgba(255,45,120,.25)",
        padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div>
          <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.4rem", color: "#ff2d78" }}>PROMOTIONS</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "#5a5470", letterSpacing: ".12em" }}>
            YASSALA · ADMIN
          </div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: showForm ? "rgba(255,45,120,.12)" : "#ff2d78",
            color: showForm ? "#ff2d78" : "#000",
            border: showForm ? "1px solid rgba(255,45,120,.4)" : "none",
            borderRadius: 8, padding: "10px 20px",
            fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".9rem",
            cursor: "pointer", letterSpacing: ".08em",
          }}
        >
          {showForm ? "✕ ANNULER" : "+ NOUVELLE PROMO"}
        </button>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Formulaire création ────────────────────────────── */}
        {showForm && (
          <div style={{
            background: "rgba(255,45,120,.05)", border: "1px solid rgba(255,45,120,.3)",
            borderRadius: 12, padding: 20, marginBottom: 28,
          }}>
            <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1rem", color: "#ff2d78", marginBottom: 16 }}>
              NOUVELLE PROMO
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {/* Titre */}
              <div>
                <label style={labelStyle}>Titre</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={inputStyle} placeholder="Flash Deal 🔥" />
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description (optionnel)</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={inputStyle} placeholder="Offre limitée ce soir uniquement !" />
              </div>

              {/* Remise */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Type de remise</label>
                  <select
                    value={form.discountType}
                    onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percent" | "fixed" }))}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    <option value="percent">Pourcentage (%)</option>
                    <option value="fixed">Montant fixe (€)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Valeur {form.discountType === "percent" ? "(%)" : "(€)"}
                  </label>
                  <input
                    type="number" min={0} step={form.discountType === "percent" ? 1 : 0.5}
                    value={form.discountValue}
                    onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Durée + max uses */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Durée (minutes)</label>
                  <input
                    type="number" min={1} max={1440}
                    value={form.durationMinutes}
                    onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Max utilisations (optionnel)</label>
                  <input
                    type="number" min={1} placeholder="Illimité"
                    value={form.maxUses}
                    onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Produits */}
              <div>
                <label style={labelStyle}>
                  Produits concernés ({form.productIds.length}/3)
                </label>
                <input
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 8 }}
                  placeholder="Rechercher un produit…"
                />
                <div style={{
                  maxHeight: 200, overflowY: "auto",
                  border: "1px solid rgba(255,255,255,.08)", borderRadius: 8,
                  background: "rgba(0,0,0,.3)",
                }}>
                  {filteredProducts.slice(0, 20).map(p => {
                    const selected = form.productIds.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleProduct(p.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 12px", cursor: "pointer",
                          background: selected ? "rgba(255,45,120,.12)" : "transparent",
                          borderBottom: "1px solid rgba(255,255,255,.04)",
                          transition: "background .15s",
                        }}
                      >
                        {p.image && <img src={p.image} alt={p.name} style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />}
                        <span style={{ fontFamily: "'Rajdhani',sans-serif", fontSize: ".9rem", fontWeight: 600, flex: 1 }}>{p.name}</span>
                        <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#b8ff00" }}>{p.price.toFixed(2)}€</span>
                        {selected && <span style={{ color: "#ff2d78", fontSize: ".85rem" }}>✓</span>}
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div style={{ padding: 16, color: "#5a5470", textAlign: "center", fontSize: ".82rem" }}>
                      Aucun produit trouvé
                    </div>
                  )}
                </div>

                {/* Chips sélectionnés */}
                {form.productIds.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {form.productIds.map(id => {
                      const p = products.find(x => x.id === id);
                      return (
                        <span key={id} onClick={() => toggleProduct(id)} style={{
                          background: "rgba(255,45,120,.18)", border: "1px solid rgba(255,45,120,.4)",
                          borderRadius: 20, padding: "3px 10px",
                          fontFamily: "'Rajdhani',sans-serif", fontSize: ".78rem", cursor: "pointer",
                        }}>
                          {p?.name ?? id} ✕
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={createPromo}
                disabled={saving}
                style={{
                  width: "100%", background: saving ? "#5a5470" : "#ff2d78",
                  color: "#000", border: "none", borderRadius: 8,
                  padding: "13px", cursor: saving ? "not-allowed" : "pointer",
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".95rem",
                  letterSpacing: ".1em",
                }}
              >
                {saving ? "CRÉATION…" : `🚀 LANCER LA PROMO (${form.durationMinutes} min)`}
              </button>
            </div>
          </div>
        )}

        {/* ── Liste des promos ───────────────────────────────── */}
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 12 }}>
          PROMOTIONS ({promotions.length})
        </div>

        {promotions.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#5a5470", fontFamily: "'Rajdhani',sans-serif" }}>
            Aucune promo créée pour l&apos;instant.
          </div>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          {promotions.map(p => {
            const live = isPromoLive(p);
            return (
              <div key={p.id} style={{
                background: live
                  ? "linear-gradient(135deg,rgba(255,45,120,.1),rgba(255,100,0,.07))"
                  : "rgba(255,255,255,.03)",
                border: `1px solid ${live ? "rgba(255,45,120,.4)" : "rgba(255,255,255,.08)"}`,
                borderRadius: 10, padding: "16px 18px",
              }}>
                {/* Titre + statut */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: "1rem", letterSpacing: ".03em" }}>
                      {p.title}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: ".78rem", color: "#5a5470", marginTop: 2 }}>{p.description}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <span style={{
                      fontFamily: "'Share Tech Mono',monospace", fontSize: ".58rem", letterSpacing: ".1em",
                      padding: "3px 9px", borderRadius: 20,
                      background: live ? "rgba(184,255,0,.15)" : p.isActive ? "rgba(0,245,255,.1)" : "rgba(90,84,112,.2)",
                      color: live ? "#b8ff00" : p.isActive ? "#00f5ff" : "#5a5470",
                      border: `1px solid ${live ? "rgba(184,255,0,.3)" : p.isActive ? "rgba(0,245,255,.25)" : "rgba(90,84,112,.3)"}`,
                    }}>
                      {live ? "🟢 EN DIRECT" : p.isActive ? "⏳ EN ATTENTE" : "⚫ INACTIF"}
                    </span>
                    {live && <RemainingTimer endAt={p.endAt} />}
                  </div>
                </div>

                {/* Stats grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                  {[
                    { label: "REMISE", value: p.discountType === "percent" ? `${p.discountValue}%` : `${p.discountValue.toFixed(2)}€` },
                    { label: "DÉBUT",  value: fmtDate(p.startAt) },
                    { label: "FIN",    value: fmtDate(p.endAt) },
                    { label: "USES",   value: `${p.usesCount}${p.maxUses ? ` / ${p.maxUses}` : ""}` },
                  ].map(s => (
                    <div key={s.label} style={{ background: "rgba(255,255,255,.04)", borderRadius: 6, padding: "6px 8px" }}>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".55rem", color: "#5a5470", letterSpacing: ".1em" }}>
                        {s.label}
                      </div>
                      <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".85rem", marginTop: 2 }}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Produits concernés */}
                {p.productIds.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                    {p.productIds.map(id => {
                      const prod = products.find(x => x.id === id);
                      return (
                        <span key={id} style={{
                          fontFamily: "'Share Tech Mono',monospace", fontSize: ".6rem",
                          background: "rgba(0,245,255,.08)", border: "1px solid rgba(0,245,255,.2)",
                          borderRadius: 4, padding: "2px 8px", color: "#00f5ff",
                        }}>
                          {prod?.name ?? id}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => toggleActive(p)}
                    style={{
                      flex: 1, background: p.isActive ? "rgba(90,84,112,.2)" : "rgba(184,255,0,.1)",
                      color: p.isActive ? "#5a5470" : "#b8ff00",
                      border: `1px solid ${p.isActive ? "rgba(90,84,112,.3)" : "rgba(184,255,0,.3)"}`,
                      borderRadius: 6, padding: "8px",
                      fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".8rem",
                      cursor: "pointer", letterSpacing: ".08em",
                    }}
                  >
                    {p.isActive ? "⏸ DÉSACTIVER" : "▶ ACTIVER"}
                  </button>
                  {live && (
                    <button
                      onClick={() => stopNow(p)}
                      style={{
                        background: "rgba(255,45,120,.1)", color: "#ff2d78",
                        border: "1px solid rgba(255,45,120,.3)", borderRadius: 6, padding: "8px 14px",
                        fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".8rem",
                        cursor: "pointer", letterSpacing: ".08em",
                      }}
                    >
                      ■ STOP
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Styles partagés ──────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 7,
  padding: "10px 12px",
  color: "#f0eeff",
  fontFamily: "'Rajdhani',sans-serif",
  fontSize: ".9rem",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "'Share Tech Mono',monospace",
  fontSize: ".62rem",
  color: "#5a5470",
  letterSpacing: ".1em",
  textTransform: "uppercase",
  marginBottom: 5,
};
