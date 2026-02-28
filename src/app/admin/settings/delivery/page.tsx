"use client";

import { useEffect, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { DEFAULT_DELIVERY_CONFIG, type DeliveryConfig } from "@/types/delivery";

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

export default function DeliverySettingsPage() {
  const [config, setConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState({ msg: "", show: false });

  const showToast = (msg: string) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  // Lecture unique au montage — évite que Firestore écrase les modifications locales en cours
  useEffect(() => {
    getDoc(doc(db, "settings", "delivery")).then(snap => {
      if (snap.exists()) {
        setConfig({ ...DEFAULT_DELIVERY_CONFIG, ...snap.data() } as DeliveryConfig);
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const safe = { ...DEFAULT_DELIVERY_CONFIG, ...config };
      await setDoc(doc(db, "settings", "delivery"), safe);
      setSaved(true);
      showToast("✓ Configuration sauvegardée et appliquée instantanément");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      showToast("✕ Erreur lors de la sauvegarde");
    }
    setSaving(false);
  };

  const num = (key: keyof DeliveryConfig) => (val: string) => {
    const n = parseFloat(val);
    setConfig(c => ({ ...c, [key]: isNaN(n) ? 0 : n }));
  };

  const tog = (key: keyof DeliveryConfig) => () =>
    setConfig(c => ({ ...c, [key]: !c[key] }));

  // Simulation du tarif actuel
  const simFee = (() => {
    const hour = new Date().getHours();
    const isNight = hour >= config.night_start || hour < config.night_end;
    const base = config.delivery_base_fee;
    const night = isNight ? config.night_fee : 0;
    const rain = config.rain_mode_enabled ? config.rain_fee : 0;
    const rush = config.rush_mode_enabled ? config.rush_fee : 0;
    // Distance non incluse dans la simulation (rayon inclus = distance 0)
    const total = parseFloat((base + night + rain + rush).toFixed(2));
    const driverPay = parseFloat((
      config.driver_base_pay
      + (isNight ? config.driver_night_bonus : 0)
      + (config.rain_mode_enabled ? config.driver_rain_bonus : 0)
      + (config.rush_mode_enabled ? config.driver_rush_bonus : 0)
    ).toFixed(2));
    return { total, driverPay, margin: parseFloat((total - driverPay).toFixed(2)), isNight };
  })();

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "#080514", border: "1px solid rgba(0,245,255,.2)",
    borderRadius: 6, padding: "10px 12px", color: "#f0eeff",
    fontFamily: "'Rajdhani',sans-serif", fontSize: "1rem",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
    color: "#5a5470", letterSpacing: ".1em", display: "block", marginBottom: 4,
  };
  const sectionStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)",
    borderRadius: 12, padding: "20px 18px", marginBottom: 14,
  };
  const rowStyle: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        input:focus{outline:none;border-color:rgba(0,245,255,.5) !important;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:#0a0a12;}
        ::-webkit-scrollbar-thumb{background:#00f5ff;border-radius:2px;}
      `}</style>

      {/* Toast */}
      <div style={{
        position: "fixed", top: 18, right: 18, zIndex: 9999,
        background: "rgba(184,255,0,.12)", border: "1px solid #b8ff00",
        borderRadius: 10, padding: "12px 18px",
        fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem",
        color: "#b8ff00", maxWidth: 320,
        transform: toast.show ? "translateX(0)" : "translateX(130%)",
        transition: "transform .4s cubic-bezier(.34,1.56,.64,1)",
      }}>
        {toast.msg}
      </div>

      {/* Header */}
      <header style={{
        background: "rgba(10,10,18,.95)", borderBottom: "1px solid rgba(0,245,255,.1)",
        padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(20px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a href="/admin" style={{
            color: "#5a5470", fontFamily: "'Share Tech Mono',monospace",
            fontSize: ".78rem", textDecoration: "none", letterSpacing: ".1em",
          }}>← ADMIN</a>
          <span style={{ color: "rgba(255,255,255,.1)" }}>|</span>
          <div style={{
            fontFamily: "'Black Ops One',cursive", fontSize: "1rem",
            background: "linear-gradient(135deg,#00f5ff,#ff2d78)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>CONFIG LIVRAISON</div>
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          background: saved
            ? "linear-gradient(135deg,#b8ff00,#7acc00)"
            : "linear-gradient(135deg,#00f5ff,#0090ff)",
          border: "none", color: "#000", padding: "10px 22px", borderRadius: 8,
          fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".92rem",
          cursor: saving ? "not-allowed" : "pointer", letterSpacing: ".06em",
          boxShadow: "0 4px 16px rgba(0,245,255,.25)", opacity: saving ? 0.7 : 1,
          transition: "all .2s",
        }}>
          {saving ? "..." : saved ? "✓ SAUVEGARDÉ" : "💾 SAUVEGARDER"}
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", animation: "fadeUp .3s both" }}>

        {/* Simulation temps réel */}
        <div style={{
          background: "rgba(184,255,0,.05)", border: "1px solid rgba(184,255,0,.25)",
          borderRadius: 12, padding: "16px 20px", marginBottom: 24,
          display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16,
        }}>
          <div>
            <div style={labelStyle}>TARIF CLIENT ACTUEL</div>
            <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem", color: "#b8ff00" }}>
              {simFee.total.toFixed(2)}€
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".62rem", color: "#5a5470", marginTop: 2 }}>
              {simFee.isNight ? "🌙 NUIT" : "☀️ JOUR"}
              {config.rain_mode_enabled ? " · 🌧️ PLUIE" : ""}
              {config.rush_mode_enabled ? " · 🚀 RUSH" : ""}
            </div>
          </div>
          <div>
            <div style={labelStyle}>RÉMUNÉRATION LIVREUR</div>
            <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem", color: "#00f5ff" }}>
              {simFee.driverPay.toFixed(2)}€
            </div>
          </div>
          <div>
            <div style={labelStyle}>MARGE ESTIMÉE</div>
            <div style={{
              fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem",
              color: simFee.margin >= 0 ? "#ff2d78" : "#ef4444",
            }}>
              {simFee.margin >= 0 ? "+" : ""}{simFee.margin.toFixed(2)}€
            </div>
          </div>
          <div style={{ gridColumn: "1/-1", borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 10 }}>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "#5a5470" }}>
              Simulation basée sur la configuration en cours · heure locale : {new Date().getHours()}h · distance = rayon inclus
            </div>
          </div>
        </div>

        {/* Section BASE */}
        <div style={sectionStyle}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem",
            color: "#00f5ff", letterSpacing: ".15em", marginBottom: 2,
          }}>BASE</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".8rem", color: "#5a5470", marginBottom: 12 }}>
            Paramètres fondamentaux applicables à toutes les livraisons
          </div>
          <div style={rowStyle}>
            <div>
              <span style={labelStyle}>FRAIS DE BASE (€)</span>
              <input type="number" step="0.5" min="0" value={config.delivery_base_fee}
                onChange={e => num("delivery_base_fee")(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <span style={labelStyle}>COMMANDE MINIMUM (€)</span>
              <input type="number" step="1" min="0" value={config.minimum_order_amount}
                onChange={e => num("minimum_order_amount")(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <span style={labelStyle}>LIVRAISON OFFERTE À PARTIR DE (€)</span>
              <input type="number" step="1" min="0" value={config.free_delivery_threshold}
                onChange={e => num("free_delivery_threshold")(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Section DISTANCE */}
        <div style={{
          ...sectionStyle,
          border: config.distance_fee_enabled
            ? "1px solid rgba(167,139,250,.4)"
            : "1px solid rgba(255,255,255,.07)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{
                fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem",
                color: config.distance_fee_enabled ? "#a78bfa" : "#5a5470", letterSpacing: ".15em", marginBottom: 2,
              }}>DISTANCE 📍</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".8rem", color: "#5a5470" }}>
                Les km au-delà du rayon inclus génèrent un supplément
              </div>
            </div>
            <button onClick={tog("distance_fee_enabled")} style={{
              width: 52, height: 28, borderRadius: 14, border: "none",
              background: config.distance_fee_enabled
                ? "linear-gradient(135deg,#a78bfa,#7c3aed)"
                : "rgba(255,255,255,.08)",
              cursor: "pointer", position: "relative", transition: "all .25s",
              flexShrink: 0,
            }}>
              <span style={{
                position: "absolute", top: 3,
                left: config.distance_fee_enabled ? 26 : 3,
                width: 22, height: 22, borderRadius: "50%", background: "#fff",
                transition: "left .25s", boxShadow: "0 1px 4px rgba(0,0,0,.4)",
              }} />
            </button>
          </div>
          <div style={{
            ...rowStyle,
            opacity: config.distance_fee_enabled ? 1 : 0.4,
            pointerEvents: config.distance_fee_enabled ? "auto" : "none",
          }}>
            <div>
              <span style={labelStyle}>RAYON INCLUS (km)</span>
              <input type="number" step="0.5" min="0" value={config.base_radius_km}
                onChange={e => num("base_radius_km")(e.target.value)} style={inputStyle}
                disabled={!config.distance_fee_enabled} />
            </div>
            <div>
              <span style={labelStyle}>SUPPLÉMENT PAR KM AU-DELÀ (€/km)</span>
              <input type="number" step="0.1" min="0" value={config.extra_fee_per_km}
                onChange={e => num("extra_fee_per_km")(e.target.value)} style={inputStyle}
                disabled={!config.distance_fee_enabled} />
            </div>
          </div>
        </div>

        {/* Section NUIT */}
        <div style={sectionStyle}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem",
            color: "#a78bfa", letterSpacing: ".15em", marginBottom: 2,
          }}>NUIT 🌙</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".8rem", color: "#5a5470", marginBottom: 12 }}>
            Actif automatiquement selon l'heure locale du serveur
          </div>
          <div style={rowStyle}>
            <div>
              <span style={labelStyle}>SUPPLÉMENT NUIT (€)</span>
              <input type="number" step="0.5" min="0" value={config.night_fee}
                onChange={e => num("night_fee")(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <span style={labelStyle}>DÉBUT (heure)</span>
                <input type="number" step="1" min="0" max="23" value={config.night_start}
                  onChange={e => num("night_start")(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <span style={labelStyle}>FIN (heure)</span>
                <input type="number" step="1" min="0" max="23" value={config.night_end}
                  onChange={e => num("night_end")(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>

        {/* Section PLUIE */}
        <div style={{
          ...sectionStyle,
          border: config.rain_mode_enabled
            ? "1px solid rgba(99,179,237,.4)"
            : "1px solid rgba(255,255,255,.07)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{
                fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem",
                color: config.rain_mode_enabled ? "#63b3ed" : "#5a5470", letterSpacing: ".15em", marginBottom: 2,
              }}>PLUIE 🌧️</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".8rem", color: "#5a5470" }}>
                Supplément manuel activé/désactivé depuis l'admin
              </div>
            </div>
            <button onClick={tog("rain_mode_enabled")} style={{
              width: 52, height: 28, borderRadius: 14, border: "none",
              background: config.rain_mode_enabled
                ? "linear-gradient(135deg,#63b3ed,#4299e1)"
                : "rgba(255,255,255,.08)",
              cursor: "pointer", position: "relative", transition: "all .25s",
              flexShrink: 0,
            }}>
              <span style={{
                position: "absolute", top: 3,
                left: config.rain_mode_enabled ? 26 : 3,
                width: 22, height: 22, borderRadius: "50%", background: "#fff",
                transition: "left .25s", boxShadow: "0 1px 4px rgba(0,0,0,.4)",
              }} />
            </button>
          </div>
          <div>
            <span style={labelStyle}>SUPPLÉMENT PLUIE (€)</span>
            <input type="number" step="0.5" min="0" value={config.rain_fee}
              onChange={e => num("rain_fee")(e.target.value)} style={{
                ...inputStyle,
                opacity: config.rain_mode_enabled ? 1 : 0.4,
              }} disabled={!config.rain_mode_enabled} />
          </div>
        </div>

        {/* Section RUSH */}
        <div style={{
          ...sectionStyle,
          border: config.rush_mode_enabled
            ? "1px solid rgba(239,68,68,.4)"
            : "1px solid rgba(255,255,255,.07)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{
                fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem",
                color: config.rush_mode_enabled ? "#ef4444" : "#5a5470", letterSpacing: ".15em", marginBottom: 2,
              }}>RUSH 🚀</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".8rem", color: "#5a5470" }}>
                Mode haute demande — supplément activé manuellement
              </div>
            </div>
            <button onClick={tog("rush_mode_enabled")} style={{
              width: 52, height: 28, borderRadius: 14, border: "none",
              background: config.rush_mode_enabled
                ? "linear-gradient(135deg,#ef4444,#dc2626)"
                : "rgba(255,255,255,.08)",
              cursor: "pointer", position: "relative", transition: "all .25s",
              flexShrink: 0,
            }}>
              <span style={{
                position: "absolute", top: 3,
                left: config.rush_mode_enabled ? 26 : 3,
                width: 22, height: 22, borderRadius: "50%", background: "#fff",
                transition: "left .25s", boxShadow: "0 1px 4px rgba(0,0,0,.4)",
              }} />
            </button>
          </div>
          <div>
            <span style={labelStyle}>SUPPLÉMENT RUSH (€)</span>
            <input type="number" step="0.5" min="0" value={config.rush_fee}
              onChange={e => num("rush_fee")(e.target.value)} style={{
                ...inputStyle,
                opacity: config.rush_mode_enabled ? 1 : 0.4,
              }} disabled={!config.rush_mode_enabled} />
          </div>
        </div>

        {/* Section LIVREUR */}
        <div style={sectionStyle}>
          <div style={{
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem",
            color: "#b8ff00", letterSpacing: ".15em", marginBottom: 2,
          }}>RÉMUNÉRATION LIVREUR</div>
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".8rem", color: "#5a5470", marginBottom: 12 }}>
            Calcul de la paye livreur par course. Marge = Tarif client − Rémunération livreur.
          </div>
          <div style={rowStyle}>
            <div>
              <span style={labelStyle}>PAYE DE BASE (€/course)</span>
              <input type="number" step="0.1" min="0" value={config.driver_base_pay}
                onChange={e => num("driver_base_pay")(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <span style={labelStyle}>BONUS NUIT (€)</span>
              <input type="number" step="0.1" min="0" value={config.driver_night_bonus}
                onChange={e => num("driver_night_bonus")(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <span style={labelStyle}>BONUS PLUIE (€)</span>
              <input type="number" step="0.1" min="0" value={config.driver_rain_bonus}
                onChange={e => num("driver_rain_bonus")(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <span style={labelStyle}>BONUS RUSH (€)</span>
              <input type="number" step="0.1" min="0" value={config.driver_rush_bonus}
                onChange={e => num("driver_rush_bonus")(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Bouton save bottom */}
        <button onClick={handleSave} disabled={saving} style={{
          width: "100%", padding: "16px",
          background: saving ? "rgba(0,245,255,.1)" : "linear-gradient(135deg,#00f5ff,#0090ff)",
          border: saving ? "1px solid rgba(0,245,255,.2)" : "none",
          borderRadius: 12, color: saving ? "#00f5ff" : "#000",
          fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: "1rem",
          letterSpacing: ".08em", cursor: saving ? "not-allowed" : "pointer",
          boxShadow: saving ? "none" : "0 6px 24px rgba(0,245,255,.25)",
          marginBottom: 40, transition: "all .2s",
        }}>
          {saving ? "Sauvegarde en cours..." : "💾 SAUVEGARDER LA CONFIGURATION"}
        </button>
      </div>
    </>
  );
}
