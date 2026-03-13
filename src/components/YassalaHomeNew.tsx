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
};
export type CartItem = { id: string; name: string; price: number; qty: number; };

interface HomeNewProps {
  products:         Product[];
  categories:       Category[];
  /** night_etablissements (utilisé en mode NIGHT) */
  merchants:        Etablissement[];
  /** banners collection (nuit) – utilisé comme fallback */
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

/* ─── Hero carrousel — bannière libre, aucune information dessus ─────── */
function HeroBanner({ banners }: { banners: Banner[] }) {
  const { resolvedTheme } = useTheme();
  const [idx, setIdx] = useState(0);

  // Même filtre que YassalaDayView : active !== false (affiche tout sauf explicitement désactivé)
  const active = banners
    .filter(b => b.active !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

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
      {/* Couche 1 : gradient de fond */}
      <div
        className="yn-hero-bg"
        style={{ background: current?.gradient || fallbackGradient }}
      />
      {/* Couche 2 : image par-dessus (2 divs séparés comme YassalaDayView) */}
      {current?.image && (
        <div
          className="yn-hero-bg"
          style={{
            backgroundImage: `url(${current.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: current.brightness ?? 1,
          }}
        />
      )}

      {/* Aucun texte / bouton sur la bannière — pleine visibilité */}

      {active.length > 1 && (
        <div className="yn-hero-dots">
          {active.map((_, i) => (
            <button
              key={i}
              className={`yn-dot${i === idx % active.length ? ' yn-dot-active' : ''}`}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── 2 cartes info ──────────────────────────────────────────────────── */
function InfoCards({ settings }: { settings: Settings }) {
  return (
    <div className="yn-info-cards">
      <div className="yn-info-card">
        <span className="yn-info-icon">⚡</span>
        <div>
          <div className="yn-info-title">Ultra rapide</div>
          <div className="yn-info-sub">10–20 min</div>
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

/* ─── Section header ─────────────────────────────────────────────────── */
function SectionHeader({ title, onAll }: { title: string; onAll?: () => void }) {
  return (
    <div className="yn-section-header">
      <h2 className="yn-section-title">{title}</h2>
      {onAll && (
        <button className="yn-section-all" onClick={onAll}>Tout →</button>
      )}
    </div>
  );
}

/* ─── Carte établissement ────────────────────────────────────────────── */
function MerchantCard({ merchant, onOpen }: { merchant: Etablissement; onOpen: () => void }) {
  return (
    <button className="yn-merchant-card" onClick={onOpen}>
      <div className="yn-merchant-cover">
        {merchant.coverUrl || merchant.logoUrl ? (
          <img
            src={merchant.coverUrl || merchant.logoUrl}
            alt={merchant.name}
            className="yn-merchant-img"
          />
        ) : (
          <div className="yn-merchant-placeholder">🏪</div>
        )}
        {merchant.isActive && (
          <span className="yn-badge yn-badge-open">Ouvert</span>
        )}
      </div>
      <div className="yn-merchant-info">
        <div className="yn-merchant-name">{merchant.name}</div>
        <div className="yn-merchant-meta">
          {merchant.openHours && <span>{merchant.openHours}</span>}
          {merchant.address   && <span>{merchant.address}</span>}
        </div>
      </div>
    </button>
  );
}

/* ─── Helper : image URL ou emoji ───────────────────────────────────── */
function isUrl(s: string) {
  return s && (s.startsWith('http') || s.startsWith('/'));
}

/* ─── Carte produit promo ────────────────────────────────────────────── */
function PromoCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <button className="yn-promo-card" onClick={onAdd}>
      <div className="yn-promo-img-wrap">
        {isUrl(product.image) ? (
          <img src={product.image} alt={product.name} className="yn-promo-img-url" />
        ) : (
          <span className="yn-promo-emoji">{product.image}</span>
        )}
        {product.badge && (
          <span className="yn-badge yn-badge-promo">{product.badge}</span>
        )}
      </div>
      <div className="yn-promo-info">
        <div className="yn-promo-name">{product.name}</div>
        <div className="yn-promo-price">{Number(product.price).toFixed(2)}€</div>
      </div>
    </button>
  );
}

/* ─── Chip catégorie ─────────────────────────────────────────────────── */
function CategoryChip({ cat, active, onClick }: { cat: Category; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`yn-chip${active ? ' yn-chip-active' : ''}`}
      onClick={onClick}
    >
      <span className="yn-chip-icon">{cat.emoji}</span>
      <span className="yn-chip-label">{cat.label.replace(/^[^\s]+\s/, '')}</span>
    </button>
  );
}

/* ─── Bottom nav ─────────────────────────────────────────────────────── */
function BottomNav({
  cartCount, onOpenCart, onSetActiveCat,
}: { cartCount: number; onOpenCart: () => void; onSetActiveCat: (c: string) => void }) {
  const [active, setActive] = useState('home');

  return (
    <nav className="yn-bottom-nav">
      <button
        className={`yn-nav-item${active === 'home' ? ' yn-nav-active' : ''}`}
        onClick={() => { setActive('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      >
        <span className="yn-nav-icon">🏠</span>
        <span className="yn-nav-label">Home</span>
      </button>

      <button
        className={`yn-nav-item${active === 'cats' ? ' yn-nav-active' : ''}`}
        onClick={() => {
          setActive('cats');
          document.getElementById('yn-categories')?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        <span className="yn-nav-icon">🗂️</span>
        <span className="yn-nav-label">Catégories</span>
      </button>

      <button
        className="yn-nav-item yn-nav-cart"
        onClick={() => { setActive('cart'); onOpenCart(); }}
      >
        <span className="yn-nav-icon yn-nav-cart-icon">
          🛒
          {cartCount > 0 && <span className="yn-cart-badge">{cartCount}</span>}
        </span>
        <span className="yn-nav-label">Panier</span>
      </button>

      <button
        className={`yn-nav-item${active === 'orders' ? ' yn-nav-active' : ''}`}
        onClick={() => setActive('orders')}
      >
        <span className="yn-nav-icon">📦</span>
        <span className="yn-nav-label">Commandes</span>
      </button>

      <button
        className={`yn-nav-item${active === 'account' ? ' yn-nav-active' : ''}`}
        onClick={() => setActive('account')}
      >
        <span className="yn-nav-icon">👤</span>
        <span className="yn-nav-label">Compte</span>
      </button>
    </nav>
  );
}

/* ─── Composant principal ────────────────────────────────────────────── */
export default function YassalaHomeNew({
  products,
  categories,
  merchants,       // night_etablissements (depuis NightHome)
  banners,         // banners collection night (depuis NightHome)
  settings,
  cart,
  onOpenCart,
  onOpenAuth,
  currentUserEmail,
  activeCat,
  onSetActiveCat,
  onAddToCart,
}: HomeNewProps) {
  const { resolvedTheme, setTheme, serviceMode } = useTheme();

  // ── Logique de service (commandes autorisées ou non) ──────────────────────
  const canOrder = resolvedTheme === 'day' ? serviceMode.canOrderDay : serviceMode.canOrderNight;
  const currentStatus = resolvedTheme === 'day' ? serviceMode.day : serviceMode.night;
  const otherMode: 'day' | 'night' = resolvedTheme === 'day' ? 'night' : 'day';
  const otherServiceIsOpen = resolvedTheme === 'day' ? serviceMode.canOrderNight : serviceMode.canOrderDay;

  /** Ajout au panier bloqué si le service est fermé */
  const handleAddToCart = (p: Product) => { if (canOrder) onAddToCart(p); };

  /* ── Fetch day_banners & day_etablissements indépendamment ── */
  const [dayBanners,  setDayBanners]  = useState<Banner[]>([]);
  const [dayEtabs,    setDayEtabs]    = useState<Etablissement[]>([]);

  useEffect(() => {
    // day_banners — même filtre que YassalaDayView : active !== false
    const unsubDB = onSnapshot(collection(db, 'day_banners'), snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Banner))
        .filter(b => b.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setDayBanners(all);
    });

    // day_etablissements
    const unsubDE = onSnapshot(collection(db, 'day_etablissements'), snap => {
      setDayEtabs(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Etablissement))
          .filter(e => e.isActive)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      );
    });

    return () => { unsubDB(); unsubDE(); };
  }, []);

  /* ── Établissement sélectionné ── */
  const [selectedEtab, setSelectedEtab] = useState<Etablissement | null>(null);
  const [etabSearch, setEtabSearch] = useState('');

  /* ── Choisir les données selon le thème ── */
  const displayBanners      = resolvedTheme === 'day'
    ? (dayBanners.length > 0 ? dayBanners : banners)
    : banners;

  const displayEtablissements: Etablissement[] = resolvedTheme === 'day'
    ? dayEtabs
    : merchants;

  const cartCount    = cart.reduce((s, i) => s + i.qty, 0);
  const promoProducts = products.filter(p => p.badge && p.isActive !== false);
  const filteredProducts = activeCat === 'all'
    ? products.filter(p => p.isActive !== false)
    : products.filter(p => p.cat === activeCat && p.isActive !== false);

  const allCats: Category[] = [
    { key: 'all', label: 'Tout', emoji: '✨', order: 0 },
    ...categories,
  ];

  return (
    <div className={`yn-root yn-${resolvedTheme}`} data-theme={resolvedTheme}>

      {/* ── HEADER ── */}
      <header className="yn-header">
        <div className="yn-header-inner">
          <div className="yn-logo">
            <span className="yn-logo-text">YASSALA</span>
            <span className="yn-logo-sub">
              {resolvedTheme === 'night' ? 'Night Shop' : 'Day Shop'}
            </span>
          </div>

          <div className="yn-header-right">
            <ThemeToggle />
            <button className="yn-cart-btn" onClick={onOpenCart}>
              <span className="yn-cart-icon">🛒</span>
              <span className="yn-cart-label">PANIER</span>
              {cartCount > 0 && <span className="yn-cart-badge">{cartCount}</span>}
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="yn-info-bar">
          <span>📍 Guyane</span>
          <span className="yn-info-sep">•</span>
          <span>MIN {settings.deliveryMin}€</span>
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

        {/* HERO — bannière libre, sans texte ni bouton */}
        <HeroBanner banners={displayBanners} />

        {/* 2 INFO CARDS */}
        <InfoCards settings={settings} />

        {/* ── BANDEAU SERVICE FERMÉ ── */}
        {!canOrder && (
          <div style={{
            background: resolvedTheme === 'day'
              ? 'linear-gradient(135deg,#fffbeb,#fef3c7)'
              : 'linear-gradient(135deg,#1a1040,#2d1b69)',
            border: `1px solid ${resolvedTheme === 'day' ? '#fbbf24' : '#6d28d9'}`,
            borderRadius: 12,
            margin: '0 0 20px',
            padding: '20px 24px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>
              {resolvedTheme === 'day' ? '☀️' : '🌙'}
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: resolvedTheme === 'day' ? '#92400e' : '#c4b5fd' }}>
              Service {resolvedTheme === 'day' ? 'DAY' : 'NIGHT'} fermé
            </div>
            <div style={{ fontSize: '.85rem', color: resolvedTheme === 'day' ? '#78350f' : '#8b5cf6', marginTop: 6 }}>
              Ouvre à {currentStatus.opensAt} · <span style={{ fontWeight: 600 }}>{currentStatus.countdown}</span>
            </div>
            <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: 4 }}>
              Catalogue disponible · commandes désactivées
            </div>
            {otherServiceIsOpen && (
              <button
                onClick={() => setTheme(otherMode)}
                style={{
                  marginTop: 14,
                  background: otherMode === 'day'
                    ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                    : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 22px', fontWeight: 700, fontSize: '.88rem',
                  cursor: 'pointer', letterSpacing: '.04em',
                }}
              >
                {otherMode === 'day' ? '☀️ Basculer vers DAY' : '🌙 Basculer vers NIGHT'} — ouvert maintenant
              </button>
            )}
            {!otherServiceIsOpen && serviceMode.isClosed && (
              <div style={{ fontSize: '.82rem', color: '#9ca3af', marginTop: 12, fontWeight: 500 }}>
                Le shop est fermé — ouvre à 07:00
              </div>
            )}
            {!otherServiceIsOpen && serviceMode.isPause && (
              <div style={{ fontSize: '.82rem', color: '#9ca3af', marginTop: 12, fontWeight: 500 }}>
                Pause entre les services — NIGHT ouvre à {serviceMode.night.opensAt}
              </div>
            )}
          </div>
        )}

        {/* ── MODE DAY : uniquement les établissements ── */}
        {resolvedTheme === 'day' && (
          <>
            {displayEtablissements.length > 0 ? (
              <section className="yn-section">
                <SectionHeader title="Nos établissements" />
                <div className="yn-etabs-grid">
                  {displayEtablissements.map(e => (
                    <MerchantCard key={e.id} merchant={e} onOpen={() => { setSelectedEtab(e); setEtabSearch(''); }} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="yn-empty">
                <span>🏪</span>
                <p>Aucun établissement disponible pour le moment</p>
              </div>
            )}
          </>
        )}

        {/* ── MODE NIGHT : articles + établissements ── */}
        {resolvedTheme === 'night' && (
          <>
            {/* Établissements */}
            {displayEtablissements.length > 0 && (
              <section className="yn-section">
                <SectionHeader title="À proximité" />
                <div className="yn-h-scroll">
                  {displayEtablissements.map(e => (
                    <MerchantCard key={e.id} merchant={e} onOpen={() => { setSelectedEtab(e); setEtabSearch(''); }} />
                  ))}
                </div>
              </section>
            )}

            {/* Promos du moment */}
            {promoProducts.length > 0 && (
              <section className="yn-section">
                <SectionHeader title="Promos du moment" onAll={onOpenCart} />
                <div className="yn-h-scroll">
                  {promoProducts.slice(0, 12).map(p => (
                    <PromoCard key={p.id} product={p} onAdd={() => handleAddToCart(p)} />
                  ))}
                </div>
              </section>
            )}

            {/* Catégories */}
            <section className="yn-section" id="yn-categories">
              <SectionHeader title="Catégories" />
              <div className="yn-chips-row">
                {allCats.map(cat => (
                  <CategoryChip
                    key={cat.key}
                    cat={cat}
                    active={activeCat === cat.key}
                    onClick={() => onSetActiveCat(cat.key)}
                  />
                ))}
              </div>
            </section>

            {/* Grille produits */}
            {filteredProducts.length > 0 && (
              <section className="yn-section">
                <SectionHeader
                  title={
                    activeCat === 'all'
                      ? 'Tous les produits'
                      : (allCats.find(c => c.key === activeCat)?.label || '')
                  }
                />
                <div className="yn-products-grid">
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      className="yn-product-card"
                      onClick={() => handleAddToCart(p)}
                      disabled={!canOrder}
                      style={!canOrder ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                    >
                      <div className="yn-product-img-wrap">
                        {isUrl(p.image) ? (
                          <img src={p.image} alt={p.name} className="yn-product-img-url" />
                        ) : (
                          <span className="yn-product-emoji">{p.image}</span>
                        )}
                        {p.badge && (
                          <span className="yn-badge yn-badge-promo">{p.badge}</span>
                        )}
                      </div>
                      <div className="yn-product-info">
                        <div className="yn-product-name">{p.name}</div>
                        <div className="yn-product-desc">{p.desc}</div>
                        <div className="yn-product-footer">
                          <span className="yn-product-price">{Number(p.price).toFixed(2)}€</span>
                          <span className="yn-product-add" style={!canOrder ? { color: '#9ca3af' } : undefined}>
                            {canOrder ? '+' : '🔒'}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <div style={{ height: 80 }} />
      </main>

      {/* ── BOTTOM NAV ── */}
      <BottomNav
        cartCount={cartCount}
        onOpenCart={onOpenCart}
        onSetActiveCat={onSetActiveCat}
      />

      {/* ── FICHE ÉTABLISSEMENT (bottom sheet) ── */}
      {selectedEtab && (() => {
        const etabProds = products.filter((p: any) =>
          p.etablissementId === selectedEtab.id && p.isActive !== false
        );
        const q = etabSearch.toLowerCase().trim();
        const filtered2 = q
          ? etabProds.filter(p => p.name.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q))
          : etabProds;
        return (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setSelectedEtab(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100 }}
            />
            {/* Sheet */}
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, height: '93vh',
              background: 'var(--yn-bg, #fff)', borderRadius: '20px 20px 0 0',
              zIndex: 101, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              animation: 'slideUp .3s cubic-bezier(.32,.72,0,1) both',
              boxShadow: '0 -4px 24px rgba(0,0,0,.12)',
            }}>
              {/* Poignée */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 0 4px' }}>
                <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 2 }} />
              </div>

              {/* Scrollable */}
              <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
                {/* Cover */}
                <div style={{ position: 'relative', height: 180, overflow: 'hidden', background: 'linear-gradient(135deg,#ff2d78 0%,#ffd93d 100%)' }}>
                  {selectedEtab.coverUrl && (
                    <img src={selectedEtab.coverUrl} alt={selectedEtab.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(.65)' }} />
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.6) 100%)' }} />
                  <button onClick={() => setSelectedEtab(null)}
                    style={{ position: 'absolute', top: 14, right: 14, zIndex: 3, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,.45)', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '0 20px 16px', textAlign: 'center' }}>
                    {selectedEtab.logoUrl && (
                      <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid #fff', overflow: 'hidden', background: '#fff', marginBottom: 8, boxShadow: '0 4px 16px rgba(0,0,0,.3)' }}>
                        <img src={selectedEtab.logoUrl} alt={selectedEtab.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <h1 style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: '1.3rem', margin: '0 0 6px', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>
                      {selectedEtab.name}
                    </h1>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {selectedEtab.openHours && <span style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.88)' }}>🕐 {selectedEtab.openHours}</span>}
                      {selectedEtab.address && <span style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.82)' }}>📍 {selectedEtab.address}</span>}
                      {selectedEtab.phone && <a href={`tel:${selectedEtab.phone}`} style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.92)', textDecoration: 'none', fontWeight: 600 }}>📞 {selectedEtab.phone}</a>}
                      <span style={{ background: selectedEtab.isActive ? 'rgba(34,197,94,.85)' : 'rgba(120,120,120,.75)', color: '#fff', fontSize: '.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                        {selectedEtab.isActive ? 'OUVERT' : 'FERMÉ'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Barre de recherche */}
                <div style={{ position: 'sticky', top: 0, zIndex: 10, padding: '12px 16px 10px', background: 'var(--yn-bg, #fff)', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '.95rem', color: '#9ca3af', pointerEvents: 'none' }}>🔍</span>
                    <input
                      value={etabSearch}
                      onChange={e => setEtabSearch(e.target.value)}
                      placeholder={`Rechercher dans ${selectedEtab.name}`}
                      style={{ width: '100%', background: '#f5f5f7', border: '1px solid #e5e7eb', borderRadius: 14, padding: '12px 16px 12px 42px', fontFamily: "'Inter',sans-serif", fontSize: '.9rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Produits */}
                <div style={{ padding: '20px 16px 80px' }}>
                  {filtered2.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontFamily: "'Inter',sans-serif" }}>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🍽️</div>
                      <p>{q ? 'Aucun résultat' : 'Aucun article disponible'}</p>
                    </div>
                  ) : (
                    <div className="yn-products-grid">
                      {filtered2.map(p => (
                        <button
                          key={p.id}
                          className="yn-product-card"
                          onClick={() => handleAddToCart(p)}
                          disabled={!canOrder}
                          style={!canOrder ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                        >
                          <div className="yn-product-img-wrap">
                            {isUrl(p.image) ? <img src={p.image} alt={p.name} className="yn-product-img-url" /> : <span className="yn-product-emoji">{p.image}</span>}
                            {p.badge && <span className="yn-badge yn-badge-promo">{p.badge}</span>}
                          </div>
                          <div className="yn-product-info">
                            <div className="yn-product-name">{p.name}</div>
                            <div className="yn-product-desc">{p.desc}</div>
                            <div className="yn-product-footer">
                              <span className="yn-product-price">{Number(p.price).toFixed(2)}€</span>
                              <span className="yn-product-add">+</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
