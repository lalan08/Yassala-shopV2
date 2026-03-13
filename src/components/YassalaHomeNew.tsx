'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

/* ─── Types ──────────────────────────────────────────────────────────── */
export type Product = {
  id: string; name: string; desc: string; price: number;
  image: string; cat: string; badge: string; stock: number; isActive?: boolean;
};
export type Category = { id?: string; key: string; label: string; emoji: string; order: number; };
export type Settings = {
  shopOpen: boolean; deliveryMin: number; freeDelivery: number;
  hours: string; zone: string; whatsapp: string;
  paymentOnlineEnabled: boolean; paymentCashEnabled: boolean;
  fulfillmentDeliveryEnabled: boolean; fulfillmentPickupEnabled: boolean;
  [key: string]: unknown;
};
export type Banner = {
  id: string; title: string; subtitle: string; desc: string; cta: string;
  link: string; gradient: string; image: string; brightness?: number;
  active: boolean; order: number;
};
export type Etablissement = {
  id: string; name: string; slug?: string; description?: string;
  address?: string; phone?: string; logoUrl?: string; coverUrl?: string;
  openHours?: string; isActive: boolean;
  // champs enrichis
  isOpen?: boolean; category?: string; emoji?: string; bgColor?: string;
  deliveryMin?: number; deliveryMax?: number; deliveryFee?: number;
  rating?: number; reviewCount?: number; isComingSoon?: boolean;
};
export type CartItem = { id: string; name: string; price: number; qty: number; };

interface HomeNewProps {
  products:         Product[];
  categories:       Category[];
  merchants:        Etablissement[]; // night_etablissements
  banners:          Banner[];
  settings:         Settings;
  cart:             CartItem[];
  onOpenCart:       () => void;
  onOpenAuth:       () => void;
  currentUserEmail?: string | null;
  activeCat:        string;
  onSetActiveCat:   (cat: string) => void;
  onAddToCart:      (product: Product) => void;
}

/* ─── Toggle DAY / NIGHT avec statut de service ─────────────────────── */
function ThemeToggle() {
  const { resolvedTheme, setTheme, serviceMode } = useTheme();
  const dayStatus   = serviceMode.day.isOpen   ? 'OUVERT' : 'FERMÉ';
  const nightStatus = serviceMode.night.isOpen ? 'OUVERT' : 'FERMÉ';
  return (
    <div className="yn-toggle" aria-label="Changer le thème">
      <button
        className={`yn-toggle-btn${resolvedTheme === 'day' ? ' yn-toggle-active' : ''}`}
        onClick={() => setTheme('day')}
        title={serviceMode.day.isOpen ? `DAY · Ferme à ${serviceMode.day.closesAt}` : `DAY · ${serviceMode.day.countdown}`}
      >
        <span className="yn-toggle-icon">☀️</span>
        <span className="yn-toggle-label">DAY</span>
        <span style={{ fontSize: '.58rem', color: serviceMode.day.isOpen ? '#4ade80' : '#f87171', display: 'block', lineHeight: 1, fontWeight: 700, letterSpacing: '.04em' }}>
          {dayStatus}
        </span>
      </button>
      <button
        className={`yn-toggle-btn${resolvedTheme === 'night' ? ' yn-toggle-active' : ''}`}
        onClick={() => setTheme('night')}
        title={serviceMode.night.isOpen ? `NIGHT · Ferme à ${serviceMode.night.closesAt}` : `NIGHT · ${serviceMode.night.countdown}`}
      >
        <span className="yn-toggle-icon">🌙</span>
        <span className="yn-toggle-label">NIGHT</span>
        <span style={{ fontSize: '.58rem', color: serviceMode.night.isOpen ? '#4ade80' : '#f87171', display: 'block', lineHeight: 1, fontWeight: 700, letterSpacing: '.04em' }}>
          {nightStatus}
        </span>
      </button>
    </div>
  );
}

/* ─── Hero bannière libre ────────────────────────────────────────────── */
function HeroBanner({ banners }: { banners: Banner[] }) {
  const { resolvedTheme } = useTheme();
  const [idx, setIdx] = useState(0);
  const active = banners.filter(b => b.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  useEffect(() => {
    if (active.length <= 1) return;
    const id = setInterval(() => setIdx(i => (i + 1) % active.length), 4500);
    return () => clearInterval(id);
  }, [active.length]);
  const current = active.length > 0 ? active[idx % active.length] : null;
  const fallbackGradient = resolvedTheme === 'night'
    ? 'linear-gradient(135deg,#0B0F1A 0%,#1a0a2e 60%,#0d1b3e 100%)'
    : 'linear-gradient(135deg,#ff2d78 0%,#ff8e53 50%,#ffd93d 100%)';
  return (
    <section className="yn-hero">
      <div className="yn-hero-bg" style={{ background: current?.gradient || fallbackGradient }} />
      {current?.image && (
        <div className="yn-hero-bg" style={{ backgroundImage: `url(${current.image})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: current.brightness ?? 1 }} />
      )}
      {active.length > 1 && (
        <div className="yn-hero-dots">
          {active.map((_, i) => (
            <button key={i} className={`yn-dot${i === idx % active.length ? ' yn-dot-active' : ''}`} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Cartes info livraison ──────────────────────────────────────────── */
function InfoCards({ settings }: { settings: Settings }) {
  return (
    <div className="yn-info-cards">
      <div className="yn-info-card">
        <span className="yn-info-icon">⚡</span>
        <div>
          <div className="yn-info-title">Ultra rapide</div>
          <div className="yn-info-sub">20–35 min</div>
        </div>
      </div>
      <div className="yn-info-card">
        <span className="yn-info-icon">🎁</span>
        <div>
          <div className="yn-info-title">Livraison offerte</div>
          <div className="yn-info-sub">dès {settings.freeDelivery}€</div>
        </div>
      </div>
    </div>
  );
}

/* ─── En-tête de section ─────────────────────────────────────────────── */
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="yn-section-header">
      <h2 className="yn-section-title">{title}</h2>
    </div>
  );
}

/* ─── Carte établissement (Uber Eats style) ──────────────────────────── */
function EtabCard({ etab, service }: { etab: Etablissement; service: 'day' | 'night' }) {
  const isOpen = etab.isOpen ?? etab.isActive;
  const href = service === 'day' ? `/shop/${etab.id}` : `/nuit/${etab.id}`;
  return (
    <a href={href} className="yn-etab-card" style={{ textDecoration: 'none', display: 'block' }}>
      {/* Cover */}
      <div style={{ position: 'relative', height: 160, overflow: 'hidden', borderRadius: '14px 14px 0 0', background: etab.bgColor || (service === 'night' ? '#1a0a2e' : '#fef3c7'), flexShrink: 0 }}>
        {etab.coverUrl ? (
          <img src={etab.coverUrl} alt={etab.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem' }}>
            {etab.emoji || '🏪'}
          </div>
        )}
        {/* Badge statut */}
        <span style={{
          position: 'absolute', top: 10, right: 10,
          background: isOpen ? 'rgba(16,185,129,.92)' : 'rgba(75,85,99,.9)',
          color: '#fff', fontSize: '.68rem', fontWeight: 700, letterSpacing: '.06em',
          padding: '4px 10px', borderRadius: 20,
        }}>
          {etab.isComingSoon ? '🔜 Bientôt' : isOpen ? '🟢 OUVERT' : '🔴 FERMÉ'}
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px 14px', background: 'var(--yn-card, #fff)', borderRadius: '0 0 14px 14px', border: '1px solid var(--yn-border, #e5e7eb)', borderTop: 'none' }}>
        {/* Logo + nom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          {etab.logoUrl ? (
            <img src={etab.logoUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--yn-border, #e5e7eb)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: service === 'night' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>
              {(etab.name || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--yn-text, #111827)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {etab.name}
            </div>
            {etab.category && (
              <div style={{ fontSize: '.72rem', color: 'var(--yn-text-muted, #9ca3af)', marginTop: 1 }}>{etab.category}</div>
            )}
          </div>
        </div>

        {/* Méta : délai + frais + note */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {etab.deliveryMin != null && etab.deliveryMax != null && (
            <span style={{ fontSize: '.75rem', color: 'var(--yn-text-muted, #6b7280)' }}>⏱️ {etab.deliveryMin}–{etab.deliveryMax} min</span>
          )}
          {etab.deliveryFee != null && (
            <span style={{ fontSize: '.75rem', color: 'var(--yn-text-muted, #6b7280)' }}>
              🛵 {etab.deliveryFee === 0 ? 'Livraison offerte' : `${etab.deliveryFee}€`}
            </span>
          )}
          {etab.rating != null && (
            <span style={{ fontSize: '.75rem', color: '#f59e0b', fontWeight: 600 }}>⭐ {etab.rating.toFixed(1)}{etab.reviewCount ? ` (${etab.reviewCount})` : ''}</span>
          )}
        </div>

        {/* CTA */}
        <div style={{
          textAlign: 'center', background: service === 'night' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)',
          color: service === 'night' ? '#fff' : '#000', borderRadius: 8, padding: '8px 0',
          fontSize: '.82rem', fontWeight: 700, letterSpacing: '.04em',
        }}>
          Voir le menu →
        </div>
      </div>
    </a>
  );
}

/* ─── Slider horizontal d'établissements ─────────────────────────────── */
function EtabSlider({ title, etabs, service }: { title: string; etabs: Etablissement[]; service: 'day' | 'night' }) {
  if (etabs.length === 0) return null;
  return (
    <section className="yn-section">
      <SectionHeader title={title} />
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {etabs.map(e => (
          <div key={e.id} style={{ minWidth: 240, maxWidth: 260, flex: '0 0 auto', scrollSnapAlign: 'start' }}>
            <EtabCard etab={e} service={service} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Grille établissements ──────────────────────────────────────────── */
function EtabGrid({ title, etabs, service }: { title: string; etabs: Etablissement[]; service: 'day' | 'night' }) {
  if (etabs.length === 0) return null;
  return (
    <section className="yn-section">
      <SectionHeader title={title} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
        {etabs.map(e => <EtabCard key={e.id} etab={e} service={service} />)}
      </div>
    </section>
  );
}

/* ─── Composant principal ────────────────────────────────────────────── */
export default function YassalaHomeNew({
  merchants,
  banners,
  settings,
  cart,
  onOpenCart,
}: HomeNewProps) {
  const { resolvedTheme, setTheme, serviceMode } = useTheme();

  const canOrder = resolvedTheme === 'day' ? serviceMode.canOrderDay : serviceMode.canOrderNight;
  const currentStatus = resolvedTheme === 'day' ? serviceMode.day : serviceMode.night;
  const otherMode: 'day' | 'night' = resolvedTheme === 'day' ? 'night' : 'day';
  const otherServiceIsOpen = resolvedTheme === 'day' ? serviceMode.canOrderNight : serviceMode.canOrderDay;

  /* ── Fetch day_banners + day_etablissements ── */
  const [dayBanners, setDayBanners] = useState<Banner[]>([]);
  const [dayEtabs,   setDayEtabs]   = useState<Etablissement[]>([]);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'day_banners'), snap => {
      setDayBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)).filter(b => b.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    const u2 = onSnapshot(collection(db, 'day_etablissements'), snap => {
      setDayEtabs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Etablissement)).filter(e => e.isActive).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
    return () => { u1(); u2(); };
  }, []);

  /* ── Récemment consultés (localStorage) ── */
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    try { setRecentIds(JSON.parse(localStorage.getItem('yassala_recent_etabs') || '[]')); } catch {}
  }, []);

  const displayBanners = resolvedTheme === 'day' ? (dayBanners.length > 0 ? dayBanners : banners) : banners;
  const allEtabs = resolvedTheme === 'day' ? dayEtabs : (merchants as Etablissement[]);
  const service: 'day' | 'night' = resolvedTheme;

  const openNow  = allEtabs.filter(e => (e.isOpen ?? e.isActive) && !e.isComingSoon);
  const comingSoon = allEtabs.filter(e => e.isComingSoon);
  const recentEtabs = allEtabs.filter(e => recentIds.includes(e.id)).sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className={`yn-root yn-${resolvedTheme}`} data-theme={resolvedTheme}>

      {/* ── HEADER ── */}
      <header className="yn-header">
        <div className="yn-header-inner">
          <div className="yn-logo">
            <span className="yn-logo-text">YASSALA</span>
            <span className="yn-logo-sub">{resolvedTheme === 'night' ? 'Night' : 'Day'}</span>
          </div>
          <div className="yn-header-right">
            <ThemeToggle />
          </div>
        </div>

        <div className="yn-info-bar">
          <span>📍 Guyane</span>
          <span className="yn-info-sep">•</span>
          <span>{settings.hours}</span>
          <span className="yn-info-sep">•</span>
          <span className={`yn-shop-status${settings.shopOpen ? ' yn-open' : ' yn-closed'}`}>
            {settings.shopOpen ? '🟢 Ouvert' : '🔴 Fermé'}
          </span>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="yn-main">

        <HeroBanner banners={displayBanners} />
        <InfoCards settings={settings} />

        {/* ── BANDEAU SERVICE FERMÉ ── */}
        {!canOrder && (
          <div style={{
            background: resolvedTheme === 'day' ? 'linear-gradient(135deg,#fffbeb,#fef3c7)' : 'linear-gradient(135deg,#1a1040,#2d1b69)',
            border: `1px solid ${resolvedTheme === 'day' ? '#fbbf24' : '#6d28d9'}`,
            borderRadius: 12, margin: '0 0 20px', padding: '20px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>{resolvedTheme === 'day' ? '☀️' : '🌙'}</div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: resolvedTheme === 'day' ? '#92400e' : '#c4b5fd' }}>
              Service {resolvedTheme === 'day' ? 'DAY' : 'NIGHT'} fermé
            </div>
            <div style={{ fontSize: '.85rem', color: resolvedTheme === 'day' ? '#78350f' : '#8b5cf6', marginTop: 6 }}>
              Ouvre à {currentStatus.opensAt} · <span style={{ fontWeight: 600 }}>{currentStatus.countdown}</span>
            </div>
            <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: 4 }}>Catalogue disponible · commandes désactivées</div>
            {otherServiceIsOpen && (
              <button onClick={() => setTheme(otherMode)} style={{ marginTop: 14, background: otherMode === 'day' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', letterSpacing: '.04em' }}>
                {otherMode === 'day' ? '☀️ Basculer vers DAY' : '🌙 Basculer vers NIGHT'} — ouvert maintenant
              </button>
            )}
            {!otherServiceIsOpen && serviceMode.isClosed && (
              <div style={{ fontSize: '.82rem', color: '#9ca3af', marginTop: 12, fontWeight: 500 }}>Le shop est fermé — ouvre à 07:00</div>
            )}
            {!otherServiceIsOpen && serviceMode.isPause && (
              <div style={{ fontSize: '.82rem', color: '#9ca3af', marginTop: 12, fontWeight: 500 }}>Pause entre les services — NIGHT ouvre à {serviceMode.night.opensAt}</div>
            )}
          </div>
        )}

        {/* ── ÉTABLISSEMENTS ── */}
        {allEtabs.length === 0 ? (
          <div className="yn-empty">
            <span style={{ fontSize: '3rem' }}>🏪</span>
            <p style={{ marginTop: 12, color: 'var(--yn-text-muted,#9ca3af)' }}>Aucun établissement disponible</p>
          </div>
        ) : (
          <>
            {/* Ouverts maintenant — slider */}
            {openNow.length > 0 && (
              <EtabSlider title="🟢 Ouverts maintenant" etabs={openNow} service={service} />
            )}

            {/* Récemment consultés — slider */}
            {recentEtabs.length > 0 && (
              <EtabSlider title="🕐 Récemment consultés" etabs={recentEtabs} service={service} />
            )}

            {/* Tous les établissements — grille */}
            <EtabGrid title={resolvedTheme === 'day' ? '🏪 Tous les restaurants' : '🌙 Partenaires nuit'} etabs={allEtabs} service={service} />

            {/* Bientôt disponibles */}
            {comingSoon.length > 0 && (
              <EtabSlider title="🔜 Bientôt disponibles" etabs={comingSoon} service={service} />
            )}
          </>
        )}

        <div style={{ height: 32 }} />
      </main>

      {/* ── BOTTOM NAV ── */}
      <nav className="yn-bottom-nav">
        <button className="yn-nav-item yn-nav-active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="yn-nav-icon">🏠</span>
          <span className="yn-nav-label">Accueil</span>
        </button>
        <button className="yn-nav-item" onClick={() => setTheme(resolvedTheme === 'day' ? 'night' : 'day')}>
          <span className="yn-nav-icon">{resolvedTheme === 'day' ? '🌙' : '☀️'}</span>
          <span className="yn-nav-label">{resolvedTheme === 'day' ? 'Night' : 'Day'}</span>
        </button>
      </nav>

    </div>
  );
}
