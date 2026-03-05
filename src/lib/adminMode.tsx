"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type AdminMode = "day" | "night" | "all";

const STORAGE_KEY = "yassala_admin_mode";

const ModeContext = createContext<{
  mode: AdminMode;
  setMode: (m: AdminMode) => void;
}>({ mode: "all", setMode: () => {} });

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AdminMode>("all");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AdminMode | null;
    if (stored === "day" || stored === "night" || stored === "all") {
      setModeState(stored);
    }
  }, []);

  const setMode = (m: AdminMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useAdminMode() {
  return useContext(ModeContext);
}

/**
 * Returns true if an item with the given mode should be shown
 * for the current admin mode.
 * - "all" admin mode: show everything
 * - "day" admin mode: show items with mode "day" or "both"
 * - "night" admin mode: show items with mode "night" or "both"
 */
export function matchesMode(itemMode: string | undefined | null, adminMode: AdminMode): boolean {
  if (adminMode === "all") return true;
  if (!itemMode || itemMode === "both") return true;
  return itemMode === adminMode;
}

export const MODE_CONFIG = {
  day:   { label: "Jour",  icon: "☀️", color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)"  },
  night: { label: "Nuit",  icon: "🌙", color: "#818cf8", bg: "rgba(129,140,248,0.12)", border: "rgba(129,140,248,0.3)" },
  all:   { label: "Tout",  icon: "⚡", color: "#22c55e", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)"   },
} as const;
