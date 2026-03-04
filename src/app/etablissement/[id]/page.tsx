"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, doc, onSnapshot, updateDoc,
  collection, query, where, getCountFromServer, addDoc, orderBy, limit,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

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
const storage = getStorage(app);

const PINK = "#ff2d78";
const GOLD = "#fbbf24";
const GREEN = "#b8ff00";
const BG = "#08050f";
const CARD = "#0c0918";
const MONO = { fontFamily: "'Share Tech Mono',monospace" } as const;

type Etablissement = {
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  coverUrl?: string;
  openHours?: string;
  isActive: boolean;
  isOpen?: boolean;
  closeTime?: string;
  deliveryMin?: number;
  deliveryMax?: number;
  deliveryFee?: number;
};

type DayOrder = {
  id: string;
  name?: string;
  phone?: string;
  items?: string;
  total?: number;
  status?: string;
  address?: string;
  createdAt?: string;
  paidOnline?: boolean;
  etablissementId?: string;
  mode?: string;
  driverName?: string;
};

type EtabAuth = { id: string; name: string; slug: string };

type Tab = "dashboard" | "orders" | "scanner";

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: ok ? "#0a2e1a" : "#2e0a14",
      border: `1px solid ${ok ? "rgba(184,255,0,.3)" : "rgba(255,45,120,.35)"}`,
      color: ok ? GREEN : PINK,
      padding: "12px 20px", borderRadius: 8,
      ...MONO, fontSize: ".82rem",
    }}>
      {msg}
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  nouveau:              { label: "Nouveau",       color: PINK,    bg: "rgba(255,45,120,.12)" },
  confirmed:            { label: "Confirmé",      color: GOLD,    bg: "rgba(251,191,36,.12)" },
  en_cours:             { label: "En préparation",color: GOLD,    bg: "rgba(251,191,36,.12)" },
  delivering:           { label: "En livraison",  color: "#60a5fa", bg: "rgba(96,165,250,.12)" },
  livre:                { label: "Livré",         color: GREEN,   bg: "rgba(184,255,0,.1)" },
  livree:               { label: "Livré",         color: GREEN,   bg: "rgba(184,255,0,.1)" },
  delivered:            { label: "Livré",         color: GREEN,   bg: "rgba(184,255,0,.1)" },
  annulee:              { label: "Annulé",        color: "#9ca3af", bg: "rgba(255,255,255,.06)" },
  annule:               { label: "Annulé",        color: "#9ca3af", bg: "rgba(255,255,255,.06)" },
};

function fmtTime(iso?: string) {
  if (!iso) return "–";
  try { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return "–"; }
}

function StatusBadge({ status }: { status?: string }) {
  const s = status ? STATUS_LABELS[status] ?? { label: status, color: "#9ca3af", bg: "rgba(255,255,255,.06)" } : { label: "–", color: "#9ca3af", bg: "rgba(255,255,255,.06)" };
  return (
    <span style={{ ...MONO, fontSize: ".65rem", letterSpacing: ".08em", padding: "3px 10px", borderRadius: 20, color: s.color, background: s.bg, fontWeight: 700 }}>
      {s.label.toUpperCase()}
    </span>
  );
}

// ── QR Scanner (using html5-qrcode) ──────────────────────────────────────────
function QRScannerTab({ etabId, etabName }: { etabId: string; etabName: string }) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [scanLog, setScanLog] = useState<Array<{ driverName: string; ts: string }>>([]);
  const html5QrRef = useRef<unknown>(null);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    setScanStatus("scanning");
    setScanResult(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader-etab");
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText: string) => {
          scanner.stop().catch(() => {});
          html5QrRef.current = null;
          handleScanSuccess(decodedText);
        },
        () => {}
      );
    } catch {
      setScanStatus("error");
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const stopScanner = useCallback(() => {
    if (html5QrRef.current) {
      (html5QrRef.current as { stop: () => Promise<void> }).stop().catch(() => {});
      html5QrRef.current = null;
    }
    setScanStatus("idle");
  }, []);

  useEffect(() => () => stopScanner(), [stopScanner]);

  // Load recent scan logs for this etab
  useEffect(() => {
    const q = query(
      collection(db, "etab_scans"),
      where("etablissementId", "==", etabId),
      orderBy("ts", "desc"),
      limit(10)
    );
    return onSnapshot(q, snap => {
      setScanLog(snap.docs.map(d => d.data() as { driverName: string; ts: string }));
    });
  }, [etabId]);

  const handleScanSuccess = async (text: string) => {
    setScanResult(text);
    // Expected QR format: "YASSALA_DRIVER:<driverId>:<driverName>"
    const parts = text.split(":");
    const prefix = parts[0];
    if (prefix !== "YASSALA_DRIVER" || parts.length < 2) {
      setScanStatus("error");
      return;
    }
    const driverName = parts.slice(2).join(":") || "Livreur";
    try {
      await addDoc(collection(db, "etab_scans"), {
        etablissementId: etabId,
        etabName,
        driverId: parts[1],
        driverName,
        ts: new Date().toISOString(),
        raw: text,
      });
      setScanStatus("success");
    } catch {
      setScanStatus("error");
    }
  };

  return (
    <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: CARD, border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "22px 20px" }}>
        <div style={{ ...MONO, fontSize: ".68rem", color: PINK, letterSpacing: ".12em", marginBottom: 16 }}>
          // SCANNER QR CODE LIVREUR
        </div>
        <p style={{ fontSize: ".85rem", color: "#7a7490", marginBottom: 20, lineHeight: 1.5 }}>
          Scannez le QR code du livreur lorsqu'il vient récupérer une commande. Cela enregistre automatiquement l'heure de passage.
        </p>

        {/* Scanner area */}
        {scanStatus === "scanning" ? (
          <div>
            <div
              id="qr-reader-etab"
              ref={scannerRef}
              style={{ width: "100%", borderRadius: 12, overflow: "hidden", border: `2px solid ${PINK}` }}
            />
            <button
              onClick={stopScanner}
              style={{
                marginTop: 14, width: "100%", background: "rgba(255,45,120,.1)",
                border: `1px solid ${PINK}`, borderRadius: 8, padding: "11px",
                ...MONO, fontSize: ".8rem", color: PINK, cursor: "pointer",
              }}
            >
              ✕ ARRÊTER
            </button>
          </div>
        ) : scanStatus === "success" ? (
          <div style={{
            background: "rgba(184,255,0,.06)", border: "1px solid rgba(184,255,0,.25)",
            borderRadius: 12, padding: "24px 20px", textAlign: "center",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>✅</div>
            <div style={{ ...MONO, color: GREEN, fontSize: ".9rem", fontWeight: 700, marginBottom: 6 }}>
              LIVREUR CONFIRMÉ
            </div>
            <div style={{ ...MONO, fontSize: ".75rem", color: "#7a7490", wordBreak: "break-all" }}>
              {scanResult}
            </div>
            <button
              onClick={() => { setScanStatus("idle"); setScanResult(null); }}
              style={{
                marginTop: 18, padding: "10px 24px",
                background: GREEN, color: "#000", border: "none",
                borderRadius: 8, ...MONO, fontSize: ".8rem", fontWeight: 700,
                cursor: "pointer", letterSpacing: ".06em",
              }}
            >
              SCANNER UN AUTRE
            </button>
          </div>
        ) : scanStatus === "error" ? (
          <div style={{
            background: "rgba(255,45,120,.06)", border: "1px solid rgba(255,45,120,.25)",
            borderRadius: 12, padding: "24px 20px", textAlign: "center",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>❌</div>
            <div style={{ ...MONO, color: PINK, fontSize: ".85rem", marginBottom: 6 }}>
              QR code non reconnu
            </div>
            <div style={{ ...MONO, fontSize: ".72rem", color: "#5a5470" }}>
              Ce QR code n'appartient pas à un livreur Yassala.
            </div>
            <button
              onClick={() => { setScanStatus("idle"); setScanResult(null); startScanner(); }}
              style={{
                marginTop: 16, padding: "10px 24px",
                background: PINK, color: "#fff", border: "none",
                borderRadius: 8, ...MONO, fontSize: ".8rem", fontWeight: 700,
                cursor: "pointer",
              }}
            >
              RÉESSAYER
            </button>
          </div>
        ) : (
          <button
            onClick={startScanner}
            style={{
              width: "100%", background: PINK, color: "#fff", border: "none",
              borderRadius: 12, padding: "18px", ...MONO, fontSize: ".9rem",
              fontWeight: 700, cursor: "pointer", letterSpacing: ".06em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}
          >
            📷 SCANNER LE QR DU LIVREUR
          </button>
        )}
      </div>

      {/* Recent scan logs */}
      {scanLog.length > 0 && (
        <div style={{ background: CARD, border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "22px 20px" }}>
          <div style={{ ...MONO, fontSize: ".68rem", color: GOLD, letterSpacing: ".12em", marginBottom: 14 }}>
            // DERNIERS PASSAGES LIVREURS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {scanLog.map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "10px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "1.2rem" }}>🛵</span>
                  <div>
                    <div style={{ fontSize: ".85rem", fontWeight: 600 }}>{s.driverName}</div>
                  </div>
                </div>
                <div style={{ ...MONO, fontSize: ".72rem", color: "#5a5470" }}>{fmtTime(s.ts)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Orders Tab ────────────────────────────────────────────────────────────────
function OrdersTab({ etabId }: { etabId: string }) {
  const [orders, setOrders] = useState<DayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const prevIds = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      where("etablissementId", "==", etabId),
      orderBy("createdAt", "desc"),
      limit(40)
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as DayOrder));
      // detect new orders
      const incoming = new Set<string>();
      list.forEach(o => {
        if (!prevIds.current.has(o.id)) incoming.add(o.id);
      });
      if (incoming.size > 0 && prevIds.current.size > 0) {
        setNewIds(incoming);
        setTimeout(() => setNewIds(new Set()), 4000);
      }
      prevIds.current = new Set(list.map(o => o.id));
      setOrders(list);
      setLoading(false);
    });
    return () => unsub();
  }, [etabId]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter(o => (o.createdAt || "").startsWith(todayStr));
  const activeOrders = orders.filter(o => !["livre", "livree", "delivered", "annulee", "annule"].includes(o.status || ""));
  const revenue = todayOrders
    .filter(o => !["annulee", "annule"].includes(o.status || ""))
    .reduce((s, o) => s + (o.total || 0), 0);

  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: "40px 0", ...MONO, color: "#5a5470", fontSize: ".85rem" }}>
      Chargement des commandes...
    </div>
  );

  return (
    <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "EN COURS", value: activeOrders.length, color: PINK },
          { label: "AUJOURD'HUI", value: todayOrders.length, color: GOLD },
          { label: "CA DU JOUR", value: `${revenue.toFixed(2)}€`, color: GREEN },
        ].map(s => (
          <div key={s.label} style={{
            background: CARD, border: "1px solid rgba(255,255,255,.06)",
            borderRadius: 10, padding: "14px 12px", textAlign: "center",
          }}>
            <div style={{ ...MONO, fontSize: "1.2rem", fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ ...MONO, fontSize: ".58rem", color: "#5a5470", marginTop: 4, letterSpacing: ".1em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active orders first */}
      {activeOrders.length > 0 && (
        <div>
          <div style={{ ...MONO, fontSize: ".68rem", color: PINK, letterSpacing: ".12em", marginBottom: 10 }}>
            // COMMANDES EN COURS ({activeOrders.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeOrders.map(o => (
              <OrderCard key={o.id} order={o} isNew={newIds.has(o.id)} onUpdateStatus={updateStatus} />
            ))}
          </div>
        </div>
      )}

      {/* Today's completed */}
      {todayOrders.filter(o => ["livre","livree","delivered","annulee","annule"].includes(o.status||"")).length > 0 && (
        <div>
          <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 10 }}>
            // TERMINÉES AUJOURD'HUI
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayOrders
              .filter(o => ["livre","livree","delivered","annulee","annule"].includes(o.status||""))
              .map(o => (
                <OrderCard key={o.id} order={o} isNew={false} onUpdateStatus={updateStatus} compact />
              ))
            }
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📭</div>
          <div style={{ ...MONO, fontSize: ".85rem", color: "#5a5470" }}>Aucune commande pour l'instant</div>
          <div style={{ ...MONO, fontSize: ".72rem", color: "#3a2850", marginTop: 6 }}>
            Les nouvelles commandes apparaîtront ici en temps réel
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order, isNew, onUpdateStatus, compact = false,
}: {
  order: DayOrder;
  isNew: boolean;
  onUpdateStatus: (id: string, status: string) => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <div
      style={{
        background: isNew ? "rgba(255,45,120,.08)" : CARD,
        border: `1px solid ${isNew ? "rgba(255,45,120,.4)" : "rgba(255,255,255,.07)"}`,
        borderRadius: 12, overflow: "hidden",
        transition: "border-color .3s",
        boxShadow: isNew ? "0 0 20px rgba(255,45,120,.15)" : "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: "pointer",
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isNew && <span style={{ ...MONO, fontSize: ".65rem", color: PINK, animation: "pulse 1s infinite" }}>●</span>}
          <div>
            <div style={{ fontWeight: 700, fontSize: ".88rem" }}>{order.name || "Client"}</div>
            <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470" }}>{fmtTime(order.createdAt)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusBadge status={order.status} />
          {order.total != null && (
            <span style={{ ...MONO, fontSize: ".85rem", color: GOLD, fontWeight: 700 }}>
              {order.total.toFixed(2)}€
            </span>
          )}
          <span style={{ ...MONO, fontSize: ".72rem", color: "#5a5470" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {order.items && (
            <div style={{ ...MONO, fontSize: ".78rem", color: "#c4b8e0", lineHeight: 1.6, whiteSpace: "pre-line" }}>
              {order.items}
            </div>
          )}
          {order.address && (
            <div style={{ fontSize: ".78rem", color: "#7a7490" }}>📍 {order.address}</div>
          )}
          {order.phone && (
            <a href={`tel:${order.phone}`} style={{ fontSize: ".78rem", color: "#60a5fa", textDecoration: "none" }}>
              📞 {order.phone}
            </a>
          )}
          {order.driverName && (
            <div style={{ fontSize: ".78rem", color: "#7a7490" }}>🛵 {order.driverName}</div>
          )}
          {/* Payment */}
          <div style={{ ...MONO, fontSize: ".68rem", color: order.paidOnline ? GREEN : GOLD }}>
            {order.paidOnline ? "💳 PAYÉ EN LIGNE" : "💵 PAIEMENT À LA LIVRAISON"}
          </div>

          {/* Quick status actions */}
          {!["livre","livree","delivered","annulee","annule"].includes(order.status||"") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {order.status !== "en_cours" && (
                <button
                  onClick={() => onUpdateStatus(order.id, "en_cours")}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8,
                    background: "rgba(251,191,36,.12)", border: "1px solid rgba(251,191,36,.3)",
                    color: GOLD, ...MONO, fontSize: ".7rem", cursor: "pointer", fontWeight: 700,
                  }}
                >
                  🍳 EN PRÉPARATION
                </button>
              )}
              <button
                onClick={() => onUpdateStatus(order.id, "livre")}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8,
                  background: "rgba(184,255,0,.1)", border: "1px solid rgba(184,255,0,.25)",
                  color: GREEN, ...MONO, fontSize: ".7rem", cursor: "pointer", fontWeight: 700,
                }}
              >
                ✅ PRÊT / LIVRÉ
              </button>
              <button
                onClick={() => onUpdateStatus(order.id, "annule")}
                style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)",
                  color: "#5a5470", ...MONO, fontSize: ".7rem", cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function EtablissementDashboard() {
  const { id: etabId } = useParams() as { id: string };
  const router = useRouter();

  const [auth, setAuth] = useState<EtabAuth | null>(null);
  const [etab, setEtab] = useState<Etablissement | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [catCount, setCatCount] = useState(0);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", ok: true, show: false });
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const showMsg = (msg: string, ok = true) => {
    setToast({ msg, ok, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  // Auth check
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("yassala_etab_auth");
    if (!raw) { router.replace("/etablissement/login"); return; }
    try {
      const parsed: EtabAuth = JSON.parse(raw);
      if (parsed.id !== etabId) { router.replace("/etablissement/login"); return; }
      setAuth(parsed);
    } catch {
      router.replace("/etablissement/login");
    }
  }, [etabId, router]);

  // Firestore listeners
  useEffect(() => {
    if (!auth) return;
    return onSnapshot(doc(db, "day_etablissements", etabId), snap => {
      if (snap.exists()) setEtab({ id: snap.id, ...snap.data() } as Etablissement);
    });
  }, [auth, etabId]);

  // Product & category counts
  useEffect(() => {
    if (!auth) return;
    const q = (col: string) => query(collection(db, col), where("etablissementId", "==", etabId));
    getCountFromServer(q("day_products")).then(s => setProductCount(s.data().count)).catch(() => {});
    getCountFromServer(q("day_categories")).then(s => setCatCount(s.data().count)).catch(() => {});
  }, [auth, etabId]);

  const toggleOpen = async () => {
    if (!etab) return;
    const newVal = !etab.isOpen;
    setEtab(e => e ? { ...e, isOpen: newVal } : e);
    await updateDoc(doc(db, "day_etablissements", etabId), {
      isOpen: newVal, updatedAt: new Date().toISOString(),
    });
    showMsg(newVal ? "Établissement ouvert ✓" : "Établissement fermé");
  };

  const uploadImage = async (file: File, type: "logo" | "cover") => {
    if (!file.type.startsWith("image/")) { showMsg("Fichier image requis", false); return; }
    setUploading(type);
    try {
      const r = ref(storage, `day_etablissements/${Date.now()}_${type}_${file.name}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const field = type === "logo" ? "logoUrl" : "coverUrl";
      await updateDoc(doc(db, "day_etablissements", etabId), { [field]: url, updatedAt: new Date().toISOString() });
      setEtab(e => e ? { ...e, [field]: url } : e);
      showMsg(type === "logo" ? "Logo mis à jour ✓" : "Photo de couverture mise à jour ✓");
    } catch { showMsg("Erreur lors de l'upload", false); }
    finally { setUploading(null); }
  };

  const saveDelivery = async () => {
    if (!etab) return;
    setSaving(true);
    await updateDoc(doc(db, "day_etablissements", etabId), {
      openHours: etab.openHours,
      closeTime: etab.closeTime,
      deliveryMin: etab.deliveryMin,
      deliveryMax: etab.deliveryMax,
      deliveryFee: etab.deliveryFee,
      updatedAt: new Date().toISOString(),
    });
    setSaving(false);
    showMsg("Informations sauvegardées ✓");
  };

  const logout = () => {
    localStorage.removeItem("yassala_etab_auth");
    router.replace("/etablissement/login");
  };

  if (!auth || !etab) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ ...MONO, color: "#5a5470", fontSize: ".85rem" }}>Chargement...</span>
      </div>
    );
  }

  const isOpen = etab.isOpen !== false;

  const inp = (extra?: object) => ({
    width: "100%", background: "#08050f",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 8, padding: "10px 13px",
    color: "#f0eeff", fontSize: ".88rem",
    fontFamily: "'Inter',sans-serif",
    boxSizing: "border-box" as const, ...extra,
  });

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Accueil", icon: "🏪" },
    { id: "orders",    label: "Commandes", icon: "📋" },
    { id: "scanner",   label: "Scanner QR", icon: "📷" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#f0eeff", fontFamily: "'Inter',sans-serif" }}>
      {toast.show && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* Topbar */}
      <div style={{
        background: "rgba(12,9,24,.97)",
        borderBottom: "1px solid rgba(255,45,120,.15)",
        padding: "0 20px", height: 54,
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          {etab.logoUrl && (
            <img src={etab.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
          )}
          <span style={{ ...MONO, fontSize: ".88rem", color: PINK, fontWeight: 700, letterSpacing: ".05em" }}>
            {etab.name}
          </span>
          <span style={{
            ...MONO, fontSize: ".65rem", padding: "2px 9px", borderRadius: 20,
            background: isOpen ? "rgba(184,255,0,.1)" : "rgba(255,45,120,.1)",
            color: isOpen ? GREEN : PINK,
          }}>
            {isOpen ? "OUVERT" : "FERMÉ"}
          </span>
        </div>
        <a href={`/etablissement/${etabId}/menu`}
          style={{ ...MONO, fontSize: ".72rem", color: "#f0eeff", textDecoration: "none", padding: "6px 14px", background: "rgba(255,45,120,.12)", border: "1px solid rgba(255,45,120,.25)", borderRadius: 6 }}>
          🍽️ MENU
        </a>
        <button onClick={logout}
          style={{ ...MONO, fontSize: ".72rem", color: "#5a5470", background: "transparent", border: "1px solid rgba(255,255,255,.08)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
          ↩
        </button>
      </div>

      {/* Tab nav */}
      <div style={{
        background: "rgba(12,9,24,.95)",
        borderBottom: "1px solid rgba(255,255,255,.07)",
        display: "flex", position: "sticky", top: 54, zIndex: 39,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, padding: "12px 8px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === t.id ? `2px solid ${PINK}` : "2px solid transparent",
              color: activeTab === t.id ? PINK : "#5a5470",
              ...MONO, fontSize: ".7rem", letterSpacing: ".06em",
              cursor: "pointer", transition: "color .15s",
              display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3,
            }}
          >
            <span style={{ fontSize: "1.1rem" }}>{t.icon}</span>
            {t.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px 40px" }}>

        {/* ── TAB: DASHBOARD ── */}
        {activeTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 24 }}>

            {/* Open/Close toggle */}
            <div style={{
              background: isOpen ? "rgba(184,255,0,.06)" : "rgba(255,45,120,.06)",
              border: `2px solid ${isOpen ? "rgba(184,255,0,.25)" : "rgba(255,45,120,.25)"}`,
              borderRadius: 16, padding: "28px 24px",
              display: "flex", alignItems: "center", gap: 20,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...MONO, fontSize: ".68rem", color: "#5a5470", letterSpacing: ".12em", marginBottom: 8 }}>
                  STATUT EN TEMPS RÉEL
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: isOpen ? GREEN : PINK, marginBottom: 4 }}>
                  {isOpen ? "☀️ OUVERT" : "🌙 FERMÉ"}
                </div>
                <div style={{ ...MONO, fontSize: ".75rem", color: "#5a5470" }}>
                  {isOpen ? "Les clients peuvent passer commande" : "Votre établissement n'accepte pas de commandes"}
                </div>
              </div>
              <div
                onClick={toggleOpen}
                style={{
                  width: 72, height: 38, borderRadius: 19, position: "relative", cursor: "pointer", flexShrink: 0,
                  background: isOpen ? GREEN : "rgba(255,255,255,.12)",
                  transition: "background .25s",
                  boxShadow: isOpen ? "0 0 20px rgba(184,255,0,.3)" : "none",
                }}
              >
                <div style={{
                  position: "absolute", top: 4, left: isOpen ? 36 : 4,
                  width: 30, height: 30, borderRadius: "50%",
                  background: isOpen ? "#000" : "#5a5470",
                  transition: "left .25s",
                }} />
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { label: "PRODUITS AU MENU", value: productCount, icon: "🛍️", link: `/etablissement/${etabId}/menu` },
                { label: "CATÉGORIES", value: catCount, icon: "🗂️", link: `/etablissement/${etabId}/menu` },
              ].map(s => (
                <a key={s.label} href={s.link} style={{ textDecoration: "none" }}>
                  <div style={{
                    background: CARD, border: "1px solid rgba(255,255,255,.06)",
                    borderRadius: 12, padding: "18px 20px",
                  }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: PINK, ...MONO }}>{s.value}</div>
                    <div style={{ ...MONO, fontSize: ".65rem", color: "#5a5470", marginTop: 4, letterSpacing: ".1em" }}>{s.label}</div>
                  </div>
                </a>
              ))}
            </div>

            {/* Quick links */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                onClick={() => setActiveTab("orders")}
                style={{
                  background: "rgba(255,45,120,.06)", border: "1px solid rgba(255,45,120,.2)",
                  borderRadius: 14, padding: "18px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                }}
              >
                <span style={{ fontSize: "1.8rem" }}>📋</span>
                <div>
                  <div style={{ color: "#f0eeff", fontWeight: 700, fontSize: ".9rem", marginBottom: 2 }}>Commandes</div>
                  <div style={{ ...MONO, fontSize: ".65rem", color: "#7a7490" }}>Temps réel</div>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("scanner")}
                style={{
                  background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)",
                  borderRadius: 14, padding: "18px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                }}
              >
                <span style={{ fontSize: "1.8rem" }}>📷</span>
                <div>
                  <div style={{ color: "#f0eeff", fontWeight: 700, fontSize: ".9rem", marginBottom: 2 }}>Scanner QR</div>
                  <div style={{ ...MONO, fontSize: ".65rem", color: "#7a7490" }}>Livreurs</div>
                </div>
              </button>
            </div>

            {/* Images */}
            <div style={{ background: CARD, border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "22px 20px" }}>
              <div style={{ ...MONO, fontSize: ".68rem", color: PINK, letterSpacing: ".12em", marginBottom: 18 }}>
                // IMAGES DE L'ÉTABLISSEMENT
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Logo */}
                <div>
                  <div style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", marginBottom: 10 }}>LOGO</div>
                  <div
                    onClick={() => logoRef.current?.click()}
                    style={{
                      height: 120, borderRadius: 10, cursor: "pointer", overflow: "hidden",
                      border: "2px dashed rgba(255,45,120,.25)",
                      background: "rgba(255,255,255,.02)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    {etab.logoUrl ? (
                      <img src={etab.logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <>
                        <div style={{ fontSize: "2rem", marginBottom: 6 }}>{uploading === "logo" ? "⏳" : "🏪"}</div>
                        <div style={{ ...MONO, fontSize: ".7rem", color: "#5a5470", textAlign: "center" }}>
                          {uploading === "logo" ? "Upload..." : "Cliquer pour ajouter"}
                        </div>
                      </>
                    )}
                  </div>
                  <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) uploadImage(e.target.files[0], "logo"); }} />
                </div>

                {/* Cover */}
                <div>
                  <div style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", marginBottom: 10 }}>PHOTO DE COUVERTURE</div>
                  <div
                    onClick={() => coverRef.current?.click()}
                    style={{
                      height: 120, borderRadius: 10, cursor: "pointer", overflow: "hidden",
                      border: "2px dashed rgba(255,45,120,.25)",
                      background: "rgba(255,255,255,.02)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    {etab.coverUrl ? (
                      <img src={etab.coverUrl} alt="cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <>
                        <div style={{ fontSize: "2rem", marginBottom: 6 }}>{uploading === "cover" ? "⏳" : "🖼️"}</div>
                        <div style={{ ...MONO, fontSize: ".7rem", color: "#5a5470", textAlign: "center" }}>
                          {uploading === "cover" ? "Upload..." : "Cliquer pour ajouter"}
                        </div>
                      </>
                    )}
                  </div>
                  <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) uploadImage(e.target.files[0], "cover"); }} />
                </div>
              </div>
            </div>

            {/* Infos pratiques */}
            <div style={{ background: CARD, border: "1px solid rgba(255,255,255,.06)", borderRadius: 14, padding: "22px 20px" }}>
              <div style={{ ...MONO, fontSize: ".68rem", color: GOLD, letterSpacing: ".12em", marginBottom: 18 }}>
                // INFORMATIONS PRATIQUES
              </div>
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                      HORAIRES
                    </label>
                    <input
                      value={etab.openHours || ""}
                      onChange={e => setEtab(v => v && ({ ...v, openHours: e.target.value }))}
                      placeholder="08:00 – 21:00"
                      style={inp()}
                    />
                  </div>
                  <div>
                    <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                      FERMETURE AUTO
                    </label>
                    <input
                      value={etab.closeTime || ""}
                      onChange={e => setEtab(v => v && ({ ...v, closeTime: e.target.value }))}
                      placeholder="21:00"
                      style={inp({ ...MONO })}
                    />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                      MIN (min)
                    </label>
                    <input
                      type="number" min={0}
                      value={etab.deliveryMin ?? 20}
                      onChange={e => setEtab(v => v && ({ ...v, deliveryMin: parseInt(e.target.value) || 0 }))}
                      style={inp({ ...MONO })}
                    />
                  </div>
                  <div>
                    <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                      MAX (min)
                    </label>
                    <input
                      type="number" min={0}
                      value={etab.deliveryMax ?? 35}
                      onChange={e => setEtab(v => v && ({ ...v, deliveryMax: parseInt(e.target.value) || 0 }))}
                      style={inp({ ...MONO })}
                    />
                  </div>
                  <div>
                    <label style={{ ...MONO, fontSize: ".65rem", color: "#7a7490", letterSpacing: ".1em", display: "block", marginBottom: 7 }}>
                      FRAIS (€)
                    </label>
                    <input
                      type="number" min={0} step={0.5}
                      value={etab.deliveryFee ?? 2}
                      onChange={e => setEtab(v => v && ({ ...v, deliveryFee: parseFloat(e.target.value) || 0 }))}
                      style={inp({ ...MONO, color: PINK })}
                    />
                  </div>
                </div>
                <button
                  onClick={saveDelivery}
                  disabled={saving}
                  style={{
                    background: GOLD, color: "#000", border: "none", borderRadius: 8,
                    padding: "11px 22px", ...MONO, fontSize: ".8rem",
                    cursor: saving ? "default" : "pointer", fontWeight: 700, letterSpacing: ".06em",
                  }}
                >
                  {saving ? "⏳ SAUVEGARDE..." : "☀️ SAUVEGARDER"}
                </button>
              </div>
            </div>

            {/* Quick link to menu */}
            <a href={`/etablissement/${etabId}/menu`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "rgba(255,45,120,.06)",
                border: "1px solid rgba(255,45,120,.2)",
                borderRadius: 14, padding: "20px 22px",
                display: "flex", alignItems: "center", gap: 16, cursor: "pointer",
              }}>
                <div style={{ fontSize: "2.2rem" }}>🍽️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>Gérer mon menu</div>
                  <div style={{ ...MONO, fontSize: ".72rem", color: "#7a7490" }}>
                    Catégories · produits · images · prix · stock
                  </div>
                </div>
                <div style={{ ...MONO, fontSize: ".8rem", color: PINK }}>→</div>
              </div>
            </a>
          </div>
        )}

        {/* ── TAB: ORDERS ── */}
        {activeTab === "orders" && <OrdersTab etabId={etabId} />}

        {/* ── TAB: QR SCANNER ── */}
        {activeTab === "scanner" && <QRScannerTab etabId={etabId} etabName={etab.name} />}
      </div>
    </div>
  );
}
