'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useServiceMode, type ServiceMode } from '@/hooks/useServiceMode';

export type ThemeMode = 'day' | 'night' | 'auto';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'day' | 'night';
  setTheme: (mode: ThemeMode) => void;
  serviceMode: ServiceMode;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getAutoTheme(): 'day' | 'night' {
  // Utilise l'heure Cayenne (UTC-3) pour la résolution automatique
  const utcH = new Date().getUTCHours();
  const cayenneH = ((utcH - 3) % 24 + 24) % 24;
  return cayenneH >= 7 && cayenneH < 21 ? 'day' : 'night';
}

function resolveTheme(mode: ThemeMode): 'day' | 'night' {
  if (mode === 'auto') return getAutoTheme();
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Thème local (choix du client, persisté en localStorage)
  const [localTheme, setLocalTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem('yassala_theme') as ThemeMode) || 'auto';
  });

  // Override admin depuis Firestore (settings/main.themeOverride)
  const [adminOverride, setAdminOverride] = useState<ThemeMode | null>(null);

  // Écoute Firestore — même logique que l'ancienne Home
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'main'), (snap) => {
      if (snap.exists()) {
        const override = snap.data().themeOverride as ThemeMode | undefined;
        setAdminOverride(override ?? null);
      } else {
        setAdminOverride(null);
      }
    });
    return () => unsub();
  }, []);

  // Refresh toutes les minutes pour le mode auto (thème visuel)
  useEffect(() => {
    const id = setInterval(() => {
      setLocalTheme(prev => prev); // force re-render pour recalculer auto
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setLocalTheme(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('yassala_theme', mode);
    }
  };

  // L'admin a la priorité sur le choix du client (pour le thème visuel)
  const effectiveTheme: ThemeMode = adminOverride ?? localTheme;
  const resolvedTheme = resolveTheme(effectiveTheme);

  // Mode de service : basé sur l'heure Cayenne + override admin
  const serviceMode = useServiceMode(adminOverride);

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, resolvedTheme, setTheme, serviceMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
