"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where, onSnapshot,
  doc, updateDoc, writeBatch, addDoc,
  orderBy, getDoc,
} from "firebase/firestore";
import {
  firebaseConfig, sha256, ADMIN_PASS, ADMIN_STORAGE_KEY,
  type Delivery, type DriverProfile, type Payout,
} from "@/lib/firebase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');`;
const fmt  = (n: number) => n.toFixed(2).replace(".", ",") + " €";
const fmtD = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/* ── auth gate (same as list page) ─────────────────────────── */
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a12" }}>
      <div style={{ width: 320, animation: "fadeUp .4s both" }}>
        <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem", color: "#ff2d78", textAlign: "center", marginBottom: 24 }}>YASSALA ADMIN</div>
        <input type="password" value={pwd} placeholder="Mot de passe admin"
          onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()}
          style={{ width: "100%", background: "rgba(255,255,255,.06)", border: `1px solid ${err ? "#ff2d78" : "rgba(255,255,255,.12)"}`, borderRadius: 8, padding: "12px 14px", color: "#f0eeff", fontFamily: "'Share Tech Mono',monospace", fontSize: ".9rem", outline: "none", marginBottom: 12 }}
        />
        <button onClick={attempt} style={{ width: "100%", background: "#ff2d78", color: "#000", border: "none", borderRadius: 8, padding: "12px", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: ".9rem" }}>
          {err ? "Incorrect" : "Accéder"}
        </button>
      </div>
    </div>
  );
}

type MarkPaidModal = { deliveries: Delivery[]; earnings: number; cash: number; net: number } | null;
type CashModal     = { delivery: Delivery } | null;

export default function DriverPayoutDetail() {
  const router   = useRouter();
  const params   = useParams();
  const driverId = params.driverId as string;

  const [authed,   setAuthed]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [driver,   setDriver]   = useState<DriverProfile | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payouts,  setPayouts]  = useState<Payout[]>([]);
  const [loading,  setLoading]  = useState(true);

  /* mark-paid modal */
  const [markModal,  setMarkModal]  = useState<MarkPaidModal>(null);
  const [payMethod,  setPayMethod]  = useState<"bank" | "cash" | "other">("bank");
  const [payRef,     setPayRef]     = useState("");
  const [paying,     setPaying]     = useState(false);
  const [payOk,      setPayOk]      = useState(false);

  /* cash-received modal */
  const [cashModal,  setCashModal]  = useState<CashModal>(null);
  const [settling,   setSettling]   = useState(false);

  /* météo */
  const [weather, setWeather] = useState<{ condition: string; precipitation: number; isRaining: boolean; isHeavyRain: boolean } | null>(null);

  /* validation en cours */
  const [validating, setValidating] = useState<string | null>(null); // deliveryId

  /* ── auth ── */
  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(ADMIN_STORAGE_KEY);
        const expected = await sha256(ADMIN_PASS);
        if (stored === expected) setAuthed(true);
      } catch { /* ignore */ }
      setChecking(false);
    })();
  }, []);

  /* ── data ── */
  useEffect(() => {
    if (!authed || !driverId) return;

    // driver profile from "drivers" collection
    getDoc(doc(db, "drivers", driverId)).then(snap => {
      if (snap.exists()) setDriver({ uid: snap.id, ...snap.data() } as DriverProfile);
      // fallback: try driver_applications
      else getDoc(doc(db, "driver_applications", driverId)).then(snap2 => {
        if (snap2.exists()) setDriver({ uid: snap2.id, ...snap2.data() } as DriverProfile);
      });
    });

    const unsubDel = onSnapshot(
      query(collection(db, "deliveries"), where("driverId", "==", driverId), orderBy("createdAt", "desc")),
      snap => { setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as Delivery))); setLoading(false); },
    );

    const unsubPay = onSnapshot(
      query(collection(db, "payouts"), where("driverId", "==", driverId), orderBy("createdAt", "desc")),
      snap => setPayouts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payout))),
    );

    return () => { unsubDel(); unsubPay(); };
  }, [authed, driverId]);

  /* ── calculations ── */
  const validated = deliveries.filter(d => d.status === "validated");
  const pending   = deliveries.filter(d => d.status === "pending");
  const paid      = deliveries.filter(d => d.status === "paid");
  const cashUnset = deliveries.filter(d => d.paymentType === "CASH" && d.cashStatus === "unsettled");

  const earnings  = validated.reduce((s, d) => s + d.totalPay, 0);
  const cashTotal = cashUnset.reduce((s, d) => s + (d.cashCollectedAmount || 0), 0);
  const net       = earnings - cashTotal;

  /* ── confirm payment ── */
  const markPaid = async () => {
    if (!markModal) return;
    setPaying(true);
    try {
      const batch = writeBatch(db);
      const now   = new Date().toISOString();

      const payDocRef = doc(collection(db, "payouts"));
      batch.set(payDocRef, {
        driverId,
        weekStart:      now.slice(0, 10),
        weekEnd:        now.slice(0, 10),
        deliveriesIds:  markModal.deliveries.filter(d => d.status === "validated").map(d => d.id),
        totalEarnings:  markModal.earnings,
        cashToReturn:   markModal.cash,
        netPaid:        markModal.net,
        status:         "paid",
        paidAt:         now,
        paidMethod:     payMethod,
        paidReference:  payRef,
        createdAt:      now,
        createdBy:      "admin",
      });

      markModal.deliveries.filter(d => d.status === "validated")
        .forEach(d => batch.update(doc(db, "deliveries", d.id), { status: "paid" }));

      await batch.commit();
      setPayOk(true);
      setTimeout(() => { setPayOk(false); setMarkModal(null); setPayRef(""); }, 2000);
    } catch (e: any) { alert("Erreur : " + e.message); }
    setPaying(false);
  };

  /* ── settle cash ── */
  const settleCash = async () => {
    if (!cashModal) return;
    setSettling(true);
    try {
      await updateDoc(doc(db, "deliveries", cashModal.delivery.id), {
        cashStatus:    "settled",
        cashSettledAt: new Date().toISOString(),
        cashSettledBy: "admin",
      });
      setCashModal(null);
    } catch (e: any) { alert("Erreur : " + e.message); }
    setSettling(false);
  };

  /* ── météo fetch (poll toutes les 5 min) ── */
  useEffect(() => {
    const load = () => fetch('/api/weather').then(r => r.json()).then(setWeather).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  /* ── valider une livraison (pending → validated + rain bonus) ── */
  const validateDelivery = async (deliveryId: string) => {
    setValidating(deliveryId);
    try {
      const res = await fetch('/api/validate-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'yassala2025' },
        body: JSON.stringify({ deliveryId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Erreur validation : ' + (err.error ?? res.statusText));
      }
    } catch (e: any) {
      alert('Erreur réseau : ' + e.message);
    }
    setValidating(null);
  };

  /* ── render ── */
  if (checking) return null;
  if (!authed) return (
    <>
      <style>{`${FONTS}*{margin:0;padding:0;box-sizing:border-box;}body{background:#0a0a12;color:#f0eeff;}
      @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}`}</style>
      <AuthGate onAuth={() => setAuthed(true)} />
    </>
  );

  const driverName = driver?.name ?? driverId;

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#ff2d78;border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        .btn{border:none;border-radius:7px;padding:8px 16px;cursor:pointer;
          font-family:'Inter',sans-serif;font-weight:600;font-size:.8rem;transition:opacity .15s;}
        .btn:hover{opacity:.82;}
        .pill{padding:3px 9px;border-radius:20px;font-family:'Share Tech Mono',monospace;font-size:.7rem;}
        .card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:18px 22px;margin-bottom:16px;}
        .section-title{font-family:'Inter',sans-serif;font-weight:600;font-size:.72rem;letter-spacing:.1em;color:#5a5470;margin-bottom:14px;}
        .del-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.8rem;flex-wrap:wrap;}
        .del-row:last-child{border-bottom:none;}
        input,select{outline:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
          border-radius:7px;padding:8px 12px;color:#f0eeff;font-family:'Inter',sans-serif;font-size:.82rem;}
        input:focus,select:focus{border-color:#00f5ff;}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;
          justify-content:center;z-index:100;backdrop-filter:blur(4px);}
        .modal{background:#13121f;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:26px;
          width:min(420px,95vw);animation:fadeUp .25s both;}
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0a0a12" }}>
        {/* top bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 22px",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          background: "rgba(0,0,0,.4)", backdropFilter: "blur(8px)",
          position: "sticky", top: 0, zIndex: 20,
        }}>
          <button onClick={() => router.push("/admin/payouts")}
            style={{ background: "none", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem" }}>←</button>
          <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#ff2d78" }}>YASSALA</div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, color: "#5a5470", fontSize: ".88rem" }}>
            {driverName}
          </div>
          {/* indicateur météo live */}
          {weather && (
            <div style={{
              marginLeft: "auto",
              display: "flex", alignItems: "center", gap: 6,
              background: weather.isHeavyRain
                ? "rgba(96,165,250,.12)"
                : weather.isRaining
                  ? "rgba(147,197,253,.1)"
                  : "rgba(250,204,21,.08)",
              border: `1px solid ${weather.isHeavyRain ? "rgba(96,165,250,.4)" : weather.isRaining ? "rgba(147,197,253,.3)" : "rgba(250,204,21,.25)"}`,
              borderRadius: 6, padding: "4px 10px",
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem",
              color: weather.isHeavyRain ? "#60a5fa" : weather.isRaining ? "#93c5fd" : "#facc15",
            }}>
              {weather.isHeavyRain ? "⛈" : weather.isRaining ? "🌧" : "☀️"}
              <span>{weather.isHeavyRain ? "+3€/livr." : weather.isRaining ? "+1.50€/livr." : "Pas de pluie"}</span>
              {(weather.isRaining || weather.isHeavyRain) && (
                <span style={{ color: "#5a5470" }}>{weather.precipitation.toFixed(1)}mm</span>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "20px 22px", maxWidth: 720, margin: "0 auto", animation: "fadeUp .3s both" }}>

          {loading && (
            <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace" }}>Chargement…</div>
          )}

          {!loading && (<>
            {/* ── résumé semaine ── */}
            <div className="card">
              <div className="section-title">RÉSUMÉ — SOLDE ACTUEL</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[
                  { label: "Gains validés",  value: fmt(earnings), color: "#b8ff00" },
                  { label: "Cash à reverser", value: fmt(cashTotal), color: cashTotal > 0 ? "#ff9500" : "#5a5470" },
                  { label: "Net à payer",    value: fmt(net),      color: net >= 0 ? "#a855f7" : "#ff2d78" },
                  { label: "En attente",     value: String(pending.length) + " livr.", color: "#ff9500" },
                  { label: "Payées (total)", value: String(paid.length) + " livr.",   color: "#00f5ff" },
                ].map(c => (
                  <div key={c.label} style={{
                    background: "rgba(255,255,255,.03)", border: `1px solid ${c.color}22`,
                    borderLeft: `3px solid ${c.color}`, borderRadius: 8, padding: "10px 14px", flex: 1, minWidth: 110,
                  }}>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: "1rem", color: c.color }}>{c.value}</div>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".66rem", color: "#5a5470" }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* action buttons */}
              {earnings > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                  <button className="btn"
                    onClick={() => setMarkModal({ deliveries: validated, earnings, cash: cashTotal, net })}
                    style={{ background: "#b8ff00", color: "#000" }}>
                    💳 Marquer payé ({fmt(net)})
                  </button>
                  {cashTotal > 0 && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "rgba(255,149,0,.08)", border: "1px solid rgba(255,149,0,.3)",
                      borderRadius: 8, padding: "8px 14px",
                      fontFamily: "'Share Tech Mono',monospace", fontSize: ".76rem", color: "#ff9500",
                    }}>
                      ⚠️ Cash non réglé : {fmt(cashTotal)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── infos driver ── */}
            {driver && (
              <div className="card">
                <div className="section-title">INFOS LIVREUR</div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {[
                    ["Nom",       driver.name],
                    ["Téléphone", driver.phone],
                    ["IBAN",      driver.iban ?? "Non renseigné"],
                    ["Méthode",   driver.paymentMethod ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".65rem", color: "#5a5470" }}>{k}</div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".8rem", color: "#f0eeff" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── livraisons ── */}
            <div className="card">
              <div className="section-title">LIVRAISONS ({deliveries.length})</div>
              {deliveries.length === 0 && (
                <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem" }}>
                  // aucune livraison
                </div>
              )}
              {deliveries.map(d => (
                <div key={d.id} className="del-row">
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470", minWidth: 42 }}>
                    {fmtD(d.createdAt)}
                  </span>
                  <span style={{ fontFamily: "'Black Ops One',cursive", fontSize: ".75rem", color: "#ff2d78", minWidth: 52 }}>
                    #{d.orderId?.slice(-4).toUpperCase() ?? "----"}
                  </span>

                  {/* payment type */}
                  <span className="pill" style={{
                    background: d.paymentType === "CASH" ? "rgba(255,149,0,.12)" : "rgba(0,245,255,.12)",
                    color:      d.paymentType === "CASH" ? "#ff9500" : "#00f5ff",
                  }}>{d.paymentType}</span>

                  {/* amounts */}
                  <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470" }}>
                    base {fmt(d.basePay)}
                    {d.bonusPay > 0 && <> + bonus {fmt(d.bonusPay)}</>}
                    {(d.rainBonus ?? 0) > 0 && (
                      <span style={{ color: "#93c5fd" }}> + 🌧 {fmt(d.rainBonus!)}</span>
                    )}
                    {(d.boostPay ?? 0) > 0 && (
                      <span style={{ color: "#a855f7" }}> + 🚀 {fmt(d.boostPay!)}</span>
                    )}
                  </span>
                  <span style={{ fontFamily: "'Black Ops One',cursive", fontSize: ".88rem", color: "#b8ff00", marginLeft: "auto" }}>
                    {fmt(d.totalPay)}
                  </span>

                  {/* delivery status */}
                  <span className="pill" style={{
                    background: d.status === "paid" ? "rgba(184,255,0,.12)" : d.status === "validated" ? "rgba(0,245,255,.12)" : "rgba(255,149,0,.12)",
                    color:      d.status === "paid" ? "#b8ff00"             : d.status === "validated" ? "#00f5ff"             : "#ff9500",
                  }}>
                    {d.status}
                  </span>

                  {/* bouton valider (pending uniquement) */}
                  {d.status === "pending" && (
                    <button className="btn"
                      onClick={() => validateDelivery(d.id)}
                      disabled={validating === d.id}
                      style={{ background: "rgba(0,245,255,.12)", color: "#00f5ff", padding: "4px 10px", fontSize: ".7rem" }}>
                      {validating === d.id ? "…" : "✓ Valider"}
                    </button>
                  )}

                  {/* cash status */}
                  {d.paymentType === "CASH" && (
                    <>
                      <span className="pill" style={{
                        background: d.cashStatus === "settled" ? "rgba(184,255,0,.1)" : "rgba(255,45,120,.1)",
                        color:      d.cashStatus === "settled" ? "#b8ff00" : "#ff2d78",
                      }}>
                        cash {d.cashStatus === "settled" ? "✓ réglé" : "⚠ non réglé"}
                      </span>
                      {d.cashStatus === "unsettled" && d.status !== "paid" && (
                        <button className="btn"
                          onClick={() => setCashModal({ delivery: d })}
                          style={{ background: "rgba(255,45,120,.15)", color: "#ff2d78", padding: "4px 10px", fontSize: ".7rem" }}>
                          Cash reçu
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* ── historique payouts ── */}
            {payouts.length > 0 && (
              <div className="card">
                <div className="section-title">HISTORIQUE PAIEMENTS</div>
                {payouts.map(p => (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                    borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: ".8rem",
                  }}>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470" }}>
                      {p.paidAt?.slice(0, 10) ?? p.createdAt.slice(0, 10)}
                    </span>
                    <span style={{ fontFamily: "'Black Ops One',cursive", color: "#b8ff00" }}>
                      {fmt(p.netPaid)}
                    </span>
                    <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#5a5470" }}>
                      {p.paidMethod ?? "—"} {p.paidReference ? `· ${p.paidReference}` : ""}
                    </span>
                    <span className="pill" style={{
                      marginLeft: "auto",
                      background: p.status === "paid" ? "rgba(184,255,0,.1)" : "rgba(255,45,120,.1)",
                      color:      p.status === "paid" ? "#b8ff00" : "#ff2d78",
                    }}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}

          </>)}
        </div>
      </div>

      {/* ── mark-paid modal ── */}
      {markModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setMarkModal(null); }}>
          <div className="modal">
            <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#b8ff00", marginBottom: 4 }}>
              MARQUER PAYÉ
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".76rem", color: "#5a5470", marginBottom: 18 }}>
              {driverName} · {fmt(markModal.net)}
              {markModal.cash > 0 && (
                <div style={{ color: "#ff9500", marginTop: 4 }}>
                  ⚠️ Cash non réglé inclus : {fmt(markModal.cash)}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: ".7rem", color: "#5a5470", marginBottom: 6 }}>Méthode</div>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value as any)} style={{ width: "100%" }}>
                  <option value="bank">Virement bancaire</option>
                  <option value="cash">Espèces</option>
                  <option value="other">Autre</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: ".7rem", color: "#5a5470", marginBottom: 6 }}>Référence</div>
                <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Référence optionnelle…" style={{ width: "100%" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn" onClick={() => setMarkModal(null)}
                style={{ background: "rgba(255,255,255,.05)", color: "#5a5470", flex: 1 }}>Annuler</button>
              <button className="btn" onClick={markPaid} disabled={paying}
                style={{ background: payOk ? "#b8ff00" : "#ff2d78", color: "#000", flex: 2 }}>
                {paying ? "…" : payOk ? "✓ Enregistré !" : `Confirmer ${fmt(markModal.net)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── cash-received modal ── */}
      {cashModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setCashModal(null); }}>
          <div className="modal">
            <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#ff9500", marginBottom: 4 }}>
              CASH REÇU
            </div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#5a5470", marginBottom: 18 }}>
              Confirmer la réception du cash pour la livraison<br />
              #{cashModal.delivery.orderId?.slice(-4).toUpperCase()} — {fmt(cashModal.delivery.cashCollectedAmount)}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" onClick={() => setCashModal(null)}
                style={{ background: "rgba(255,255,255,.05)", color: "#5a5470", flex: 1 }}>Annuler</button>
              <button className="btn" onClick={settleCash} disabled={settling}
                style={{ background: "#ff9500", color: "#000", flex: 2 }}>
                {settling ? "…" : "✓ Confirmer réception cash"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
