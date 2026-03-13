'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export type ThemeMode = 'day' | 'night' | 'auto';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'day' | 'night';
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getAutoTheme(): 'day' | 'night' {
  const h = new Date().getHours();
  return h >= 7 && h < 21 ? 'day' : 'night';
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

  // Refresh toutes les minutes pour le mode auto
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

  // L'admin a la priorité sur le choix du client
  const effectiveTheme: ThemeMode = adminOverride ?? localTheme;
  const resolvedTheme = resolveTheme(effectiveTheme);

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
