"use client";

import { useEffect, useState } from "react";
import {
  collection, onSnapshot, doc, updateDoc, addDoc,
} from "firebase/firestore";
import { db, type Order, type OnlineDriver } from "@/lib/adminFirebase";

const C = {
  bg: "#0a0a14", card: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)",
  text: "#f1f5f9", muted: "#64748b", accent: "#f97316",
  green: "#22c55e", red: "#ef4444", blue: "#3b82f6", yellow: "#fbbf24",
  purple: "#8b5cf6",
};

const PREP_STATUSES    = ["paid", "confirmed", "nouveau", "preparing"];
const READY_STATUSES   = ["ready", "pret"];
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

function elapsedMinutes(dateStr: string): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function elapsedColor(mins: number): string {
  if (mins < 15) return C.green;
  if (mins < 30) return C.yellow;
  return C.red;
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    nouveau:          { label: "Nouveau",       color: "#f97316", bg: "rgba(249,115,22,0.15)" },
    paid:             { label: "Paye",           color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
    confirmed:        { label: "Confirme",       color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    preparing:        { label: "En preparation", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
    ready:            { label: "Pret",           color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
    pret:             { label: "Pret",           color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
    assigned:         { label: "Assigne",        color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    en_cours:         { label: "En livraison",   color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    out_for_delivery: { label: "En route",       color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    livre:            { label: "Livre",          color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
    annule:           { label: "Annule",         color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  };
  return map[s] ?? { label: s, color: C.muted, bg: "rgba(255,255,255,0.06)" };
}

type ExtOrder = Order & { commerceName?: string };

export default function DispatchPage() {
  const [orders, setOrders]         = useState<ExtOrder[]>([]);
  const [drivers, setDrivers]       = useState<OnlineDriver[]>([]);
  const [driverLocs, setDriverLocs] = useState<Record<string, { lat: number; lng: number; updatedAt: any }>>({});
  const [selected, setSelected]     = useState<ExtOrder | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [toast, setToast]           = useState("");
  const [tick, setTick]             = useState(0);
  const [driversExpanded, setDriversExpanded] = useState(true);

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
    showMsg(`Statut -> ${status}`);
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
    await addDoc(collection(db, "driver_notifications"), {
      driverId: driver.uid,
      orderId: order.id,
      type: "new_assignment",
      message: `Nouvelle course: ${order.name} -- ${order.address}`,
      createdAt: new Date().toISOString(),
      read: false,
    });
    showMsg(`Assigne a ${driver.name}`);
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
    await addDoc(collection(db, "admin_notifications"), {
      type: "driver_refused",
      orderId: order.id,
      message: `Livreur a refuse la course #${(order as any).orderNumber ?? order.id?.slice(-6)}`,
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
  const freeDrivers   = onlineDrivers.filter((d) => d.status !== "busy");
  const busyDrivers   = onlineDrivers.filter((d) => d.status === "busy");
  const prepOrders    = orders.filter((o) => PREP_STATUSES.includes(o.status));
  const readyOrders   = orders.filter((o) => READY_STATUSES.includes(o.status));
  const delivOrders   = orders.filter((o) => DELIVER_STATUSES.includes(o.status));

  return (
    <div style={{ padding: "20px 24px", minHeight: "100vh", background: C.bg, color: C.text }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20,
          background: C.accent, color: "#fff",
          padding: "10px 20px", borderRadius: 10,
          zIndex: 9999, fontWeight: 600, fontSize: 14,
          boxShadow: "0 4px 20px rgba(249,115,22,0.4)",
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Dispatch</h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>Temps reel - mis a jour automatiquement</div>
        </div>
        {/* Quick stats */}
        <div style={{ display: "flex", gap: 10 }}>
          <StatPill label="En preparation" value={prepOrders.length} color={C.yellow} />
          <StatPill label="Pretes" value={readyOrders.length} color={C.green} />
          <StatPill label="En livraison" value={delivOrders.length} color={C.blue} />
          <StatPill label="Libres" value={freeDrivers.length} color={C.green} />
        </div>
      </div>

      {/* Drivers panel */}
      <DriversPanel
        drivers={onlineDrivers}
        driverLocs={driverLocs}
        orders={orders}
        expanded={driversExpanded}
        onToggle={() => setDriversExpanded((e) => !e)}
        tick={tick}
      />

      {/* Kanban + detail */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr 1fr 360px" : "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>
        <KanbanColumn
          title="A preparer"
          count={prepOrders.length}
          color={C.yellow}
          orders={prepOrders}
          drivers={drivers}
          driverLocs={driverLocs}
          tick={tick}
          onSelect={(o) => { setSelected(o); setAssignOpen(false); }}
          selectedId={selected?.id}
          nextStatus="ready"
          nextLabel="-> Pret"
          onUpdateStatus={updateStatus}
        />

        <KanbanColumn
          title="Pretes - A assigner"
          count={readyOrders.length}
          color={C.green}
          orders={readyOrders}
          drivers={drivers}
          driverLocs={driverLocs}
          tick={tick}
          onSelect={(o) => { setSelected(o); setAssignOpen(false); }}
          selectedId={selected?.id}
          nextStatus="assigned"
          nextLabel="-> Assigner"
          onUpdateStatus={updateStatus}
          showAssign
          onAutoAssign={autoAssign}
          onOpenAssign={(o) => { setSelected(o); setAssignOpen(true); }}
          onQuickAssign={assignDriver}
          freeDrivers={freeDrivers}
        />

        <KanbanColumn
          title="En livraison"
          count={delivOrders.length}
          color={C.blue}
          orders={delivOrders}
          drivers={drivers}
          driverLocs={driverLocs}
          tick={tick}
          onSelect={(o) => { setSelected(o); setAssignOpen(false); }}
          selectedId={selected?.id}
          nextStatus="livre"
          nextLabel="Livre"
          onUpdateStatus={updateStatus}
          onRefusal={handleDriverRefusal}
        />

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
          />
        )}
      </div>
    </div>
  );
}

// ── STAT PILL ──
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: `${color}11`,
      border: `1px solid ${color}33`,
      borderRadius: 10,
      padding: "8px 14px",
      textAlign: "center",
      minWidth: 76,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── DRIVERS PANEL ──
function DriversPanel({
  drivers, driverLocs, orders, expanded, onToggle, tick,
}: {
  drivers: OnlineDriver[];
  driverLocs: Record<string, { lat: number; lng: number; updatedAt: any }>;
  orders: ExtOrder[];
  expanded: boolean;
  onToggle: () => void;
  tick: number;
}) {
  const freeDrivers = drivers.filter((d) => d.status !== "busy");
  const busyDrivers = drivers.filter((d) => d.status === "busy");

  return (
    <div style={{
      marginBottom: 20,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <div
        onClick={onToggle}
        style={{
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Livreurs en ligne</span>
          <Badge label={`${drivers.length} en ligne`} color={C.green} />
          <Badge label={`${freeDrivers.length} libres`} color={C.green} />
          <Badge label={`${busyDrivers.length} en livraison`} color={C.blue} />
        </div>
        <span style={{ color: C.muted, fontSize: 12 }}>{expanded ? "A" : "V"}</span>
      </div>

      {expanded && (
        <div style={{
          display: "flex", gap: 10, overflowX: "auto",
          padding: "0 16px 14px", scrollbarWidth: "thin",
        }}>
          {drivers.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, padding: "8px 0" }}>
              Aucun livreur en ligne
            </div>
          )}
          {[...drivers]
            .sort((a, b) => (a.status === "busy" ? 1 : -1) - (b.status === "busy" ? 1 : -1))
            .map((d) => {
              const loc = driverLocs[d.uid];
              const ping = loc ? minsAgo(loc.updatedAt) : null;
              const isBusy = d.status === "busy";
              const currentOrder = isBusy && (d as any).currentOrderId
                ? orders.find((o) => o.id === (d as any).currentOrderId)
                : null;
              return (
                <div
                  key={d.uid}
                  style={{
                    flexShrink: 0,
                    background: isBusy ? "rgba(59,130,246,0.08)" : "rgba(34,197,94,0.08)",
                    border: `1px solid ${isBusy ? "rgba(59,130,246,0.25)" : "rgba(34,197,94,0.25)"}`,
                    borderRadius: 10, padding: "10px 14px", minWidth: 160,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: isBusy ? C.blue : C.green,
                      boxShadow: `0 0 6px ${isBusy ? C.blue : C.green}`,
                    }} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{d.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: isBusy ? C.blue : C.green, marginBottom: 3 }}>
                    {isBusy ? "En livraison" : "Libre"}
                  </div>
                  {d.zone && <div style={{ fontSize: 10, color: C.muted }}>Zone: {d.zone}</div>}
                  {ping !== null && (
                    <div style={{ fontSize: 10, color: ping < 5 ? C.green : ping < 15 ? C.yellow : C.red, marginTop: 2 }}>
                      GPS: {fmtMins(ping)}
                    </div>
                  )}
                  {currentOrder && (
                    <div style={{ marginTop: 6, fontSize: 10, color: C.muted, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 5 }}>
                      Course: #{(currentOrder as any).orderNumber ?? currentOrder.id?.slice(-6).toUpperCase()}
                    </div>
                  )}
                  {d.acceptanceRate !== undefined && (
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      Taux: {(d.acceptanceRate * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
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
  onQuickAssign, freeDrivers,
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
  onQuickAssign?: (order: ExtOrder, driver: OnlineDriver) => void;
  freeDrivers?: OnlineDriver[];
}) {
  const [quickAssignId, setQuickAssignId] = useState<string | null>(null);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span style={{
          fontSize: 12, color, background: `${color}22`,
          padding: "1px 8px", borderRadius: 99, fontWeight: 700,
        }}>{count}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 100 }}>
        {orders.map((o) => {
          const st = statusBadge(o.status);
          const assignedDriver = o.assignedDriverId ? drivers.find((d) => d.uid === o.assignedDriverId) : null;
          const elapsedMins = elapsedMinutes(o.createdAt);
          const timeColor = elapsedColor(elapsedMins);
          const isSelected = o.id === selectedId;
          const isQuickOpen = quickAssignId === o.id;
          const isUrgent = elapsedMins > 30 || (o as any).isRush;

          return (
            <div
              key={o.id}
              onClick={() => onSelect(o)}
              style={{
                background: isSelected
                  ? "rgba(249,115,22,0.1)"
                  : isUrgent
                    ? "rgba(239,68,68,0.05)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${isSelected
                  ? "rgba(249,115,22,0.4)"
                  : isUrgent
                    ? "rgba(239,68,68,0.3)"
                    : "rgba(255,255,255,0.08)"}`,
                borderRadius: 12,
                padding: "12px 14px",
                cursor: "pointer",
                transition: "all 0.15s",
                position: "relative",
              }}
            >
              {/* Urgency strip */}
              {isUrgent && !isSelected && (
                <div style={{
                  position: "absolute", top: 0, left: 0, bottom: 0, width: 3,
                  background: C.red, borderRadius: "12px 0 0 12px",
                }} />
              )}

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>
                    #{(o as any).orderNumber ?? o.id?.slice(-6).toUpperCase()}
                  </span>
                  {(o as any).isRush && (
                    <span style={{ fontSize: 9, background: "rgba(239,68,68,0.18)", color: C.red, padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>
                      URGENT
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: timeColor, fontWeight: 600 }}>{fmtDuration(o.createdAt)}</span>
              </div>

              {/* Client */}
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 2 }}>
                {o.name || o.phone || "Client"}
              </div>
              {o.address && (
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.address}
                </div>
              )}
              {o.commerceName && (
                <div style={{ fontSize: 11, color: C.muted }}>Commerce: {o.commerceName}</div>
              )}

              {/* Amount + status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: C.accent }}>{Number(o.total).toFixed(2)} EUR</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
              </div>

              {/* Assigned driver */}
              {assignedDriver && (
                <div style={{
                  marginTop: 8, padding: "6px 10px",
                  background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
                  borderRadius: 8, display: "flex", alignItems: "center", gap: 6,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blue }} />
                  <span style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>Livreur: {assignedDriver.name}</span>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onUpdateStatus(o.id!, nextStatus)}
                  style={{
                    flex: 1, padding: "6px 8px", borderRadius: 7,
                    border: "none", background: `${color}22`, color,
                    fontWeight: 700, fontSize: 11, cursor: "pointer",
                  }}
                >
                  {nextLabel}
                </button>

                {showAssign && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickAssignId(isQuickOpen ? null : o.id!);
                      }}
                      title="Choisir un livreur"
                      style={{
                        padding: "6px 10px", borderRadius: 7,
                        border: `1px solid ${isQuickOpen ? "rgba(249,115,22,0.4)" : "rgba(59,130,246,0.2)"}`,
                        background: isQuickOpen ? "rgba(249,115,22,0.15)" : "rgba(59,130,246,0.12)",
                        color: isQuickOpen ? C.accent : C.blue,
                        fontWeight: 700, fontSize: 11, cursor: "pointer",
                      }}
                    >
                      Assigner
                    </button>
                    <button
                      onClick={() => onAutoAssign?.(o)}
                      title="Auto-assigner le meilleur livreur"
                      style={{
                        padding: "6px 10px", borderRadius: 7,
                        border: "none", background: "rgba(34,197,94,0.12)", color: C.green,
                        fontWeight: 700, fontSize: 11, cursor: "pointer",
                      }}
                    >
                      Auto
                    </button>
                  </>
                )}

                {onRefusal && o.assignedDriverId && (
                  <button
                    onClick={() => onRefusal(o)}
                    title="Livreur a refuse - remettre en Ready"
                    style={{
                      padding: "6px 10px", borderRadius: 7,
                      border: "none", background: "rgba(239,68,68,0.12)", color: C.red,
                      fontWeight: 700, fontSize: 11, cursor: "pointer",
                    }}
                  >
                    Refus
                  </button>
                )}
              </div>

              {/* Quick-assign dropdown */}
              {isQuickOpen && showAssign && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 10, background: "#1a1a2e",
                    border: "1px solid rgba(249,115,22,0.2)", borderRadius: 10, overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "7px 12px", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    Assigner a :
                  </div>
                  {(!freeDrivers || freeDrivers.length === 0) && (
                    <div style={{ padding: "10px 12px", fontSize: 12, color: C.muted }}>Aucun livreur libre</div>
                  )}
                  {freeDrivers?.map((d) => (
                    <button
                      key={d.uid}
                      onClick={() => {
                        onQuickAssign?.(o, d);
                        setQuickAssignId(null);
                      }}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        width: "100%", padding: "9px 12px",
                        background: "transparent", border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        color: C.text, cursor: "pointer", textAlign: "left",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(249,115,22,0.1)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{d.name}</div>
                        {d.zone && <div style={{ fontSize: 10, color: C.muted }}>Zone: {d.zone}</div>}
                      </div>
                      {d.acceptanceRate !== undefined && (
                        <div style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>
                          {(d.acceptanceRate * 100).toFixed(0)}%
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {orders.length === 0 && (
          <div style={{
            padding: "32px 16px", textAlign: "center",
            color: C.muted, fontSize: 13,
            background: "rgba(255,255,255,0.015)",
            borderRadius: 12, border: "1px dashed rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>OK</div>
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
  onClose, onUpdateStatus, onAssign, onAutoAssign, onRefusal, onNav, onToggleAssign,
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
}) {
  const [notes, setNotes] = useState((order as any).internalNotes ?? "");
  const assignedDriver = order.assignedDriverId ? drivers.find((d) => d.uid === order.assignedDriverId) : null;
  const onlineDrivers  = drivers.filter((d) => d.isOnline && d.status !== "offline");
  const freeDrivers    = onlineDrivers.filter((d) => d.status !== "busy");

  const saveNotes = async () => {
    await updateDoc(doc(db, "orders", order.id!), { internalNotes: notes });
  };

  const STATUS_FLOW = ["nouveau", "paid", "confirmed", "preparing", "ready", "assigned", "en_cours", "livre"];
  const currentIdx  = STATUS_FLOW.indexOf(order.status);

  return (
    <div style={{
      background: "#0f1423",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14, padding: 20,
      position: "sticky", top: 20,
      maxHeight: "calc(100vh - 80px)", overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            Commande #{(order as any).orderNumber ?? order.id?.slice(-6).toUpperCase()}
          </h3>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {fmtDuration(order.createdAt)} · {statusBadge(order.status).label}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "rgba(255,255,255,0.06)", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, borderRadius: 7, padding: "5px 9px" }}
        >
          X
        </button>
      </div>

      {/* Status progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 3 }}>
          {STATUS_FLOW.map((s, i) => {
            const isCurrent = i === currentIdx;
            const isPast    = i < currentIdx;
            return (
              <button
                key={s}
                onClick={() => onUpdateStatus(s)}
                title={statusBadge(s).label}
                style={{
                  flex: 1, height: 6, borderRadius: 3, border: "none", cursor: "pointer",
                  background: isCurrent ? C.accent : isPast ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.08)",
                  transition: "all 0.2s",
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 9, color: C.muted }}>Nouveau</span>
          <span style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>{statusBadge(order.status).label}</span>
          <span style={{ fontSize: 9, color: C.muted }}>Livre</span>
        </div>
      </div>

      {/* Status buttons */}
      <Section title="Changer le statut">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STATUS_FLOW.map((s) => {
            const st = statusBadge(s);
            return (
              <button
                key={s}
                onClick={() => onUpdateStatus(s)}
                style={{
                  padding: "5px 10px", borderRadius: 7,
                  border: order.status === s ? "none" : "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer", fontSize: 11,
                  background: order.status === s ? C.accent : "rgba(255,255,255,0.04)",
                  color: order.status === s ? "#fff" : C.muted,
                  fontWeight: order.status === s ? 700 : 400,
                }}
              >
                {st.label}
              </button>
            );
          })}
        </div>
        {order.status === "en_cours" && order.assignedDriverId && (
          <button
            onClick={onRefusal}
            style={{
              marginTop: 10, width: "100%", padding: "7px", borderRadius: 8, border: "none",
              background: "rgba(239,68,68,0.12)", color: C.red,
              fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}
          >
            Livreur a refuse - remettre en Ready
          </button>
        )}
      </Section>

      {/* Client */}
      <Section title="Client">
        <InfoRow label="Nom" value={order.name || "—"} />
        <InfoRow label="Tel" value={
          order.phone
            ? <a href={`tel:${order.phone}`} style={{ color: C.blue, textDecoration: "none" }}>{order.phone}</a>
            : "—"
        } />
        <InfoRow label="Adresse" value={
          <span style={{ fontSize: 11, textAlign: "right" }}>{order.address || "—"}</span>
        } />
        {order.address && (
          <button
            onClick={() => onNav(order.address!)}
            style={{
              marginTop: 8, width: "100%", padding: "8px", borderRadius: 8, border: "none",
              background: "rgba(59,130,246,0.12)", color: C.blue,
              fontWeight: 700, fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            Ouvrir navigation
          </button>
        )}
      </Section>

      {/* Order info */}
      <Section title="Commande">
        <InfoRow label="Montant" value={<span style={{ color: C.accent, fontWeight: 800, fontSize: 15 }}>{Number(order.total).toFixed(2)} EUR</span>} />
        <InfoRow label="Paiement" value={order.paidOnline ? "En ligne" : "Especes"} />
        <InfoRow label="Duree" value={fmtDuration(order.createdAt)} />
        {order.commerceName && <InfoRow label="Commerce" value={order.commerceName} />}
        {(order as any).isRush && (
          <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(239,68,68,0.1)", borderRadius: 7, color: C.red, fontWeight: 700, fontSize: 12 }}>
            COMMANDE URGENTE
          </div>
        )}
      </Section>

      {/* Driver */}
      <Section title="Livreur">
        {assignedDriver ? (
          <div style={{
            background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 10, padding: "10px 12px", marginBottom: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: C.green }}>{assignedDriver.name}</span>
            </div>
            {assignedDriver.phone && (
              <a href={`tel:${assignedDriver.phone}`} style={{ display: "block", color: C.blue, fontSize: 12, marginBottom: 4, textDecoration: "none" }}>
                Tel: {assignedDriver.phone}
              </a>
            )}
            {driverLocs[assignedDriver.uid] && (
              <a
                href={`https://www.google.com/maps?q=${driverLocs[assignedDriver.uid].lat},${driverLocs[assignedDriver.uid].lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block", color: C.blue, fontSize: 12, textDecoration: "none" }}
              >
                Voir position GPS (il y a {fmtMins(minsAgo(driverLocs[assignedDriver.uid].updatedAt))})
              </a>
            )}
          </div>
        ) : (
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 10, padding: "8px 0" }}>
            Aucun livreur assigne
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            onClick={onToggleAssign}
            style={{
              flex: 1, padding: "9px", borderRadius: 8, border: "none",
              background: "rgba(249,115,22,0.15)", color: C.accent,
              fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}
          >
            {assignedDriver ? "Reassigner un livreur" : "Assigner un livreur"}
          </button>
          <button
            onClick={onAutoAssign}
            title="Auto-assigner le meilleur livreur disponible"
            style={{
              padding: "9px 14px", borderRadius: 8, border: "none",
              background: "rgba(34,197,94,0.12)", color: C.green,
              fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}
          >
            Auto
          </button>
        </div>

        {assignOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 2 }}>
              {freeDrivers.length > 0
                ? `${freeDrivers.length} livreur${freeDrivers.length > 1 ? "s" : ""} disponible${freeDrivers.length > 1 ? "s" : ""}`
                : "Aucun livreur libre"}
            </div>
            {onlineDrivers
              .sort((a, b) => (b.acceptanceRate ?? 0.8) - (a.acceptanceRate ?? 0.8))
              .map((d) => {
                const loc = driverLocs[d.uid];
                const isBusy = d.status === "busy";
                return (
                  <button
                    key={d.uid}
                    onClick={() => onAssign(d)}
                    disabled={isBusy}
                    style={{
                      padding: "10px 12px", borderRadius: 9,
                      border: `1px solid ${isBusy ? "rgba(255,255,255,0.05)" : "rgba(34,197,94,0.2)"}`,
                      background: isBusy ? "rgba(255,255,255,0.01)" : "rgba(34,197,94,0.05)",
                      color: isBusy ? "#475569" : C.text,
                      cursor: isBusy ? "not-allowed" : "pointer",
                      textAlign: "left",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      opacity: isBusy ? 0.5 : 1,
                      transition: "all 0.15s",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: isBusy ? C.red : C.green,
                          display: "inline-block",
                        }} />
                        {d.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        {isBusy ? "En livraison" : "Libre"}{d.zone && ` · ${d.zone}`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {d.acceptanceRate !== undefined && (
                        <div style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>
                          {(d.acceptanceRate * 100).toFixed(0)}%
                        </div>
                      )}
                      {loc && <div style={{ fontSize: 10, color: C.muted }}>GPS: {fmtMins(minsAgo(loc.updatedAt))}</div>}
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
          placeholder="Notes internes (auto-sauvegarde)..."
          style={{
            width: "100%", minHeight: 80, padding: "8px 10px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
            color: C.text, fontSize: 12, resize: "vertical", outline: "none",
            boxSizing: "border-box", fontFamily: "inherit",
          }}
        />
      </Section>
    </div>
  );
}

// ── HELPERS ──
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, background: `${color}18`, color,
      padding: "1px 8px", borderRadius: 99, fontWeight: 600,
    }}>
      {label}
    </span>
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
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.text, fontWeight: 500, textAlign: "right", maxWidth: "65%" }}>{value}</span>
    </div>
  );
}
