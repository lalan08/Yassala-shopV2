'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'day' | 'night' | 'auto';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'day' | 'night';
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
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
  const [theme, setThemeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    const saved = localStorage.getItem('yassala_theme') as ThemeMode | null;
    if (saved && ['day', 'night', 'auto'].includes(saved)) {
      setThemeState(saved);
    }
    // Auto-refresh every minute for auto mode
    const id = setInterval(() => {
      setThemeState(prev => prev); // trigger re-render for auto
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem('yassala_theme', mode);
  };

  const toggleTheme = () => {
    const resolved = resolveTheme(theme);
    setTheme(resolved === 'day' ? 'night' : 'day');
  };

  const resolvedTheme = resolveTheme(theme);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
