"use client";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query,
  getDocs, orderBy, limit,
} from "firebase/firestore";
import { firebaseConfig, sha256, ADMIN_PASS, ADMIN_STORAGE_KEY } from "@/lib/firebase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

// ─── Constants ────────────────────────────────────────────────
const TZ_OFFSET_MS       = -3 * 3_600_000;   // America/Cayenne = UTC-3
const DRIVERS_PER_HOUR   = 3;                 // livraisons/livreur/heure
const NIGHT_HOURS        = [20,21,22,23,0,1,2,3,4,5,6] as const;
const REFRESH_MS         = 60_000;            // 60 secondes
const HISTORY_DAYS       = 21;                // fenêtre requête (3 × 7 j)

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');`;

// ─── Timezone helpers ─────────────────────────────────────────
function utcToLocal(isoStr: string): Date {
  return new Date(new Date(isoStr).getTime() + TZ_OFFSET_MS);
}
function localHour(isoStr: string): number {
  return utcToLocal(isoStr).getUTCHours();
}
function localDateStr(isoStr: string): string {
  return utcToLocal(isoStr).toISOString().slice(0, 10);
}
function isNightHour(h: number): boolean {
  return h >= 20 || h <= 6;
}

/** Returns the ISO date strings of the 3 most-recent occurrences of today's weekday */
function getLast3SameWeekdays(): string[] {
  const localNow = utcToLocal(new Date().toISOString());
  const dow      = localNow.getDay();           // 0=Sun … 6=Sat
  const dates: string[] = [];
  let offset = 0;
  while (dates.length < 3) {
    offset++;
    const d = new Date(localNow);
    d.setUTCDate(localNow.getUTCDate() - offset);
    if (d.getDay() === dow) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Returns local hour label (handles "0h" → "00h") */
function hourLabel(h: number) { return `${String(h).padStart(2, "0")}h`; }

// ─── Items parsing ────────────────────────────────────────────
type ParsedItem = { name: string; qty: number };

function parseItems(str: string): ParsedItem[] {
  if (!str) return [];
  return str.split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(line => {
      // "NomProduit x2" or "2x NomProduit" or "NomProduit ×2"
      const suf = line.match(/^(.+?)\s*[xX×]\s*(\d+)\s*$/);
      if (suf) return { name: suf[1].trim(), qty: parseInt(suf[2]) };
      const pre = line.match(/^(\d+)\s*[xX×]\s*(.+)$/);
      if (pre) return { name: pre[2].trim(), qty: parseInt(pre[1]) };
      return { name: line.replace(/\s*[xX×]\d+.*$/i, "").trim(), qty: 1 };
    })
    .filter(i => i.name.length > 0);
}

// ─── Prediction types ─────────────────────────────────────────
type HourPrediction = { hour: number; label: string; count: number };
type StockRisk      = { id: string; name: string; stock: number; predictedNeed: number; deficit: number };

interface Predictions {
  hourly:        HourPrediction[];
  totalTonight:  number;
  peakHour:      number;
  peakCount:     number;
  driversNeeded: number;
  stockRisks:    StockRisk[];
  trendCoeff:    number;
  trendPct:      number;
  sampleSize:    number;            // orders used for history
  sameDays:      string[];
}

// ─── Core prediction engine ───────────────────────────────────
function computePredictions(orders: any[], products: any[]): Predictions {
  const sameDays = getLast3SameWeekdays();

  // ── Filter: same weekday, night hours, non-cancelled ──────
  const histOrders = orders.filter(o => {
    if (!o.createdAt) return false;
    if (o.status === "annule") return false;
    return sameDays.includes(localDateStr(o.createdAt)) && isNightHour(localHour(o.createdAt));
  });

  // ── Count by hour (sum across 3 days) ────────────────────
  const countByHour: Record<number, number> = {};
  NIGHT_HOURS.forEach(h => { countByHour[h] = 0; });
  histOrders.forEach(o => {
    const h = localHour(o.createdAt);
    if (isNightHour(h)) countByHour[h] = (countByHour[h] ?? 0) + 1;
  });

  // ── Trend coefficient (semaine passée vs semaine -2) ─────
  const localNow = utcToLocal(new Date().toISOString());
  const weekAgo  = new Date(localNow); weekAgo.setUTCDate(localNow.getUTCDate() - 7);
  const twoWeeks = new Date(localNow); twoWeeks.setUTCDate(localNow.getUTCDate() - 14);

  const lastWkCount  = orders.filter(o => {
    if (!o.createdAt || o.status === "annule") return false;
    const d = new Date(o.createdAt);
    return d >= weekAgo && isNightHour(localHour(o.createdAt));
  }).length;

  const prevWkCount  = orders.filter(o => {
    if (!o.createdAt || o.status === "annule") return false;
    const d = new Date(o.createdAt);
    return d >= twoWeeks && d < weekAgo && isNightHour(localHour(o.createdAt));
  }).length;

  const rawTrend   = prevWkCount > 0 ? (lastWkCount - prevWkCount) / prevWkCount : 0;
  const trendCoeff = prevWkCount > 0
    ? Math.min(Math.max(1 + rawTrend * 0.3, 0.85), 1.35)  // capped [−15 % ; +35 %]
    : 1.0;
  const trendPct   = Math.round((trendCoeff - 1) * 100);

  // ── Build hourly predictions ─────────────────────────────
  const hourly: HourPrediction[] = NIGHT_HOURS.map(h => ({
    hour:  h,
    label: hourLabel(h),
    count: Math.max(0, Math.round((countByHour[h] / 3) * trendCoeff)),
  }));

  const totalTonight  = hourly.reduce((s, h) => s + h.count, 0);
  const peak          = hourly.reduce((a, b) => (b.count > a.count ? b : a), hourly[0]);
  const driversNeeded = Math.max(1, Math.ceil(peak.count / DRIVERS_PER_HOUR));

  // ── Stock risk analysis ──────────────────────────────────
  // 1. Sum quantities per normalized product name over 3 days
  const salesMap: Record<string, number> = {};
  histOrders.forEach(o => {
    parseItems(o.items ?? "").forEach(({ name, qty }) => {
      const key = name.toLowerCase().trim();
      salesMap[key] = (salesMap[key] ?? 0) + qty;
    });
  });

  // 2. Average per night × trend coefficient = tonight's need
  const stockRisks: StockRisk[] = products
    .filter(p => p.name && (p.stock ?? 0) >= 0)
    .map(p => {
      const pLow = p.name.toLowerCase();
      // Fuzzy match: product name contains sale key or vice versa
      const totalSold = Object.entries(salesMap)
        .filter(([k]) => pLow.includes(k) || k.includes(pLow))
        .reduce((s, [, v]) => s + v, 0);

      const avgPerNight   = totalSold / 3;
      const predictedNeed = Math.ceil(avgPerNight * trendCoeff);
      const currentStock  = p.stock ?? 0;
      const deficit       = predictedNeed - currentStock;

      if (predictedNeed > 0 && deficit > 0) {
        return { id: p.id ?? p.name, name: p.name, stock: currentStock, predictedNeed, deficit } as StockRisk;
      }
      return null;
    })
    .filter((r): r is StockRisk => r !== null)
    .sort((a, b) => b.deficit - a.deficit);

  return {
    hourly, totalTonight,
    peakHour:  peak.hour,
    peakCount: peak.count,
    driversNeeded,
    stockRisks,
    trendCoeff, trendPct,
    sampleSize: histOrders.length,
    sameDays,
  };
}

// ─── AuthGate ─────────────────────────────────────────────────
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(false);
  const attempt = async () => {
    const h = await sha256(pwd);
    const expected = await sha256(ADMIN_PASS);
    if (h === expected) { localStorage.setItem(ADMIN_STORAGE_KEY, h); onAuth(); }
    else { setErr(true); setTimeout(() => setErr(false), 1500); }
  };
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0a0a12" }}>
      <div style={{ width:320, animation:"fadeUp .4s both" }}>
        <div style={{ fontFamily:"'Black Ops One',cursive", fontSize:"1.8rem", color:"#ff2d78", textAlign:"center", marginBottom:8 }}>
          YASSALA
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".78rem", color:"#5a5470", textAlign:"center", marginBottom:28 }}>
          ANALYTICS · ADMIN
        </div>
        <input type="password" value={pwd} placeholder="Mot de passe admin"
          onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()}
          style={{ width:"100%", background:"rgba(255,255,255,.06)", border:`1px solid ${err?"#ff2d78":"rgba(255,255,255,.12)"}`,
            borderRadius:8, padding:"12px 14px", color:"#f0eeff", fontFamily:"'Share Tech Mono',monospace", fontSize:".9rem",
            outline:"none", marginBottom:12 }}
        />
        <button onClick={attempt} style={{ width:"100%", background:"#ff2d78", color:"#000", border:"none", borderRadius:8,
          padding:"12px", cursor:"pointer", fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:".9rem" }}>
          {err ? "❌ Incorrect" : "Accéder"}
        </button>
      </div>
    </div>
  );
}

// ─── BarChart ─────────────────────────────────────────────────
function BarChart({ data, peakHour }: { data: HourPrediction[]; peakHour: number }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const BAR_H    = 72;

  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height: BAR_H + 52, paddingBottom:0 }}>
      {data.map((d, i) => {
        const isPeak  = d.hour === peakHour && d.count > 0;
        const isCurrent = (() => {
          const localH = utcToLocal(new Date().toISOString()).getUTCHours();
          return d.hour === localH;
        })();
        const barH    = d.count === 0 ? 3 : Math.max(6, Math.round((d.count / maxCount) * BAR_H));
        const color   = isPeak ? "#ff2d78" : isCurrent ? "#00f5ff" : "#b8ff00";
        return (
          <div key={d.hour} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            {/* value label */}
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".7rem", color, minHeight:16, textAlign:"center" }}>
              {d.count > 0 ? d.count : ""}
            </div>
            {/* bar */}
            <div style={{
              width:"100%", height:barH,
              background: color,
              borderRadius:"3px 3px 0 0",
              opacity: d.count === 0 ? 0.18 : 1,
              transition:"height .5s",
              boxShadow: d.count > 0 ? `0 0 8px ${color}55` : "none",
              position:"relative",
            }}>
              {isPeak && (
                <div style={{
                  position:"absolute", top:-18, left:"50%", transform:"translateX(-50%)",
                  fontSize:".6rem", color:"#ff2d78", fontFamily:"'Share Tech Mono',monospace",
                  whiteSpace:"nowrap",
                }}>▲ PIC</div>
              )}
            </div>
            {/* hour label */}
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".68rem", color: isCurrent ? "#00f5ff" : "#5a5470" }}>
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────
function Chip({ icon, label, value, sub, color = "#00f5ff" }: {
  icon:string; label:string; value:string; sub?:string; color?:string;
}) {
  return (
    <div style={{
      background:"rgba(255,255,255,.03)", border:`1px solid ${color}22`,
      borderLeft:`3px solid ${color}`, borderRadius:10,
      padding:"14px 18px", flex:1, minWidth:130,
    }}>
      <div style={{ fontSize:"1.3rem", marginBottom:5 }}>{icon}</div>
      <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:"1.45rem", color, marginBottom:2 }}>
        {value}
      </div>
      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:".7rem", color:"#6b7280", letterSpacing:".07em" }}>
        {label}
      </div>
      {sub && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".67rem", color:"#5a5470", marginTop:3 }}>
        {sub}
      </div>}
    </div>
  );
}

// ─── Alert banner ─────────────────────────────────────────────
function Alert({ icon, text, color }: { icon:string; text:string; color:string }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:10,
      background:`${color}12`, border:`1px solid ${color}44`,
      borderRadius:9, padding:"10px 16px",
    }}>
      <span style={{ fontSize:"1rem" }}>{icon}</span>
      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:".84rem", color }}>
        {text}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function AdminAnalytics() {
  const router = useRouter();

  const [authed,   setAuthed]   = useState(false);
  const [checking, setChecking] = useState(true);

  const [orders,   setOrders]   = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [onlineDrv, setOnlineDrv] = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState("");
  const [boostState, setBoostState] = useState<{
    isActive: boolean; boostAmount: number; ratio: number;
    pendingOrders: number; activeDrivers: number; reason: string; updatedAt: string;
  } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown,   setCountdown]   = useState(REFRESH_MS / 1000);

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── auth ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored   = localStorage.getItem(ADMIN_STORAGE_KEY);
        const expected = await sha256(ADMIN_PASS);
        if (stored === expected) setAuthed(true);
      } catch { /* ignore */ }
      setChecking(false);
    })();
  }, []);

  // ── data fetch ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoadErr("");

      // Orders: fetch recent (capped at 600 to avoid cost)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);

      const [ordSnap, prodSnap, drvSnap] = await Promise.all([
        getDocs(query(collection(db, "orders"),   orderBy("createdAt", "desc"), limit(600))),
        getDocs(collection(db, "products")),
        getDocs(collection(db, "drivers")),
      ]);

      const allOrders = ordSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((o: any) => o.createdAt && o.createdAt >= cutoff.toISOString().slice(0, 10));

      setOrders(allOrders);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setOnlineDrv(drvSnap.docs.filter(d => (d.data() as any).isOnline === true).length);
      setLastRefresh(new Date());
      setCountdown(REFRESH_MS / 1000);

      // ── Refresh boost state (POST = recalcule + sauvegarde) ───────────
      try {
        const boostRes = await fetch('/api/boost', {
          method: 'POST',
          headers: { 'x-admin-secret': 'yassala2025' },
        });
        if (boostRes.ok) setBoostState(await boostRes.json());
      } catch { /* non-bloquant */ }
    } catch (e: any) {
      setLoadErr("Erreur chargement : " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetchData();

    // Auto-refresh every 60 s
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    countRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);

    return () => {
      if (timerRef.current)  clearInterval(timerRef.current);
      if (countRef.current)  clearInterval(countRef.current);
    };
  }, [authed, fetchData]);

  // ── predictions ───────────────────────────────────────────
  const pred = useMemo<Predictions | null>(() => {
    if (orders.length === 0 && products.length === 0) return null;
    return computePredictions(orders, products);
  }, [orders, products]);

  // ── local state for current hour display ─────────────────
  const localNowH = utcToLocal(new Date().toISOString()).getUTCHours();
  const isNight   = isNightHour(localNowH);

  // ── render guards ─────────────────────────────────────────
  if (checking) return null;
  if (!authed)  return (
    <>
      <style>{`${FONTS}*{margin:0;padding:0;box-sizing:border-box;}body{background:#0a0a12;color:#f0eeff;}
      @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}`}</style>
      <AuthGate onAuth={() => setAuthed(true)} />
    </>
  );

  // ── helpers ───────────────────────────────────────────────
  const driverAlert = pred && onlineDrv < pred.driversNeeded;
  const fmtTime = (h: number) => `${String(h).padStart(2,"0")}h00`;

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#ff2d78;border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.45;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        .chip-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
        .card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:18px 22px;margin-bottom:16px;}
        .section-title{font-family:'Inter',sans-serif;font-weight:600;font-size:.72rem;letter-spacing:.1em;color:#5a5470;margin-bottom:14px;}
        .btn{border:none;border-radius:7px;padding:8px 16px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:.8rem;transition:opacity .15s;}
        .btn:hover{opacity:.82;}
      `}</style>

      <div style={{ minHeight:"100vh", background:"radial-gradient(ellipse 80% 50% at 10% 0%,rgba(0,245,255,.04) 0%,transparent 60%)" }}>

        {/* ── top bar ── */}
        <div style={{
          display:"flex", alignItems:"center", gap:14, padding:"14px 24px",
          borderBottom:"1px solid rgba(255,255,255,.06)",
          background:"rgba(0,0,0,.4)", backdropFilter:"blur(8px)",
          position:"sticky", top:0, zIndex:20,
        }}>
          <button onClick={() => router.push("/admin")}
            style={{ background:"none", border:"none", color:"#5a5470", cursor:"pointer", fontSize:"1.1rem" }}>←</button>
          <div style={{ fontFamily:"'Black Ops One',cursive", fontSize:"1.1rem", color:"#ff2d78" }}>YASSALA</div>
          <div style={{ fontFamily:"'Rajdhani',sans-serif", fontWeight:600, color:"#5a5470", fontSize:".88rem" }}>
            PRÉVISIONS INTELLIGENTES
          </div>
          {/* refresh status */}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
            {loading && (
              <div style={{ width:14, height:14, border:"2px solid #00f5ff", borderTopColor:"transparent",
                borderRadius:"50%", animation:"spin 1s linear infinite" }} />
            )}
            {lastRefresh && !loading && (
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".7rem", color:"#5a5470" }}>
                Rafraîchi il y a {REFRESH_MS/1000 - countdown}s
              </div>
            )}
            <button className="btn" onClick={fetchData}
              style={{ background:"rgba(0,245,255,.1)", color:"#00f5ff", padding:"6px 12px", fontSize:".75rem" }}>
              ↻ Actualiser
            </button>
          </div>
        </div>

        <div style={{ padding:"20px 24px", maxWidth:960, margin:"0 auto", animation:"fadeUp .3s both" }}>

          {/* ── header row ── */}
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontFamily:"'Black Ops One',cursive", fontSize:"1.6rem", color:"#f0eeff", letterSpacing:".04em" }}>
                Prévisions ce soir
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".75rem", color:"#5a5470", marginTop:4 }}>
                Matoury · 20h → 06h · America/Cayenne
                {pred && <span style={{ marginLeft:10, color:"#5a5470" }}>
                  (base : {pred.sampleSize} commandes — {pred.sameDays.map(d => d.slice(5)).join(", ")})
                </span>}
              </div>
            </div>
            <div style={{
              fontFamily:"'Share Tech Mono',monospace", fontSize:".72rem", color:"#5a5470",
              background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)",
              borderRadius:8, padding:"6px 14px",
            }}>
              🕐 {fmtTime(localNowH)} · {isNight ? "🌙 nuit active" : "☀️ hors créneau"}
              <br />
              Prochain refresh dans <span style={{ color:"#00f5ff" }}>{countdown}s</span>
            </div>
          </div>

          {/* ── error ── */}
          {loadErr && (
            <div style={{ background:"rgba(255,45,120,.1)", border:"1px solid rgba(255,45,120,.4)",
              borderRadius:8, padding:"10px 16px", marginBottom:16,
              fontFamily:"'Share Tech Mono',monospace", fontSize:".8rem", color:"#ff2d78" }}>
              {loadErr}
            </div>
          )}

          {/* ── loading ── */}
          {loading && !pred && (
            <div style={{ color:"#5a5470", fontFamily:"'Share Tech Mono',monospace", animation:"pulse 1s infinite",
              padding:"40px 0", textAlign:"center" }}>
              Analyse en cours…
            </div>
          )}

          {pred && (<>

            {/* ── 4 KPI chips ── */}
            <div className="chip-row">
              <Chip icon="📦" label="Commandes prévues ce soir" value={String(pred.totalTonight)}
                sub={`tendance ${pred.trendPct >= 0 ? "+" : ""}${pred.trendPct}% vs sem. précédente`}
                color="#00f5ff" />
              <Chip icon="🔥" label="Heure de pic prévue" value={fmtTime(pred.peakHour)}
                sub={`≈ ${pred.peakCount} cmd cette heure-là`}
                color="#ff2d78" />
              <Chip icon="🏍️" label="Livreurs conseillés" value={String(pred.driversNeeded)}
                sub={`en ligne actuellement : ${onlineDrv}`}
                color={driverAlert ? "#ff9500" : "#b8ff00"} />
              <Chip icon="📊" label="Coefficient tendance" value={`×${pred.trendCoeff.toFixed(2)}`}
                sub={pred.trendPct > 0 ? `hausse détectée` : pred.trendPct < 0 ? `baisse détectée` : `stable`}
                color={pred.trendPct > 5 ? "#ff9500" : pred.trendPct < -5 ? "#a855f7" : "#b8ff00"} />
            </div>

            {/* ── smart alerts ── */}
            {(driverAlert || pred.peakCount > 0 || pred.stockRisks.length > 0) && (
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                {driverAlert && (
                  <Alert icon="⚠️"
                    text={`Manque de livreurs : ${pred.driversNeeded} conseillés, seulement ${onlineDrv} en ligne actuellement`}
                    color="#ff9500" />
                )}
                {pred.peakCount > 0 && (
                  <Alert icon="🔥"
                    text={`Pic de demande prévu à ${fmtTime(pred.peakHour)} — environ ${pred.peakCount} commandes dans l'heure`}
                    color="#ff2d78" />
                )}
                {pred.stockRisks.slice(0, 3).map(r => (
                  <Alert key={r.id} icon="📦"
                    text={`Stock faible · ${r.name} : ${r.stock} unité${r.stock>1?"s":""} dispo, besoin estimé ${r.predictedNeed} (déficit ${r.deficit})`}
                    color="#a855f7" />
                ))}
              </div>
            )}

            {/* ── BOOST card ── */}
            <div className="card" style={{ marginBottom:16,
              borderColor: boostState?.isActive ? (boostState.boostAmount >= 5 ? "rgba(255,45,120,.4)" : boostState.boostAmount >= 3 ? "rgba(255,149,0,.4)" : "rgba(168,85,247,.4)") : "rgba(255,255,255,.06)",
            }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ fontSize:"1.8rem" }}>
                    {boostState?.isActive ? (boostState.boostAmount >= 5 ? "🔥" : boostState.boostAmount >= 3 ? "⚡" : "🚀") : "💤"}
                  </div>
                  <div>
                    <div style={{ fontFamily:"'Black Ops One',cursive", fontSize:"1rem", letterSpacing:".06em",
                      color: boostState?.isActive
                        ? (boostState.boostAmount >= 5 ? "#ff2d78" : boostState.boostAmount >= 3 ? "#ff9500" : "#a855f7")
                        : "#5a5470" }}>
                      BOOST AUTO — {boostState ? (boostState.isActive ? "ACTIF" : "INACTIF") : "…"}
                    </div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".7rem", color:"#5a5470", marginTop:3 }}>
                      {boostState?.reason ?? "Calcul en cours…"}
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                  {[
                    { label:"Boost / livraison", value: boostState ? `+${boostState.boostAmount.toFixed(2)} €` : "—",
                      color: boostState?.isActive ? "#a855f7" : "#5a5470" },
                    { label:"Ratio cmd/livreur",  value: boostState ? boostState.ratio.toFixed(2) : "—", color:"#00f5ff" },
                    { label:"Cmd. en attente",    value: boostState ? String(boostState.pendingOrders) : "—", color:"#ff9500" },
                    { label:"Livreurs actifs",    value: boostState ? String(boostState.activeDrivers) : "—", color:"#b8ff00" },
                  ].map(c => (
                    <div key={c.label} style={{
                      background:"rgba(255,255,255,.03)", border:`1px solid ${c.color}22`,
                      borderLeft:`3px solid ${c.color}`, borderRadius:8, padding:"8px 14px", minWidth:110,
                    }}>
                      <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:".95rem", color:c.color }}>
                        {c.value}
                      </div>
                      <div style={{ fontFamily:"'Inter',sans-serif", fontSize:".63rem", color:"#5a5470" }}>
                        {c.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {boostState && (
                <div style={{ marginTop:10, fontFamily:"'Share Tech Mono',monospace", fontSize:".66rem", color:"#3a3450" }}>
                  Seuils : ratio≥2→+1.50€ · ratio≥3→+3.00€ · ratio≥4→+5.00€ · MàJ {boostState.updatedAt.slice(11,19)}
                </div>
              )}
            </div>

            {/* ── bar chart ── */}
            <div className="card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div className="section-title" style={{ marginBottom:0 }}>
                  COMMANDES PRÉVUES PAR HEURE — 20h → 06h
                </div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".72rem", color:"#5a5470" }}>
                  <span style={{ color:"#ff2d78" }}>■</span> pic &nbsp;
                  <span style={{ color:"#00f5ff" }}>■</span> heure actuelle &nbsp;
                  <span style={{ color:"#b8ff00" }}>■</span> autres heures
                </div>
              </div>
              <BarChart data={pred.hourly} peakHour={pred.peakHour} />
            </div>

            {/* ── bottom 2 columns ── */}
            <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>

              {/* Risques stock */}
              <div className="card" style={{ flex:1, minWidth:260, marginBottom:0 }}>
                <div className="section-title">RISQUES RUPTURE DE STOCK</div>
                {pred.stockRisks.length === 0 ? (
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".78rem", color:"#5a5470" }}>
                    // aucun risque détecté ✓
                  </div>
                ) : (
                  pred.stockRisks.map(r => (
                    <div key={r.id} style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,.04)",
                    }}>
                      <span style={{ fontSize:"1rem" }}>📦</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontWeight:700, fontSize:".9rem", color:"#f0eeff" }}>
                          {r.name}
                        </div>
                        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:".68rem", color:"#5a5470" }}>
                          stock {r.stock} · besoin ~{r.predictedNeed}
                        </div>
                      </div>
                      <span style={{
                        padding:"3px 9px", borderRadius:20,
                        fontFamily:"'Share Tech Mono',monospace", fontSize:".7rem",
                        background:"rgba(168,85,247,.15)", color:"#a855f7",
                      }}>
                        −{r.deficit}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Détail heures */}
              <div className="card" style={{ flex:1, minWidth:220, marginBottom:0 }}>
                <div className="section-title">DÉTAIL HORAIRE PRÉVU</div>
                {pred.hourly.map(h => (
                  <div key={h.hour} style={{
                    display:"flex", alignItems:"center", gap:8,
                    padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,.03)",
                  }}>
                    <span style={{
                      fontFamily:"'Share Tech Mono',monospace", fontSize:".78rem",
                      color: h.hour === pred.peakHour ? "#ff2d78" : "#5a5470",
                      minWidth:34,
                    }}>{h.label}</span>
                    {/* mini bar */}
                    <div style={{
                      flex:1, height:6, background:"rgba(255,255,255,.05)", borderRadius:3, overflow:"hidden",
                    }}>
                      <div style={{
                        width: `${(h.count / (pred.peakCount || 1)) * 100}%`,
                        height:"100%", borderRadius:3,
                        background: h.hour === pred.peakHour ? "#ff2d78" : "#b8ff00",
                        transition:"width .5s",
                        boxShadow: h.hour === pred.peakHour ? "0 0 6px #ff2d7888" : "none",
                      }} />
                    </div>
                    <span style={{
                      fontFamily:"'Black Ops One',cursive", fontSize:".8rem",
                      color: h.hour === pred.peakHour ? "#ff2d78" : h.count > 0 ? "#b8ff00" : "#3a3450",
                      minWidth:26, textAlign:"right",
                    }}>{h.count}</span>
                  </div>
                ))}
              </div>

            </div>

            {/* ── methodology note ── */}
            <div style={{
              marginTop:16, padding:"12px 16px",
              background:"rgba(255,255,255,.015)", border:"1px solid rgba(255,255,255,.04)",
              borderRadius:8, fontFamily:"'Share Tech Mono',monospace", fontSize:".68rem",
              color:"#5a5470", lineHeight:1.7,
            }}>
              // Méthode : moyenne des 3 derniers {["dim.","lun.","mar.","mer.","jeu.","ven.","sam."][utcToLocal(new Date().toISOString()).getDay()]}s
              · coefficient tendance ×{pred.trendCoeff.toFixed(2)} (sem. courante vs sem. -1)
              · {DRIVERS_PER_HOUR} livraisons/livreur/h · fenêtre 20h→06h
              · données {pred.sampleSize} cmd analysées
            </div>

          </>)}

        </div>
      </div>
    </>
  );
}
