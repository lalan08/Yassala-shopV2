"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, query, where,
  onSnapshot, doc, writeBatch, addDoc,
  serverTimestamp, getDocs, orderBy,
} from "firebase/firestore";
import {
  firebaseConfig, sha256, ADMIN_PASS, ADMIN_STORAGE_KEY,
  type Delivery, type DriverProfile, type Payout,
} from "@/lib/firebase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');`;
const fmt  = (n: number) => n.toFixed(2).replace(".", ",") + " €";

/* ── period helpers ──────────────────────────────────────────── */
function weekBounds(offset = 0) {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon.toISOString(), end: sun.toISOString() };
}

type DriverRow = {
  driver: DriverProfile;
  deliveries: Delivery[];
  earningsValidated: number;
  cashToReturn: number;
  netPayout: number;
  countValidated: number;
  payoutStatus: "unpaid" | "paid" | "partial";
  boostTotal: number;
};

type MarkPayModal = { driverId: string; driverName: string; net: number; deliveries: Delivery[] } | null;

/* ── auth gate ───────────────────────────────────────────────── */
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
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0a12",
    }}>
      <div style={{ width: 320, animation: "fadeUp .4s both" }}>
        <div style={{
          fontFamily: "'Black Ops One',cursive", fontSize: "1.8rem",
          color: "#ff2d78", textAlign: "center", marginBottom: 8,
        }}>YASSALA</div>
        <div style={{
          fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem",
          color: "#5a5470", textAlign: "center", marginBottom: 28,
        }}>MODULE RÉMUNÉRATION · ADMIN</div>
        <input
          type="password" value={pwd} placeholder="Mot de passe admin"
          onChange={e => setPwd(e.target.value)}
          onKeyDown={e => e.key === "Enter" && attempt()}
          style={{
            width: "100%", background: "rgba(255,255,255,.06)",
            border: `1px solid ${err ? "#ff2d78" : "rgba(255,255,255,.12)"}`,
            borderRadius: 8, padding: "12px 14px", color: "#f0eeff",
            fontFamily: "'Share Tech Mono',monospace", fontSize: ".9rem", outline: "none",
            marginBottom: 12,
          }}
        />
        <button onClick={attempt} style={{
          width: "100%", background: "#ff2d78", color: "#000",
          border: "none", borderRadius: 8, padding: "12px", cursor: "pointer",
          fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: ".9rem",
        }}>
          {err ? "Mot de passe incorrect" : "Accéder"}
        </button>
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────────────── */
export default function AdminPayouts() {
  const router = useRouter();
  const [authed,  setAuthed]  = useState(false);
  const [checking, setChecking] = useState(true);

  /* drivers + deliveries */
  const [drivers,    setDrivers]    = useState<DriverProfile[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payouts,    setPayouts]    = useState<Payout[]>([]);
  const [loading,    setLoading]    = useState(true);

  /* filters */
  const [period,  setPeriod]  = useState<"current" | "prev" | "custom">("current");
  const [status,  setStatus]  = useState<"all" | "unpaid" | "paid">("all");
  const [search,  setSearch]  = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");

  /* mark-paid modal */
  const [modal,       setModal]       = useState<MarkPayModal>(null);
  const [payMethod,   setPayMethod]   = useState<"bank" | "cash" | "other">("bank");
  const [payRef,      setPayRef]      = useState("");
  const [paying,      setPaying]      = useState(false);
  const [payOk,       setPayOk]       = useState(false);

  /* ── check stored auth ─────────────────────────────────────── */
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

  /* ── load data ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!authed) return;

    const unsubDrv = onSnapshot(collection(db, "drivers"), snap => {
      setDrivers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as DriverProfile)));
    });

    const unsubDel = onSnapshot(
      query(collection(db, "deliveries"), orderBy("createdAt", "desc")),
      snap => { setDeliveries(snap.docs.map(d => ({ id: d.id, ...d.data() } as Delivery))); setLoading(false); },
    );

    const unsubPay = onSnapshot(collection(db, "payouts"), snap => {
      setPayouts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Payout)));
    });

    return () => { unsubDrv(); unsubDel(); unsubPay(); };
  }, [authed]);

  /* ── period bounds ─────────────────────────────────────────── */
  const bounds = useMemo(() => {
    if (period === "current") return weekBounds(0);
    if (period === "prev")    return weekBounds(-1);
    return {
      start: customStart ? new Date(customStart).toISOString() : "",
      end:   customEnd   ? new Date(customEnd + "T23:59:59").toISOString() : "",
    };
  }, [period, customStart, customEnd]);

  /* ── build driver rows ─────────────────────────────────────── */
  const rows: DriverRow[] = useMemo(() => {
    return drivers
      .filter(dr => {
        if (!search) return true;
        const s = search.toLowerCase();
        return dr.name?.toLowerCase().includes(s) || dr.phone?.includes(s);
      })
      .map(dr => {
        const drDels = deliveries.filter(d => {
          if (d.driverId !== dr.uid) return false;
          if (bounds.start && d.createdAt < bounds.start) return false;
          if (bounds.end   && d.createdAt > bounds.end)   return false;
          return true;
        });

        const validated  = drDels.filter(d => d.status === "validated");
        const cashUnset  = drDels.filter(d => d.paymentType === "CASH" && d.cashStatus === "unsettled");
        const earn       = validated.reduce((s, d) => s + d.totalPay, 0);
        const cash       = cashUnset.reduce((s, d) => s + (d.cashCollectedAmount || 0), 0);
        const net        = earn - cash;
        const boostTotal = drDels.reduce((s, d) => s + ((d as any).boostPay ?? 0), 0);

        // check if already paid in this period
        const paid = payouts.some(p =>
          p.driverId === dr.uid &&
          (!bounds.start || p.weekStart >= bounds.start.slice(0, 10)) &&
          p.status === "paid",
        );

        return {
          driver: dr,
          deliveries: drDels,
          earningsValidated: earn,
          cashToReturn: cash,
          netPayout: net,
          countValidated: validated.length,
          payoutStatus: paid ? "paid" : earn > 0 ? "unpaid" : "unpaid",
          boostTotal,
        } as DriverRow;
      })
      .filter(r => {
        if (status === "all") return true;
        return r.payoutStatus === status;
      })
      .sort((a, b) => b.netPayout - a.netPayout);
  }, [drivers, deliveries, payouts, bounds, search, status]);

  /* ── mark paid ─────────────────────────────────────────────── */
  const markPaid = async () => {
    if (!modal) return;
    setPaying(true);
    try {
      const batch = writeBatch(db);
      const now   = new Date().toISOString();
      const adminId = "admin"; // no firebase auth; use placeholder

      // create payout doc
      const payRef2 = doc(collection(db, "payouts"));
      batch.set(payRef2, {
        driverId:       modal.driverId,
        weekStart:      bounds.start?.slice(0, 10) ?? now.slice(0, 10),
        weekEnd:        bounds.end?.slice(0, 10)   ?? now.slice(0, 10),
        deliveriesIds:  modal.deliveries.map(d => d.id),
        totalEarnings:  modal.deliveries.filter(d => d.status === "validated").reduce((s, d) => s + d.totalPay, 0),
        cashToReturn:   modal.deliveries.filter(d => d.paymentType === "CASH" && d.cashStatus === "unsettled").reduce((s, d) => s + (d.cashCollectedAmount || 0), 0),
        netPaid:        modal.net,
        status:         "paid",
        paidAt:         now,
        paidMethod:     payMethod,
        paidReference:  payRef,
        createdAt:      now,
        createdBy:      adminId,
      });

      // update deliveries → paid
      modal.deliveries
        .filter(d => d.status === "validated")
        .forEach(d => batch.update(doc(db, "deliveries", d.id), { status: "paid" }));

      await batch.commit();
      setPayOk(true);
      setTimeout(() => { setPayOk(false); setModal(null); setPayRef(""); }, 1800);
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
    setPaying(false);
  };

  /* ── export CSV ─────────────────────────────────────────────── */
  const exportCSV = (row: DriverRow) => {
    const header = "Date,OrderId,Type,Base,Bonus,Total,Statut\n";
    const lines  = row.deliveries.map(d =>
      `${d.createdAt?.slice(0, 10)},${d.orderId},${d.paymentType},${d.basePay},${d.bonusPay},${d.totalPay},${d.status}`,
    ).join("\n");
    const blob = new Blob([header + lines], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `paie_${row.driver.name?.replace(/\s/g, "_")}_${bounds.start?.slice(0, 10) ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── render ─────────────────────────────────────────────────── */
  if (checking) return null;
  if (!authed)  return (
    <>
      <style>{`${FONTS}*{margin:0;padding:0;box-sizing:border-box;}body{background:#0a0a12;color:#f0eeff;}
      @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}`}</style>
      <AuthGate onAuth={() => setAuthed(true)} />
    </>
  );

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{height:4px;width:4px;}
        ::-webkit-scrollbar-thumb{background:#ff2d78;border-radius:2px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        .btn{border:none;border-radius:7px;padding:7px 14px;cursor:pointer;
          font-family:'Inter',sans-serif;font-weight:600;font-size:.78rem;transition:opacity .15s;}
        .btn:hover{opacity:.82;}
        .pill{padding:3px 10px;border-radius:20px;font-family:'Share Tech Mono',monospace;font-size:.7rem;}
        input,select{outline:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
          border-radius:7px;padding:8px 12px;color:#f0eeff;font-family:'Inter',sans-serif;font-size:.82rem;}
        input:focus,select:focus{border-color:#00f5ff;}
        table{width:100%;border-collapse:collapse;}
        th{font-family:'Inter',sans-serif;font-weight:600;font-size:.68rem;color:#5a5470;
          letter-spacing:.08em;text-align:left;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06);}
        td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-size:.82rem;vertical-align:middle;}
        tr:hover td{background:rgba(255,255,255,.02);}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;
          justify-content:center;z-index:100;backdrop-filter:blur(4px);}
        .modal{background:#13121f;border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:28px;
          width:min(440px,95vw);animation:fadeUp .25s both;}
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0a0a12" }}>
        {/* top bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: "14px 24px",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          background: "rgba(0,0,0,.4)", backdropFilter: "blur(8px)",
          position: "sticky", top: 0, zIndex: 20,
        }}>
          <button onClick={() => router.push("/admin")}
            style={{ background: "none", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem" }}>←</button>
          <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#ff2d78" }}>YASSALA</div>
          <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 600, color: "#5a5470", fontSize: ".88rem" }}>
            RÉMUNÉRATION LIVREURS
          </div>
        </div>

        <div style={{ padding: "20px 24px", animation: "fadeUp .3s both" }}>

          {/* ── filters ── */}
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
            background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 20,
          }}>
            {/* period */}
            <select value={period} onChange={e => setPeriod(e.target.value as any)}>
              <option value="current">Semaine en cours</option>
              <option value="prev">Semaine précédente</option>
              <option value="custom">Dates personnalisées</option>
            </select>
            {period === "custom" && (<>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                placeholder="Début" style={{ width: 140 }} />
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                placeholder="Fin" style={{ width: 140 }} />
            </>)}

            {/* status */}
            <select value={status} onChange={e => setStatus(e.target.value as any)}>
              <option value="all">Tous les statuts</option>
              <option value="unpaid">À payer</option>
              <option value="paid">Payé</option>
            </select>

            {/* search */}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Nom / téléphone"
              style={{ flex: 1, minWidth: 160 }}
            />
          </div>

          {/* ── summary chips ── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              { label: "Livreurs", value: rows.length, color: "#00f5ff" },
              { label: "Total gains", value: fmt(rows.reduce((s, r) => s + r.earningsValidated, 0)), color: "#b8ff00" },
              { label: "Cash à récupérer", value: fmt(rows.reduce((s, r) => s + r.cashToReturn, 0)), color: "#ff9500" },
              { label: "Net à payer", value: fmt(rows.reduce((s, r) => s + r.netPayout, 0)), color: "#a855f7" },
            ].map(c => (
              <div key={c.label} style={{
                background: "rgba(255,255,255,.03)", border: `1px solid ${c.color}22`,
                borderLeft: `3px solid ${c.color}`, borderRadius: 8, padding: "10px 16px",
              }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: "1.1rem", color: c.color }}>
                  {c.value}
                </div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: ".68rem", color: "#5a5470" }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* ── table ── */}
          {loading ? (
            <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", padding: "20px 0" }}>Chargement…</div>
          ) : rows.length === 0 ? (
            <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", padding: "20px 0" }}>
              // aucun livreur trouvé
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>LIVREUR</th>
                    <th>LIVRAISONS VALIDÉES</th>
                    <th>GAINS</th>
                    <th>🚀 BOOST</th>
                    <th>CASH ENCAISSÉ</th>
                    <th>NET À PAYER</th>
                    <th>STATUT</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.driver.uid}>
                      <td>
                        <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, color: "#f0eeff" }}>
                          {r.driver.name}
                        </div>
                        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#5a5470" }}>
                          {r.driver.phone}
                        </div>
                      </td>
                      <td style={{ fontFamily: "'Black Ops One',cursive", color: "#00f5ff" }}>
                        {r.countValidated}
                      </td>
                      <td style={{ fontFamily: "'Black Ops One',cursive", color: "#b8ff00" }}>
                        {fmt(r.earningsValidated)}
                      </td>
                      <td style={{ fontFamily: "'Black Ops One',cursive", color: r.boostTotal > 0 ? "#a855f7" : "#5a5470" }}>
                        {r.boostTotal > 0 ? fmt(r.boostTotal) : "—"}
                      </td>
                      <td style={{ fontFamily: "'Black Ops One',cursive", color: r.cashToReturn > 0 ? "#ff9500" : "#5a5470" }}>
                        {fmt(r.cashToReturn)}
                      </td>
                      <td style={{ fontFamily: "'Black Ops One',cursive", color: r.netPayout >= 0 ? "#a855f7" : "#ff2d78" }}>
                        {fmt(r.netPayout)}
                      </td>
                      <td>
                        <span className="pill" style={{
                          background: r.payoutStatus === "paid" ? "rgba(184,255,0,.12)" : "rgba(255,45,120,.12)",
                          color:      r.payoutStatus === "paid" ? "#b8ff00" : "#ff2d78",
                        }}>
                          {r.payoutStatus === "paid" ? "✓ payé" : "à payer"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn"
                            onClick={() => router.push(`/admin/payouts/${r.driver.uid}`)}
                            style={{ background: "rgba(255,255,255,.06)", color: "#f0eeff" }}>
                            Voir
                          </button>
                          {r.payoutStatus !== "paid" && r.netPayout > 0 && (
                            <button className="btn"
                              onClick={() => setModal({
                                driverId:   r.driver.uid,
                                driverName: r.driver.name,
                                net:        r.netPayout,
                                deliveries: r.deliveries,
                              })}
                              style={{ background: "#b8ff00", color: "#000" }}>
                              Payer
                            </button>
                          )}
                          <button className="btn"
                            onClick={() => exportCSV(r)}
                            style={{ background: "rgba(168,85,247,.15)", color: "#a855f7" }}>
                            CSV
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── mark-paid modal ── */}
      {modal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal">
            <div style={{
              fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem",
              color: "#b8ff00", marginBottom: 6,
            }}>MARQUER PAYÉ</div>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#5a5470", marginBottom: 20 }}>
              {modal.driverName} · {fmt(modal.net)}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: ".72rem", color: "#5a5470", marginBottom: 6 }}>Méthode de paiement</div>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value as any)} style={{ width: "100%" }}>
                  <option value="bank">Virement bancaire</option>
                  <option value="cash">Espèces</option>
                  <option value="other">Autre</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: ".72rem", color: "#5a5470", marginBottom: 6 }}>Référence (optionnel)</div>
                <input value={payRef} onChange={e => setPayRef(e.target.value)}
                  placeholder="Référence virement, numéro chèque…" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn" onClick={() => setModal(null)}
                style={{ background: "rgba(255,255,255,.05)", color: "#5a5470", flex: 1 }}>
                Annuler
              </button>
              <button className="btn" onClick={markPaid} disabled={paying}
                style={{ background: payOk ? "#b8ff00" : "#ff2d78", color: "#000", flex: 2 }}>
                {paying ? "Enregistrement…" : payOk ? "✓ Enregistré !" : `Confirmer paiement ${fmt(modal.net)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
