"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { sha256, ADMIN_PASSWORD, AUTH_KEY, getStoredAuth, setStoredAuth } from "@/lib/adminAuth";

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

// ── DESIGN TOKENS ──
const C = {
  bg:         "#0a0a14",
  sidebar:    "rgba(8,8,18,0.97)",
  border:     "rgba(255,255,255,0.08)",
  text:       "#f1f5f9",
  muted:      "#64748b",
  accent:     "#f97316",
  accentDim:  "rgba(249,115,22,0.15)",
  active:     "rgba(249,115,22,0.18)",
  hover:      "rgba(255,255,255,0.05)",
};

type NavItem = { label: string; href: string; icon: string; badge?: number };
type NavGroup = { label: string; icon: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Operations",
    icon: "⚡",
    items: [
      { label: "Commandes",            href: "/admin/operations/commandes",    icon: "📦" },
      { label: "Dispatch",             href: "/admin/operations/dispatch",     icon: "🏍️" },
      { label: "Livreurs",             href: "/admin/operations/livreurs",     icon: "👤" },
      { label: "Clients",              href: "/admin/operations/clients",      icon: "👥" },
      { label: "Candidatures livreurs",href: "/admin/operations/candidatures", icon: "📋" },
    ],
  },
  {
    label: "Commerces",
    icon: "🏪",
    items: [
      { label: "Établissements",       href: "/admin/commerces",               icon: "🏬" },
    ],
  },
  {
    label: "Catalogue",
    icon: "🛒",
    items: [
      { label: "Produits",             href: "/admin/catalogue/produits",      icon: "🍽️" },
      { label: "Catégories",           href: "/admin/catalogue/categories",    icon: "🏷️" },
      { label: "Packs",                href: "/admin/catalogue/packs",         icon: "🎁" },
    ],
  },
  {
    label: "Marketing",
    icon: "📣",
    items: [
      { label: "Promotions",           href: "/admin/marketing/promotions",    icon: "🎯" },
      { label: "Coupons",              href: "/admin/marketing/coupons",       icon: "🎟️" },
      { label: "Bannières",            href: "/admin/marketing/bannieres",     icon: "🖼️" },
    ],
  },
  {
    label: "Finance",
    icon: "💶",
    items: [
      { label: "Paiements",            href: "/admin/finance/paiements",       icon: "💳" },
      { label: "Rapports",             href: "/admin/finance/rapports",        icon: "📊" },
    ],
  },
  {
    label: "Paramètres",
    icon: "⚙️",
    items: [
      { label: "Configuration",        href: "/admin/parametres",              icon: "🔧" },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [auth, setAuth]           = useState(false);
  const [pwd, setPwd]             = useState("");
  const [pwdError, setPwdError]   = useState(false);
  const [adminHash, setAdminHash] = useState<string | null>(null);
  const [sideOpen, setSideOpen]   = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ── Load admin hash + auto-restore session ──
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

  // ── AUTH GATE ──
  if (!auth) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "40px 48px",
          width: 360,
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
              width: "100%",
              padding: "11px 14px",
              borderRadius: 10,
              border: `1.5px solid ${pwdError ? "#ef4444" : C.border}`,
              background: "rgba(255,255,255,0.06)",
              color: C.text,
              fontSize: 15,
              outline: "none",
              marginBottom: pwdError ? 8 : 16,
              boxSizing: "border-box",
            }}
          />
          {pwdError && (
            <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>
              Mot de passe incorrect
            </div>
          )}
          <button
            onClick={login}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              border: "none",
              background: C.accent,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              letterSpacing: "0.3px",
            }}
          >
            Connexion
          </button>
        </div>
      </div>
    );
  }

  // ── LAYOUT ──
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Mobile overlay */}
      {sideOpen && (
        <div
          onClick={() => setSideOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
        />
      )}

      {/* Sidebar */}
      <nav style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: 240,
        background: C.sidebar,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        overflowY: "auto",
        transform: sideOpen ? "translateX(0)" : undefined,
        transition: "transform 0.2s",
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.accent, fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px" }}>
            YASSALA
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Admin Panel</div>
        </div>

        {/* Dashboard */}
        <div style={{ padding: "8px 10px" }}>
          <NavLink
            href="/admin/dashboard"
            label="Dashboard"
            icon="📊"
            active={pathname === "/admin/dashboard" || pathname === "/admin"}
          />
          <NavLink
            href="/admin/home-builder"
            label="Home Builder"
            icon="🏗️"
            active={pathname.startsWith("/admin/home-builder")}
          />
        </div>

        {/* Groups */}
        {NAV.map((group) => {
          const isCollapsed = collapsed[group.label] ?? false;
          const groupActive = group.items.some((i) => pathname.startsWith(i.href));
          return (
            <div key={group.label} style={{ padding: "0 10px 4px" }}>
              <button
                onClick={() => toggleGroup(group.label)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 8px",
                  borderRadius: 8,
                  border: "none",
                  background: groupActive ? C.accentDim : "transparent",
                  color: groupActive ? C.accent : C.muted,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                }}
              >
                <span>{group.icon} {group.label}</span>
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
        })}

        {/* Logout */}
        <div style={{ marginTop: "auto", padding: "12px 10px", borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={() => {
              localStorage.removeItem(AUTH_KEY);
              setAuth(false);
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: C.muted,
              cursor: "pointer",
              fontSize: 13,
              textAlign: "left",
            }}
          >
            🚪 Déconnexion
          </button>
        </div>
      </nav>

      {/* Mobile header */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        background: C.sidebar,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        zIndex: 30,
        "@media (min-width: 768px)": { display: "none" } as any,
      }}>
        <button
          onClick={() => setSideOpen(true)}
          style={{
            background: "none",
            border: "none",
            color: C.text,
            fontSize: 20,
            cursor: "pointer",
            marginRight: 12,
          }}
        >
          ☰
        </button>
        <span style={{ color: C.accent, fontWeight: 800, fontSize: 16 }}>YASSALA Admin</span>
      </div>

      {/* Main content */}
      <main style={{
        marginLeft: 240,
        flex: 1,
        minHeight: "100vh",
        color: C.text,
        paddingTop: 0,
      }}>
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 8,
        color: active ? "#f97316" : "#94a3b8",
        background: active ? "rgba(249,115,22,0.12)" : "transparent",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        marginBottom: 1,
        transition: "all 0.15s",
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </Link>
  );
}
