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

/* ─── Toggle DAY / NIGHT (sans AUTO côté client) ────────────────────── */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="yn-toggle" aria-label="Changer le thème">
      <button
        className={`yn-toggle-btn${resolvedTheme === 'day' ? ' yn-toggle-active' : ''}`}
        onClick={() => setTheme('day')}
        title="Thème jour"
      >
        <span className="yn-toggle-icon">☀️</span>
        <span className="yn-toggle-label">DAY</span>
      </button>
      <button
        className={`yn-toggle-btn${resolvedTheme === 'night' ? ' yn-toggle-active' : ''}`}
        onClick={() => setTheme('night')}
        title="Thème nuit"
      >
        <span className="yn-toggle-icon">🌙</span>
        <span className="yn-toggle-label">NIGHT</span>
      </button>
    </div>
  );
}

/* ─── Hero carrousel — bannière libre, aucune information dessus ─────── */
function HeroBanner({ banners }: { banners: Banner[] }) {
  const { resolvedTheme } = useTheme();
  const [idx, setIdx] = useState(0);

  const active = banners
    .filter(b => b.active)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  useEffect(() => {
    if (active.length <= 1) return;
    const id = setInterval(() => setIdx(i => (i + 1) % active.length), 4500);
    return () => clearInterval(id);
  }, [active.length]);

  const current = active[idx % Math.max(active.length, 1)];

  const fallbackGradient = resolvedTheme === 'night'
    ? 'linear-gradient(135deg,#0B0F1A 0%,#1a0a2e 60%,#0d1b3e 100%)'
    : 'linear-gradient(135deg,#ff2d78 0%,#ff8e53 50%,#ffd93d 100%)';

  return (
    <section className="yn-hero">
      {/* Bannière : backgroundImage CSS (comme YassalaDayView) pour compatibilité Firebase Storage */}
      <div
        className="yn-hero-bg"
        style={{
          background: current?.gradient || fallbackGradient,
          ...(current?.image ? {
            backgroundImage: `url(${current.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: (current.brightness ?? 100) / 100,
          } : {}),
        }}
      />

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
function MerchantCard({ merchant, onOpenCart }: { merchant: Etablissement; onOpenCart: () => void }) {
  return (
    <button className="yn-merchant-card" onClick={onOpenCart}>
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
  const { resolvedTheme } = useTheme();

  /* ── Fetch day_banners & day_etablissements indépendamment ── */
  const [dayBanners,  setDayBanners]  = useState<Banner[]>([]);
  const [dayEtabs,    setDayEtabs]    = useState<Etablissement[]>([]);

  useEffect(() => {
    // day_banners (avec fallback sur banners si vide)
    const unsubDB = onSnapshot(collection(db, 'day_banners'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner));
      setDayBanners(all.length > 0 ? all : []);
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

        {/* ── MODE DAY : uniquement les établissements ── */}
        {resolvedTheme === 'day' && (
          <>
            {displayEtablissements.length > 0 ? (
              <section className="yn-section">
                <SectionHeader title="Nos établissements" />
                <div className="yn-etabs-grid">
                  {displayEtablissements.map(e => (
                    <MerchantCard key={e.id} merchant={e} onOpenCart={onOpenCart} />
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
                    <MerchantCard key={e.id} merchant={e} onOpenCart={onOpenCart} />
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
                    <PromoCard key={p.id} product={p} onAdd={() => onAddToCart(p)} />
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
                    <button key={p.id} className="yn-product-card" onClick={() => onAddToCart(p)}>
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
                          <span className="yn-product-add">+</span>
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
    </div>
  );
}
