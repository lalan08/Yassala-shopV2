"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/adminFirebase";

const C = { bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#f1f5f9", muted: "#64748b", accent: "#f97316", green: "#22c55e" };

type Settings = {
  shopOpen: boolean; deliveryMin: number; freeDelivery: number; hours: string; zone: string;
  whatsapp: string; paymentOnlineEnabled: boolean; paymentCashEnabled: boolean;
  fulfillmentDeliveryEnabled: boolean; fulfillmentPickupEnabled: boolean;
  themeOverride: "auto" | "day" | "night";
  nightBannerText: string; dayBannerText: string;
  aiChatEnabled: boolean; aiVoiceEnabled: boolean; aiRecommendEnabled: boolean;
};

const DEFAULT: Settings = {
  shopOpen: true, deliveryMin: 15, freeDelivery: 50, hours: "22:00–06:00",
  zone: "Cayenne & alentours", whatsapp: "+594 XXX XXX",
  paymentOnlineEnabled: true, paymentCashEnabled: true,
  fulfillmentDeliveryEnabled: true, fulfillmentPickupEnabled: true,
  themeOverride: "auto",
  nightBannerText: "LIVRAISON NOCTURNE DE 21H À 00H00 · CLICK & COLLECT JUSQU'À 6H · MATOURY UNIQUEMENT",
  dayBannerText: "LIVRAISON JOURNÉE DE 8H À 21H · MATOURY UNIQUEMENT",
  aiChatEnabled: false, aiVoiceEnabled: true, aiRecommendEnabled: true,
};

export default function ParametresPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [activeTab, setActiveTab] = useState<"general" | "ai" | "stripe">("general");

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "main"), (snap) => {
      if (snap.exists()) setSettings((s) => ({ ...s, ...snap.data() as Settings }));
    });
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const S = (k: keyof Settings, v: any) => setSettings((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "main"), settings, { merge: true });
      showMsg("Paramètres sauvegardés");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600 }}>{toast}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Paramètres</h1>
        <button onClick={save} disabled={saving} style={{ padding: "9px 24px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[["general", "⚙️ Général"], ["ai", "🤖 IA"], ["stripe", "💳 Stripe"]].map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} style={{ padding: "8px 20px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab ? 700 : 400, background: activeTab === tab ? C.accent : "rgba(255,255,255,0.06)", color: activeTab === tab ? "#fff" : C.muted }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "general" && (
        <div style={{ display: "grid", gap: 20, maxWidth: 700 }}>
          <Section title="Boutique">
            <Toggle label="Boutique ouverte" value={settings.shopOpen} onChange={(v) => S("shopOpen", v)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <Field label="Minimum de commande (€)">
                <input style={inputStyle} type="number" value={settings.deliveryMin} onChange={(e) => S("deliveryMin", +e.target.value)} min={0} />
              </Field>
              <Field label="Livraison gratuite dès (€)">
                <input style={inputStyle} type="number" value={settings.freeDelivery} onChange={(e) => S("freeDelivery", +e.target.value)} min={0} />
              </Field>
              <Field label="Horaires">
                <input style={inputStyle} value={settings.hours} onChange={(e) => S("hours", e.target.value)} placeholder="22:00–06:00" />
              </Field>
              <Field label="Zone de livraison">
                <input style={inputStyle} value={settings.zone} onChange={(e) => S("zone", e.target.value)} placeholder="Cayenne & alentours" />
              </Field>
              <Field label="WhatsApp">
                <input style={inputStyle} value={settings.whatsapp} onChange={(e) => S("whatsapp", e.target.value)} placeholder="+594 XXX XXX" />
              </Field>
            </div>
          </Section>

          <Section title="Thème / Mode">
            <Field label="Thème forcé">
              <select style={inputStyle} value={settings.themeOverride} onChange={(e) => S("themeOverride", e.target.value as any)}>
                <option value="auto">Auto (selon l'heure)</option>
                <option value="day">☀️ Forcer Jour</option>
                <option value="night">🌙 Forcer Nuit</option>
              </select>
            </Field>
            <Field label="Texte bannière Jour" style={{ marginTop: 12 }}>
              <input style={inputStyle} value={settings.dayBannerText} onChange={(e) => S("dayBannerText", e.target.value)} />
            </Field>
            <Field label="Texte bannière Nuit" style={{ marginTop: 12 }}>
              <input style={inputStyle} value={settings.nightBannerText} onChange={(e) => S("nightBannerText", e.target.value)} />
            </Field>
          </Section>

          <Section title="Paiement">
            <Toggle label="Paiement en ligne (carte)" value={settings.paymentOnlineEnabled} onChange={(v) => S("paymentOnlineEnabled", v)} />
            <Toggle label="Paiement en espèces" value={settings.paymentCashEnabled} onChange={(v) => S("paymentCashEnabled", v)} style={{ marginTop: 8 }} />
          </Section>

          <Section title="Modes de livraison">
            <Toggle label="Livraison à domicile" value={settings.fulfillmentDeliveryEnabled} onChange={(v) => S("fulfillmentDeliveryEnabled", v)} />
            <Toggle label="Click & Collect (retrait)" value={settings.fulfillmentPickupEnabled} onChange={(v) => S("fulfillmentPickupEnabled", v)} style={{ marginTop: 8 }} />
          </Section>
        </div>
      )}

      {activeTab === "ai" && (
        <div style={{ display: "grid", gap: 12, maxWidth: 500 }}>
          <Section title="Fonctionnalités IA">
            <Toggle label="Chat IA" value={settings.aiChatEnabled} onChange={(v) => S("aiChatEnabled", v)} />
            <Toggle label="Commande vocale" value={settings.aiVoiceEnabled} onChange={(v) => S("aiVoiceEnabled", v)} style={{ marginTop: 8 }} />
            <Toggle label="Recommandations IA" value={settings.aiRecommendEnabled} onChange={(v) => S("aiRecommendEnabled", v)} style={{ marginTop: 8 }} />
          </Section>
        </div>
      )}

      {activeTab === "stripe" && (
        <div style={{ maxWidth: 500 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
            <p style={{ color: C.muted, fontSize: 13 }}>
              Les clés Stripe sont configurées via les variables d'environnement (<code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>STRIPE_SECRET_KEY</code>, <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>).
            </p>
            <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>
              Modifiez le fichier <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>.env.local</code> ou les variables d'environnement de votre hébergeur.
            </p>
            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(249,115,22,0.08)", borderRadius: 8, fontSize: 12, color: C.accent }}>
              ⚠️ Ne jamais exposer la clé secrète Stripe côté client.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: "#f1f5f9" }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange, style }: { label: string; value: boolean; onChange: (v: boolean) => void; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", ...style }}>
      <span style={{ fontSize: 13, color: "#f1f5f9" }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{ width: 42, height: 22, borderRadius: 11, background: value ? "#f97316" : "rgba(255,255,255,0.12)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 3, left: value ? 22 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </div>
    </label>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#f1f5f9", outline: "none", boxSizing: "border-box" };
