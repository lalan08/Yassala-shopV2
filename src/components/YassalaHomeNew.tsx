'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, addDoc } from 'firebase/firestore';

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
  isOpen?: boolean; category?: string; emoji?: string; bgColor?: string;
  deliveryMin?: number; deliveryMax?: number; deliveryFee?: number;
  rating?: number; reviewCount?: number; isComingSoon?: boolean;
};
export type CartItem = { id: string; name: string; price: number; qty: number; };

type EtabCat  = { id: string; key: string; label: string; emoji: string; order: number; };
type EtabProd = { id: string; name: string; desc: string; price: number; image: string; cat: string; badge?: string; stock?: number; isActive?: boolean; };
type EtabSupp = { id: string; name: string; price: number; etablissementId?: string; isActive?: boolean; emoji?: string; };

interface HomeNewProps {
  products:         Product[];
  categories:       Category[];
  merchants:        Etablissement[];
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

/* ─── Helpers ────────────────────────────────────────────────────────── */
function fmtPrice(p: number) { return p.toFixed(2).replace('.', ',') + ' €'; }
function cartTotal(cart: CartItem[]) { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
/** Extrait les tailles depuis la description ("… • Petite 9€ · Grande 12€ · Familiale 17€") */
function parseSizes(desc: string): { label: string; price: number }[] | null {
  const idx = desc.indexOf(' • ');
  if (idx === -1) return null;
  const parts = desc.slice(idx + 3).split(/\s*[·•]\s*/);
  const sizes = parts.map(p => {
    const m = p.trim().match(/^(.+?)\s+([\d]+(?:[.,]\d{1,2})?)\s*€/);
    return m ? { label: m[1].trim(), price: parseFloat(m[2].replace(',', '.')) } : null;
  }).filter(Boolean) as { label: string; price: number }[];
  return sizes.length > 1 ? sizes : null;
}
function getDisplayDesc(desc: string) {
  const idx = desc.indexOf(' • ');
  return idx === -1 ? desc : desc.slice(0, idx);
}
function saveRecent(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const list: string[] = JSON.parse(localStorage.getItem('yassala_recent_etabs') || '[]');
    localStorage.setItem('yassala_recent_etabs', JSON.stringify([id, ...list.filter(x => x !== id)].slice(0, 10)));
  } catch {}
}

/* ─── Toggle DAY / NIGHT ─────────────────────────────────────────────── */
function ThemeToggle() {
  const { resolvedTheme, setTheme, serviceMode } = useTheme();
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
          {serviceMode.day.isOpen ? 'OUVERT' : 'FERMÉ'}
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
          {serviceMode.night.isOpen ? 'OUVERT' : 'FERMÉ'}
        </span>
      </button>
    </div>
  );
}

/* ─── Hero bannière ──────────────────────────────────────────────────── */
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

/* ─── En-tête de section (style Uber Eats) ──────────────────────────── */
function SectionHeader({ title, arrow }: { title: string; arrow?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--yn-text,#111827)' }}>{title}</h2>
      {arrow && (
        <button style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #e5e7eb', background: 'var(--yn-card,#fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '.85rem', color: '#374151', flexShrink: 0 }}>→</button>
      )}
    </div>
  );
}

/* ─── Carte établissement — version slider (demi-largeur) ───────────── */
function EtabCardSmall({ etab, onClick }: { etab: Etablissement; onClick: () => void }) {
  const isOpen = etab.isOpen ?? etab.isActive;
  const availText = etab.isComingSoon ? 'Bientôt disponible'
    : isOpen ? 'Disponible maintenant'
    : etab.openHours ? `Disponible à ${etab.openHours.split('–')[0]}` : 'Actuellement fermé';
  return (
    <button onClick={onClick} style={{ display: 'block', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      {/* Cover */}
      <div style={{ position: 'relative', width: '100%', paddingBottom: '58%', borderRadius: 10, overflow: 'hidden', background: etab.bgColor || '#f3f4f6' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {etab.coverUrl
            ? <img src={etab.coverUrl} alt={etab.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>{etab.emoji || '🏪'}</div>
          }
          {etab.deliveryFee === 0 && (
            <span style={{ position: 'absolute', top: 6, left: 6, background: '#ff2d78', color: '#fff', fontSize: '.58rem', fontWeight: 700, padding: '3px 6px', borderRadius: 4 }}>Livraison à 0 €</span>
          )}
          {!isOpen && !etab.isComingSoon && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.32)' }} />
          )}
        </div>
      </div>
      {/* Info */}
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontSize: '.68rem', color: '#6b7280', marginBottom: 1 }}>{availText}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--yn-text,#111827)', lineHeight: 1.25, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{etab.name}</div>
          <span style={{ color: '#d1d5db', fontSize: '.9rem', flexShrink: 0 }}>♡</span>
        </div>
        {etab.isComingSoon
          ? <span style={{ fontSize: '.6rem', color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: 4, fontWeight: 600, display: 'inline-block', marginTop: 3 }}>Bientôt</span>
          : etab.category
          ? <div style={{ fontSize: '.68rem', color: '#9ca3af', marginTop: 2 }}>{etab.category}</div>
          : null
        }
      </div>
    </button>
  );
}

/* ─── Carte établissement — version liste (pleine largeur) ──────────── */
function EtabCardFull({ etab, onClick }: { etab: Etablissement; onClick: () => void }) {
  const isOpen = etab.isOpen ?? etab.isActive;
  const availText = etab.isComingSoon ? 'Bientôt disponible'
    : isOpen ? 'Disponible maintenant'
    : etab.openHours ? `Disponible à ${etab.openHours.split('–')[0]}` : 'Actuellement fermé';
  return (
    <button onClick={onClick} style={{ display: 'block', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      {/* Cover */}
      <div style={{ position: 'relative', width: '100%', height: 155, borderRadius: 12, overflow: 'hidden', background: etab.bgColor || '#f3f4f6' }}>
        {etab.coverUrl
          ? <img src={etab.coverUrl} alt={etab.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>{etab.emoji || '🏪'}</div>
        }
        {etab.deliveryFee === 0 && (
          <span style={{ position: 'absolute', top: 8, left: 8, background: '#ff2d78', color: '#fff', fontSize: '.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: 5 }}>Livraison à 0 €</span>
        )}
        {!isOpen && !etab.isComingSoon && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.28)' }} />
        )}
      </div>
      {/* Info */}
      <div style={{ padding: '8px 0 2px' }}>
        <div style={{ fontSize: '.7rem', color: '#6b7280', marginBottom: 2 }}>{availText}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--yn-text,#111827)' }}>{etab.name}</div>
          <span style={{ color: '#d1d5db', fontSize: '1rem' }}>♡</span>
        </div>
        <div style={{ fontSize: '.7rem', color: '#9ca3af', marginTop: 2 }}>
          {[etab.category, etab.deliveryMin != null ? `${etab.deliveryMin}–${etab.deliveryMax} min` : null].filter(Boolean).join(' · ')}
        </div>
      </div>
    </button>
  );
}

/* ─── Slider horizontal (2 cartes visibles, scroll gauche→droite) ───── */
function EtabSlider({ title, etabs, service, onSelect }: { title: string; etabs: Etablissement[]; service: 'day' | 'night'; onSelect: (e: Etablissement) => void }) {
  if (etabs.length === 0) return null;
  return (
    <section className="yn-section">
      <SectionHeader title={title} arrow />
      <div style={{
        display: 'flex', gap: 12,
        overflowX: 'auto', overflowY: 'visible',
        paddingLeft: 16, paddingRight: 16, paddingBottom: 8,
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      } as React.CSSProperties}>
        {etabs.map(e => (
          <div key={e.id} style={{ minWidth: 'calc(50vw - 22px)', maxWidth: 190, flex: '0 0 auto', scrollSnapAlign: 'start' }}>
            <EtabCardSmall etab={e} onClick={() => onSelect(e)} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Liste pleine largeur (scroll vertical de la page) ─────────────── */
function EtabGrid({ title, etabs, service, onSelect }: { title: string; etabs: Etablissement[]; service: 'day' | 'night'; onSelect: (e: Etablissement) => void }) {
  if (etabs.length === 0) return null;
  return (
    <section className="yn-section">
      <SectionHeader title={title} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 16px' }}>
        {etabs.map(e => <EtabCardFull key={e.id} etab={e} onClick={() => onSelect(e)} />)}
      </div>
    </section>
  );
}

/* ─── Panel menu établissement (plein-écran inline) ─────────────────── */
const PINK   = '#ff2d78';
const DARK   = '#08050f';
const CARD_BG = '#0e0a1a';
const BORDER = 'rgba(255,45,120,.18)';

/* ─── Carte établissement — Uber Eats style, snap horizontal ────────── */
function EtabSnapCard({ etab, onClick, isNight }: { etab: Etablissement; onClick: () => void; isNight: boolean }) {
  const isOpen = etab.isOpen ?? etab.isActive;
  return (
    <button onClick={onClick} style={{ flexShrink: 0, width: 200, scrollSnapAlign: 'start',
      background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ borderRadius: 18, overflow: 'hidden',
        background: isNight ? CARD_BG : '#fff',
        border: isNight ? `1px solid ${BORDER}` : '1px solid rgba(0,0,0,.07)',
        boxShadow: isNight ? '0 6px 24px rgba(0,0,0,.5)' : '0 4px 16px rgba(0,0,0,.08)' }}>
        {/* Cover */}
        <div style={{ position: 'relative', height: 130, overflow: 'hidden',
          background: isNight ? 'rgba(255,255,255,.04)' : '#f3f4f6' }}>
          {etab.coverUrl
            ? <img src={etab.coverUrl} alt={etab.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover',
                  opacity: (!isOpen && !etab.isComingSoon) ? 0.5 : 1 }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '2.5rem', opacity: isNight ? .12 : .25 }}>
                {etab.emoji || '🏪'}
              </div>}
          {!isOpen && !etab.isComingSoon && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.28)' }} />
          )}
          {/* Badge statut */}
          <span style={{ position: 'absolute', top: 8, left: 8,
            background: etab.isComingSoon ? '#6366f1' : isOpen ? '#22c55e' : 'rgba(0,0,0,.55)',
            color: '#fff', fontSize: '.6rem', fontWeight: 700, padding: '3px 9px', borderRadius: 8,
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            {etab.isComingSoon ? 'Bientôt' : isOpen ? 'Ouvert' : 'Fermé'}
          </span>
          {etab.deliveryFee === 0 && (
            <span style={{ position: 'absolute', bottom: 8, left: 8,
              background: PINK, color: '#fff', fontSize: '.58rem', fontWeight: 700,
              padding: '2px 7px', borderRadius: 6 }}>0 € livraison</span>
          )}
        </div>
        {/* Info */}
        <div style={{ padding: '11px 13px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: '.9rem',
            color: isNight ? '#f0eeff' : '#111827',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{etab.name}</div>
          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {etab.category && <span style={{ fontSize: '.7rem', color: isNight ? '#9ca3af' : '#6b7280' }}>{etab.category}</span>}
            {etab.deliveryMin != null && <span style={{ fontSize: '.7rem', color: isNight ? '#6b7280' : '#9ca3af' }}>· {etab.deliveryMin}–{etab.deliveryMax} min</span>}
          </div>
          {etab.rating != null && (
            <div style={{ marginTop: 5, fontSize: '.7rem', color: isNight ? '#9ca3af' : '#6b7280', fontWeight: 600 }}>
              ⭐ {etab.rating.toFixed(1)}{etab.reviewCount ? ` (${etab.reviewCount})` : ''}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function ProductCard({ prod, onAdd, disabled, lastAdded }: { prod: EtabProd; onAdd: () => void; disabled: boolean; lastAdded?: boolean }) {
  const isAdded = !!lastAdded;
  const badgeBg = prod.badge==="HOT" ? PINK : prod.badge==="BEST" ? "#ffb400" : prod.badge==="NEW" ? "#22c55e" : PINK;
  const hasImage = !!prod.image;
  const addBtn = (inImage: boolean) => (
    <button onClick={e => { e.stopPropagation(); if (!disabled) onAdd(); }} disabled={disabled}
      style={inImage ? {
        position: 'absolute', bottom: 7, right: 7, width: 34, height: 34, borderRadius: '50%',
        background: disabled ? 'rgba(255,255,255,.12)' : isAdded ? '#22c55e' : PINK,
        border: '2.5px solid rgba(8,5,15,.85)', color: '#fff',
        fontSize: isAdded ? '.85rem' : '1.25rem', display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: '0 3px 12px rgba(0,0,0,.5)', transition: 'all .2s',
        fontFamily: "'Inter',sans-serif", fontWeight: 700,
      } : {
        flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
        background: disabled ? 'rgba(255,255,255,.1)' : isAdded ? '#22c55e' : PINK,
        border: `1.5px solid ${isAdded ? '#22c55e' : PINK}`, color: '#fff',
        fontSize: isAdded ? '.85rem' : '1.2rem', display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: isAdded ? '0 0 0 3px rgba(34,197,94,.2)' : `0 0 0 3px ${PINK}22`,
        transition: 'all .2s', fontFamily: "'Inter',sans-serif", fontWeight: 700,
      }}>
      {disabled ? '✕' : isAdded ? '✓' : '+'}
    </button>
  );

  if (!hasImage) {
    /* ── Style menu texte (sans image) ── */
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 12px 6px',
        padding: '13px 14px 13px 16px', borderRadius: 14, cursor: 'pointer',
        background: isAdded ? 'rgba(34,197,94,.06)' : CARD_BG,
        borderLeft: `3px solid ${isAdded ? '#22c55e' : PINK}`,
        border: isAdded ? '1px solid rgba(34,197,94,.2)' : `1px solid ${BORDER}`,
        borderLeftWidth: 3, boxShadow: '0 1px 6px rgba(0,0,0,.25)', transition: 'all .2s' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            {prod.badge && <span style={{ background: badgeBg, color: '#fff', fontSize: '.55rem',
              fontWeight: 700, padding: '1px 7px', borderRadius: 8 }}>{prod.badge}</span>}
            <span style={{ fontWeight: 700, color: disabled ? '#4b5563' : '#f0eeff', fontSize: '.95rem',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{prod.name}</span>
          </div>
          {prod.desc && <div style={{ color: '#6b7280', fontSize: '.73rem', lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{prod.desc}</div>}
          <div style={{ marginTop: 6, fontWeight: 800, fontSize: '.9rem',
            color: disabled ? '#4b5563' : PINK }}>{fmtPrice(prod.price)}</div>
        </div>
        {addBtn(false)}
      </div>
    );
  }

  /* ── Style avec image (Deliveroo) ── */
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, margin: '0 12px 10px',
      borderRadius: 16, overflow: 'hidden',
      background: isAdded ? 'rgba(34,197,94,.08)' : CARD_BG,
      border: isAdded ? '1px solid rgba(34,197,94,.3)' : `1px solid ${BORDER}`,
      boxShadow: '0 2px 12px rgba(0,0,0,.35)', transition: 'all .25s', cursor: 'pointer' }}>
      <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {prod.badge && <span style={{ display: 'inline-block', background: badgeBg, color: '#fff',
          fontSize: '.6rem', fontWeight: 700, padding: '2px 9px', borderRadius: 10,
          marginBottom: 6, alignSelf: 'flex-start' }}>{prod.badge}</span>}
        <div style={{ fontWeight: 700, color: disabled ? '#4b5563' : '#f0eeff', fontSize: '1rem',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{prod.name}</div>
        {prod.desc && <div style={{ color: '#6b7280', fontSize: '.78rem', lineHeight: 1.45, marginTop: 4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{prod.desc}</div>}
        <div style={{ marginTop: 8, fontWeight: 800, fontSize: '1rem',
          color: disabled ? '#4b5563' : PINK }}>{fmtPrice(prod.price)}</div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0, width: 110, height: 110 }}>
        <img src={prod.image} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: disabled ? 0.35 : 1 }} />
        {addBtn(true)}
      </div>
    </div>
  );
}

function EtabMenuPanel({ etab, service, canOrder, serviceCountdown, onClose, onAddItem, onOpenCart }: {
  etab: Etablissement;
  service: 'day' | 'night';
  canOrder: boolean;
  serviceCountdown: string;
  onClose: () => void;
  onAddItem: (id: string, name: string, price: number) => void;
  onOpenCart: () => void;
}) {
  const [cats,  setCats]  = useState<EtabCat[]>([]);
  const [prods, setProds] = useState<EtabProd[]>([]);
  const [supps, setSupps] = useState<EtabSupp[]>([]);
  const [activeCat, setActiveCat] = useState('all');
  const [toast, setToast] = useState('');
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [sizePickerProd, setSizePickerProd] = useState<EtabProd | null>(null);
  const [pickerStep, setPickerStep] = useState<'size' | 'extras'>('size');
  const [chosenSize, setChosenSize] = useState<{ label: string; price: number } | null>(null);
  const [selectedSupps, setSelectedSupps] = useState<string[]>([]);
  const [halfEnabled, setHalfEnabled] = useState(false);
  const [halfProd, setHalfProd] = useState<EtabProd | null>(null);
  const [pickerNote, setPickerNote] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const coll = service === 'day' ? 'day' : 'night';

  useEffect(() => {
    saveRecent(etab.id);
    const q1 = query(collection(db, `${coll}_categories`), where('etablissementId', '==', etab.id));
    const q2 = query(collection(db, `${coll}_products`),   where('etablissementId', '==', etab.id));
    const u1 = onSnapshot(q1, snap => setCats(snap.docs.map(d => ({ id: d.id, ...d.data() } as EtabCat)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
    const u2 = onSnapshot(q2, snap => setProds(snap.docs.map(d => ({ id: d.id, ...d.data() } as EtabProd)).filter(p => p.isActive !== false)));
    const u3 = onSnapshot(collection(db, `${coll}_supplements`), snap => {
      setSupps(snap.docs.map(d => ({ id: d.id, ...d.data() } as EtabSupp)).filter(s => s.isActive !== false && (!s.etablissementId || s.etablissementId === etab.id)));
    });
    return () => { u1(); u2(); u3(); };
  }, [etab.id, coll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const resetPicker = () => {
    setSizePickerProd(null);
    setPickerStep('size');
    setChosenSize(null);
    setSelectedSupps([]);
    setHalfEnabled(false);
    setHalfProd(null);
    setPickerNote('');
  };

  const confirmAddToCart = () => {
    if (!sizePickerProd || !canOrder) return;
    const sizes  = parseSizes(sizePickerProd.desc || '');
    const size   = chosenSize ?? (sizes ? null : null);
    const suppTotal = selectedSupps.reduce((s, sid) => {
      const sp = supps.find(x => x.id === sid);
      return s + (sp ? sp.price : 0);
    }, 0);
    const suppNames = selectedSupps.map(sid => supps.find(x => x.id === sid)?.name).filter(Boolean).map(n => `+${n}`).join(', ');
    const notePart  = pickerNote.trim() ? ` · ${pickerNote.trim()}` : '';
    const noteSuffix = suppNames || notePart ? ` [${[suppNames, notePart.replace(' · ', '')].filter(Boolean).join(' · ')}]` : '';

    let id: string, name: string, price: number;
    if (halfEnabled && halfProd && size) {
      const halfSizes = parseSizes(halfProd.desc || '');
      const halfSize  = halfSizes?.find(s => s.label === size.label) ?? halfSizes?.[0] ?? { price: halfProd.price };
      price = Math.max(size.price, halfSize.price) + suppTotal;
      id    = `${sizePickerProd.id}_${size.label}_half_${halfProd.id}`;
      name  = `½ ${sizePickerProd.name} / ½ ${halfProd.name} (${size.label})${noteSuffix}`;
    } else if (size) {
      price = size.price + suppTotal;
      id    = `${sizePickerProd.id}_${size.label}`;
      name  = `${sizePickerProd.name} (${size.label})${noteSuffix}`;
    } else {
      price = sizePickerProd.price + suppTotal;
      id    = sizePickerProd.id;
      name  = `${sizePickerProd.name}${noteSuffix}`;
    }
    setLastAddedId(sizePickerProd.id);
    setTimeout(() => setLastAddedId(null), 1200);
    onAddItem(id, name, price);
    setToast(`${sizePickerProd.name} ajouté · ${fmtPrice(price)}`);
    resetPicker();
  };

  const addDirectToCart = (prod: EtabProd) => {
    if (!canOrder) { setToast(`Service fermé · ${serviceCountdown}`); return; }
    setLastAddedId(prod.id);
    setTimeout(() => setLastAddedId(null), 1200);
    onAddItem(prod.id, prod.name, prod.price);
    setToast(`${prod.name} ajouté · ${fmtPrice(prod.price)}`);
  };

  const pickOrAdd = (prod: EtabProd) => {
    if (!canOrder) { setToast(`Service fermé · ${serviceCountdown}`); return; }
    const sizes = parseSizes(prod.desc || '');
    if (sizes || supps.length > 0) {
      setSizePickerProd(prod);
      setPickerStep(sizes ? 'size' : 'extras');
      return;
    }
    addDirectToCart(prod);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: DARK, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} ref={scrollRef}>

      {/* Cover header */}
      <div style={{ position: 'relative', height: 200, flexShrink: 0, background: etab.bgColor || (service === 'night' ? '#1a0a2e' : '#fef3c7'), overflow: 'hidden' }}>
        {etab.coverUrl && <img src={etab.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: .7 }} />}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${DARK}, transparent 60%)` }} />
        {/* Back */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, left: 16, width: 38, height: 38, borderRadius: '50%', background: 'rgba(8,5,15,.75)', border: '1px solid rgba(255,255,255,.15)', color: '#f0eeff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>←</button>
      </div>

      {/* Etab info */}
      <div style={{ padding: '0 16px', maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: -32, position: 'relative' }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: `2px solid ${BORDER}`, background: CARD_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
            {etab.logoUrl ? <img src={etab.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (etab.emoji || '🏪')}
          </div>
          <div style={{ paddingBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#f0eeff' }}>{etab.name}</h1>
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              {etab.category && <span style={{ color: '#9ca3af', fontSize: '.75rem' }}>{etab.category}</span>}
              <span style={{ display: 'inline-block', padding: '1px 9px', borderRadius: 20, background: canOrder ? 'rgba(74,222,128,.15)' : 'rgba(248,113,113,.12)', color: canOrder ? '#4ade80' : '#f87171', fontSize: '.68rem', fontFamily: "'Share Tech Mono',monospace" }}>
                {canOrder ? '🟢 Ouvert' : '🔴 Fermé'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, color: '#9ca3af', fontSize: '.78rem' }}>
          {etab.deliveryMin != null && <span>⏱ {etab.deliveryMin}–{etab.deliveryMax} min</span>}
          {etab.deliveryFee != null && <span>🛵 {etab.deliveryFee === 0 ? 'Livraison offerte' : fmtPrice(etab.deliveryFee)}</span>}
          {etab.rating != null && <span>⭐ {etab.rating.toFixed(1)}{etab.reviewCount ? ` (${etab.reviewCount})` : ''}</span>}
          {etab.address && <span>📍 {etab.address}</span>}
        </div>
        {etab.description && <p style={{ color: '#6b7280', fontSize: '.8rem', lineHeight: 1.5, marginTop: 8 }}>{etab.description}</p>}

        {!canOrder && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,45,120,.07)', border: '1px solid rgba(255,45,120,.18)', color: '#f87171', fontSize: '.78rem', fontFamily: "'Share Tech Mono',monospace" }}>
            🔴 Service fermé · {serviceCountdown}
          </div>
        )}

      </div>

      {/* Sticky category chips */}
      {cats.length > 0 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: DARK, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 16px', scrollbarWidth: 'none', maxWidth: 720, margin: '0 auto' }}>
            {[{ id: 'all', key: 'all', label: 'Tout', emoji: '', order: -1 }, ...cats].map(c => (
              <button key={c.key} onClick={() => setActiveCat(c.key)}
                style={{ flexShrink: 0, padding: '6px 16px', borderRadius: 30, border: 'none',
                  background: activeCat === c.key ? '#f0eeff' : 'rgba(255,255,255,.08)',
                  color: activeCat === c.key ? DARK : '#9ca3af',
                  fontSize: '.8rem', fontFamily: "'Share Tech Mono',monospace",
                  cursor: 'pointer', letterSpacing: '.03em', fontWeight: activeCat === c.key ? 700 : 400 }}>
                {c.emoji ? `${c.emoji} ` : ''}{c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', paddingBottom: 120 }}>
        {prods.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#4b5563', fontFamily: "'Share Tech Mono',monospace", fontSize: '.8rem' }}>Aucun produit disponible</div>
        ) : activeCat !== 'all' ? (
          /* Single category view */
          <div>
            {prods.filter(p => {
              const cat = cats.find(c => c.key === activeCat || c.id === activeCat);
              return cat ? (p.cat === cat.key || p.cat === cat.id) : p.cat === activeCat;
            }).map(p => (
              <ProductCard key={p.id} prod={p} onAdd={() => pickOrAdd(p)} disabled={!canOrder} lastAdded={lastAddedId === p.id} />
            ))}
          </div>
        ) : (
          /* All categories — Populaires + per-category sections */
          <>
            {/* 🔥 Populaires horizontal scroll */}
            {(() => {
              const popular = prods.filter(p => p.badge === 'HOT' || p.badge === 'BEST' || p.badge === 'PROMO').slice(0, 6);
              if (popular.length === 0) return null;
              return (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: '#f0eeff', fontSize: '.9rem', padding: '16px 16px 8px' }}>🔥 Populaires</div>
                  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 16px 12px', scrollbarWidth: 'none' }}>
                    {popular.map(p => {
                      const isAdded = lastAddedId === p.id;
                      const disabled = !canOrder || p.stock === 0;
                      return (
                        <div key={p.id} onClick={() => { if (!disabled) pickOrAdd(p); }}
                          style={{ flexShrink: 0, width: 148, background: isAdded ? 'rgba(34,197,94,.08)' : CARD_BG,
                            borderRadius: 16, overflow: 'hidden', cursor: disabled ? 'default' : 'pointer',
                            border: isAdded ? '1px solid rgba(34,197,94,.3)' : `1px solid ${BORDER}`,
                            boxShadow: '0 4px 18px rgba(0,0,0,.4)', transition: 'all .25s' }}>
                          <div style={{ position: 'relative', height: 105, background: 'rgba(255,255,255,.04)' }}>
                            {p.image
                              ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: disabled ? 0.35 : 1 }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', opacity: .15 }}>🍽️</div>}
                            {p.badge && <span style={{ position: 'absolute', top: 7, left: 7, background: PINK, color: '#fff', fontSize: '.55rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8 }}>{p.badge}</span>}
                          </div>
                          <div style={{ padding: '10px 11px 12px' }}>
                            <div style={{ fontWeight: 700, color: disabled ? '#4b5563' : '#f0eeff', fontSize: '.84rem', lineHeight: 1.35,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                              <span style={{ fontWeight: 800, color: disabled ? '#4b5563' : PINK, fontSize: '.88rem' }}>{fmtPrice(p.price)}</span>
                              <button onClick={e => { e.stopPropagation(); if (!disabled) pickOrAdd(p); }} disabled={disabled}
                                style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid rgba(8,5,15,.7)',
                                  background: disabled ? 'rgba(255,255,255,.1)' : isAdded ? '#22c55e' : PINK,
                                  color: '#fff', fontSize: isAdded ? '.8rem' : '1.1rem',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all .2s',
                                  boxShadow: '0 2px 10px rgba(0,0,0,.4)', fontWeight: 700 }}>
                                {disabled ? '✕' : isAdded ? '✓' : '+'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Per-category sections */}
            {cats.length > 0 ? cats.map(cat => {
              const catProds = prods.filter(p => p.cat === cat.key || p.cat === cat.id);
              if (catProds.length === 0) return null;
              return (
                <div key={cat.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: '#f0eeff', fontSize: '.9rem', padding: '16px 16px 4px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                    {cat.emoji ? `${cat.emoji} ` : ''}{cat.label}
                  </div>
                  {catProds.map(p => (
                    <ProductCard key={p.id} prod={p} onAdd={() => pickOrAdd(p)} disabled={!canOrder} lastAdded={lastAddedId === p.id} />
                  ))}
                </div>
              );
            }) : prods.map(p => (
              <ProductCard key={p.id} prod={p} onAdd={() => pickOrAdd(p)} disabled={!canOrder} lastAdded={lastAddedId === p.id} />
            ))}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1a1028', border: `1px solid ${BORDER}`, color: '#f0eeff', padding: '9px 18px', borderRadius: 10, fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: '.82rem', zIndex: 800, whiteSpace: 'nowrap' }}>{toast}</div>
      )}

      {/* Size + Extras picker */}
      {sizePickerProd && (() => {
        const sizes = parseSizes(sizePickerProd.desc || '');
        const isMixte = /mixte/i.test(sizePickerProd.name);
        const pizzasForHalf = isMixte
          ? prods.filter(p => p.id !== sizePickerProd.id && parseSizes(p.desc || '') && p.stock !== 0)
          : [];
        const suppTotal = selectedSupps.reduce((s, sid) => { const sp = supps.find(x => x.id === sid); return s + (sp ? sp.price : 0); }, 0);
        const basePrice = chosenSize ? chosenSize.price : sizePickerProd.price;
        const halfPrice = halfEnabled && halfProd && chosenSize ? (() => { const hs = parseSizes(halfProd.desc || ''); return Math.max(chosenSize.price, hs?.find(s => s.label === chosenSize.label)?.price ?? hs?.[0]?.price ?? halfProd.price); })() : basePrice;
        const total = (halfEnabled && halfProd ? halfPrice : basePrice) + suppTotal;
        const canConfirm = (!sizes || chosenSize) && (!halfEnabled || halfProd);
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 900 }} onClick={resetPicker}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.65)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#120d22',
              borderTop: `1px solid ${BORDER}`, borderRadius: '22px 22px 0 0',
              maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0 }}>
                <div style={{ width: 38, height: 4, background: 'rgba(255,255,255,.15)', borderRadius: 2 }} />
              </div>
              {/* Header */}
              <div style={{ padding: '0 20px 10px', flexShrink: 0 }}>
                {pickerStep === 'extras' && sizes && (
                  <button onClick={() => setPickerStep('size')} style={{ background: 'none', border: 'none', color: PINK, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', padding: '0 0 6px', fontFamily: "'Inter',sans-serif" }}>← Changer de taille</button>
                )}
                <div style={{ fontWeight: 800, color: '#f0eeff', fontSize: '1.1rem', marginBottom: 3, fontFamily: "'Inter',sans-serif" }}>{sizePickerProd.name}</div>
                <div style={{ color: '#9ca3af', fontSize: '.82rem', lineHeight: 1.4, fontFamily: "'Inter',sans-serif" }}>{getDisplayDesc(sizePickerProd.desc || '')}</div>
              </div>

              {/* STEP 1 — Taille */}
              {pickerStep === 'size' && sizes && (
                <div style={{ padding: '0 20px 12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#6b7280', letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: "'Inter',sans-serif", marginBottom: 10 }}>Choisir une taille</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sizes.map(size => (
                      <button key={size.label} onClick={() => { setChosenSize(size); setPickerStep('extras'); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px', borderRadius: 14,
                          border: `1.5px solid ${chosenSize?.label === size.label ? PINK : BORDER}`,
                          background: chosenSize?.label === size.label ? 'rgba(255,45,120,.08)' : 'rgba(255,255,255,.04)',
                          cursor: 'pointer', transition: 'all .15s', fontFamily: "'Inter',sans-serif" }}>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 700, color: '#f0eeff', fontSize: '.95rem' }}>{size.label}</div>
                          <div style={{ fontSize: '.73rem', color: '#6b7280', marginTop: 2 }}>
                            {size.label === 'Petite' ? '~1 pers.' : size.label === 'Grande' ? '~2-3 pers.' : size.label === 'Familiale' ? '~4-6 pers.' : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 800, color: PINK, fontSize: '1rem' }}>{fmtPrice(size.price)}</span>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: PINK, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>→</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 2 — Extras */}
              {pickerStep === 'extras' && (
                <div style={{ padding: '0 20px', overflowY: 'auto', flex: 1 }}>
                  {/* Moitié-moitié */}
                  {sizes && pizzasForHalf.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#6b7280', letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: "'Inter',sans-serif", marginBottom: 10 }}>Pizza mixte</div>
                      <button onClick={() => { setHalfEnabled(h => !h); setHalfProd(null); }}
                        style={{ width: '100%', padding: '13px 18px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          border: `1px solid ${halfEnabled ? PINK : BORDER}`, background: halfEnabled ? 'rgba(255,45,120,.1)' : 'rgba(255,255,255,.04)', cursor: 'pointer' }}>
                        <span style={{ fontWeight: 700, color: halfEnabled ? PINK : '#f0eeff', fontSize: '.9rem' }}>½ Moitié-Moitié</span>
                        <span style={{ fontSize: '1rem' }}>{halfEnabled ? '✓' : '+'}</span>
                      </button>
                      {halfEnabled && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4, fontFamily: "'Inter',sans-serif" }}>Choisir la 2e moitié :</div>
                          {pizzasForHalf.map(p => (
                            <button key={p.id} onClick={() => setHalfProd(p)}
                              style={{ padding: '11px 16px', borderRadius: 12, border: `1px solid ${halfProd?.id === p.id ? PINK : BORDER}`,
                                background: halfProd?.id === p.id ? 'rgba(255,45,120,.1)' : 'rgba(255,255,255,.04)',
                                color: halfProd?.id === p.id ? PINK : '#f0eeff', fontWeight: halfProd?.id === p.id ? 700 : 400,
                                cursor: 'pointer', textAlign: 'left', fontSize: '.88rem' }}>
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Suppléments */}
                  {supps.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#6b7280', letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: "'Inter',sans-serif", marginBottom: 10 }}>Suppléments</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {supps.map(s => {
                          const active = selectedSupps.includes(s.id);
                          return (
                            <button key={s.id} onClick={() => setSelectedSupps(prev => active ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 16px', borderRadius: 12,
                                border: `1px solid ${active ? PINK : BORDER}`,
                                background: active ? 'rgba(255,45,120,.1)' : 'rgba(255,255,255,.04)',
                                cursor: 'pointer' }}>
                              <span style={{ color: active ? PINK : '#f0eeff', fontWeight: active ? 700 : 400, fontSize: '.9rem' }}>
                                {s.emoji ? `${s.emoji} ` : ''}{s.name}
                              </span>
                              <span style={{ color: active ? PINK : '#9ca3af', fontSize: '.85rem', fontWeight: 700 }}>
                                {s.price === 0 ? 'Gratuit' : `+${fmtPrice(s.price)}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  <div style={{ marginBottom: 100 }}>
                    <div style={{ fontSize: '.7rem', fontWeight: 600, color: '#6b7280', letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: "'Inter',sans-serif", marginBottom: 8 }}>Instruction spéciale (optionnel)</div>
                    <textarea value={pickerNote} onChange={e => setPickerNote(e.target.value)}
                      placeholder="Ex: sans oignons, bien cuit..."
                      style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 12,
                        color: '#f0eeff', padding: '12px 14px', fontSize: '.85rem', resize: 'none', rows: 2,
                        fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' } as React.CSSProperties} rows={2} />
                  </div>
                </div>
              )}

              {/* Sticky add button */}
              {pickerStep === 'extras' && (
                <div style={{ padding: '12px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', flexShrink: 0, background: '#120d22', borderTop: `1px solid ${BORDER}` }}>
                  <button onClick={confirmAddToCart} disabled={!canConfirm}
                    style={{ width: '100%', padding: '15px', borderRadius: 14, background: canConfirm ? PINK : 'rgba(255,255,255,.1)',
                      border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 800, cursor: canConfirm ? 'pointer' : 'not-allowed',
                      fontFamily: "'Inter',sans-serif", letterSpacing: '.01em' }}>
                    Ajouter · {fmtPrice(total)}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Composant principal ────────────────────────────────────────────── */
export default function YassalaHomeNew({
  merchants,
  banners,
  settings,
  cart,
  onOpenCart,
  onAddToCart,
}: HomeNewProps) {
  const { resolvedTheme, setTheme, serviceMode } = useTheme();

  const canOrder = resolvedTheme === 'day' ? serviceMode.canOrderDay : serviceMode.canOrderNight;
  const currentStatus = resolvedTheme === 'day' ? serviceMode.day : serviceMode.night;
  const otherMode: 'day' | 'night' = resolvedTheme === 'day' ? 'night' : 'day';
  const otherServiceIsOpen = resolvedTheme === 'day' ? serviceMode.canOrderNight : serviceMode.canOrderDay;

  const [dayBanners,  setDayBanners]  = useState<Banner[]>([]);
  const [dayEtabs,    setDayEtabs]    = useState<Etablissement[]>([]);
  const [nightEtabs,  setNightEtabs]  = useState<Etablissement[]>([]);
  const [selectedEtab, setSelectedEtab] = useState<Etablissement | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'day_banners'), snap => {
      setDayBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)).filter(b => b.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    const u2 = onSnapshot(collection(db, 'day_etablissements'), snap => {
      setDayEtabs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Etablissement)).filter(e => e.isActive).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
    const u3 = onSnapshot(collection(db, 'night_etablissements'), snap => {
      setNightEtabs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Etablissement)).filter(e => e.isActive).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    try { setRecentIds(JSON.parse(localStorage.getItem('yassala_recent_etabs') || '[]')); } catch {}
  }, []);

  // Refresh recent list when returning from a menu
  useEffect(() => {
    if (!selectedEtab) {
      try { setRecentIds(JSON.parse(localStorage.getItem('yassala_recent_etabs') || '[]')); } catch {}
    }
  }, [selectedEtab]);

  const displayBanners = resolvedTheme === 'day' ? (dayBanners.length > 0 ? dayBanners : banners) : banners;
  const allEtabs = resolvedTheme === 'day' ? dayEtabs : (nightEtabs.length > 0 ? nightEtabs : (merchants as Etablissement[]));
  const service: 'day' | 'night' = resolvedTheme;

  const openNow    = allEtabs.filter(e => (e.isOpen ?? e.isActive) && !e.isComingSoon);
  const comingSoon = allEtabs.filter(e => e.isComingSoon);
  const recentEtabs = allEtabs.filter(e => recentIds.includes(e.id)).sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
  const handleSelectEtab = (etab: Etablissement) => {
    setSelectedEtab(etab);
    window.scrollTo(0, 0);
  };

  return (
    <>
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
            <div style={{ background: 'rgba(255,45,120,.06)', border: '1px solid rgba(255,45,120,.2)', borderRadius: 12, margin: '0 0 20px', padding: '20px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>{resolvedTheme === 'day' ? '☀️' : '🌙'}</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f0eeff' }}>Service {resolvedTheme === 'day' ? 'DAY' : 'NIGHT'} fermé</div>
              <div style={{ fontSize: '.85rem', color: '#ff6b9d', marginTop: 6 }}>Ouvre à {currentStatus.opensAt} · <span style={{ fontWeight: 600 }}>{currentStatus.countdown}</span></div>
              <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: 4 }}>Catalogue disponible · commandes désactivées</div>
              {otherServiceIsOpen && (
                <button onClick={() => setTheme(otherMode)} style={{ marginTop: 14, background: 'linear-gradient(135deg,#ff2d78,#e11d69)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer', letterSpacing: '.04em' }}>
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

          {/* ── AUTOUR DE TOI ── */}
          <section className="yn-section">
            <div style={{ padding: '0 16px 10px' }}>
              <h2 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: '1.2rem',
                color: 'var(--yn-text,#111827)', margin: 0, letterSpacing: '-.01em' }}>
                📍 Autour de toi
              </h2>
              {allEtabs.length > 0 && (
                <p style={{ fontFamily: "'Inter',sans-serif", fontSize: '.8rem',
                  color: 'var(--yn-text-muted,#9ca3af)', margin: '4px 0 0' }}>
                  {allEtabs.filter(e => (e.isOpen ?? e.isActive) && !e.isComingSoon).length} établissement{allEtabs.filter(e => (e.isOpen ?? e.isActive) && !e.isComingSoon).length !== 1 ? 's' : ''} ouvert{allEtabs.filter(e => (e.isOpen ?? e.isActive) && !e.isComingSoon).length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {allEtabs.length === 0 ? (
              <div className="yn-empty">
                <span style={{ fontSize: '3rem' }}>🏪</span>
                <p style={{ marginTop: 12, color: 'var(--yn-text-muted,#9ca3af)' }}>Aucun établissement disponible</p>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto',
                padding: '6px 16px 20px', scrollSnapType: 'x mandatory',
                scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                {allEtabs.map(e => (
                  <EtabSnapCard key={e.id} etab={e} onClick={() => handleSelectEtab(e)} isNight={resolvedTheme === 'night'} />
                ))}
              </div>
            )}
          </section>

          <div style={{ height: 32 }} />
        </main>

      </div>

      {/* ── MENU PANEL (inline, par-dessus la home) ── */}
      {selectedEtab && (
        <EtabMenuPanel
          etab={selectedEtab}
          service={service}
          canOrder={canOrder}
          serviceCountdown={currentStatus.countdown}
          onClose={() => setSelectedEtab(null)}
          onAddItem={(id, name, price) => onAddToCart({ id, name, price, qty: 1, desc: '', image: '', cat: '', badge: '', stock: 99 } as unknown as Product)}
          onOpenCart={onOpenCart}
        />
      )}
    </>
  );
}
