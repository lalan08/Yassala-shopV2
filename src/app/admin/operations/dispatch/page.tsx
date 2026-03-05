"use client";

import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, doc, updateDoc, addDoc,
} from "firebase/firestore";
import { db, type Order, type OnlineDriver, haversineKm } from "@/lib/adminFirebase";

const C = {
  bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)",
  text: "#f1f5f9", muted: "#64748b", accent: "#f97316",
  green: "#22c55e", red: "#ef4444", blue: "#3b82f6", yellow: "#fbbf24",
  purple: "#8b5cf6",
};

// Statuses managed by dispatch
const PREP_STATUSES   = ["paid", "confirmed", "nouveau", "preparing"];
const READY_STATUSES  = ["ready", "pret"];
const DELIVER_STATUSES = ["assigned", "en_cours", "out_for_delivery"];

function minsAgo(ts: any): number {
  if (!ts) return 9999;
  const ms = ts?.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
  return Math.round((Date.now() - ms) / 60000);
}

function fmtDuration(dateStr: string): string {
  if (!dateStr) return "—";
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

function fmtMins(m: number): string {
  if (m >= 9999) return "—";
  if (m < 1) return "maintenant";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    nouveau:          { label: "Nouveau",       color: "#f97316", bg: "rgba(249,115,22,0.15)" },
    paid:             { label: "Payé",           color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
    confirmed:        { label: "Confirmé",       color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    preparing:        { label: "En préparation", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
    ready:            { label: "Prêt",           color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
    pret:             { label: "Prêt",           color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
    assigned:         { label: "Assigné",        color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    en_cours:         { label: "En livraison",   color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    out_for_delivery: { label: "En route",       color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    livre:            { label: "Livré",          color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
    annule:           { label: "Annulé",         color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  };
  return map[s] ?? { label: s, color: C.muted, bg: "rgba(255,255,255,0.06)" };
}

type ExtOrder = Order & { commerceName?: string };

export default function DispatchPage() {
  const [orders, setOrders]       = useState<ExtOrder[]>([]);
  const [drivers, setDrivers]     = useState<OnlineDriver[]>([]);
  const [driverLocs, setDriverLocs] = useState<Record<string, { lat: number; lng: number; updatedAt: any }>>({});
  const [selected, setSelected]   = useState<ExtOrder | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [toast, setToast]         = useState("");
  const [tick, setTick]           = useState(0);

  // Refresh elapsed times every minute
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExtOrder))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(data);
    });
    const unsubDrivers = onSnapshot(collection(db, "drivers"), (snap) => {
      setDrivers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as OnlineDriver)));
    });
    const unsubLocs = onSnapshot(collection(db, "driver_locations"), (snap) => {
      const locs: Record<string, { lat: number; lng: number; updatedAt: any }> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.lat && data.lng) locs[d.id] = { lat: data.lat, lng: data.lng, updatedAt: data.updatedAt };
      });
      setDriverLocs(locs);
    });
    return () => { unsubOrders(); unsubDrivers(); unsubLocs(); };
  }, []);

  const showMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const updateStatus = async (orderId: string, status: string) => {
    await updateDoc(doc(db, "orders", orderId), { status });
    if (selected?.id === orderId) setSelected((s) => s ? { ...s, status } : s);
    showMsg(`Statut → ${status}`);
  };

  const assignDriver = async (order: ExtOrder, driver: OnlineDriver) => {
    await updateDoc(doc(db, "orders", order.id!), {
      assignedDriverId: driver.uid,
      assignedDriverName: driver.name,
      status: "assigned",
    });
    await updateDoc(doc(db, "drivers", driver.uid), {
      status: "busy",
      currentOrderId: order.id,
    });
    // Notify driver (write to notifications collection)
    await addDoc(collection(db, "driver_notifications"), {
      driverId: driver.uid,
      orderId: order.id,
      type: "new_assignment",
      message: `Nouvelle course: ${order.name} — ${order.address}`,
      createdAt: new Date().toISOString(),
      read: false,
    });
    showMsg(`Assigné à ${driver.name}`);
    setAssignOpen(false);
  };

  const handleDriverRefusal = async (order: ExtOrder) => {
    await updateDoc(doc(db, "orders", order.id!), {
      status: "ready",
      assignedDriverId: null,
      assignedDriverName: null,
    });
    if (order.assignedDriverId) {
      await updateDoc(doc(db, "drivers", order.assignedDriverId), {
        status: "online",
        currentOrderId: null,
      });
    }
    // Notify admin
    await addDoc(collection(db, "admin_notifications"), {
      type: "driver_refused",
      orderId: order.id,
      message: `Livreur a refusé la course #${(order as any).orderNumber ?? order.id?.slice(-6)}`,
      createdAt: new Date().toISOString(),
    });
    showMsg("Commande remise en file Ready");
    setSelected(null);
  };

  const autoAssign = async (order: ExtOrder) => {
    const free = drivers.filter((d) => d.isOnline && d.status !== "busy" && d.status !== "offline");
    if (free.length === 0) { showMsg("Aucun livreur libre"); return; }
    const best = [...free].sort((a, b) => ((b.acceptanceRate ?? 0.8) - (a.acceptanceRate ?? 0.8)))[0];
    await assignDriver(order, best);
  };

  const openNavigation = (address: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank");
  };

  const onlineDrivers = drivers.filter((d) => d.isOnline && d.status !== "offline");
  const prepOrders    = orders.filter((o) => PREP_STATUSES.includes(o.status));
  const readyOrders   = orders.filter((o) => READY_STATUSES.includes(o.status));
  const delivOrders   = orders.filter((o) => DELIVER_STATUSES.includes(o.status));

  return (
    <div style={{ padding: "20px 24px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, zIndex: 9999, fontWeight: 600, fontSize: 14 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Dispatch</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            {onlineDrivers.length} livreur{onlineDrivers.length !== 1 ? "s" : ""} en ligne ·{" "}
            {prepOrders.length + readyOrders.length + delivOrders.length} commande{prepOrders.length + readyOrders.length + delivOrders.length !== 1 ? "s" : ""} actives
          </div>
        </div>
        {/* Online driver quick summary */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {onlineDrivers.slice(0, 5).map((d) => {
            const loc = driverLocs[d.uid];
            const ping = loc ? minsAgo(loc.updatedAt) : null;
            return (
              <div key={d.uid} title={`${d.name} — ${ping !== null ? fmtMins(ping) : "?"}`} style={{ textAlign: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: d.status === "busy" ? "rgba(59,130,246,0.2)" : "rgba(34,197,94,0.2)", border: `2px solid ${d.status === "busy" ? C.blue : C.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                  🏍️
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2, maxWidth: 40, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name.split(" ")[0]}</div>
              </div>
            );
          })}
          {onlineDrivers.length > 5 && <div style={{ color: C.muted, fontSize: 12 }}>+{onlineDrivers.length - 5}</div>}
        </div>
      </div>

      {/* Kanban columns + detail panel */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr 1fr 340px" : "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Column 1: À préparer */}
        <KanbanColumn
          title="À préparer"
          count={prepOrders.length}
          color="#fbbf24"
          orders={prepOrders}
          drivers={drivers}
          driverLocs={driverLocs}
          tick={tick}
          onSelect={(o) => { setSelected(o); setAssignOpen(false); }}
          selectedId={selected?.id}
          nextStatus="ready"
          nextLabel="→ Prêt"
          onUpdateStatus={updateStatus}
        />

        {/* Column 2: Prêtes */}
        <KanbanColumn
          title="Prêtes"
          count={readyOrders.length}
          color="#22c55e"
          orders={readyOrders}
          drivers={drivers}
          driverLocs={driverLocs}
          tick={tick}
          onSelect={(o) => { setSelected(o); setAssignOpen(false); }}
          selectedId={selected?.id}
          nextStatus="assigned"
          nextLabel="→ Assigner"
          onUpdateStatus={updateStatus}
          showAssign
          onAutoAssign={autoAssign}
          onOpenAssign={(o) => { setSelected(o); setAssignOpen(true); }}
        />

        {/* Column 3: En livraison */}
        <KanbanColumn
          title="En livraison"
          count={delivOrders.length}
          color="#3b82f6"
          orders={delivOrders}
          drivers={drivers}
          driverLocs={driverLocs}
          tick={tick}
          onSelect={(o) => { setSelected(o); setAssignOpen(false); }}
          selectedId={selected?.id}
          nextStatus="livre"
          nextLabel="✓ Livré"
          onUpdateStatus={updateStatus}
          onRefusal={handleDriverRefusal}
        />

        {/* Detail Panel */}
        {selected && (
          <OrderDetailPanel
            order={selected}
            drivers={drivers}
            driverLocs={driverLocs}
            assignOpen={assignOpen}
            onClose={() => setSelected(null)}
            onUpdateStatus={(s) => updateStatus(selected.id!, s)}
            onAssign={(driver) => assignDriver(selected, driver)}
            onAutoAssign={() => autoAssign(selected)}
            onRefusal={() => handleDriverRefusal(selected)}
            onNav={(addr) => openNavigation(addr)}
            onToggleAssign={() => setAssignOpen((a) => !a)}
            toast={toast}
          />
        )}
      </div>
    </div>
  );
}

// ── KANBAN COLUMN ──
function KanbanColumn({
  title, count, color, orders, drivers, driverLocs, tick,
  onSelect, selectedId,
  nextStatus, nextLabel,
  onUpdateStatus,
  showAssign, onAutoAssign, onOpenAssign, onRefusal,
}: {
  title: string; count: number; color: string;
  orders: ExtOrder[]; drivers: OnlineDriver[];
  driverLocs: Record<string, { lat: number; lng: number; updatedAt: any }>;
  tick: number;
  onSelect: (o: ExtOrder) => void;
  selectedId?: string;
  nextStatus: string; nextLabel: string;
  onUpdateStatus: (id: string, s: string) => void;
  showAssign?: boolean;
  onAutoAssign?: (o: ExtOrder) => void;
  onOpenAssign?: (o: ExtOrder) => void;
  onRefusal?: (o: ExtOrder) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 12, color: "#64748b", background: "rgba(255,255,255,0.06)", padding: "1px 8px", borderRadius: 99 }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 100 }}>
        {orders.map((o) => {
          const st = statusBadge(o.status);
          const assignedDriver = o.assignedDriverId ? drivers.find((d) => d.uid === o.assignedDriverId) : null;
          const elapsed = fmtDuration(o.createdAt);
          const isSelected = o.id === selectedId;
          return (
            <div
              key={o.id}
              onClick={() => onSelect(o)}
              style={{
                background: isSelected ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${isSelected ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10,
                padding: "12px 14px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  #{(o as any).orderNumber ?? o.id?.slice(-6).toUpperCase()}
                </span>
                <span style={{ fontSize: 10, color: "#64748b" }}>{elapsed}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{o.name || o.phone}</div>
              {o.commerceName && <div style={{ fontSize: 11, color: "#64748b" }}>🏪 {o.commerceName}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#f97316" }}>{Number(o.total).toFixed(2)} €</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
              </div>
              {assignedDriver && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#3b82f6" }}>🏍️ {assignedDriver.name}</div>
              )}
              {/* Quick actions */}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onUpdateStatus(o.id!, nextStatus)}
                  style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", background: color + "22", color, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                >
                  {nextLabel}
                </button>
                {showAssign && (
                  <>
                    <button
                      onClick={() => onOpenAssign?.(o)}
                      style={{ padding: "5px 8px", borderRadius: 6, border: "none", background: "rgba(59,130,246,0.15)", color: "#3b82f6", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                    >
                      👤
                    </button>
                    <button
                      onClick={() => onAutoAssign?.(o)}
                      style={{ padding: "5px 8px", borderRadius: 6, border: "none", background: "rgba(34,197,94,0.15)", color: "#22c55e", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                    >
                      ⚡
                    </button>
                  </>
                )}
                {onRefusal && o.assignedDriverId && (
                  <button
                    onClick={() => onRefusal(o)}
                    style={{ padding: "5px 8px", borderRadius: 6, border: "none", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                    title="Livreur a refusé"
                  >
                    ↩
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#475569", fontSize: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.06)" }}>
            Aucune commande
          </div>
        )}
      </div>
    </div>
  );
}

// ── ORDER DETAIL PANEL ──
function OrderDetailPanel({
  order, drivers, driverLocs, assignOpen,
  onClose, onUpdateStatus, onAssign, onAutoAssign, onRefusal, onNav, onToggleAssign, toast,
}: {
  order: ExtOrder; drivers: OnlineDriver[];
  driverLocs: Record<string, { lat: number; lng: number; updatedAt: any }>;
  assignOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (s: string) => void;
  onAssign: (d: OnlineDriver) => void;
  onAutoAssign: () => void;
  onRefusal: () => void;
  onNav: (a: string) => void;
  onToggleAssign: () => void;
  toast: string;
}) {
  const [notes, setNotes] = useState((order as any).internalNotes ?? "");
  const assignedDriver = order.assignedDriverId ? drivers.find((d) => d.uid === order.assignedDriverId) : null;
  const onlineDrivers = drivers.filter((d) => d.isOnline && d.status !== "offline");

  const saveNotes = async () => {
    await updateDoc(doc(db, "orders", order.id!), { internalNotes: notes });
  };

  const STATUS_FLOW = ["nouveau", "paid", "confirmed", "preparing", "ready", "assigned", "en_cours", "livre"];

  return (
    <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 20, position: "sticky", top: 20, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          Commande #{(order as any).orderNumber ?? order.id?.slice(-6).toUpperCase()}
        </h3>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>

      {/* Client info */}
      <Section title="Client">
        <InfoRow label="Nom" value={order.name || "—"} />
        <InfoRow label="Téléphone" value={
          order.phone ? (
            <a href={`tel:${order.phone}`} style={{ color: "#3b82f6", textDecoration: "none" }}>{order.phone}</a>
          ) : "—"
        } />
        <InfoRow label="Adresse" value={order.address || "—"} />
        {order.address && (
          <button
            onClick={() => onNav(order.address!)}
            style={{ marginTop: 8, width: "100%", padding: "8px", borderRadius: 8, border: "none", background: "rgba(59,130,246,0.15)", color: "#3b82f6", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            🗺️ Ouvrir navigation
          </button>
        )}
      </Section>

      {/* Order info */}
      <Section title="Commande">
        <InfoRow label="Montant" value={<span style={{ color: "#f97316", fontWeight: 700 }}>{Number(order.total).toFixed(2)} €</span>} />
        <InfoRow label="Paiement" value={order.paidOnline ? "💳 En ligne" : "💵 Espèces"} />
        <InfoRow label="Créée" value={fmtDuration(order.createdAt) + " ago"} />
        {order.commerceName && <InfoRow label="Commerce" value={order.commerceName} />}
        {(order as any).isRush && <InfoRow label="Urgence" value={<span style={{ color: "#ef4444", fontWeight: 700 }}>⚡ URGENT</span>} />}
      </Section>

      {/* Status control */}
      <Section title="Statut">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STATUS_FLOW.map((s) => (
            <button
              key={s}
              onClick={() => onUpdateStatus(s)}
              style={{
                padding: "5px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11,
                background: order.status === s ? "#f97316" : "rgba(255,255,255,0.06)",
                color: order.status === s ? "#fff" : "#64748b",
                fontWeight: order.status === s ? 700 : 400,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {order.status === "en_cours" && order.assignedDriverId && (
          <button
            onClick={onRefusal}
            style={{ marginTop: 10, width: "100%", padding: "7px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.12)", color: "#ef4444", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
          >
            ↩ Livreur a refusé → remettre en Ready
          </button>
        )}
      </Section>

      {/* Driver */}
      <Section title="Livreur">
        {assignedDriver ? (
          <div style={{ background: "rgba(34,197,94,0.08)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#22c55e" }}>🏍️ {assignedDriver.name}</div>
            {assignedDriver.phone && (
              <a href={`tel:${assignedDriver.phone}`} style={{ display: "block", color: "#3b82f6", fontSize: 12, marginTop: 4, textDecoration: "none" }}>📞 {assignedDriver.phone}</a>
            )}
            {driverLocs[assignedDriver.uid] && (
              <a
                href={`https://www.google.com/maps?q=${driverLocs[assignedDriver.uid].lat},${driverLocs[assignedDriver.uid].lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block", color: "#3b82f6", fontSize: 12, marginTop: 4, textDecoration: "none" }}
              >
                📍 Voir position (ping: {fmtMins(minsAgo(driverLocs[assignedDriver.uid].updatedAt))})
              </a>
            )}
          </div>
        ) : (
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>Aucun livreur assigné</div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onToggleAssign}
            style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: "rgba(249,115,22,0.15)", color: "#f97316", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            {assignedDriver ? "Réassigner" : "Assigner livreur"}
          </button>
          <button
            onClick={onAutoAssign}
            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "rgba(34,197,94,0.15)", color: "#22c55e", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            ⚡ Auto
          </button>
        </div>

        {/* Driver list for manual assignment */}
        {assignOpen && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Choisir un livreur :</div>
            {onlineDrivers.length === 0 && (
              <div style={{ fontSize: 12, color: "#64748b" }}>Aucun livreur en ligne</div>
            )}
            {onlineDrivers
              .sort((a, b) => (b.acceptanceRate ?? 0.8) - (a.acceptanceRate ?? 0.8))
              .map((d) => {
                const loc = driverLocs[d.uid];
                return (
                  <button
                    key={d.uid}
                    onClick={() => onAssign(d)}
                    disabled={d.status === "busy"}
                    style={{
                      padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
                      background: d.status === "busy" ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.04)",
                      color: d.status === "busy" ? "#475569" : "#f1f5f9",
                      cursor: d.status === "busy" ? "not-allowed" : "pointer",
                      textAlign: "left", display: "flex", justifyContent: "space-between",
                      opacity: d.status === "busy" ? 0.5 : 1,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                        {d.status === "busy" ? "🔴 En livraison" : "🟢 Libre"}
                        {d.zone && ` · ${d.zone}`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11 }}>
                      {d.acceptanceRate !== undefined && <div style={{ color: "#22c55e" }}>{(d.acceptanceRate * 100).toFixed(0)}%</div>}
                      {loc && <div style={{ color: "#64748b" }}>📡 {fmtMins(minsAgo(loc.updatedAt))}</div>}
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </Section>

      {/* Internal notes */}
      <Section title="Notes internes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Notes internes (auto-sauvegarde au clic ailleurs)..."
          style={{ width: "100%", minHeight: 80, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#f1f5f9", fontSize: 12, resize: "vertical", outline: "none", boxSizing: "border-box" }}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#475569", marginBottom: 8 }}>{title}</div>
      {children}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", marginTop: 14 }} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ color: "#f1f5f9", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

