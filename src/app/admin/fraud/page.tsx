"use client";
/**
 * /admin/fraud — Tableau de bord Anti-Abus ULTRA
 *
 * - Cards KPI : High Risk, Events today, Cash >24h, Bloqués
 * - Table triable des drivers avec riskScore, strikes, flags
 * - Actions : Voir | Bloquer/Débloquer | Marquer OK | Export CSV
 */
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where,
  onSnapshot, doc, updateDoc, getDocs, orderBy, limit,
} from "firebase/firestore";
import {
  firebaseConfig, sha256, ADMIN_PASS, ADMIN_STORAGE_KEY,
  type DriverProfile, type FraudEvent,
} from "@/lib/firebase";
import { FLAG_LABELS, riskColor } from "@/utils/fraudDetection";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');`;

// ── Auth gate ─────────────────────────────────────────────────────────────────
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(false);
  const attempt = async () => {
    const h = await sha256(pwd);
    if (h === await sha256(ADMIN_PASS)) {
      localStorage.setItem(ADMIN_STORAGE_KEY, h); onAuth();
    } else { setErr(true); setTimeout(() => setErr(false), 1500); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a12" }}>
      <div style={{ width: 320 }}>
        <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem", color: "#ff2d78", textAlign: "center", marginBottom: 24 }}>YASSALA ADMIN</div>
        <input type="password" value={pwd} placeholder="Mot de passe admin"
          onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()}
          style={{ width: "100%", background: "rgba(255,255,255,.06)", border: `1px solid ${err ? "#ff2d78" : "rgba(255,255,255,.12)"}`, borderRadius: 8, padding: "12px 14px", color: "#f0eeff", fontFamily: "'Share Tech Mono',monospace", fontSize: ".9rem", outline: "none", marginBottom: 12 }} />
        <button onClick={attempt} style={{ width: "100%", background: "#ff2d78", color: "#000", border: "none", borderRadius: 8, padding: "12px", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 700 }}>
          {err ? "Incorrect" : "Accéder"}
        </button>
      </div>
    </div>
  );
}

type SortKey = "riskScore" | "strikesCount" | "name";
type FilterKey = "all" | "risk" | "blocked";

export default function FraudDashboard() {
  const router = useRouter();
  const [authed,   setAuthed]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [drivers,  setDrivers]  = useState<DriverProfile[]>([]);
  const [todayEventsCount,  setTodayEventsCount]  = useState(0);
  const [cashUnsettled24h,  setCashUnsettled24h]  = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [sortBy,   setSortBy]   = useState<SortKey>("riskScore");
  const [filter,   setFilter]   = useState<FilterKey>("all");
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  // ── auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(ADMIN_STORAGE_KEY);
        if (stored && stored === await sha256(ADMIN_PASS)) setAuthed(true);
      } catch {}
      setChecking(false);
    })();
  }, []);

  // ── data subscriptions ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;

    // Drivers (real-time)
    const unsub1 = onSnapshot(collection(db, "drivers"), snap => {
      setDrivers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as DriverProfile)));
      setLoading(false);
    });

    // Today's fraud events count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const unsub2 = onSnapshot(
      query(collection(db, "fraud_events"), where("createdAt", ">=", todayStart.toISOString())),
      snap => setTodayEventsCount(snap.size),
    );

    // Cash unsettled > 24h (one-shot)
    getDocs(query(
      collection(db, "deliveries"),
      where("paymentType", "==", "CASH"),
      where("cashStatus", "==", "unsettled"),
    )).then(snap => {
      const count = snap.docs.filter(d => {
        const ca = d.data().createdAt;
        return ca && Date.now() - Date.parse(ca) > 24 * 3600_000;
      }).length;
      setCashUnsettled24h(count);
    });

    return () => { unsub1(); unsub2(); };
  }, [authed]);

  // ── computed rows ─────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    let list = [...drivers];
    if (filter === "risk")    list = list.filter(d => (d.riskScore ?? 0) >= 30 || (d.strikesCount ?? 0) > 0);
    if (filter === "blocked") list = list.filter(d => d.isBlocked);
    list.sort((a, b) => {
      if (sortBy === "name")         return (a.name ?? "").localeCompare(b.name ?? "");
      if (sortBy === "strikesCount") return (b.strikesCount ?? 0) - (a.strikesCount ?? 0);
      return (b.riskScore ?? 0) - (a.riskScore ?? 0);
    });
    return list;
  }, [drivers, sortBy, filter]);

  const highRiskCount = drivers.filter(d => (d.riskScore ?? 0) >= 60).length;
  const blockedCount  = drivers.filter(d => d.isBlocked).length;

  // ── actions ───────────────────────────────────────────────────────────────
  const toggleBlock = async (uid: string, cur: boolean) => {
    await updateDoc(doc(db, "drivers", uid), { isBlocked: !cur });
  };
  const markOk = async (uid: string) => {
    await updateDoc(doc(db, "drivers", uid), {
      riskScore: 0, strikesCount: 0, isBlocked: false, suspiciousEventsCount: 0,
    });
  };
  const analyzeDriver = async (uid: string) => {
    setAnalyzing(uid);
    try {
      // Fetch last 5 unanalyzed deliveries for the driver
      const snap = await getDocs(query(
        collection(db, "deliveries"),
        where("driverId", "==", uid),
        orderBy("createdAt", "desc"),
        limit(5),
      ));
      for (const d of snap.docs) {
        await fetch("/api/fraud-check", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-secret": "yassala2025" },
          body: JSON.stringify({ deliveryId: d.id }),
        });
      }
    } catch {}
    setAnalyzing(null);
  };

  const exportCSV = () => {
    const header = "driverId,name,phone,riskScore,strikes,isBlocked\n";
    const body   = rows.map(r =>
      `${r.uid},${r.name},${r.phone ?? ""},${r.riskScore ?? 0},${r.strikesCount ?? 0},${r.isBlocked ?? false}`,
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "fraud_drivers.csv"; a.click();
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (checking) return null;
  if (!authed)  return <AuthGate onAuth={() => setAuthed(true)} />;

  const kpis = [
    { label: "HIGH RISK",          value: highRiskCount,       color: "#ff2d78", icon: "🚨" },
    { label: "EVENTS AUJOURD'HUI", value: todayEventsCount,    color: "#ff9500", icon: "⚡" },
    { label: "CASH > 24H",         value: cashUnsettled24h,    color: "#ffd600", icon: "💵" },
    { label: "BLOQUÉS",            value: blockedCount,         color: "#a855f7", icon: "🔒" },
  ];

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#ff2d78;border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        .card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:18px 22px;margin-bottom:16px;}
        .btn{border:none;border-radius:7px;padding:6px 12px;font-family:'Inter',sans-serif;font-weight:600;font-size:.75rem;cursor:pointer;transition:opacity .15s;white-space:nowrap;}
        .btn:hover{opacity:.8;}
        .btn:disabled{opacity:.4;cursor:default;}
        .pill{padding:2px 8px;border-radius:20px;font-family:'Share Tech Mono',monospace;font-size:.66rem;display:inline-block;}
        table{width:100%;border-collapse:collapse;font-size:.8rem;}
        th{padding:8px 12px;text-align:left;font-family:'Inter',sans-serif;font-weight:600;font-size:.66rem;letter-spacing:.1em;color:#5a5470;border-bottom:1px solid rgba(255,255,255,.07);}
        td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:top;}
        tr:hover td{background:rgba(255,255,255,.02);}
        .risk-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;width:80px;margin-top:4px;}
        .risk-bar-fill{height:100%;border-radius:3px;transition:width .3s;}
        .flag-tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:.6rem;font-family:'Share Tech Mono',monospace;margin:1px;background:rgba(255,45,120,.15);color:#ff2d78;}
        .filter-btn{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:5px 14px;font-family:'Inter',sans-serif;font-size:.75rem;font-weight:600;cursor:pointer;color:#5a5470;transition:all .15s;}
        .filter-btn.active{background:rgba(255,45,120,.15);border-color:rgba(255,45,120,.5);color:#ff2d78;}
      `}</style>

      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse 70% 50% at 20% 0%,rgba(255,45,120,.04) 0%,transparent 60%)", padding: "0 0 60px" }}>

        {/* ── top bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.05)", background: "rgba(0,0,0,.3)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 10 }}>
          <button onClick={() => router.push("/admin")} style={{ background: "none", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem" }}>←</button>
          <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#ff2d78", letterSpacing: ".06em" }}>ANTI-ABUS ULTRA</div>
          <button onClick={exportCSV} className="btn" style={{ marginLeft: "auto", background: "rgba(168,85,247,.15)", color: "#a855f7" }}>Export CSV</button>
        </div>

        <div style={{ padding: "20px 16px", maxWidth: 1100, margin: "0 auto", animation: "fadeUp .3s both" }}>

          {/* ── KPI cards ── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            {kpis.map(k => (
              <div key={k.label} style={{ flex: 1, minWidth: 130, background: "rgba(255,255,255,.02)", border: `1px solid ${k.color}22`, borderLeft: `3px solid ${k.color}`, borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: "1.1rem", marginBottom: 4 }}>{k.icon}</div>
                <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem", color: k.color }}>{k.value}</div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".64rem", color: "#5a5470", letterSpacing: ".08em" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* ── filters + sort ── */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            {(["all", "risk", "blocked"] as FilterKey[]).map(f => (
              <button key={f} className={`filter-btn ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? "Tous" : f === "risk" ? "⚠ À risque" : "🔒 Bloqués"}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470" }}>
              Trier :
              {(["riskScore", "strikesCount", "name"] as SortKey[]).map(s => (
                <button key={s} className={`filter-btn ${sortBy === s ? "active" : ""}`} onClick={() => setSortBy(s)}>
                  {s === "riskScore" ? "Risque" : s === "strikesCount" ? "Strikes" : "Nom"}
                </button>
              ))}
            </div>
          </div>

          {/* ── table ── */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#5a5470", fontFamily: "'Share Tech Mono',monospace" }}>Chargement…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#5a5470", fontFamily: "'Share Tech Mono',monospace" }}>// aucun livreur trouvé</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>LIVREUR</th>
                      <th>RISK SCORE</th>
                      <th>STRIKES</th>
                      <th>STATUT</th>
                      <th>TOP FLAGS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const risk = r.riskScore ?? 0;
                      const col  = riskColor(risk);
                      return (
                        <tr key={r.uid}>
                          <td>
                            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, color: "#f0eeff" }}>{r.name}</div>
                            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "#5a5470" }}>{r.phone}</div>
                          </td>
                          <td>
                            <div style={{ fontFamily: "'Black Ops One',cursive", color: col, fontSize: "1.1rem" }}>{risk}</div>
                            <div className="risk-bar">
                              <div className="risk-bar-fill" style={{ width: `${risk}%`, background: col }} />
                            </div>
                          </td>
                          <td>
                            <span style={{ fontFamily: "'Black Ops One',cursive", color: (r.strikesCount ?? 0) > 0 ? "#ff9500" : "#5a5470" }}>
                              {r.strikesCount ?? 0}
                            </span>
                          </td>
                          <td>
                            {r.isBlocked ? (
                              <span className="pill" style={{ background: "rgba(255,45,120,.15)", color: "#ff2d78" }}>🔒 BLOQUÉ</span>
                            ) : risk >= 60 ? (
                              <span className="pill" style={{ background: "rgba(255,149,0,.12)", color: "#ff9500" }}>⚠ WARNING</span>
                            ) : (
                              <span className="pill" style={{ background: "rgba(90,84,112,.15)", color: "#5a5470" }}>OK</span>
                            )}
                          </td>
                          <td style={{ maxWidth: 200 }}>
                            {/* We can't show flags here without fetching events per driver - show suspiciousEventsCount instead */}
                            {(r.suspiciousEventsCount ?? 0) > 0 ? (
                              <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "#ff9500" }}>
                                {r.suspiciousEventsCount} événement{(r.suspiciousEventsCount ?? 0) > 1 ? "s" : ""} suspect{(r.suspiciousEventsCount ?? 0) > 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem" }}>—</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              <button className="btn"
                                onClick={() => router.push(`/admin/fraud/${r.uid}`)}
                                style={{ background: "rgba(255,255,255,.06)", color: "#f0eeff" }}>
                                Voir
                              </button>
                              <button className="btn"
                                onClick={() => analyzeDriver(r.uid)}
                                disabled={analyzing === r.uid}
                                style={{ background: "rgba(0,245,255,.1)", color: "#00f5ff" }}>
                                {analyzing === r.uid ? "…" : "Analyser"}
                              </button>
                              <button className="btn"
                                onClick={() => toggleBlock(r.uid, r.isBlocked ?? false)}
                                style={{ background: r.isBlocked ? "rgba(184,255,0,.12)" : "rgba(255,45,120,.12)", color: r.isBlocked ? "#b8ff00" : "#ff2d78" }}>
                                {r.isBlocked ? "Débloquer" : "Bloquer"}
                              </button>
                              {(risk > 0 || (r.strikesCount ?? 0) > 0) && (
                                <button className="btn"
                                  onClick={() => markOk(r.uid)}
                                  style={{ background: "rgba(184,255,0,.1)", color: "#b8ff00" }}>
                                  ✓ OK
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── instructions ── */}
          <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: "14px 18px", fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", lineHeight: 1.9, color: "#5a5470" }}>
            <span style={{ color: "#00f5ff" }}>// Guide rapide</span><br />
            <span style={{ color: "#b8ff00" }}>Analyser</span> → Lance l'anti-fraude sur les 5 dernières livraisons du driver<br />
            <span style={{ color: "#ff2d78" }}>Bloquer</span> → Empêche le driver d'être assigné (isBlocked=true)<br />
            <span style={{ color: "#b8ff00" }}>✓ OK</span> → Remet le score à 0 (résolution manuelle admin)<br />
            riskScore ≥ 80 → blocage automatique | ≥ 60 → warning | &lt; 60 → ok
          </div>
        </div>
      </div>
    </>
  );
}
