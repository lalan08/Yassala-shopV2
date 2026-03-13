'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { useTheme } from '@/context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Etab = {
  id: string; name: string; description?: string; address?: string;
  phone?: string; logoUrl?: string; coverUrl?: string; openHours?: string;
  isActive: boolean; category?: string; emoji?: string;
  deliveryMin?: number; deliveryMax?: number; deliveryFee?: number;
  rating?: number; reviewCount?: number; isComingSoon?: boolean; isOpen?: boolean;
};

type Cat  = { id: string; key: string; label: string; emoji: string; order: number; };
type Prod = { id: string; name: string; desc: string; price: number; image: string; cat: string; badge?: string; stock?: number; isActive?: boolean; };
type CartItem = { id: string; name: string; price: number; qty: number; };

// ─── Design tokens ────────────────────────────────────────────────────────────

const GOLD   = '#fbbf24';
const DARK   = '#08050f';
const CARD   = '#0e0a1a';
const BORDER = 'rgba(251,191,36,.15)';
const MONO   = "'Share Tech Mono',monospace";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(p: number) {
  return p.toFixed(2).replace('.', ',') + ' €';
}

function cartTotal(cart: CartItem[]) {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function saveRecent(etabId: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('yassala_recent_etabs') || '[]';
    const list: string[] = JSON.parse(raw);
    const updated = [etabId, ...list.filter(x => x !== etabId)].slice(0, 10);
    localStorage.setItem('yassala_recent_etabs', JSON.stringify(updated));
  } catch { /* ignore */ }
}

// ─── Components ──────────────────────────────────────────────────────────────

function Badge({ children, color = GOLD }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      background: `${color}22`, color, fontSize: '.72rem',
      fontFamily: MONO, letterSpacing: '.06em',
    }}>
      {children}
    </span>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, padding: '7px 16px', borderRadius: 20,
      border: active ? `1.5px solid ${GOLD}` : '1.5px solid rgba(255,255,255,.1)',
      background: active ? `${GOLD}18` : 'transparent',
      color: active ? GOLD : '#9ca3af', fontSize: '.83rem',
      fontFamily: MONO, cursor: 'pointer', letterSpacing: '.04em',
      transition: 'all .15s',
    }}>
      {label}
    </button>
  );
}

function ProductCard({ prod, onAdd, disabled }: { prod: Prod; onAdd: () => void; disabled: boolean }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {prod.image ? (
        <div style={{ height: 140, overflow: 'hidden', position: 'relative' }}>
          <img src={prod.image} alt={prod.name} style={{
            width: '100%', height: '100%', objectFit: 'cover',
          }} />
          {prod.badge && (
            <span style={{
              position: 'absolute', top: 8, left: 8,
              background: '#ff2d78', color: '#fff',
              fontSize: '.68rem', fontFamily: MONO,
              padding: '2px 8px', borderRadius: 4, letterSpacing: '.06em',
            }}>{prod.badge}</span>
          )}
        </div>
      ) : (
        <div style={{
          height: 140, background: 'rgba(251,191,36,.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2.5rem',
        }}>🍽️</div>
      )}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontWeight: 600, color: '#f0eeff', fontSize: '.9rem', lineHeight: 1.3 }}>{prod.name}</div>
        {prod.desc && (
          <div style={{ color: '#6b7280', fontSize: '.78rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {prod.desc}
          </div>
        )}
        <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: GOLD, fontFamily: MONO, fontWeight: 700, fontSize: '.95rem' }}>
            {formatPrice(prod.price)}
          </span>
          <button
            onClick={disabled ? undefined : onAdd}
            disabled={disabled}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: `1.5px solid ${disabled ? 'rgba(255,255,255,.1)' : GOLD}`,
              background: disabled ? 'transparent' : `${GOLD}18`,
              color: disabled ? '#4b5563' : GOLD,
              fontSize: '1.2rem', lineHeight: 1, cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .15s',
            }}
            title={disabled ? 'Service fermé' : 'Ajouter au panier'}
          >+</button>
        </div>
      </div>
    </div>
  );
}

// Cart item row
function CartRow({ item, onInc, onDec }: { item: CartItem; onInc: () => void; onDec: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ flex: 1, color: '#f0eeff', fontSize: '.88rem' }}>{item.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onDec} style={{
          width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(255,255,255,.15)',
          background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>−</button>
        <span style={{ fontFamily: MONO, color: GOLD, minWidth: 18, textAlign: 'center', fontSize: '.88rem' }}>{item.qty}</span>
        <button onClick={onInc} style={{
          width: 26, height: 26, borderRadius: '50%', border: `1px solid ${GOLD}`,
          background: `${GOLD}18`, color: GOLD, cursor: 'pointer', fontSize: '.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
      </div>
      <div style={{ fontFamily: MONO, color: '#f0eeff', fontSize: '.88rem', minWidth: 56, textAlign: 'right' }}>
        {formatPrice(item.price * item.qty)}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ShopEtabPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { resolvedTheme, serviceMode } = useTheme();

  const [etab,    setEtab]    = useState<Etab | null>(null);
  const [cats,    setCats]    = useState<Cat[]>([]);
  const [prods,   setProds]   = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeCat, setActiveCat] = useState('all');
  const [cart,      setCart]      = useState<CartItem[]>([]);
  const [cartOpen,  setCartOpen]  = useState(false);

  // Checkout form
  const [step,    setStep]    = useState<'cart' | 'form' | 'done'>('cart');
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast,      setToast]      = useState('');

  const catsRef = useRef<HTMLDivElement>(null);

  const canOrder = resolvedTheme === 'day' ? serviceMode.canOrderDay : serviceMode.canOrderNight;
  const serviceStatus = resolvedTheme === 'day' ? serviceMode.day : serviceMode.night;

  // ── Load establishment ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'day_etablissements', id)).then(snap => {
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() } as Etab;
      setEtab(data);
      setLoading(false);
      saveRecent(id);
    });
  }, [id]);

  // ── Load categories ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'day_categories'), where('etablissementId', '==', id));
    return onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Cat))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setCats(list);
    });
  }, [id]);

  // ── Load products ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'day_products'), where('etablissementId', '==', id));
    return onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Prod))
        .filter(p => p.isActive !== false);
      setProds(list);
    });
  }, [id]);

  // ── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = (prod: Prod) => {
    if (!canOrder) { setToast(`Service fermé · ${serviceStatus.countdown}`); return; }
    setCart(prev => {
      const existing = prev.find(i => i.id === prod.id);
      if (existing) return prev.map(i => i.id === prod.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: prod.id, name: prod.name, price: prod.price, qty: 1 }];
    });
  };

  const incItem = (id: string) => setCart(prev => prev.map(i => i.id === id ? { ...i, qty: i.qty + 1 } : i));
  const decItem = (id: string) => setCart(prev => {
    const item = prev.find(i => i.id === id);
    if (!item) return prev;
    if (item.qty <= 1) return prev.filter(i => i.id !== id);
    return prev.map(i => i.id === id ? { ...i, qty: i.qty - 1 } : i);
  });

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const total    = cartTotal(cart);

  // ── Submit order ──────────────────────────────────────────────────────────
  const submitOrder = async () => {
    if (!name.trim() || !phone.trim()) { setToast('Nom et téléphone requis'); return; }
    if (!canOrder) { setToast(`Service fermé · ${serviceStatus.countdown}`); return; }
    setSubmitting(true);
    try {
      const itemsStr = cart.map(i => `${i.qty}x ${i.name} (${formatPrice(i.price)})`).join(', ');
      await addDoc(collection(db, 'orders'), {
        items: itemsStr,
        total,
        status: 'nouveau',
        createdAt: new Date().toISOString(),
        phone: phone.trim(),
        name: name.trim(),
        address: address.trim(),
        fulfillmentType: 'delivery',
        paidOnline: false,
        etablissementId: id,
        etablissementName: etab?.name || '',
        service: resolvedTheme,
      });
      setCart([]);
      setStep('done');
    } catch (e) {
      console.error(e);
      setToast('Erreur lors de la commande, réessayez');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filtered products ─────────────────────────────────────────────────────
  const visibleProds = activeCat === 'all' ? prods : prods.filter(p => p.cat === activeCat);

  // ── Render states ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#4b5563', fontFamily: MONO, fontSize: '.88rem' }}>Chargement…</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ fontSize: '3rem' }}>🔍</div>
      <div style={{ color: '#f0eeff', fontFamily: MONO, fontSize: '1rem' }}>Établissement introuvable</div>
      <button onClick={() => router.push('/')} style={{
        padding: '10px 24px', borderRadius: 8, border: `1px solid ${GOLD}`,
        background: `${GOLD}18`, color: GOLD, cursor: 'pointer', fontFamily: MONO, fontSize: '.83rem',
      }}>← Retour</button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: '#f0eeff', fontFamily: "'Inter',sans-serif" }}>

      {/* ── Cover + header ── */}
      <div style={{ position: 'relative', height: 220, background: '#1a1028', overflow: 'hidden' }}>
        {etab?.coverUrl ? (
          <img src={etab.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: .65 }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, ${etab?.bgColor || '#1a1028'} 0%, #08050f 100%)`,
          }} />
        )}
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          style={{
            position: 'absolute', top: 16, left: 16, width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(8,5,15,.75)', border: '1px solid rgba(255,255,255,.15)',
            color: '#f0eeff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
          }}
        >←</button>
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
          background: `linear-gradient(to top, ${DARK}, transparent)`,
        }} />
      </div>

      {/* ── Etab info bar ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: -36, position: 'relative' }}>
          {/* Logo */}
          <div style={{
            width: 72, height: 72, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
            border: `2px solid ${BORDER}`, background: CARD,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem',
          }}>
            {etab?.logoUrl
              ? <img src={etab.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (etab?.emoji || '🏪')}
          </div>
          <div style={{ flex: 1, paddingBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f0eeff' }}>{etab?.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
              {etab?.category && <span style={{ color: '#9ca3af', fontSize: '.78rem' }}>{etab.category}</span>}
              <Badge color={canOrder ? '#b8ff00' : '#ff2d78'}>
                {canOrder ? '🟢 Ouvert' : '🔴 Fermé'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14, color: '#9ca3af', fontSize: '.8rem' }}>
          {(etab?.deliveryMin || etab?.deliveryMax) && (
            <span>⏱ {etab.deliveryMin}–{etab.deliveryMax} min</span>
          )}
          {etab?.deliveryFee !== undefined && (
            <span>🛵 Livraison {etab.deliveryFee === 0 ? 'gratuite' : formatPrice(etab.deliveryFee)}</span>
          )}
          {etab?.rating && (
            <span>⭐ {etab.rating.toFixed(1)}{etab.reviewCount ? ` (${etab.reviewCount})` : ''}</span>
          )}
          {etab?.address && <span>📍 {etab.address}</span>}
        </div>

        {etab?.description && (
          <p style={{ color: '#6b7280', fontSize: '.83rem', lineHeight: 1.5, marginTop: 10 }}>{etab.description}</p>
        )}

        {/* Service closed banner */}
        {!canOrder && (
          <div style={{
            marginTop: 14, padding: '12px 16px', borderRadius: 8,
            background: 'rgba(255,45,120,.08)', border: '1px solid rgba(255,45,120,.2)',
            color: '#ff6b9d', fontFamily: MONO, fontSize: '.8rem',
          }}>
            🔴 Service {resolvedTheme === 'day' ? 'DAY' : 'NIGHT'} fermé · {serviceStatus.countdown}
          </div>
        )}

        {/* ── Category chips ── */}
        {cats.length > 0 && (
          <div ref={catsRef} style={{
            display: 'flex', gap: 8, overflowX: 'auto', padding: '16px 0 8px',
            scrollbarWidth: 'none', msOverflowStyle: 'none',
          }}>
            <Chip label="Tout" active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
            {cats.map(c => (
              <Chip key={c.id} label={`${c.emoji} ${c.label}`} active={activeCat === c.key} onClick={() => setActiveCat(c.key)} />
            ))}
          </div>
        )}

        {/* ── Products grid ── */}
        <div style={{ marginTop: 8, marginBottom: 100 }}>
          {visibleProds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#4b5563', fontFamily: MONO, fontSize: '.83rem' }}>
              Aucun produit disponible
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 14,
            }}>
              {visibleProds.map(p => (
                <ProductCard key={p.id} prod={p} onAdd={() => addToCart(p)} disabled={!canOrder} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Floating cart button ── */}
      {totalQty > 0 && !cartOpen && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <button
            onClick={() => { setCartOpen(true); setStep('cart'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: `linear-gradient(135deg, ${GOLD}, #f59e0b)`,
              border: 'none', borderRadius: 30, padding: '14px 28px',
              color: '#000', fontFamily: MONO, fontSize: '.88rem', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 8px 32px rgba(251,191,36,.35)',
              letterSpacing: '.05em',
            }}
          >
            <span style={{
              background: 'rgba(0,0,0,.2)', borderRadius: '50%',
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.78rem', fontWeight: 700,
            }}>{totalQty}</span>
            Voir mon panier
            <span>{formatPrice(total)}</span>
          </button>
        </div>
      )}

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
          onClick={e => { if (e.target === e.currentTarget) setCartOpen(false); }}
        >
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />

          {/* Drawer */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            maxHeight: '85vh', background: '#0e0a1a',
            borderTop: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,.15)', borderRadius: 2 }} />
            </div>

            {/* Header */}
            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: MONO, color: '#f0eeff', fontSize: '.9rem', letterSpacing: '.06em' }}>
                {step === 'done' ? '✅ COMMANDE ENVOYÉE' : step === 'form' ? '📋 VOS INFORMATIONS' : `🛒 MON PANIER (${totalQty})`}
              </span>
              <button onClick={() => setCartOpen(false)} style={{
                background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.2rem',
              }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>

              {/* ── Step: cart ── */}
              {step === 'cart' && (
                <>
                  {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563', fontFamily: MONO, fontSize: '.83rem' }}>
                      Votre panier est vide
                    </div>
                  ) : (
                    cart.map(item => (
                      <CartRow key={item.id} item={item} onInc={() => incItem(item.id)} onDec={() => decItem(item.id)} />
                    ))
                  )}
                </>
              )}

              {/* ── Step: form ── */}
              {step === 'form' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: MONO, fontSize: '.72rem', color: '#7a7490', letterSpacing: '.08em', marginBottom: 6 }}>NOM *</label>
                    <input
                      value={name} onChange={e => setName(e.target.value)}
                      placeholder="Votre prénom et nom"
                      style={{ width: '100%', background: DARK, border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '11px 14px', color: '#f0eeff', fontSize: '.9rem', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: MONO, fontSize: '.72rem', color: '#7a7490', letterSpacing: '.08em', marginBottom: 6 }}>TÉLÉPHONE *</label>
                    <input
                      value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="0694 00 00 00"
                      type="tel"
                      style={{ width: '100%', background: DARK, border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '11px 14px', color: '#f0eeff', fontSize: '.9rem', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: MONO, fontSize: '.72rem', color: '#7a7490', letterSpacing: '.08em', marginBottom: 6 }}>ADRESSE DE LIVRAISON</label>
                    <input
                      value={address} onChange={e => setAddress(e.target.value)}
                      placeholder="Rue, quartier, ville"
                      style={{ width: '100%', background: DARK, border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '11px 14px', color: '#f0eeff', fontSize: '.9rem', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* Order recap */}
                  <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px', marginTop: 4 }}>
                    <div style={{ fontFamily: MONO, fontSize: '.72rem', color: '#7a7490', letterSpacing: '.08em', marginBottom: 8 }}>RÉCAP</div>
                    {cart.map(i => (
                      <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', color: '#9ca3af', padding: '3px 0' }}>
                        <span>{i.qty}x {i.name}</span>
                        <span>{formatPrice(i.price * i.qty)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontFamily: MONO, color: GOLD, fontSize: '.88rem', fontWeight: 700 }}>
                      <span>TOTAL</span>
                      <span>{formatPrice(total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step: done ── */}
              {step === 'done' && (
                <div style={{ textAlign: 'center', padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: '3rem' }}>🎉</div>
                  <div style={{ color: '#f0eeff', fontSize: '1rem', fontWeight: 600 }}>Commande reçue !</div>
                  <div style={{ color: '#9ca3af', fontSize: '.83rem', lineHeight: 1.5 }}>
                    Nous avons bien reçu votre commande.<br />
                    Vous serez contacté sur le {phone}.
                  </div>
                  <button
                    onClick={() => { setCartOpen(false); setStep('cart'); }}
                    style={{
                      marginTop: 8, padding: '12px 28px', borderRadius: 8,
                      background: `${GOLD}18`, border: `1px solid ${GOLD}`,
                      color: GOLD, cursor: 'pointer', fontFamily: MONO, fontSize: '.83rem',
                    }}
                  >Fermer</button>
                </div>
              )}
            </div>

            {/* Footer CTA */}
            {step !== 'done' && (
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}` }}>
                {step === 'cart' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, fontFamily: MONO, fontSize: '.9rem' }}>
                      <span style={{ color: '#6b7280', fontSize: '.75rem' }}>TOTAL </span>
                      <span style={{ color: GOLD, fontWeight: 700 }}>{formatPrice(total)}</span>
                    </div>
                    <button
                      onClick={() => cart.length > 0 && setStep('form')}
                      disabled={cart.length === 0}
                      style={{
                        padding: '12px 28px', borderRadius: 8, border: 'none',
                        background: cart.length > 0 ? `linear-gradient(135deg,${GOLD},#f59e0b)` : 'rgba(255,255,255,.08)',
                        color: cart.length > 0 ? '#000' : '#4b5563',
                        fontFamily: MONO, fontSize: '.85rem', fontWeight: 700, cursor: cart.length > 0 ? 'pointer' : 'not-allowed',
                        letterSpacing: '.06em',
                      }}
                    >Commander →</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setStep('cart')}
                      style={{
                        padding: '12px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                        background: 'transparent', color: '#9ca3af', fontFamily: MONO, fontSize: '.83rem', cursor: 'pointer',
                      }}
                    >← Retour</button>
                    <button
                      onClick={submitOrder}
                      disabled={submitting}
                      style={{
                        flex: 1, padding: '12px 0', borderRadius: 8, border: 'none',
                        background: submitting ? 'rgba(255,255,255,.08)' : `linear-gradient(135deg,${GOLD},#f59e0b)`,
                        color: submitting ? '#4b5563' : '#000',
                        fontFamily: MONO, fontSize: '.85rem', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
                        letterSpacing: '.06em',
                      }}
                    >{submitting ? 'Envoi…' : 'Confirmer la commande ✓'}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1028', border: `1px solid ${BORDER}`, color: '#f0eeff',
          padding: '10px 20px', borderRadius: 8, fontFamily: MONO, fontSize: '.8rem',
          zIndex: 300, whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  );
}
