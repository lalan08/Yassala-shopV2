"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { sha256, ADMIN_PASSWORD, AUTH_KEY, getStoredAuth, setStoredAuth } from "@/lib/adminAuth";
import { ModeProvider, useAdminMode, type AdminMode, MODE_CONFIG } from "@/lib/adminMode";

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

const C = {
  bg:        "#0a0a14",
  sidebar:   "rgba(8,8,18,0.97)",
  border:    "rgba(255,255,255,0.08)",
  text:      "#f1f5f9",
  muted:     "#64748b",
  accent:    "#f97316",
  accentDim: "rgba(249,115,22,0.15)",
  active:    "rgba(249,115,22,0.18)",
  hover:     "rgba(255,255,255,0.05)",
};

type NavItem  = { label: string; href: string; icon: string; badge?: number };
type NavGroup = { label: string; icon: string; items: NavItem[] };

// Operations: always visible, no mode filter
const NAV_OPERATIONS: NavGroup = {
  label: "Operations",
  icon: "⚡",
  items: [
    { label: "Commandes",             href: "/admin/operations/commandes",    icon: "📦" },
    { label: "Dispatch",              href: "/admin/operations/dispatch",     icon: "🏍️" },
    { label: "Livreurs",              href: "/admin/operations/livreurs",     icon: "👤" },
    { label: "Clients",               href: "/admin/operations/clients",      icon: "👥" },
    { label: "Candidatures livreurs", href: "/admin/operations/candidatures", icon: "📋" },
  ],
};

// Content: filtered by global mode
const NAV_CONTENT: NavGroup[] = [
  {
    label: "Commerces",
    icon: "🏪",
    items: [
      { label: "Etablissements", href: "/admin/commerces", icon: "🏬" },
    ],
  },
  {
    label: "Catalogue",
    icon: "🛒",
    items: [
      { label: "Produits",    href: "/admin/catalogue/produits",    icon: "🍽️" },
      { label: "Categories",  href: "/admin/catalogue/categories",  icon: "🏷️" },
      { label: "Packs",       href: "/admin/catalogue/packs",       icon: "🎁" },
    ],
  },
  {
    label: "Marketing",
    icon: "📣",
    items: [
      { label: "Promotions", href: "/admin/marketing/promotions", icon: "🎯" },
      { label: "Coupons",    href: "/admin/marketing/coupons",    icon: "🎟️" },
      { label: "Bannieres",  href: "/admin/marketing/bannieres",  icon: "🖼️" },
    ],
  },
  {
    label: "Finance",
    icon: "💶",
    items: [
      { label: "Paiements", href: "/admin/finance/paiements", icon: "💳" },
      { label: "Rapports",  href: "/admin/finance/rapports",  icon: "📊" },
    ],
  },
  {
    label: "Parametres",
    icon: "⚙️",
    items: [
      { label: "Configuration", href: "/admin/parametres", icon: "🔧" },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModeProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </ModeProvider>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode, setMode } = useAdminMode();
  const [auth, setAuth]           = useState(false);
  const [pwd, setPwd]             = useState("");
  const [pwdError, setPwdError]   = useState(false);
  const [adminHash, setAdminHash] = useState<string | null>(null);
  const [sideOpen, setSideOpen]   = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const modeConf = MODE_CONFIG[mode];
  const sidebarBg = mode === "day"
    ? "rgba(251,191,36,0.04)"
    : mode === "night"
      ? "rgba(129,140,248,0.05)"
      : "transparent";

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "adminAuth"), async (snap) => {
      const h = snap.exists() ? (snap.data().hash ?? null) : null;
      setAdminHash(h);
      const stored = getStoredAuth();
      if (!stored) return;
      if (h) {
        if (stored === h) setAuth(true);
      } else {
        const defaultHash = await sha256(ADMIN_PASSWORD);
        if (stored === defaultHash) setAuth(true);
      }
    });
    return () => unsub();
  }, []);

  const login = useCallback(async () => {
    const hash = await sha256(pwd);
    let ok = false;
    if (adminHash) {
      ok = hash === adminHash;
    } else {
      ok = pwd === ADMIN_PASSWORD;
    }
    if (ok) {
      setAuth(true);
      setPwdError(false);
      const h = adminHash ?? (await sha256(ADMIN_PASSWORD));
      setStoredAuth(h);
    } else {
      setPwdError(true);
    }
  }, [pwd, adminHash]);

  const toggleGroup = (label: string) =>
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));

  if (!auth) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${C.border}`,
          borderRadius: 16, padding: "40px 48px", width: 360,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
            <div style={{ color: C.text, fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px" }}>Yassala Admin</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Panneau d'administration</div>
          </div>
          <input
            type="password"
            placeholder="Mot de passe"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            autoFocus
            style={{
              width: "100%", padding: "11px 14px", borderRadius: 10,
              border: `1.5px solid ${pwdError ? "#ef4444" : C.border}`,
              background: "rgba(255,255,255,0.06)", color: C.text,
              fontSize: 15, outline: "none",
              marginBottom: pwdError ? 8 : 16, boxSizing: "border-box",
            }}
          />
          {pwdError && (
            <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>Mot de passe incorrect</div>
          )}
          <button
            onClick={login}
            style={{
              width: "100%", padding: "12px", borderRadius: 10, border: "none",
              background: C.accent, color: "#fff",
              fontWeight: 700, fontSize: 15, cursor: "pointer", letterSpacing: "0.3px",
            }}
          >
            Connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {sideOpen && (
        <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      )}

      {/* Sidebar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 240,
        background: `linear-gradient(${sidebarBg}, ${sidebarBg}), ${C.sidebar}`,
        borderRight: `1px solid ${mode !== "all" ? modeConf.border : C.border}`,
        display: "flex", flexDirection: "column",
        zIndex: 50, overflowY: "auto",
        transform: sideOpen ? "translateX(0)" : undefined,
        transition: "all 0.2s",
      }}>
        {/* Logo */}
        <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.accent, fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px" }}>
            YASSALA
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Admin Panel</div>
        </div>

        {/* ── MODE SWITCH ── */}
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
            Mode actif
          </div>
          <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.04)", borderRadius: 9, padding: 3 }}>
            {(["day", "all", "night"] as const).map((m) => {
              const mc = MODE_CONFIG[m];
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 7, border: "none",
                    background: isActive ? mc.bg : "transparent",
                    color: isActive ? mc.color : C.muted,
                    fontWeight: isActive ? 700 : 400,
                    fontSize: 11, cursor: "pointer",
                    outline: isActive ? `1px solid ${mc.border}` : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {mc.icon} {mc.label}
                </button>
              );
            })}
          </div>
          {mode !== "all" && (
            <div style={{
              marginTop: 6, padding: "4px 8px", borderRadius: 6,
              background: modeConf.bg,
              color: modeConf.color,
              fontSize: 10, fontWeight: 600, textAlign: "center",
            }}>
              Filtre {modeConf.icon} {modeConf.label} actif sur le contenu
            </div>
          )}
        </div>

        {/* Dashboard + Home Builder */}
        <div style={{ padding: "8px 10px" }}>
          <NavLink href="/admin/dashboard" label="Dashboard" icon="📊" active={pathname === "/admin/dashboard" || pathname === "/admin"} />
          <NavLink href="/admin/home-builder" label="Home Builder" icon="🏗️" active={pathname.startsWith("/admin/home-builder")} />
        </div>

        {/* Operations group (no mode indicator) */}
        <NavGroupBlock
          group={NAV_OPERATIONS}
          pathname={pathname}
          collapsed={collapsed}
          onToggle={toggleGroup}
          modeIndicator={false}
        />

        {/* Separator */}
        <div style={{ margin: "4px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {mode !== "all" && (
            <div style={{ padding: "4px 8px", marginTop: 6, fontSize: 9, color: modeConf.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Contenu {modeConf.icon} {modeConf.label}
            </div>
          )}
        </div>

        {/* Content groups (mode-filtered) */}
        {NAV_CONTENT.map((group) => (
          <NavGroupBlock
            key={group.label}
            group={group}
            pathname={pathname}
            collapsed={collapsed}
            onToggle={toggleGroup}
            modeIndicator={mode !== "all"}
            modeColor={modeConf.color}
          />
        ))}

        {/* Logout */}
        <div style={{ marginTop: "auto", padding: "12px 10px", borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => { localStorage.removeItem(AUTH_KEY); setAuth(false); }}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, border: "none",
              background: "transparent", color: C.muted, cursor: "pointer", fontSize: 13, textAlign: "left",
            }}
          >
            Deconnexion
          </button>
        </div>
      </nav>

      {/* Mobile header */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 52,
        background: C.sidebar, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", padding: "0 16px", zIndex: 30,
      }}>
        <button
          onClick={() => setSideOpen(true)}
          style={{ background: "none", border: "none", color: C.text, fontSize: 20, cursor: "pointer", marginRight: 12 }}
        >
          ☰
        </button>
        <span style={{ color: C.accent, fontWeight: 800, fontSize: 16 }}>YASSALA Admin</span>
        {/* Mini mode badge on mobile */}
        <div style={{
          marginLeft: "auto",
          padding: "3px 10px", borderRadius: 99,
          background: modeConf.bg, color: modeConf.color,
          fontSize: 11, fontWeight: 700,
        }}>
          {modeConf.icon} {modeConf.label}
        </div>
      </div>

      {/* Main content */}
      <main style={{ marginLeft: 240, flex: 1, minHeight: "100vh", color: C.text, paddingTop: 0 }}>
        {children}
      </main>
    </div>
  );
}

function NavGroupBlock({
  group, pathname, collapsed, onToggle, modeIndicator, modeColor,
}: {
  group: NavGroup;
  pathname: string;
  collapsed: Record<string, boolean>;
  onToggle: (label: string) => void;
  modeIndicator?: boolean;
  modeColor?: string;
}) {
  const isCollapsed = collapsed[group.label] ?? false;
  const groupActive = group.items.some((i) => pathname.startsWith(i.href));
  return (
    <div style={{ padding: "0 10px 4px" }}>
      <button
        onClick={() => onToggle(group.label)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 8px", borderRadius: 8, border: "none",
          background: groupActive ? C.accentDim : "transparent",
          color: groupActive ? C.accent : C.muted,
          cursor: "pointer", fontSize: 11, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.6px",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {group.icon} {group.label}
          {modeIndicator && modeColor && (
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: modeColor, display: "inline-block", marginLeft: 2 }} />
          )}
        </span>
        <span style={{ fontSize: 10 }}>{isCollapsed ? "▶" : "▼"}</span>
      </button>
      {!isCollapsed && (
        <div style={{ paddingLeft: 4, paddingBottom: 4 }}>
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 8,
        color: active ? "#f97316" : "#94a3b8",
        background: active ? "rgba(249,115,22,0.12)" : "transparent",
        textDecoration: "none", fontSize: 13,
        fontWeight: active ? 600 : 400,
        marginBottom: 1, transition: "all 0.15s",
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </Link>
  );
}
