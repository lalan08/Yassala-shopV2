"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  initializeApp, getApps,
} from "firebase/app";
import {
  getFirestore, collection, query, where, onSnapshot,
  doc, updateDoc, orderBy,
} from "firebase/firestore";
import { firebaseConfig, nextFridayLabel, type Delivery, type DriverProfile } from "@/lib/firebase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

/* ─── tiny helpers ────────────────────────────────────────────── */
const fmt  = (n: number) => n.toFixed(2).replace(".", ",") + " €";
const fmtD = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Inter:wght@400;500;600;700&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap');`;

/* ─── chip component ──────────────────────────────────────────── */
function Chip({ icon, label, value, color, sub, chipRef }: {
  icon: string; label: string; value: string;
  color: string; sub?: string;
  chipRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={chipRef} style={{
      background: "rgba(255,255,255,.03)",
      border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: "14px 18px",
      flex: 1,
      minWidth: 130,
      position: "relative",
    }}>
      <div style={{ fontSize: "1.3rem", marginBottom: 4 }}>{icon}</div>
      <div style={{
        fontFamily: "'Inter',sans-serif", fontWeight: 700,
        fontSize: "1.45rem", color, marginBottom: 2,
      }}>{value}</div>
      <div style={{
        fontFamily: "'Inter',sans-serif", fontSize: ".7rem",
        color: "#5a5470", letterSpacing: ".07em",
      }}>{label}</div>
      {sub && <div style={{
        fontFamily: "'Share Tech Mono',monospace", fontSize: ".68rem",
        color: "#5a5470", marginTop: 3,
      }}>{sub}</div>}
    </div>
  );
}

/* ─── reward floating chip ────────────────────────────────────── */
interface RewardChip { amount: number; key: number; }

function RewardFloat({
  chip,
  targetRef,
}: {
  chip: RewardChip;
  targetRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    zIndex: 9999,
    pointerEvents: "none",
    left: "50%",
    bottom: "220px",
    transform: "translateX(-50%) scale(0.75)",
    opacity: 0,
    transition: "none",
  });

  useEffect(() => {
    // Phase 1 — apparition rapide
    const t1 = setTimeout(() => {
      setStyle(s => ({
        ...s,
        opacity: 1,
        transform: "translateX(-50%) scale(1.1)",
        transition: "opacity 0.18s ease-out, transform 0.18s ease-out",
      }));
    }, 20);

    // Phase 2 — vol vers la chip "À recevoir vendredi"
    const t2 = setTimeout(() => {
      const rect = targetRef.current?.getBoundingClientRect();
      // On calcule la distance entre le point de départ (220px du bas) et la chip cible
      const startBottom = 220;
      const targetFromBottom = rect
        ? window.innerHeight - rect.bottom + rect.height / 2
        : window.innerHeight * 0.72;
      const deltaY = targetFromBottom - startBottom;

      setStyle(s => ({
        ...s,
        bottom: `${targetFromBottom + 8}px`,
        opacity: 0.9,
        transform: `translateX(-50%) translateY(0) scale(0.92)`,
        transition: `bottom 0.7s cubic-bezier(.22,.61,.36,1), opacity 0.7s ease-out, transform 0.7s ease-out`,
      }));
      void deltaY; // used via bottom calc above
    }, 230);

    // Phase 3 — fondu final au niveau de la chip
    const t3 = setTimeout(() => {
      setStyle(s => ({
        ...s,
        opacity: 0,
        transform: "translateX(-50%) scale(0.8)",
        transition: "opacity 0.28s ease-in, transform 0.28s ease-in",
      }));
    }, 920);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={style}>
      <div style={{
        fontFamily: "'Black Ops One',cursive",
        fontSize: "1.35rem",
        color: "#b8ff00",
        letterSpacing: ".04em",
        background: "rgba(8,5,20,.88)",
        border: "1px solid rgba(184,255,0,.45)",
        borderRadius: 20,
        padding: "5px 16px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 0 14px rgba(184,255,0,.35), 0 4px 20px rgba(0,0,0,.5)",
        whiteSpace: "nowrap",
      }}>
        +{fmt(chip.amount)}
      </div>
    </div>
  );
}

/* ─── main page ───────────────────────────────────────────────── */
export default function DriverWallet() {
  const router = useRouter();

  const [driver,     setDriver]     = useState<DriverProfile | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  /* météo */
  const [weather, setWeather] = useState<{ isRaining: boolean; isHeavyRain: boolean; condition: string } | null>(null);

  /* boost */
  const [boostState, setBoostState] = useState<{ isActive: boolean; boostAmount: number } | null>(null);

  /* IBAN editor */
  const [showIban,   setShowIban]   = useState(false);
  const [ibanInput,  setIbanInput]  = useState("");
  const [ibanSaving, setIbanSaving] = useState(false);
  const [ibanOk,     setIbanOk]     = useState(false);

  /* ── reward animation ────────────────────────────────────────── */
  const [rewardChips, setRewardChips] = useState<RewardChip[]>([]);
  const [newRowId,    setNewRowId]    = useState<string | null>(null);
  const rewardKeyRef                  = useRef(0);
  /** Vrai seulement pour le premier snapshot (chargement initial) */
  const isInitialLoadRef              = useRef(true);
  /** IDs déjà connus avant le dernier snapshot */
  const prevIdsRef                    = useRef<Set<string>>(new Set());
  /** Ref sur la chip "À recevoir vendredi" — destination du chip flottant */
  const targetChipRef                 = useRef<HTMLDivElement>(null);

  /* ── auth ───────────────────────────────────────────────────── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("yassala_driver");
      if (!raw) { router.replace("/livreur"); return; }
      const data = JSON.parse(raw) as DriverProfile;
      setDriver(data);
      setIbanInput(data.iban ?? "");
    } catch {
      router.replace("/livreur");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── météo ───────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => fetch("/api/weather").then(r => r.json()).then(setWeather).catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  /* ── boost ───────────────────────────────────────────────────── */
  useEffect(() => {
    const load = () => fetch("/api/boost").then(r => r.json()).then(setBoostState).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  /* ── real-time deliveries + détection récompense ────────────── */
  useEffect(() => {
    if (!driver?.uid) return;

    const q = query(
      collection(db, "deliveries"),
      where("driverId", "==", driver.uid),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Delivery));
        setDeliveries(list);
        setLoading(false);

        const currentIds = new Set(list.map(d => d.id));

        if (!isInitialLoadRef.current) {
          /* Livraisons qui n'existaient pas au snapshot précédent */
          const newEntries = list.filter(d => !prevIdsRef.current.has(d.id));

          if (newEntries.length > 0) {
            const newest = newEntries[0]; // trié desc → le plus récent
            rewardKeyRef.current += 1;
            const key = rewardKeyRef.current;

            /* Chip flottante "+X€" */
            setRewardChips(prev => [...prev, { amount: newest.totalPay, key }]);
            /* Surlignage de la ligne dans l'historique */
            setNewRowId(newest.id);

            setTimeout(() => {
              setRewardChips(prev => prev.filter(c => c.key !== key));
            }, 1_400);
            setTimeout(() => setNewRowId(null), 2_400);
          }
        } else {
          isInitialLoadRef.current = false;
        }

        prevIdsRef.current = currentIds;
      },
      err => { setError("Erreur chargement : " + err.message); setLoading(false); },
    );

    return unsub;
  }, [driver?.uid]);

  /* ── calculations ────────────────────────────────────────────── */
  const validated = deliveries.filter(d => d.status === "validated");
  const pending   = deliveries.filter(d => d.status === "pending");
  const cashUnset = deliveries.filter(d => d.paymentType === "CASH" && d.cashStatus === "unsettled");

  const earningsVal = validated.reduce((s, d) => s + d.totalPay, 0);
  const cashToRet   = cashUnset.reduce((s, d) => s + (d.cashCollectedAmount || 0), 0);
  const netPayout   = earningsVal - cashToRet;
  const pendingAmt  = pending.reduce((s, d) => s + d.totalPay, 0);
  const netEst      = deliveries
    .filter(d => d.status !== "paid")
    .reduce((s, d) => s + d.totalPay, 0) - cashToRet;

  /* ── save IBAN ───────────────────────────────────────────────── */
  const saveIban = async () => {
    if (!driver?.uid) return;
    setIbanSaving(true);
    try {
      await updateDoc(doc(db, "drivers", driver.uid), {
        iban: ibanInput.trim(),
        paymentMethod: "bank",
      });
      const updated = { ...driver, iban: ibanInput.trim(), paymentMethod: "bank" as const };
      setDriver(updated);
      localStorage.setItem("yassala_driver", JSON.stringify(updated));
      setIbanOk(true);
      setTimeout(() => { setIbanOk(false); setShowIban(false); }, 1500);
    } catch (e: any) {
      setError("Erreur sauvegarde IBAN : " + e.message);
    }
    setIbanSaving(false);
  };

  /* ── render ──────────────────────────────────────────────────── */
  if (!driver) return null;

  return (
    <>
      <style>{`
        ${FONTS}
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#0a0a12;color:#f0eeff;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:#ff2d78;border-radius:2px;}

        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.5;}}

        /* Nouvelle ligne dans l'historique */
        @keyframes rowSlideIn{
          0%  {opacity:0;transform:translateX(-6px);background:rgba(184,255,0,.1);}
          30% {opacity:1;transform:translateX(0);background:rgba(184,255,0,.08);}
          100%{opacity:1;transform:translateX(0);background:transparent;}
        }
        @keyframes rowGlow{
          0%,100%{box-shadow:none;}
          40%{box-shadow:inset 0 0 0 1px rgba(184,255,0,.25);}
        }

        .chip-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;}
        .del-row{
          display:flex;align-items:center;gap:10px;
          padding:9px 4px;
          border-bottom:1px solid rgba(255,255,255,.05);
          font-size:.82rem;
          border-radius:6px;
          transition:background .4s;
        }
        .del-row:last-child{border-bottom:none;}
        .del-row.new-row{
          animation:rowSlideIn 2.4s ease-out forwards, rowGlow 2.4s ease-out forwards;
        }
        .badge{padding:3px 9px;border-radius:20px;font-family:'Share Tech Mono',monospace;font-size:.7rem;}
        .btn{border:none;border-radius:8px;padding:10px 20px;font-family:'Inter',sans-serif;font-weight:600;font-size:.85rem;cursor:pointer;transition:opacity .15s;}
        .btn:hover{opacity:.85;}
        input{outline:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;
          padding:10px 14px;color:#f0eeff;font-family:'Share Tech Mono',monospace;font-size:.85rem;width:100%;}
        input:focus{border-color:#00f5ff;}
        .card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:18px 22px;margin-bottom:16px;}
        .section-title{font-family:'Inter',sans-serif;font-weight:600;font-size:.78rem;letter-spacing:.1em;color:#5a5470;margin-bottom:14px;}
      `}</style>

      {/* ── Reward floating chips (portail hors du flux) ── */}
      {rewardChips.map(chip => (
        <RewardFloat key={chip.key} chip={chip} targetRef={targetChipRef} />
      ))}

      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse 70% 50% at 20% 0%,rgba(0,245,255,.04) 0%,transparent 60%)",
        padding: "0 0 60px",
      }}>

        {/* ── top bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,.05)",
          background: "rgba(0,0,0,.3)",
          backdropFilter: "blur(8px)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <button onClick={() => router.push("/livreur")}
            style={{ background: "none", border: "none", color: "#5a5470", cursor: "pointer", fontSize: "1.1rem" }}>
            ←
          </button>
          <div style={{ fontFamily: "'Black Ops One',cursive", fontSize: "1.1rem", color: "#00f5ff", letterSpacing: ".06em" }}>
            WALLET
          </div>
          <div style={{ marginLeft: "auto", fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem", color: "#5a5470" }}>
            {driver.name}
          </div>
        </div>

        <div style={{ padding: "20px 16px", maxWidth: 560, margin: "0 auto", animation: "fadeUp .3s both" }}>

          {error && (
            <div style={{
              background: "rgba(255,45,120,.1)", border: "1px solid rgba(255,45,120,.4)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontFamily: "'Share Tech Mono',monospace", fontSize: ".8rem", color: "#ff2d78",
            }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#5a5470", animation: "pulse 1s infinite" }}>
              Chargement…
            </div>
          )}

          {!loading && (<>

            {/* ── KPI chips ── */}
            <div className="chip-row">
              {/*
                chipRef pointe ici → c'est la DESTINATION de l'animation flottante.
                La ref permet à RewardFloat de calculer la position cible.
              */}
              <Chip
                chipRef={targetChipRef}
                icon="💰"
                label="À recevoir vendredi"
                value={fmt(netPayout)}
                color={netPayout >= 0 ? "#b8ff00" : "#ff2d78"}
                sub={`${validated.length} livraison${validated.length !== 1 ? "s" : ""} validée${validated.length !== 1 ? "s" : ""}`}
              />
              <Chip
                icon="⏳"
                label="En attente validation"
                value={fmt(pendingAmt)}
                color="#ff9500"
                sub={`${pending.length} livraison${pending.length !== 1 ? "s" : ""}`}
              />
            </div>
            <div className="chip-row">
              <Chip
                icon="💵"
                label="Cash à reverser"
                value={fmt(cashToRet)}
                color={cashToRet > 0 ? "#ff2d78" : "#5a5470"}
                sub={cashToRet > 0 ? "à remettre à l'admin" : "rien à reverser"}
              />
              <Chip
                icon="📊"
                label="Net estimé (total)"
                value={fmt(netEst)}
                color="#a855f7"
                sub="gains non payés – cash"
              />
            </div>

            {/* ── badge pluie ── */}
            {weather && (weather.isRaining || weather.isHeavyRain) && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: weather.isHeavyRain ? "rgba(96,165,250,.1)" : "rgba(147,197,253,.08)",
                border: `1px solid ${weather.isHeavyRain ? "rgba(96,165,250,.5)" : "rgba(147,197,253,.4)"}`,
                borderRadius: 10, padding: "12px 18px", marginBottom: 16,
              }}>
                <span style={{ fontSize: "1.4rem" }}>{weather.isHeavyRain ? "⛈" : "🌧"}</span>
                <div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".95rem",
                    color: weather.isHeavyRain ? "#60a5fa" : "#93c5fd" }}>BONUS PLUIE ACTIF</div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#5a5470" }}>
                    +{weather.isHeavyRain ? "3.00" : "1.50"} € par livraison effectuée maintenant
                  </div>
                </div>
              </div>
            )}

            {/* ── badge boost ── */}
            {boostState?.isActive && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(168,85,247,.1)",
                border: "1px solid rgba(168,85,247,.4)",
                borderRadius: 10, padding: "12px 18px", marginBottom: 16,
              }}>
                <span style={{ fontSize: "1.4rem" }}>🚀</span>
                <div>
                  <div style={{ fontFamily: "'Rajdhani',sans-serif", fontWeight: 700, fontSize: ".95rem", color: "#a855f7" }}>
                    BOOST ACTIF
                  </div>
                  <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#5a5470" }}>
                    +{boostState.boostAmount.toFixed(2)} € par livraison validée maintenant
                  </div>
                </div>
              </div>
            )}

            {/* ── prochain paiement ── */}
            <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: "1.5rem" }}>📅</div>
              <div>
                <div style={{
                  fontFamily: "'Inter',sans-serif", fontWeight: 600,
                  fontSize: ".82rem", color: "#5a5470", marginBottom: 3, letterSpacing: ".06em",
                }}>PROCHAIN PAIEMENT</div>
                <div style={{
                  fontFamily: "'Rajdhani',sans-serif", fontWeight: 600,
                  fontSize: "1.1rem", color: "#b8ff00",
                }}>{nextFridayLabel()}</div>
              </div>
            </div>

            {/* ── historique ── */}
            <div className="card">
              <div className="section-title">
                HISTORIQUE DES COURSES
                <span style={{
                  marginLeft: 8, fontFamily: "'Share Tech Mono',monospace",
                  color: "#5a5470", fontSize: ".68rem", fontWeight: 400,
                }}>
                  ({deliveries.length})
                </span>
              </div>

              {deliveries.length === 0 && (
                <div style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", fontSize: ".78rem" }}>
                  // aucune livraison
                </div>
              )}

              {deliveries.map(d => {
                const isNew = d.id === newRowId;
                return (
                  <div key={d.id} className={`del-row${isNew ? " new-row" : ""}`}>
                    {/* date */}
                    <span style={{ color: "#5a5470", fontFamily: "'Share Tech Mono',monospace", minWidth: 38, fontSize: ".75rem" }}>
                      {fmtD(d.createdAt)}
                    </span>
                    {/* order id */}
                    <span style={{ fontFamily: "'Black Ops One',cursive", fontSize: ".75rem", color: "#ff2d78", minWidth: 52 }}>
                      #{d.orderId?.slice(-4).toUpperCase() ?? "----"}
                    </span>
                    {/* payment type */}
                    <span className="badge" style={{
                      background: d.paymentType === "CASH" ? "rgba(184,255,0,.12)" : "rgba(0,245,255,.12)",
                      color: d.paymentType === "CASH" ? "#b8ff00" : "#00f5ff",
                    }}>{d.paymentType}</span>
                    {/* bonus pluie */}
                    {(d.rainBonus ?? 0) > 0 && (
                      <span className="badge" style={{ background: "rgba(147,197,253,.12)", color: "#93c5fd", fontSize: ".65rem" }}>
                        🌧 +{fmt(d.rainBonus!)}
                      </span>
                    )}
                    {/* boost */}
                    {(d.boostPay ?? 0) > 0 && (
                      <span className="badge" style={{ background: "rgba(168,85,247,.12)", color: "#a855f7", fontSize: ".65rem" }}>
                        🚀 +{fmt(d.boostPay!)}
                      </span>
                    )}
                    {/* badge NEW */}
                    {isNew && (
                      <span className="badge" style={{
                        background: "rgba(184,255,0,.18)",
                        border: "1px solid rgba(184,255,0,.3)",
                        color: "#b8ff00",
                        fontSize: ".62rem",
                        letterSpacing: ".1em",
                      }}>NEW</span>
                    )}
                    {/* montant */}
                    <span style={{
                      fontFamily: "'Black Ops One',cursive",
                      color: "#b8ff00",
                      marginLeft: "auto",
                      textShadow: isNew ? "0 0 12px rgba(184,255,0,.7)" : "none",
                      transition: "text-shadow .6s ease-out",
                    }}>
                      +{fmt(d.totalPay)}
                    </span>
                    {/* status */}
                    <span className="badge" style={{
                      background:
                        d.status === "paid"      ? "rgba(184,255,0,.12)" :
                        d.status === "validated" ? "rgba(0,245,255,.12)" :
                                                   "rgba(255,149,0,.12)",
                      color:
                        d.status === "paid"      ? "#b8ff00" :
                        d.status === "validated" ? "#00f5ff" :
                                                   "#ff9500",
                    }}>
                      {d.status === "paid" ? "payé" : d.status === "validated" ? "validé" : "attente"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ── infos paiement ── */}
            <div className="card">
              <div className="section-title">INFOS DE PAIEMENT</div>
              {!showIban ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".82rem", color: "#f0eeff" }}>
                      {driver.iban ? driver.iban : <span style={{ color: "#5a5470" }}>Aucun IBAN enregistré</span>}
                    </div>
                    {driver.paymentMethod && (
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: ".7rem", color: "#5a5470", marginTop: 3 }}>
                        Méthode : {driver.paymentMethod}
                      </div>
                    )}
                  </div>
                  <button className="btn" onClick={() => setShowIban(true)}
                    style={{ background: "rgba(255,255,255,.06)", color: "#f0eeff", padding: "7px 14px", fontSize: ".78rem" }}>
                    Modifier
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 10, fontFamily: "'Share Tech Mono',monospace", fontSize: ".72rem", color: "#5a5470" }}>
                    Format : FR76 XXXX XXXX XXXX XXXX XXXX XXX
                  </div>
                  <input
                    value={ibanInput}
                    onChange={e => setIbanInput(e.target.value)}
                    placeholder="FR76 3000 …"
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn"
                      onClick={() => { setShowIban(false); setIbanInput(driver.iban ?? ""); }}
                      style={{ background: "rgba(255,255,255,.05)", color: "#5a5470", flex: 1 }}>
                      Annuler
                    </button>
                    <button className="btn" onClick={saveIban} disabled={ibanSaving}
                      style={{ background: ibanOk ? "#b8ff00" : "#00f5ff", color: "#000", flex: 2 }}>
                      {ibanSaving ? "Sauvegarde…" : ibanOk ? "✓ Enregistré !" : "Enregistrer"}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </>)}
        </div>
      </div>
    </>
  );
}
