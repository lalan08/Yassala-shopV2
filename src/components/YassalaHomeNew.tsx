'use client';

import React, { useState, useEffect } from 'react';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';

/* ─── Types (local, matching NightHome) ──────────────────────────────── */
export type Product = {
  id: string; name: string; desc: string; price: number;
  image: string; cat: string; badge: string; stock: number; isActive?: boolean;
};
export type Category = { id?: string; key: string; label: string; emoji: string; order: number; };
export type Pack     = { id: string; name: string; tag: string; emoji: string; items: string; price: number; real: number; star: boolean; };
export type Settings = {
  shopOpen: boolean; deliveryMin: number; freeDelivery: number;
  hours: string; zone: string; whatsapp: string;
  paymentOnlineEnabled: boolean; paymentCashEnabled: boolean;
  fulfillmentDeliveryEnabled: boolean; fulfillmentPickupEnabled: boolean;
  [key: string]: unknown;
};
export type Banner = {
  id: string; title: string; subtitle: string; desc: string; cta: string;
  link: string; gradient: string; image: string; brightness?: number; active: boolean; order: number;
};
export type NightPartenaire = {
  id: string; name: string; slug?: string; description?: string;
  address?: string; phone?: string; logoUrl?: string; coverUrl?: string;
  openHours?: string; isActive: boolean;
};
export type CartItem = { id: string; name: string; price: number; qty: number; };

interface HomeNewProps {
  products:         Product[];
  categories:       Category[];
  merchants:        NightPartenaire[];
  banners:          Banner[];
  settings:         Settings;
  cart:             CartItem[];
  onOpenCart:       () => void;
  onOpenAuth:       () => void;
  currentUserEmail?: string | null;
  onSignOut?:       () => void;
  activeCat:        string;
  onSetActiveCat:   (cat: string) => void;
  onAddToCart:      (product: Product) => void;
}

/* ─── Theme toggle button ─────────────────────────────────────────────── */
function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const options: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'day',   label: 'DAY',   icon: '☀️' },
    { value: 'night', label: 'NIGHT', icon: '🌙' },
    { value: 'auto',  label: 'AUTO',  icon: '⚡' },
  ];

  return (
    <div className="yn-toggle" aria-label="Changer le thème">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`yn-toggle-btn${theme === opt.value ? ' yn-toggle-active' : ''}`}
          onClick={() => setTheme(opt.value)}
          title={opt.value === 'auto' ? 'Mode automatique selon l\'heure' : `Thème ${opt.label}`}
        >
          <span className="yn-toggle-icon">{opt.icon}</span>
          <span className="yn-toggle-label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Hero carrousel ─────────────────────────────────────────────────── */
function HeroBanner({
  banners, resolvedTheme, onOpenCart,
}: { banners: Banner[]; resolvedTheme: 'day' | 'night'; onOpenCart: () => void }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => setIdx(i => (i + 1) % banners.length), 4000);
    return () => clearInterval(id);
  }, [banners.length]);

  const activeBanners = banners.filter(b => b.active).sort((a, b) => a.order - b.order);

  return (
    <section className="yn-hero">
      {activeBanners.length > 0 ? (
        <div
          className="yn-hero-bg"
          style={{
            background: activeBanners[idx % activeBanners.length]?.gradient ||
              (resolvedTheme === 'night'
                ? 'linear-gradient(135deg,#0B0F1A 0%,#1a0a2e 50%,#0d1b3e 100%)'
                : 'linear-gradient(135deg,#ff2d78 0%,#ff6b6b 50%,#ffd93d 100%)'),
          }}
        >
          {activeBanners[idx % activeBanners.length]?.image && (
            <img
              src={activeBanners[idx % activeBanners.length].image}
              alt="banner"
              className="yn-hero-img"
              style={{ opacity: (activeBanners[idx % activeBanners.length].brightness ?? 70) / 100 }}
            />
          )}
        </div>
      ) : (
        <div
          className="yn-hero-bg"
          style={{
            background: resolvedTheme === 'night'
              ? 'linear-gradient(135deg,#0B0F1A 0%,#1a0a2e 60%,#0d1b3e 100%)'
              : 'linear-gradient(135deg,#ff2d78 0%,#ff8e53 50%,#ffd93d 100%)',
          }}
        />
      )}

      <div className="yn-hero-overlay" />

      <div className="yn-hero-content">
        <div className="yn-hero-badge">
          {resolvedTheme === 'night' ? '🌙 Livraison nocturne' : '☀️ Livraison de jour'}
        </div>
        <h1 className="yn-hero-title">
          {resolvedTheme === 'night' ? 'Livraison nocturne' : 'Livraison de jour'}
          <br /><span className="yn-hero-accent">— Guyane</span>
        </h1>
        <p className="yn-hero-subtitle">
          Boissons, snacks &amp; plus — livrés en 15–30 min
        </p>
        <button className="yn-hero-cta" onClick={onOpenCart}>
          Commander <span className="yn-cta-arrow">→</span>
        </button>
      </div>

      {activeBanners.length > 1 && (
        <div className="yn-hero-dots">
          {activeBanners.map((_, i) => (
            <button
              key={i}
              className={`yn-dot${i === idx % activeBanners.length ? ' yn-dot-active' : ''}`}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Info cards ─────────────────────────────────────────────────────── */
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
        <button className="yn-section-all" onClick={onAll}>
          Tout →
        </button>
      )}
    </div>
  );
}

/* ─── Merchant card ──────────────────────────────────────────────────── */
function MerchantCard({ merchant, onClick }: { merchant: NightPartenaire; onClick?: () => void }) {
  return (
    <button className="yn-merchant-card" onClick={onClick}>
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
        {merchant.isActive && <span className="yn-badge yn-badge-open">Ouvert</span>}
      </div>
      <div className="yn-merchant-info">
        <div className="yn-merchant-name">{merchant.name}</div>
        <div className="yn-merchant-meta">
          {merchant.openHours && <span>{merchant.openHours}</span>}
          {merchant.address && <span>{merchant.address}</span>}
        </div>
      </div>
    </button>
  );
}

/* ─── Product promo card ─────────────────────────────────────────────── */
function PromoCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <button className="yn-promo-card" onClick={onAdd}>
      <div className="yn-promo-img-wrap">
        <span className="yn-promo-emoji">{product.image}</span>
        {product.badge && <span className="yn-badge yn-badge-promo">{product.badge}</span>}
      </div>
      <div className="yn-promo-info">
        <div className="yn-promo-name">{product.name}</div>
        <div className="yn-promo-price">{product.price.toFixed(2)}€</div>
      </div>
    </button>
  );
}

/* ─── Category chip ──────────────────────────────────────────────────── */
function CategoryChip({
  cat, active, onClick,
}: { cat: Category; active: boolean; onClick: () => void }) {
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
  cartCount, onOpenCart, activeCat, onSetActiveCat,
}: { cartCount: number; onOpenCart: () => void; activeCat: string; onSetActiveCat: (c: string) => void }) {
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

/* ─── Main YassalaHomeNew component ──────────────────────────────────── */
export default function YassalaHomeNew({
  products,
  categories,
  merchants,
  banners,
  settings,
  cart,
  onOpenCart,
  onOpenAuth,
  currentUserEmail,
  onSignOut,
  activeCat,
  onSetActiveCat,
  onAddToCart,
}: HomeNewProps) {
  const { resolvedTheme } = useTheme();

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const promoProducts = products.filter(p => p.badge && p.isActive !== false);
  const filteredProducts = activeCat === 'all'
    ? products.filter(p => p.isActive !== false)
    : products.filter(p => p.cat === activeCat && p.isActive !== false);

  const allCats: Category[] = [
    { key: 'all', label: 'Tout', emoji: '✨', order: 0 },
    ...categories,
  ];

  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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

      {/* ── MAIN SCROLL CONTENT ── */}
      <main className="yn-main">

        {/* HERO */}
        <HeroBanner
          banners={banners}
          resolvedTheme={resolvedTheme}
          onOpenCart={onOpenCart}
        />

        {/* 2 INFO CARDS */}
        <InfoCards settings={settings} />

        {/* SECTION: À proximité */}
        {merchants.length > 0 && (
          <section className="yn-section">
            <SectionHeader title="À proximité" />
            <div className="yn-h-scroll">
              {merchants.filter(m => m.isActive).length === 0
                ? merchants.map(m => (
                    <MerchantCard key={m.id} merchant={m} onClick={onOpenCart} />
                  ))
                : merchants.filter(m => m.isActive).map(m => (
                    <MerchantCard key={m.id} merchant={m} onClick={onOpenCart} />
                  ))
              }
            </div>
          </section>
        )}

        {/* SECTION: Promos du moment */}
        {promoProducts.length > 0 && (
          <section className="yn-section">
            <SectionHeader title="Promos du moment" onAll={onOpenCart} />
            <div className="yn-h-scroll">
              {promoProducts.slice(0, 12).map(p => (
                <PromoCard key={p.id} product={p} onAdd={() => onAddToCart(p)} />
              ))}
            </div>
          </section>
        )}

        {/* SECTION: Catégories */}
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

        {/* SECTION: Produits filtrés */}
        {filteredProducts.length > 0 && (
          <section className="yn-section">
            <SectionHeader
              title={activeCat === 'all' ? 'Tous les produits' : allCats.find(c => c.key === activeCat)?.label || ''}
            />
            <div className="yn-products-grid">
              {filteredProducts.map(p => (
                <button key={p.id} className="yn-product-card" onClick={() => onAddToCart(p)}>
                  <div className="yn-product-img-wrap">
                    <span className="yn-product-emoji">{p.image}</span>
                    {p.badge && <span className="yn-badge yn-badge-promo">{p.badge}</span>}
                  </div>
                  <div className="yn-product-info">
                    <div className="yn-product-name">{p.name}</div>
                    <div className="yn-product-desc">{p.desc}</div>
                    <div className="yn-product-footer">
                      <span className="yn-product-price">{p.price.toFixed(2)}€</span>
                      <span className="yn-product-add">+</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Bottom padding for nav */}
        <div style={{ height: 80 }} />
      </main>

      {/* ── BOTTOM NAV ── */}
      <BottomNav
        cartCount={cartCount}
        onOpenCart={onOpenCart}
        activeCat={activeCat}
        onSetActiveCat={onSetActiveCat}
      />
    </div>
  );
}
