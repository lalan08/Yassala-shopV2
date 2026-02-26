"use client";

/**
 * useAdminAlerts — Système d'alertes opérationnelles admin
 *
 * Règles surveillées (évaluées toutes les 60 s) :
 *   1. driver_shortage  — pendingOrders > activeDrivers × 2
 *   2. demand_spike     — commandesLast15Min > moyenneLast7d × 1.5 (min 2 cmd)
 *   3. payment_failed   — paiement Stripe échoué (paymentFailed = true ou annulé online)
 *   4. cash_pending     — livraison cash non reversée depuis +24 h
 *
 * Stockage : collection Firestore `admin_alerts/{id}`
 * Dédup    : cooldown 30 min par type d'alerte
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── types ─────────────────────────────────────────────────────────────────────

export type AlertType =
  | "driver_shortage"
  | "demand_spike"
  | "payment_failed"
  | "cash_pending";

export type AlertSeverity = "critical" | "warning" | "info";

export type AdminAlert = {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  count?: number;
};

// Minimal shapes needed from the parent component
type OrderInput = {
  id?: string;
  status: string;
  createdAt: string;
  paidOnline?: boolean;
  paymentFailed?: boolean;
};

type DriverInput = {
  uid: string;
  isOnline: boolean;
};

interface UseAdminAlertsProps {
  orders: OrderInput[];
  onlineDrivers: DriverInput[];
}

// ── constants ─────────────────────────────────────────────────────────────────

const COOLDOWN_MS            = 30 * 60 * 1000; // 30 min entre deux alertes du même type
const FIFTEEN_MIN_MS         = 15 * 60 * 1000;
const SEVEN_DAYS_MS          = 7  * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_15MIN_SLOTS = 7  * 24 * 4; // 672 créneaux

// ── hook ──────────────────────────────────────────────────────────────────────

export function useAdminAlerts({ orders, onlineDrivers }: UseAdminAlertsProps) {
  const [alerts, setAlerts]             = useState<AdminAlert[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("yassala_alert_sound") === "1";
  });

  const setSoundEnabled = useCallback((v: boolean) => {
    setSoundEnabledState(v);
    try { localStorage.setItem("yassala_alert_sound", v ? "1" : "0"); } catch {}
  }, []);

  // Refs for latest data (avoids stale closure in setInterval)
  const ordersRef       = useRef(orders);
  const driversRef      = useRef(onlineDrivers);
  const soundRef        = useRef(soundEnabled);
  const lastAlertRef    = useRef<Record<AlertType, number>>({
    driver_shortage: 0,
    demand_spike:    0,
    payment_failed:  0,
    cash_pending:    0,
  });

  useEffect(() => { ordersRef.current  = orders;       }, [orders]);
  useEffect(() => { driversRef.current = onlineDrivers; }, [onlineDrivers]);
  useEffect(() => { soundRef.current   = soundEnabled;  }, [soundEnabled]);

  // ── sound ───────────────────────────────────────────────────────────────────
  const playAlertSound = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const ctx  = new AudioContext();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(560, ctx.currentTime + 0.10);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.20);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime  + 0.45);
    } catch {}
  }, []);

  // ── Firestore subscription ───────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "admin_alerts"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, snap => {
      setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminAlert)));
    }, () => {}); // ignore permission errors when not logged in
    return () => unsub();
  }, []);

  // ── write alert (with cooldown dedup) ─────────────────────────────────────
  const writeAlert = useCallback(
    async (
      type: AlertType,
      severity: AlertSeverity,
      message: string,
      count?: number,
    ) => {
      const now = Date.now();
      if (now - lastAlertRef.current[type] < COOLDOWN_MS) return;
      lastAlertRef.current[type] = now;

      await addDoc(collection(db, "admin_alerts"), {
        type,
        severity,
        message,
        count:     count ?? null,
        createdAt: new Date().toISOString(),
        resolved:  false,
        resolvedAt: null,
      }).catch(() => {});

      playAlertSound();
    },
    [playAlertSound],
  );

  // ── resolve alert ──────────────────────────────────────────────────────────
  const resolveAlert = useCallback(async (id: string) => {
    await updateDoc(doc(db, "admin_alerts", id), {
      resolved:   true,
      resolvedAt: new Date().toISOString(),
    }).catch(() => {});
    // Reset cooldown so alert can re-trigger after resolution
    const alert = alerts.find(a => a.id === id);
    if (alert) lastAlertRef.current[alert.type] = 0;
  }, [alerts]);

  // ── evaluate rules (uses refs → stable function, safe in setInterval) ─────
  const evaluate = useCallback(() => {
    const orders      = ordersRef.current;
    const drivers     = driversRef.current;
    const now         = Date.now();

    // ── 1. Manque livreurs ──────────────────────────────────────────────────
    const activeStatuses  = new Set(["nouveau", "en_cours", "assigned"]);
    const pendingCount    = orders.filter(o => activeStatuses.has(o.status)).length;
    const activeDriverCnt = drivers.filter(d => d.isOnline).length;

    if (pendingCount > activeDriverCnt * 2) {
      writeAlert(
        "driver_shortage",
        "critical",
        `Manque de livreurs — ${pendingCount} commande${pendingCount > 1 ? "s" : ""} actives pour ${activeDriverCnt} livreur${activeDriverCnt !== 1 ? "s" : ""}`,
        pendingCount,
      );
    }

    // ── 2. Pic commandes ────────────────────────────────────────────────────
    const cutoff15   = new Date(now - FIFTEEN_MIN_MS).toISOString();
    const cutoff7d   = new Date(now - SEVEN_DAYS_MS).toISOString();
    const last15min  = orders.filter(o => o.createdAt >= cutoff15).length;
    const last7dCnt  = orders.filter(o => o.createdAt >= cutoff7d).length;
    const avg15      = last7dCnt / SEVEN_DAYS_15MIN_SLOTS;

    if (last15min >= 2 && last15min > avg15 * 1.5) {
      writeAlert(
        "demand_spike",
        "warning",
        `Pic de demande — ${last15min} commandes en 15 min (moyenne : ${avg15.toFixed(2)}/15 min)`,
        last15min,
      );
    }

    // ── 3. Paiement Stripe échoué ───────────────────────────────────────────
    const failedPayments = orders.filter(
      o => (o as any).paymentFailed === true
        || (o.paidOnline === true && o.status === "annule"),
    );
    if (failedPayments.length > 0) {
      writeAlert(
        "payment_failed",
        "critical",
        `Erreur paiement — ${failedPayments.length} commande${failedPayments.length > 1 ? "s" : ""} avec paiement échoué`,
        failedPayments.length,
      );
    }

    // ── 4. Cash non reversé > 24 h ──────────────────────────────────────────
    const cutoff24h   = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const cashPending = orders.filter(
      o => o.paidOnline !== true
        && o.status === "livre"
        && o.createdAt < cutoff24h,
    );
    if (cashPending.length > 0) {
      writeAlert(
        "cash_pending",
        "warning",
        `Cash en attente — ${cashPending.length} livraison${cashPending.length > 1 ? "s" : ""} cash non reversée${cashPending.length > 1 ? "s" : ""} depuis +24 h`,
        cashPending.length,
      );
    }
  }, [writeAlert]); // writeAlert is stable → evaluate is stable

  // ── run on mount + every 60 s ──────────────────────────────────────────────
  useEffect(() => {
    evaluate();
    const id = setInterval(evaluate, 60_000);
    return () => clearInterval(id);
  }, [evaluate]);

  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  return {
    alerts,
    unresolvedCount,
    resolveAlert,
    soundEnabled,
    setSoundEnabled,
    playAlertSound,
  };
}
