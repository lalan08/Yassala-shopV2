"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db, type HomeSection, type Mode } from "@/lib/adminFirebase";
import { useAdminMode, matchesMode, MODE_CONFIG } from "@/lib/adminMode";

const C = {
  bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)",
  text: "#f1f5f9", muted: "#64748b", accent: "#f97316",
  green: "#22c55e", red: "#ef4444", blue: "#3b82f6",
};

// Pre-built templates
const TEMPLATES: Array<Omit<HomeSection, "id">> = [
  {
    title: "Autour de toi",
    subtitle: "Établissements ouverts près de chez vous",
    type: "restaurants",
    source: "auto",
    query_rule: { filters: ["is_open", "mode"], sort: "score DESC", limit: 10 },
    limit: 10,
    active: true,
    order: 1,
    mode: "both",
  },
  {
    title: "Populaires",
    subtitle: "Les restaurants les plus commandés",
    type: "restaurants",
    source: "auto",
    query_rule: { sort: "orders_7d DESC", limit: 10 },
    limit: 10,
    active: true,
    order: 2,
    mode: "both",
  },
  {
    title: "Produits populaires",
    subtitle: "Top 10 produits de la semaine",
    type: "products",
    source: "auto",
    query_rule: { sort: "orders_7d DESC", limit: 12, filters: ["available"] },
    limit: 12,
    active: true,
    order: 3,
    mode: "both",
  },
  {
    title: "Nouveaux",
    subtitle: "Derniers établissements ajoutés",
    type: "restaurants",
    source: "auto",
    query_rule: { sort: "created_at DESC", limit: 10 },
    limit: 10,
    active: false,
    order: 4,
    mode: "both",
  },
  {
    title: "Bannières",
    subtitle: "Promotions et offres du moment",
    type: "banners",
    source: "auto",
    query_rule: { filters: ["active"], sort: "order ASC", limit: 5 },
    limit: 5,
    active: true,
    order: 0,
    mode: "both",
  },
];

const EMPTY: Omit<HomeSection, "id"> = {
  title: "", subtitle: "", type: "restaurants", source: "auto",
  query_rule: { filters: [], sort: "score DESC", limit: 10 },
  limit: 10, active: true, order: 99, mode: "both",
};

const TYPE_ICONS: Record<string, string> = {
  restaurants: "🏪", products: "🍽️", categories: "🏷️", banners: "🖼️",
};

const SORT_OPTIONS = [
  { value: "score DESC",      label: "Score ranking ↓" },
  { value: "orders_7d DESC",  label: "Commandes 7j ↓" },
  { value: "created_at DESC", label: "Plus récents ↓" },
  { value: "order ASC",       label: "Ordre manuel ↑" },
  { value: "name ASC",        label: "Nom A-Z" },
];

const FILTER_OPTIONS = [
  { value: "is_open",   label: "Ouverts uniquement" },
  { value: "mode",      label: "Filtre par mode" },
  { value: "available", label: "Disponibles uniquement" },
  { value: "featured",  label: "Mis en avant" },
  { value: "active",    label: "Actifs uniquement" },
];

export default function HomeBuilderPage() {
  const { mode: adminMode } = useAdminMode();
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [form, setForm] = useState<Omit<HomeSection, "id">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "home_sections"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HomeSection))
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setSections(data);
    });
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const F = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const FQ = (k: string, v: any) => setForm((f) => ({ ...f, query_rule: { ...f.query_rule, [k]: v } }));

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, "home_sections", editId), { ...form });
        showMsg("Section mise à jour");
      } else {
        await addDoc(collection(db, "home_sections"), { ...form });
        showMsg("Section créée");
      }
      setShowForm(false); setEditId(null); setForm(EMPTY);
    } finally { setSaving(false); }
  };

  const openEdit = (s: HomeSection) => {
    setForm({ ...s } as any);
    setEditId(s.id!);
    setShowForm(true);
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette section ?")) return;
    await deleteDoc(doc(db, "home_sections", id));
    showMsg("Supprimée");
  };

  const toggleActive = async (s: HomeSection) => {
    await updateDoc(doc(db, "home_sections", s.id!), { active: !s.active });
  };

  const moveOrder = async (id: string, delta: number) => {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swap = idx + delta;
    if (swap < 0 || swap >= sections.length) return;
    await Promise.all([
      updateDoc(doc(db, "home_sections", id), { order: sections[swap].order }),
      updateDoc(doc(db, "home_sections", sections[swap].id!), { order: sections[idx].order }),
    ]);
  };

  const addTemplate = async (t: Omit<HomeSection, "id">) => {
    await addDoc(collection(db, "home_sections"), { ...t });
    showMsg(`Section "${t.title}" ajoutée`);
  };

  const toggleFilter = (filter: string) => {
    const current = form.query_rule?.filters ?? [];
    const updated = current.includes(filter)
      ? current.filter((f) => f !== filter)
      : [...current, filter];
    FQ("filters", updated);
  };

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Home Builder</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            Gérez dynamiquement la page d'accueil sans modifier le code.
            Les sections sont chargées dans l'ordre et filtrées par mode (day/night).
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}
          style={btnStyle(C.accent)}
        >
          + Nouvelle section
        </button>
      </div>

      {/* Logic description */}
      <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 24, fontSize: 13 }}>
        <strong style={{ color: C.accent }}>Logique d'affichage :</strong>{" "}
        <span style={{ color: C.muted }}>
          1. Charger les sections <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>active=true</code> →
          2. Trier par <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>order</code> →
          3. Pour chaque section, charger les données selon <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>query_rule</code> →
          4. Appliquer le filtre <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>mode=day|night</code>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
        {/* Sections list */}
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Sections {adminMode !== "all" ? `${MODE_CONFIG[adminMode].icon} ${MODE_CONFIG[adminMode].label}` : ""}
            </h2>
            <span style={{ fontSize: 12, color: C.muted }}>
              {sections.filter((s) => matchesMode(s.mode, adminMode) && s.active).length} actives
              {adminMode !== "all" ? ` (filtre ${MODE_CONFIG[adminMode].label})` : ` sur ${sections.length}`}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sections.filter((s) => matchesMode(s.mode, adminMode)).map((s, i) => (
              <div
                key={s.id}
                style={{
                  background: s.active ? C.card : "rgba(255,255,255,0.02)",
                  border: `1px solid ${s.active ? C.border : "rgba(255,255,255,0.04)"}`,
                  borderRadius: 12,
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  opacity: s.active ? 1 : 0.5,
                }}
              >
                {/* Order buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button onClick={() => moveOrder(s.id!, -1)} disabled={i === 0} style={arrowBtn}>▲</button>
                  <button onClick={() => moveOrder(s.id!, 1)} disabled={i === sections.length - 1} style={arrowBtn}>▼</button>
                </div>

                {/* Order badge */}
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.muted, flexShrink: 0 }}>
                  {i + 1}
                </div>

                {/* Icon */}
                <div style={{ fontSize: 24, flexShrink: 0 }}>{TYPE_ICONS[s.type]}</div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</div>
                  {s.subtitle && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{s.subtitle}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    <Tag color={C.blue}>{s.type}</Tag>
                    <Tag color={s.source === "auto" ? C.green : "#818cf8"}>
                      {s.source === "auto" ? "AUTO" : "MANUEL"}
                    </Tag>
                    {s.mode && s.mode !== "both" && (
                      <Tag color="#fbbf24">{s.mode === "day" ? "☀️ Jour" : "🌙 Nuit"}</Tag>
                    )}
                    {s.query_rule?.sort && (
                      <Tag color={C.muted}>{s.query_rule.sort}</Tag>
                    )}
                    <Tag color={C.muted}>limit: {s.limit}</Tag>
                  </div>
                  {s.source === "auto" && s.query_rule?.filters && s.query_rule.filters.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {s.query_rule.filters.map((f) => (
                        <span key={f} style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", color: C.muted, padding: "2px 6px", borderRadius: 4 }}>{f}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <Toggle value={s.active} onChange={() => toggleActive(s)} color={C.green} />
                  <button onClick={() => openEdit(s)} style={smallBtn(C.blue)}>Edit</button>
                  <button onClick={() => remove(s.id!)} style={smallBtn(C.red)}>✕</button>
                </div>
              </div>
            ))}

            {sections.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: C.muted, background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
                Aucune section. Utilisez les templates à droite pour commencer.
              </div>
            )}
          </div>
        </div>

        {/* Templates */}
        <div>
          <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>Templates prêts à l'emploi</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {TEMPLATES.map((t) => (
              <div key={t.title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{TYPE_ICONS[t.type]} {t.title}</div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{t.subtitle}</div>
                  </div>
                  <button
                    onClick={() => addTemplate(t)}
                    style={{ ...smallBtn(C.accent), flexShrink: 0, marginLeft: 8 }}
                  >
                    + Ajouter
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag color={C.blue}>{t.type}</Tag>
                  <Tag color={C.green}>auto</Tag>
                  {t.query_rule?.sort && <Tag color={C.muted}>{t.query_rule.sort}</Tag>}
                  <Tag color={C.muted}>limit: {t.limit}</Tag>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111827", borderRadius: 16, padding: 28, width: "100%", maxWidth: 600, border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editId ? "Modifier la section" : "Nouvelle section"}</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <Field label="Titre *">
                <input style={inputStyle} value={form.title} onChange={(e) => F("title", e.target.value)} placeholder="Ex: Autour de toi" />
              </Field>
              <Field label="Sous-titre">
                <input style={inputStyle} value={form.subtitle ?? ""} onChange={(e) => F("subtitle", e.target.value)} placeholder="Description courte" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Type de contenu">
                  <select style={inputStyle} value={form.type} onChange={(e) => F("type", e.target.value as HomeSection["type"])}>
                    <option value="restaurants">🏪 Restaurants</option>
                    <option value="products">🍽️ Produits</option>
                    <option value="categories">🏷️ Catégories</option>
                    <option value="banners">🖼️ Bannières</option>
                  </select>
                </Field>
                <Field label="Source">
                  <select style={inputStyle} value={form.source} onChange={(e) => F("source", e.target.value as "auto" | "manual")}>
                    <option value="auto">Auto (règles)</option>
                    <option value="manual">Manuel</option>
                  </select>
                </Field>
              </div>

              {form.source === "auto" && (
                <>
                  <Field label="Tri">
                    <select style={inputStyle} value={form.query_rule?.sort ?? "score DESC"} onChange={(e) => FQ("sort", e.target.value)}>
                      {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Filtres">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                      {FILTER_OPTIONS.map((o) => {
                        const active = (form.query_rule?.filters ?? []).includes(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => toggleFilter(o.value)}
                            style={{
                              padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12,
                              background: active ? C.accent : "rgba(255,255,255,0.06)",
                              color: active ? "#fff" : C.muted,
                              fontWeight: active ? 700 : 400,
                            }}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Limite de résultats">
                  <input style={inputStyle} type="number" value={form.limit} onChange={(e) => { F("limit", +e.target.value); FQ("limit", +e.target.value); }} min={1} max={50} />
                </Field>
                <Field label="Ordre d'affichage">
                  <input style={inputStyle} type="number" value={form.order} onChange={(e) => F("order", +e.target.value)} min={0} />
                </Field>
              </div>

              <Field label="Mode">
                <select style={inputStyle} value={form.mode ?? "both"} onChange={(e) => F("mode", e.target.value as Mode)}>
                  <option value="both">⚡ Jour et Nuit</option>
                  <option value="day">☀️ Jour seulement</option>
                  <option value="night">🌙 Nuit seulement</option>
                </select>
              </Field>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#f1f5f9" }}>
                <input type="checkbox" checked={form.active} onChange={(e) => F("active", e.target.checked)} style={{ accentColor: C.accent }} />
                Section active (visible sur la home)
              </label>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowForm(false)} style={smallBtn(C.muted)}>Annuler</button>
                <button onClick={save} disabled={saving} style={btnStyle(C.accent)}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ value, onChange, color }: { value: boolean; onChange: () => void; color: string }) {
  return (
    <button onClick={onChange} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: value ? color : "rgba(255,255,255,0.1)", position: "relative", transition: "background 0.2s" }}>
      <span style={{ position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
    </button>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: color + "22", color, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#f1f5f9", outline: "none", boxSizing: "border-box" };
const btnStyle = (bg: string): React.CSSProperties => ({ padding: "9px 20px", borderRadius: 9, border: "none", background: bg, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" });
const smallBtn = (bg: string): React.CSSProperties => ({ padding: "5px 10px", borderRadius: 6, border: "none", background: bg + "22", color: bg, fontWeight: 600, fontSize: 12, cursor: "pointer" });
const arrowBtn: React.CSSProperties = { padding: "2px 6px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.06)", color: "#94a3b8", cursor: "pointer", fontSize: 10 };
