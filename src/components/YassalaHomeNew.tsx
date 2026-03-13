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

/* ─── En-tête de section ─────────────────────────────────────────────── */
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="yn-section-header">
      <h2 className="yn-section-title">{title}</h2>
    </div>
  );
}

/* ─── Carte établissement ────────────────────────────────────────────── */
function EtabCard({ etab, service, onClick }: { etab: Etablissement; service: 'day' | 'night'; onClick: () => void }) {
  const isOpen = etab.isOpen ?? etab.isActive;
  return (
    <button onClick={onClick} className="yn-etab-card" style={{ textDecoration: 'none', display: 'block', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      {/* Cover */}
      <div style={{ position: 'relative', height: 160, overflow: 'hidden', borderRadius: '14px 14px 0 0', background: etab.bgColor || (service === 'night' ? '#1a0a2e' : '#fef3c7'), flexShrink: 0 }}>
        {etab.coverUrl ? (
          <img src={etab.coverUrl} alt={etab.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem' }}>
            {etab.emoji || '🏪'}
          </div>
        )}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          {etab.logoUrl ? (
            <img src={etab.logoUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--yn-border, #e5e7eb)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: service === 'night' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#ff2d78,#e11d69)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>
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

        <div style={{
          textAlign: 'center',
          background: 'linear-gradient(135deg,#ff2d78,#e11d69)',
          color: '#fff', borderRadius: 8, padding: '8px 0',
          fontSize: '.82rem', fontWeight: 700, letterSpacing: '.04em',
        }}>
          Voir le menu →
        </div>
      </div>
    </button>
  );
}

/* ─── Slider horizontal ──────────────────────────────────────────────── */
function EtabSlider({ title, etabs, service, onSelect }: { title: string; etabs: Etablissement[]; service: 'day' | 'night'; onSelect: (e: Etablissement) => void }) {
  if (etabs.length === 0) return null;
  return (
    <section className="yn-section">
      <SectionHeader title={title} />
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {etabs.map(e => (
          <div key={e.id} style={{ minWidth: 240, maxWidth: 260, flex: '0 0 auto', scrollSnapAlign: 'start' }}>
            <EtabCard etab={e} service={service} onClick={() => onSelect(e)} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Grille établissements ──────────────────────────────────────────── */
function EtabGrid({ title, etabs, service, onSelect }: { title: string; etabs: Etablissement[]; service: 'day' | 'night'; onSelect: (e: Etablissement) => void }) {
  if (etabs.length === 0) return null;
  return (
    <section className="yn-section">
      <SectionHeader title={title} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
        {etabs.map(e => <EtabCard key={e.id} etab={e} service={service} onClick={() => onSelect(e)} />)}
      </div>
    </section>
  );
}

/* ─── Panel menu établissement (plein-écran inline) ─────────────────── */
const PINK   = '#ff2d78';
const DARK   = '#08050f';
const CARD_BG = '#0e0a1a';
const BORDER = 'rgba(255,45,120,.18)';

function ProductCard({ prod, onAdd, disabled }: { prod: EtabProd; onAdd: () => void; disabled: boolean }) {
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {prod.image ? (
        <div style={{ height: 130, overflow: 'hidden', position: 'relative' }}>
          <img src={prod.image} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {prod.badge && (
            <span style={{ position: 'absolute', top: 8, left: 8, background: PINK, color: '#fff', fontSize: '.65rem', fontFamily: "'Share Tech Mono',monospace", padding: '2px 7px', borderRadius: 4, letterSpacing: '.06em' }}>{prod.badge}</span>
          )}
        </div>
      ) : (
        <div style={{ height: 130, background: 'rgba(255,45,120,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>🍽️</div>
      )}
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontWeight: 600, color: '#f0eeff', fontSize: '.88rem', lineHeight: 1.3 }}>{prod.name}</div>
        {prod.desc && (
          <div style={{ color: '#6b7280', fontSize: '.75rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{prod.desc}</div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: PINK, fontFamily: "'Share Tech Mono',monospace", fontWeight: 700, fontSize: '.92rem' }}>{fmtPrice(prod.price)}</span>
          <button onClick={disabled ? undefined : onAdd} disabled={disabled} style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${disabled ? 'rgba(255,255,255,.08)' : PINK}`, background: disabled ? 'transparent' : `${PINK}22`, color: disabled ? '#374151' : PINK, fontSize: '1.2rem', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>+</button>
        </div>
      </div>
    </div>
  );
}

function EtabMenuPanel({ etab, service, canOrder, serviceCountdown, onClose }: {
  etab: Etablissement;
  service: 'day' | 'night';
  canOrder: boolean;
  serviceCountdown: string;
  onClose: () => void;
}) {
  const [cats,  setCats]  = useState<EtabCat[]>([]);
  const [prods, setProds] = useState<EtabProd[]>([]);
  const [activeCat, setActiveCat] = useState('all');
  const [cart, setCart]   = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [step, setStep]   = useState<'cart' | 'form' | 'done'>('cart');
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const coll = service === 'day' ? 'day' : 'night';

  useEffect(() => {
    saveRecent(etab.id);
    const q1 = query(collection(db, `${coll}_categories`), where('etablissementId', '==', etab.id));
    const q2 = query(collection(db, `${coll}_products`),   where('etablissementId', '==', etab.id));
    const u1 = onSnapshot(q1, snap => setCats(snap.docs.map(d => ({ id: d.id, ...d.data() } as EtabCat)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
    const u2 = onSnapshot(q2, snap => setProds(snap.docs.map(d => ({ id: d.id, ...d.data() } as EtabProd)).filter(p => p.isActive !== false)));
    return () => { u1(); u2(); };
  }, [etab.id, coll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const addToCart = (prod: EtabProd) => {
    if (!canOrder) { setToast(`Service fermé · ${serviceCountdown}`); return; }
    setCart(prev => {
      const existing = prev.find(i => i.id === prod.id);
      if (existing) return prev.map(i => i.id === prod.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: prod.id, name: prod.name, price: prod.price, qty: 1 }];
    });
  };
  const inc = (id: string) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i));
  const dec = (id: string) => setCart(prev => {
    const item = prev.find(i => i.id === id);
    if (!item) return prev;
    if (item.qty <= 1) return prev.filter(i => i.id !== id);
    return prev.map(i => i.id === id ? { ...i, qty: i.qty - 1 } : i);
  });

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const total    = cartTotal(cart);

  const submitOrder = async () => {
    if (!name.trim() || !phone.trim()) { setToast('Nom et téléphone requis'); return; }
    if (!canOrder) { setToast(`Service fermé · ${serviceCountdown}`); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'orders'), {
        items: cart.map(i => `${i.qty}x ${i.name} (${fmtPrice(i.price)})`).join(', '),
        total, status: 'nouveau',
        createdAt: new Date().toISOString(),
        phone: phone.trim(), name: name.trim(), address: address.trim(),
        fulfillmentType: 'delivery', paidOnline: false,
        etablissementId: etab.id, etablissementName: etab.name, service: coll,
      });
      setCart([]); setStep('done');
    } catch { setToast('Erreur, réessayez'); }
    finally { setSubmitting(false); }
  };

  const visibleProds = activeCat === 'all' ? prods : prods.filter(p => p.cat === activeCat);

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

        {/* Category chips */}
        {cats.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 0 6px', scrollbarWidth: 'none' }}>
            {[{ key: 'all', label: 'Tout', emoji: '' }, ...cats].map(c => (
              <button key={c.key} onClick={() => setActiveCat(c.key)} style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: activeCat === c.key ? `1.5px solid ${PINK}` : '1.5px solid rgba(255,255,255,.1)', background: activeCat === c.key ? `${PINK}22` : 'transparent', color: activeCat === c.key ? PINK : '#9ca3af', fontSize: '.8rem', fontFamily: "'Share Tech Mono',monospace", cursor: 'pointer', letterSpacing: '.03em' }}>
                {'emoji' in c && c.emoji ? `${c.emoji} ` : ''}{c.label}
              </button>
            ))}
          </div>
        )}

        {/* Products grid */}
        <div style={{ marginBottom: 100, marginTop: 8 }}>
          {visibleProds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#4b5563', fontFamily: "'Share Tech Mono',monospace", fontSize: '.8rem' }}>Aucun produit disponible</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
              {visibleProds.map(p => <ProductCard key={p.id} prod={p} onAdd={() => addToCart(p)} disabled={!canOrder} />)}
            </div>
          )}
        </div>
      </div>

      {/* Floating cart button */}
      {totalQty > 0 && !cartOpen && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 600 }}>
          <button onClick={() => { setCartOpen(true); setStep('cart'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: `linear-gradient(135deg,${PINK},#e11d69)`, border: 'none', borderRadius: 30, padding: '13px 26px', color: '#fff', fontFamily: "'Share Tech Mono',monospace", fontSize: '.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 32px rgba(255,45,120,.4)', letterSpacing: '.05em' }}>
            <span style={{ background: 'rgba(0,0,0,.2)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700 }}>{totalQty}</span>
            Voir mon panier
            <span>{fmtPrice(total)}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 700 }} onClick={e => { if (e.target === e.currentTarget) setCartOpen(false); }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85vh', background: '#0e0a1a', borderTop: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,.15)', borderRadius: 2 }} />
            </div>
            {/* Header */}
            <div style={{ padding: '14px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: "'Share Tech Mono',monospace", color: '#f0eeff', fontSize: '.88rem', letterSpacing: '.06em' }}>
                {step === 'done' ? '✅ COMMANDE ENVOYÉE' : step === 'form' ? '📋 VOS INFORMATIONS' : `🛒 PANIER (${totalQty})`}
              </span>
              <button onClick={() => setCartOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
              {step === 'cart' && (
                cart.length === 0
                  ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563', fontFamily: "'Share Tech Mono',monospace", fontSize: '.8rem' }}>Panier vide</div>
                  : cart.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                      <div style={{ flex: 1, color: '#f0eeff', fontSize: '.85rem' }}>{item.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <button onClick={() => dec(item.id)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(255,255,255,.15)', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontFamily: "'Share Tech Mono',monospace", color: PINK, minWidth: 18, textAlign: 'center', fontSize: '.85rem' }}>{item.qty}</span>
                        <button onClick={() => inc(item.id)} style={{ width: 26, height: 26, borderRadius: '50%', border: `1px solid ${PINK}`, background: `${PINK}22`, color: PINK, cursor: 'pointer', fontSize: '.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                      <div style={{ fontFamily: "'Share Tech Mono',monospace", color: '#f0eeff', fontSize: '.85rem', minWidth: 54, textAlign: 'right' }}>{fmtPrice(item.price * item.qty)}</div>
                    </div>
                  ))
              )}
              {step === 'form' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 }}>
                  {[['NOM *', name, setName, 'Votre prénom et nom', 'text'], ['TÉLÉPHONE *', phone, setPhone, '0694 00 00 00', 'tel'], ['ADRESSE', address, setAddress, 'Rue, quartier, ville', 'text']].map(([label, val, setter, ph, type]) => (
                    <div key={label as string}>
                      <label style={{ display: 'block', fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', color: '#7a7490', letterSpacing: '.08em', marginBottom: 5 }}>{label as string}</label>
                      <input value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder={ph as string} type={type as string} style={{ width: '100%', background: DARK, border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 13px', color: '#f0eeff', fontSize: '.88rem', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: '.7rem', color: '#7a7490', letterSpacing: '.08em', marginBottom: 8 }}>RÉCAP</div>
                    {cart.map(i => (
                      <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: '#9ca3af', padding: '2px 0' }}>
                        <span>{i.qty}x {i.name}</span><span>{fmtPrice(i.price * i.qty)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontFamily: "'Share Tech Mono',monospace", color: PINK, fontSize: '.85rem', fontWeight: 700 }}>
                      <span>TOTAL</span><span>{fmtPrice(total)}</span>
                    </div>
                  </div>
                </div>
              )}
              {step === 'done' && (
                <div style={{ textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: '3rem' }}>🎉</div>
                  <div style={{ color: '#f0eeff', fontSize: '.95rem', fontWeight: 600 }}>Commande reçue !</div>
                  <div style={{ color: '#9ca3af', fontSize: '.8rem', lineHeight: 1.5 }}>Nous vous contacterons sur le {phone}.</div>
                  <button onClick={() => { setCartOpen(false); setStep('cart'); }} style={{ marginTop: 8, padding: '11px 26px', borderRadius: 8, background: `${PINK}18`, border: `1px solid ${PINK}`, color: PINK, cursor: 'pointer', fontFamily: "'Share Tech Mono',monospace", fontSize: '.8rem' }}>Fermer</button>
                </div>
              )}
            </div>
            {/* Footer CTA */}
            {step !== 'done' && (
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}` }}>
                {step === 'cart' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, fontFamily: "'Share Tech Mono',monospace", fontSize: '.88rem' }}>
                      <span style={{ color: '#6b7280', fontSize: '.72rem' }}>TOTAL </span>
                      <span style={{ color: PINK, fontWeight: 700 }}>{fmtPrice(total)}</span>
                    </div>
                    <button onClick={() => cart.length > 0 && setStep('form')} disabled={cart.length === 0} style={{ padding: '11px 26px', borderRadius: 8, border: 'none', background: cart.length > 0 ? `linear-gradient(135deg,${PINK},#e11d69)` : 'rgba(255,255,255,.07)', color: cart.length > 0 ? '#fff' : '#4b5563', fontFamily: "'Share Tech Mono',monospace", fontSize: '.83rem', fontWeight: 700, cursor: cart.length > 0 ? 'pointer' : 'not-allowed', letterSpacing: '.05em' }}>Commander →</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setStep('cart')} style={{ padding: '11px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: '#9ca3af', fontFamily: "'Share Tech Mono',monospace", fontSize: '.8rem', cursor: 'pointer' }}>← Retour</button>
                    <button onClick={submitOrder} disabled={submitting} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: submitting ? 'rgba(255,255,255,.07)' : `linear-gradient(135deg,${PINK},#e11d69)`, color: submitting ? '#4b5563' : '#fff', fontFamily: "'Share Tech Mono',monospace", fontSize: '.83rem', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', letterSpacing: '.05em' }}>{submitting ? 'Envoi…' : 'Confirmer ✓'}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1a1028', border: `1px solid ${BORDER}`, color: '#f0eeff', padding: '9px 18px', borderRadius: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: '.78rem', zIndex: 800, whiteSpace: 'nowrap' }}>{toast}</div>
      )}
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
}: HomeNewProps) {
  const { resolvedTheme, setTheme, serviceMode } = useTheme();

  const canOrder = resolvedTheme === 'day' ? serviceMode.canOrderDay : serviceMode.canOrderNight;
  const currentStatus = resolvedTheme === 'day' ? serviceMode.day : serviceMode.night;
  const otherMode: 'day' | 'night' = resolvedTheme === 'day' ? 'night' : 'day';
  const otherServiceIsOpen = resolvedTheme === 'day' ? serviceMode.canOrderNight : serviceMode.canOrderDay;

  const [dayBanners, setDayBanners] = useState<Banner[]>([]);
  const [dayEtabs,   setDayEtabs]   = useState<Etablissement[]>([]);
  const [selectedEtab, setSelectedEtab] = useState<Etablissement | null>(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'day_banners'), snap => {
      setDayBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)).filter(b => b.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });
    const u2 = onSnapshot(collection(db, 'day_etablissements'), snap => {
      setDayEtabs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Etablissement)).filter(e => e.isActive).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });
    return () => { u1(); u2(); };
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
  const allEtabs = resolvedTheme === 'day' ? dayEtabs : (merchants as Etablissement[]);
  const service: 'day' | 'night' = resolvedTheme;

  const openNow    = allEtabs.filter(e => (e.isOpen ?? e.isActive) && !e.isComingSoon);
  const comingSoon = allEtabs.filter(e => e.isComingSoon);
  const recentEtabs = allEtabs.filter(e => recentIds.includes(e.id)).sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

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

          {/* ── ÉTABLISSEMENTS ── */}
          {allEtabs.length === 0 ? (
            <div className="yn-empty">
              <span style={{ fontSize: '3rem' }}>🏪</span>
              <p style={{ marginTop: 12, color: 'var(--yn-text-muted,#9ca3af)' }}>Aucun établissement disponible</p>
            </div>
          ) : (
            <>
              {openNow.length > 0 && <EtabSlider title="🟢 Ouverts maintenant" etabs={openNow} service={service} onSelect={handleSelectEtab} />}
              {recentEtabs.length > 0 && <EtabSlider title="🕐 Récemment consultés" etabs={recentEtabs} service={service} onSelect={handleSelectEtab} />}
              <EtabGrid title={resolvedTheme === 'day' ? '🏪 Tous les restaurants' : '🌙 Partenaires nuit'} etabs={allEtabs} service={service} onSelect={handleSelectEtab} />
              {comingSoon.length > 0 && <EtabSlider title="🔜 Bientôt disponibles" etabs={comingSoon} service={service} onSelect={handleSelectEtab} />}
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

      {/* ── MENU PANEL (inline, par-dessus la home) ── */}
      {selectedEtab && (
        <EtabMenuPanel
          etab={selectedEtab}
          service={service}
          canOrder={canOrder}
          serviceCountdown={currentStatus.countdown}
          onClose={() => setSelectedEtab(null)}
        />
      )}
    </>
  );
}
