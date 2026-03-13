/**
 * useServiceMode — Gestion des horaires de service Yassala
 *
 * Timezone : America/Cayenne (UTC-3, pas de DST)
 *
 * Horaires :
 *   DAY   = 07:00 → 20:00  (commandes autorisées)
 *   NIGHT = 21:00 → 24:00  (commandes autorisées)
 *   Pause = 20:00 → 21:00  (catalogue lecture seule)
 *   Fermé = 00:00 → 07:00  (catalogue lecture seule)
 */

import { useEffect, useState } from 'react';

// ── Constantes (en minutes depuis minuit) ──────────────────────────────────
const DAY_START   = 7  * 60; //  07:00
const DAY_END     = 20 * 60; //  20:00
const NIGHT_START = 21 * 60; //  21:00
const NIGHT_END   = 24 * 60; //  24:00  (= 0 du lendemain)

// ── Utilitaires ──────────────────────────────────────────────────────────────

/** Retourne les minutes écoulées depuis minuit en heure de Cayenne (UTC-3, sans DST). */
function getCayenneMinsOfDay(): number {
  const now = new Date();
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return ((utcMins - 180) % 1440 + 1440) % 1440; // UTC-3 = -180 min
}

/** Retourne les secondes écoulées depuis minuit en heure de Cayenne. */
function getCayenneSecs(): number {
  const now = new Date();
  const utcSecs = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  return ((utcSecs - 3 * 3600) % 86400 + 86400) % 86400;
}

function formatCountdown(secsRemaining: number): string {
  if (secsRemaining <= 0) return 'maintenant';
  const h = Math.floor(secsRemaining / 3600);
  const m = Math.floor((secsRemaining % 3600) / 60);
  const s = secsRemaining % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Secondes restantes jusqu'à un objectif en minutes (ex: 21*60) dans la même journée ou le lendemain. */
function secsUntilTarget(nowSecs: number, targetMins: number): number {
  const targetSecs = targetMins * 60;
  if (targetSecs > nowSecs) return targetSecs - nowSecs;
  // L'objectif est le lendemain
  return 86400 - nowSecs + targetSecs;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ServiceStatusEntry = {
  isOpen: boolean;
  opensAt: string;       // ex: "07:00"
  closesAt: string;      // ex: "20:00"
  countdown: string;     // ex: "Ouvre dans 1h 12m" ou "Ferme dans 45m"
  secsToChange: number;  // secondes jusqu'au prochain changement d'état
};

export type ServiceMode = {
  /** Service actuellement ouvert pour les commandes, ou null si aucun. */
  activeService: 'day' | 'night' | null;
  canOrderDay:   boolean;
  canOrderNight: boolean;
  /** Pause entre DAY et NIGHT (20:00–21:00). */
  isPause:  boolean;
  /** Fermeture totale (00:00–07:00). */
  isClosed: boolean;
  day:   ServiceStatusEntry;
  night: ServiceStatusEntry;
  /** Heure Cayenne actuelle pour affichage. */
  cayenneTime: string;
};

// ── Hook principal ────────────────────────────────────────────────────────────

/**
 * @param adminOverride  La valeur `themeOverride` depuis Firestore ('day' | 'night' | 'auto' | null).
 *                       Si 'day', force DAY ouvert. Si 'night', force NIGHT ouvert.
 */
export function useServiceMode(
  adminOverride: 'day' | 'night' | 'auto' | null = null
): ServiceMode {
  const [, tick] = useState(0);

  // Refresh toutes les secondes pour mettre à jour le compte à rebours
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return computeServiceMode(adminOverride);
}

/** Calcul pur (utilisable côté serveur ou dans des tests). */
export function computeServiceMode(
  adminOverride: 'day' | 'night' | 'auto' | null = null
): ServiceMode {
  const secsOfDay = getCayenneSecs();
  const minsOfDay = Math.floor(secsOfDay / 60);

  // ── Détermination naturelle (basée sur l'heure) ────────────────────────────
  const isDayNaturally   = minsOfDay >= DAY_START   && minsOfDay < DAY_END;
  const isNightNaturally = minsOfDay >= NIGHT_START; // 21:00 → 23:59
  const isPause          = minsOfDay >= DAY_END      && minsOfDay < NIGHT_START;
  const isClosed         = minsOfDay < DAY_START;    // 00:00 → 06:59

  // ── Application de l'override admin ───────────────────────────────────────
  const forceDay   = adminOverride === 'day';
  const forceNight = adminOverride === 'night';

  const canOrderDay   = forceDay   ? true : forceNight ? false : isDayNaturally;
  const canOrderNight = forceNight ? true : forceDay   ? false : isNightNaturally;

  const activeService: 'day' | 'night' | null = canOrderDay
    ? 'day'
    : canOrderNight
    ? 'night'
    : null;

  // ── Comptes à rebours ─────────────────────────────────────────────────────
  let daySecsToChange: number;
  let nightSecsToChange: number;
  let dayCd: string;
  let nightCd: string;

  if (canOrderDay) {
    // DAY est ouvert → compte à rebours jusqu'à la fermeture (20:00)
    daySecsToChange = secsUntilTarget(secsOfDay, DAY_END);
    dayCd = `Ferme dans ${formatCountdown(daySecsToChange)}`;
  } else {
    // DAY fermé → compte à rebours jusqu'à l'ouverture (07:00)
    daySecsToChange = secsUntilTarget(secsOfDay, DAY_START);
    dayCd = `Ouvre dans ${formatCountdown(daySecsToChange)}`;
  }

  if (canOrderNight) {
    // NIGHT est ouvert → compte à rebours jusqu'à la fermeture (00:00)
    nightSecsToChange = secsUntilTarget(secsOfDay, NIGHT_END % 1440); // cible = 0 = minuit
    // Si on est après minuit mais avant 07h, secsUntilTarget(secs, 0) ne marche pas bien
    // → NIGHT_END = minuit = 0 min. Secs restantes = 86400 - secsOfDay
    nightSecsToChange = 86400 - secsOfDay; // jusqu'à minuit
    nightCd = `Ferme dans ${formatCountdown(nightSecsToChange)}`;
  } else {
    // NIGHT fermé → compte à rebours jusqu'à 21:00
    nightSecsToChange = secsUntilTarget(secsOfDay, NIGHT_START);
    nightCd = `Ouvre dans ${formatCountdown(nightSecsToChange)}`;
  }

  // ── Heure Cayenne lisible ─────────────────────────────────────────────────
  const cayenneH = Math.floor(minsOfDay / 60);
  const cayenneM = minsOfDay % 60;
  const cayenneTime = `${String(cayenneH).padStart(2, '0')}:${String(cayenneM).padStart(2, '0')}`;

  return {
    activeService,
    canOrderDay,
    canOrderNight,
    isPause,
    isClosed,
    day: {
      isOpen:        canOrderDay,
      opensAt:       '07:00',
      closesAt:      '20:00',
      countdown:     dayCd,
      secsToChange:  daySecsToChange,
    },
    night: {
      isOpen:        canOrderNight,
      opensAt:       '21:00',
      closesAt:      '00:00',
      countdown:     nightCd,
      secsToChange:  nightSecsToChange,
    },
    cayenneTime,
  };
}
