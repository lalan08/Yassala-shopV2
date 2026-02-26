"use client";
/**
 * /admin/fraud/[driverId] — Profil Risque Livreur
 *
 * - Score de risque + strikes + statut blocage
 * - Liste des fraud_events (avec bouton "Résoudre")
 * - 20 dernières livraisons avec fraudFlags et fraudScore
 * - Bouton "Bloquer/Débloquer" + "Marquer OK"
 * - Bouton "Analyser livraisons" → POST /api/fraud-check
 * - Notes admin (stockées dans drivers/{id}.adminNotes)
 */
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where,
  onSnapshot, doc, updateDoc, orderBy, limit, getDocs,
} from "firebase/firestore";
import {
  firebaseConfig, sha256, ADMIN_PASS, ADMIN_STORAGE_KEY,
  type DriverProfile, type Delivery, type FraudEvent,
} from "@/lib/firebase";
import { FLAG_LABELS, riskColor, severityColor } from "@/utils/fraudDetection";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');`;
const fmtD = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtDT = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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

export default function DriverRiskProfile() {
  const router   = useRouter();
  const params   = useParams();
  const driverId = params.driverId as string;

  const [authed,     setAuthed]     = useState(false);
  const [checking,   setChecking]   = useState(true);
  const [driver,     setDriver]     = useState<DriverProfile | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [events,     setEvents]     = useState<FraudEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [noteInput,  setNoteInput]  = useState("");
  const [noteSaved,  setNoteSaved]  = useState(false);
  const [resolving,  setResolving]  = useState<string | null>(null);

  // ── auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(ADMIN_STORAGE_KEY);
        if (stored && stored === await sha256(ADMIN_PASS)) setAuthed(true);
      } catch {}
      setChecking(false);
    })();
  }, []);

  // ── data ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authed || !driverId) return;

    // Driver doc
    const unsub1 = onSnapshot(doc(db, "drivers", driverId), snap => {
      if (snap.exists()) {
        const d = { uid: snap.id, ...snap.data() } as DriverProfile & { adminNotes?: string };
        setDriver(d);
        setNoteInput((d as any).adminNotes ?? "");
      }
    });

    // Last 20 deliveries
    const unsub2 = onSnapshot(
      query(collection(db, "deliveries"), where("driverId", "==", driverId), orderBy("createdAt", "desc"), limit(20)),
      snap => { setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as Delivery))); setLoading(false); },
      () => setLoading(false),
    );

    // Fraud events (fetched + sorted client-side to avoid index requirement)
    const unsub3 = onSnapshot(
      query(collection(db, "fraud_events"), where("driverId", "==", driverId)),
      snap => {
        const evts = snap.docs.map(d => ({ id: d.id, ...d.data() } as FraudEvent));
        evts.sort((a, b) => {
          if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        });
        setEvents(evts);
      },
    );

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [authed, driverId]);

  // ── actions ───────────────────────────────────────────────────────────────
  const toggleBlock = async () => {
    if (!driver) return;
    await updateDoc(doc(db, "drivers", driverId), { isBlocked: !driver.isBlocked });
  };

  const markOk = async () => {
    await updateDoc(doc(db, "drivers", driverId), {
      riskScore: 0, strikesCount: 0, isBlocked: false, suspiciousEventsCount: 0,
    });
  };

  const resolveEvent = async (eventId: string) => {
    setResolving(eventId);
    await updateDoc(doc(db, "fraud_events", eventId), {
      resolved:   true,
      resolvedAt: new Date().toISOString(),
      resolvedBy: "admin",
    });
    setResolving(null);
  };

  const saveNote = async () => {
    setSaving(true);
    await updateDoc(doc(db, "drivers", driverId), { adminNotes: noteInput });
    setSaving(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const snap = await getDocs(query(
        collection(db, "deliveries"),
        where("driverId", "==", driverId),
        orderBy("createdAt", "desc"),
        limit(10),
      ));
      for (const d of snap.docs) {
        await fetch("/api/fraud-check", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-secret": "yassala2025" },
          body: JSON.stringify({ deliveryId: d.id }),
        });
      }
    } catch {}
    setAnalyzing(false);
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (checking) return null;
  if (!authed)  return <AuthGate onAuth={() => setAuthed(true)} />;

  const risk      = driver?.riskScore ?? 0;
  const rCol      = riskColor(risk);
  const unresolved = events.filter(e => !e.resolved);

  const statusLabel = driver?.isBlocked ? "BLOQUÉ" : risk >= 80 ? "BLOQUÉ AUTO" : risk >= 60 ? "WARNING" : "OK";
  const statusColor = driver?.isBlocked || risk >= 80 ? "#ff2d78" : risk >= 60 ? "#ff9500" : "#b8ff00";

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#ff2d78;border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        .card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:18px 22px;margin-bottom:14px;}
        .section-title{font-family:'Inter',sans-serif;font-weight:600;font-size:.72rem;letter-spacing:.1em;color:#5a5470;margin-bottom:14px;}
        .btn{border:none;border-radius:7px;padding:8px 16px;font-family:'Inter',sans-serif;font-weight:600;font-size:.8rem;cursor:pointer;transition:opacity .15s;}
        .btn:hover{opacity:.8;}
        .btn:disabled{opacity:.4;cursor:default;}
        .pill{padding:2px 8px;border-radius:20px;font-family:'Share Tech Mono',monospace;font-size:.65rem;display:inline-block;}
        .del-row{display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04);}
        .del-row:last-child{border-bottom:none;}
        .event-row{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.04);}
        .event-row:last-child{border-bottom:none;}
        .flag-tag{display:inline-block;padding:2px 7px;border-radius:4px;font-size:.62rem;font-family:'Share Tech Mono',monospace;margin:1px;background:rgba(255,45,120,.15);color:#ff2d78;}
        .risk-bar{height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:6px;}
        .risk-bar-fill{height:100%;border-radius:4px;}
        textarea{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px 14px;color:#f0eeff;font-family:'Share Tech Mono',monospace;font-size:.78rem;resize:vertical;outline:none;min-height:80px;}
        textarea:focus{border-color:#00f5ff;}
        .detail-pre{background:rgba(0,0,0,.3);border-radius:6px;padding:6px 10px;font-family:'Share Tech Mono',monospace;font-size:.6rem;color:#5a5470;margin-top:4px;overflow-x:auto;}
      `}</style>

      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse 70% 50% at 20% 0%,rgba(255,45,120,.04) 0%,transparent 60%)", padding: "0 0 60px" }}>

        {/* ── top bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,.05)", background: "rgba(0,0,0,.3)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 10 }}>
          <button onClick={() => router.push("/admin/fraud")} style={{ background: "none", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem" }}>←</button>
          <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#ff2d78", letterSpacing: ".06em" }}>PROFIL RISQUE</div>
          {driver && (
            <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: "1rem", color: "#f0eeff", marginLeft: 8 }}>
              {driver.name}
            </div>
          )}
        </div>

        <div style={{ padding: "20px 16px", maxWidth: 760, margin: "0 auto", animation: "fadeUp .3s both" }}>

          {loading && <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace" }}>Chargement…</div>}

          {!loading && driver && (<>

            {/* ── risk profile card ── */}
            <div className="card">
              <div className="section-title">PROFIL DE RISQUE</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                {[
                  { label: "Risk Score",   value: String(risk),                    color: rCol },
                  { label: "Strikes",      value: String(driver.strikesCount ?? 0), color: (driver.strikesCount ?? 0) > 0 ? "#ff9500" : "#5a5470" },
                  { label: "Statut",       value: statusLabel,                     color: statusColor },
                  { label: "Événements",   value: String(driver.suspiciousEventsCount ?? 0), color: "#a855f7" },
                ].map(c => (
                  <div key={c.label} style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,.02)", border: `1px solid ${c.color}22`, borderLeft: `3px solid ${c.color}`, borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.4rem", color: c.color }}>{c.value}</div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".64rem", color: "#5a5470", letterSpacing: ".06em" }}>{c.label}</div>
                  </div>
                ))}
              </div>
              <div className="risk-bar">
                <div className="risk-bar-fill" style={{ width: `${risk}%`, background: rCol }} />
              </div>
              {driver.lastKnownLocation && (
                <div style={{ marginTop: 10, fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "#5a5470" }}>
                  Dernière position : {driver.lastKnownLocation.lat.toFixed(5)}, {driver.lastKnownLocation.lng.toFixed(5)}
                  {driver.lastKnownLocation.updatedAt && ` — ${fmtDT(driver.lastKnownLocation.updatedAt)}`}
                </div>
              )}
            </div>

            {/* ── action bar ── */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <button className="btn" onClick={toggleBlock}
                style={{ background: driver.isBlocked ? "rgba(184,255,0,.12)" : "rgba(255,45,120,.15)", color: driver.isBlocked ? "#b8ff00" : "#ff2d78" }}>
                {driver.isBlocked ? "🔓 Débloquer" : "🔒 Bloquer"}
              </button>
              <button className="btn" onClick={markOk}
                style={{ background: "rgba(184,255,0,.1)", color: "#b8ff00" }}>
                ✓ Marquer OK
              </button>
              <button className="btn" onClick={runAnalysis} disabled={analyzing}
                style={{ background: "rgba(0,245,255,.1)", color: "#00f5ff" }}>
                {analyzing ? "Analyse en cours…" : "🔍 Analyser livraisons"}
              </button>
            </div>

            {/* ── fraud events ── */}
            <div className="card">
              <div className="section-title">
                ÉVÉNEMENTS FRAUDE ({events.length})
                {unresolved.length > 0 && (
                  <span style={{ marginLeft: 8, color: "#ff2d78" }}>• {unresolved.length} non résolus</span>
                )}
              </div>
              {events.length === 0 ? (
                <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem" }}>// aucun événement</div>
              ) : events.map(ev => (
                <div key={ev.id} className="event-row" style={{ opacity: ev.resolved ? 0.5 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {/* severity badge */}
                    <span className="pill" style={{ background: `${severityColor(ev.severity)}22`, color: severityColor(ev.severity) }}>
                      {ev.severity.toUpperCase()}
                    </span>
                    {/* flag type */}
                    <span style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".88rem", color: "#f0eeff" }}>
                      {FLAG_LABELS[ev.type] ?? ev.type}
                    </span>
                    {/* score impact */}
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".65rem", color: "#ff9500" }}>+{ev.scoreImpact}pts</span>
                    {/* date */}
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".62rem", color: "#5a5470", marginLeft: "auto" }}>
                      {fmtDT(ev.createdAt)}
                    </span>
                    {/* resolve button */}
                    {!ev.resolved ? (
                      <button className="btn" onClick={() => resolveEvent(ev.id)} disabled={resolving === ev.id}
                        style={{ background: "rgba(0,245,255,.1)", color: "#00f5ff", padding: "4px 10px", fontSize: ".7rem" }}>
                        {resolving === ev.id ? "…" : "Résoudre"}
                      </button>
                    ) : (
                      <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".62rem", color: "#b8ff00" }}>✓ résolu</span>
                    )}
                  </div>
                  {/* details */}
                  {Object.keys(ev.details ?? {}).length > 0 && (
                    <pre className="detail-pre">{JSON.stringify(ev.details, null, 2)}</pre>
                  )}
                  {ev.deliveryId && (
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".6rem", color: "#5a5470", marginTop: 4 }}>
                      livraison : {ev.deliveryId}
                      {ev.orderId && ` · commande : ${ev.orderId}`}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── deliveries ── */}
            <div className="card">
              <div className="section-title">20 DERNIÈRES LIVRAISONS</div>
              {deliveries.length === 0 ? (
                <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", fontSize: ".75rem" }}>// aucune livraison</div>
              ) : deliveries.map(d => {
                const fs  = d.fraudScore ?? 0;
                const fc  = riskColor(fs);
                const hasFlags = (d.fraudFlags?.length ?? 0) > 0;
                return (
                  <div key={d.id} className="del-row">
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem", color: "#5a5470", minWidth: 44 }}>
                      {fmtD(d.createdAt)}
                    </span>
                    <span style={{ fontFamily: "'Black Ops One',cursive", fontSize: ".72rem", color: "#ff2d78", minWidth: 50 }}>
                      #{d.orderId?.slice(-4).toUpperCase() ?? "----"}
                    </span>
                    {/* status */}
                    <span className="pill" style={{
                      background: d.status === "paid" ? "rgba(184,255,0,.1)" : d.status === "validated" ? "rgba(0,245,255,.1)" : "rgba(255,149,0,.1)",
                      color:      d.status === "paid" ? "#b8ff00"            : d.status === "validated" ? "#00f5ff"            : "#ff9500",
                    }}>{d.status}</span>
                    {/* fraud score */}
                    <span style={{ fontFamily: "'Black Ops One',cursive", fontSize: ".85rem", color: fc }}>
                      {fs > 0 ? `⚡${fs}` : "–"}
                    </span>
                    {/* review status */}
                    {d.reviewStatus && d.reviewStatus !== "ok" && (
                      <span className="pill" style={{
                        background: d.reviewStatus === "blocked" ? "rgba(255,45,120,.15)" : "rgba(255,149,0,.12)",
                        color:      d.reviewStatus === "blocked" ? "#ff2d78"              : "#ff9500",
                      }}>{d.reviewStatus}</span>
                    )}
                    {/* fraud flags */}
                    {hasFlags && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                        {d.fraudFlags!.map(f => (
                          <span key={f} className="flag-tag">{FLAG_LABELS[f] ?? f}</span>
                        ))}
                      </div>
                    )}
                    {/* GPS coords if available */}
                    {d.driverLocationAtDropoff && (
                      <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".58rem", color: "#5a5470" }}>
                        📍 {d.driverLocationAtDropoff.lat.toFixed(4)},{d.driverLocationAtDropoff.lng.toFixed(4)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── admin notes ── */}
            <div className="card">
              <div className="section-title">NOTES ADMIN</div>
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Ajouter des notes sur ce livreur (comportement, contact, contexte)…"
              />
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button className="btn" onClick={saveNote} disabled={saving}
                  style={{ background: noteSaved ? "#b8ff00" : "#00f5ff", color: "#000" }}>
                  {saving ? "Sauvegarde…" : noteSaved ? "✓ Sauvegardé" : "Enregistrer"}
                </button>
              </div>
            </div>

          </>)}
        </div>
      </div>
    </>
  );
}
