"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  MapPin,
  ChevronDown,
  Bell,
  SlidersHorizontal,
  Search,
  ChevronRight,
  Heart,
  Clock,
  Star,
  ShoppingCart,
  Grid3X3,
  User,
  Home,
  X,
} from "lucide-react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBct9CXbZigDElOsCsLHmOE4pB1lmfa2VI",
  authDomain: "yassala-shop.firebaseapp.com",
  projectId: "yassala-shop",
  storageBucket: "yassala-shop.firebasestorage.app",
  messagingSenderId: "871772438691",
  appId: "1:871772438691:web:403d6672c34e9529eaff16",
};
const _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const _db = getFirestore(_app);

// ── Constants ─────────────────────────────────────────────────────────────
const YASSALA_PINK = "#ff2d78";

// ── Types ──────────────────────────────────────────────────────────────────
interface Commerce {
  id: string;
  name: string;
  category: string;
  tags: string[];
  distanceKm: number;
  deliveryMin: number;
  deliveryMax: number;
  deliveryFee: number;
  rating: number;
  reviewCount: number;
  promo?: string;
  isOpen: boolean;
  opensAt?: string;
  closeTime?: string;
  isNew?: boolean;
  isPopular?: boolean;
  isComingSoon?: boolean;
  emoji: string;
  bgColor: string;
  logoUrl?: string;
  coverUrl?: string;
  slug?: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────
const ZONE = { name: "Matoury", code: "97351" };

const PRIMARY_FILTERS = [
  { id: "all", label: "Tout" },
  { id: "courses", label: "Courses" },
  { id: "epicerie", label: "Épicerie" },
  { id: "restauration", label: "Restauration" },
  { id: "trajets", label: "Trajets" },
  { id: "pharmacie", label: "Pharmacie" },
];

const CATEGORY_ICONS = [
  { id: "breakfast", label: "Petit-déj", emoji: "🥐" },
  { id: "cafe", label: "Café", emoji: "☕" },
  { id: "sain", label: "Cuisine saine", emoji: "🥗" },
  { id: "poulet", label: "Poulet", emoji: "🍗" },
  { id: "fastfood", label: "Fast-food", emoji: "🍔" },
  { id: "pizza", label: "Pizza", emoji: "🍕" },
  { id: "creole", label: "Créole", emoji: "🍲" },
  { id: "dessert", label: "Dessert", emoji: "🍰" },
];

const SECONDARY_FILTERS = [
  { id: "takeaway", label: "À emporter" },
  { id: "offers", label: "Offres" },
];

const DELIVERY_FEE_OPTIONS = [
  { id: "any", label: "Livraison" },
  { id: "free", label: "0€" },
  { id: "lt2", label: "< 2€" },
  { id: "lt5", label: "< 5€" },
];

const COMMERCES: Commerce[] = [
  {
    id: "1",
    name: "Boulangerie Ti' Coco",
    category: "breakfast",
    tags: ["Petit-déjeuner", "Boulangerie"],
    distanceKm: 0.8,
    deliveryMin: 15,
    deliveryMax: 25,
    deliveryFee: 0,
    rating: 4.7,
    reviewCount: 89,
    promo: "Livraison 0€",
    isOpen: true,
    isPopular: true,
    emoji: "🥐",
    bgColor: "#FEF3C7",
  },
  {
    id: "2",
    name: "Snack Créole Mamy",
    category: "creole",
    tags: ["Créole", "Fait maison"],
    distanceKm: 1.2,
    deliveryMin: 20,
    deliveryMax: 35,
    deliveryFee: 2,
    rating: 4.9,
    reviewCount: 203,
    promo: "-10€ dès 35€",
    isOpen: true,
    isPopular: true,
    emoji: "🍲",
    bgColor: "#FEE2E2",
  },
  {
    id: "3",
    name: "Épicerie TopMarché",
    category: "epicerie",
    tags: ["Épicerie", "Courses"],
    distanceKm: 1.5,
    deliveryMin: 25,
    deliveryMax: 40,
    deliveryFee: 1.5,
    rating: 4.5,
    reviewCount: 67,
    isOpen: true,
    isNew: true,
    emoji: "🛒",
    bgColor: "#DCFCE7",
  },
  {
    id: "4",
    name: "Burger Tropical",
    category: "fastfood",
    tags: ["Fast-food", "Burgers"],
    distanceKm: 2.0,
    deliveryMin: 20,
    deliveryMax: 30,
    deliveryFee: 2.5,
    rating: 4.3,
    reviewCount: 145,
    promo: "Livraison 0€ le WE",
    isOpen: true,
    emoji: "🍔",
    bgColor: "#FFF3CD",
  },
  {
    id: "5",
    name: "Yassala Night Shop",
    category: "epicerie",
    tags: ["Boissons", "Nocturne"],
    distanceKm: 2.3,
    deliveryMin: 15,
    deliveryMax: 30,
    deliveryFee: 3,
    rating: 4.8,
    reviewCount: 124,
    isOpen: false,
    opensAt: "22:00",
    emoji: "🌙",
    bgColor: "#EDE9FE",
  },
  {
    id: "6",
    name: "Pizza del Sol",
    category: "pizza",
    tags: ["Pizza", "Italien"],
    distanceKm: 3.1,
    deliveryMin: 30,
    deliveryMax: 45,
    deliveryFee: 2,
    rating: 4.6,
    reviewCount: 98,
    promo: "-2€ dès 20€",
    isOpen: true,
    emoji: "🍕",
    bgColor: "#FFF1F2",
  },
  {
    id: "7",
    name: "Café Soleil Levant",
    category: "cafe",
    tags: ["Café", "Brunch"],
    distanceKm: 0.5,
    deliveryMin: 10,
    deliveryMax: 20,
    deliveryFee: 0,
    rating: 4.8,
    reviewCount: 312,
    promo: "Livraison 0€",
    isOpen: true,
    isNew: true,
    emoji: "☕",
    bgColor: "#FEF9C3",
  },
  {
    id: "8",
    name: "Poulet Croustillant",
    category: "poulet",
    tags: ["Poulet", "Ailes"],
    distanceKm: 1.8,
    deliveryMin: 20,
    deliveryMax: 30,
    deliveryFee: 1.5,
    rating: 4.4,
    reviewCount: 201,
    isOpen: true,
    isPopular: true,
    emoji: "🍗",
    bgColor: "#FED7AA",
  },
  {
    id: "9",
    name: "Salade & Co",
    category: "sain",
    tags: ["Sain", "Végétarien"],
    distanceKm: 2.7,
    deliveryMin: 15,
    deliveryMax: 25,
    deliveryFee: 2,
    rating: 4.7,
    reviewCount: 88,
    promo: "-5€ 1ère commande",
    isOpen: true,
    isNew: true,
    emoji: "🥗",
    bgColor: "#D1FAE5",
  },
  {
    id: "10",
    name: "Pâtisserie Créole",
    category: "dessert",
    tags: ["Desserts", "Gâteaux"],
    distanceKm: 3.5,
    deliveryMin: 25,
    deliveryMax: 40,
    deliveryFee: 2.5,
    rating: 4.9,
    reviewCount: 176,
    isOpen: false,
    opensAt: "09:00",
    emoji: "🍰",
    bgColor: "#FBCFE8",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// ── ProximityCard ──────────────────────────────────────────────────────────
function ProximityCard({
  commerce,
  isFavorite,
  onToggleFavorite,
}: {
  commerce: Commerce;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div
      className="flex-shrink-0 bg-white rounded-2xl overflow-visible cursor-pointer active:scale-[0.98] transition-transform"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.09)", width: 168 }}
    >
      {/* Cover */}
      <div className="relative rounded-t-2xl overflow-hidden" style={{ height: 120 }}>
        {/* Gradient background */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: commerce.bgColor }}
        />
        {/* Emoji watermark */}
        <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
          <span style={{ fontSize: 72, opacity: 0.18 }}>{commerce.emoji}</span>
        </div>
        {/* Bottom gradient overlay */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: 52, background: "linear-gradient(to top, rgba(0,0,0,0.42) 0%, transparent 100%)" }}
        />

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          {commerce.isNew && (
            <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
              Nouveau
            </span>
          )}
          {commerce.isPopular && (
            <span
              className="text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm"
              style={{ backgroundColor: "#f59e0b" }}
            >
              🔥 Top
            </span>
          )}
        </div>

        {/* Promo on cover */}
        {commerce.promo && (
          <div
            className="absolute bottom-2.5 left-2.5 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow"
            style={{ backgroundColor: YASSALA_PINK }}
          >
            🎁 {commerce.promo}
          </div>
        )}

        {/* Favorite button */}
        <button
          className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow"
          onClick={() => onToggleFavorite(commerce.id)}
          aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <Heart
            size={11}
            fill={isFavorite ? YASSALA_PINK : "none"}
            stroke={isFavorite ? YASSALA_PINK : "#9CA3AF"}
          />
        </button>

        {/* Logo overlapping body */}
        <div
          className="absolute left-3 bg-white rounded-xl flex items-center justify-center text-xl shadow"
          style={{ width: 36, height: 36, bottom: -16, border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
        >
          {commerce.emoji}
        </div>

        {/* Closed overlay */}
        {!commerce.isOpen && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
            <span className="text-white text-[11px] font-semibold bg-black/60 px-2 py-1 rounded-full">
              Ouvre à {commerce.opensAt}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-2.5 pt-6 pb-2.5">
        <p className="font-bold text-gray-900 text-sm truncate">{commerce.name}</p>
        <p className="text-[10px] text-gray-400 truncate mt-0.5">{commerce.tags.slice(0, 2).join(" · ")}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Clock size={10} />
            <span>{commerce.deliveryMin}–{commerce.deliveryMax} min</span>
          </div>
          <div className="flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded-full">
            <Star size={9} fill="#FBBF24" stroke="#FBBF24" />
            <span className="text-[11px] font-bold text-amber-700">{commerce.rating}</span>
          </div>
        </div>
        <p className={`text-[11px] mt-1.5 font-medium ${commerce.deliveryFee === 0 ? "text-emerald-600" : "text-gray-400"}`}>
          {commerce.deliveryFee === 0 ? "🎉 Livraison offerte" : `Livraison ${commerce.deliveryFee.toFixed(2)}€`}
        </p>
      </div>
    </div>
  );
}

// ── EstablishmentCard ──────────────────────────────────────────────────────
function EstablishmentCard({
  commerce,
  isFavorite,
  onToggleFavorite,
}: {
  commerce: Commerce;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div
      className="bg-white rounded-2xl overflow-visible cursor-pointer active:scale-[0.98] transition-transform"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.09)" }}
    >
      {/* ── Cover ── */}
      <div className="relative rounded-t-2xl overflow-hidden" style={{ height: 120 }}>
        {/* Fond : vraie image ou couleur + emoji watermark */}
        {commerce.coverUrl ? (
          <img
            src={commerce.coverUrl}
            alt={commerce.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            <div className="absolute inset-0" style={{ backgroundColor: commerce.bgColor }} />
            <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
              <span style={{ fontSize: 110, opacity: 0.18, filter: "blur(1.5px)" }}>{commerce.emoji}</span>
            </div>
          </>
        )}

        {/* Dégradé bas */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: 52, background: "linear-gradient(to top, rgba(0,0,0,0.42) 0%, transparent 100%)" }}
        />

        {/* Badges top-left */}
        <div className="absolute top-2 left-2 flex gap-1">
          {commerce.isNew && (
            <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
              Nouveau
            </span>
          )}
          {commerce.isPopular && (
            <span className="text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm" style={{ backgroundColor: "#f59e0b" }}>
              🔥 Top
            </span>
          )}
        </div>

        {/* Badge promo */}
        {commerce.promo && (
          <div
            className="absolute bottom-2.5 left-2.5 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow"
            style={{ backgroundColor: YASSALA_PINK }}
          >
            🎁 {commerce.promo}
          </div>
        )}

        {/* Bouton favori */}
        <button
          className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(commerce.id); }}
          aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <Heart size={11} fill={isFavorite ? YASSALA_PINK : "none"} stroke={isFavorite ? YASSALA_PINK : "#9CA3AF"} />
        </button>

        {/* Logo chevauchant */}
        <div
          className="absolute left-3 bg-white rounded-xl flex items-center justify-center overflow-hidden text-xl shadow"
          style={{ width: 36, height: 36, bottom: -16, border: "2px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
        >
          {commerce.logoUrl ? (
            <img src={commerce.logoUrl} alt={commerce.name} className="w-full h-full object-cover" />
          ) : (
            commerce.emoji
          )}
        </div>

        {/* Overlay fermé */}
        {!commerce.isOpen && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
            <span className="text-white text-[11px] font-semibold bg-black/60 px-2 py-1 rounded-full">
              Ouvre à {commerce.opensAt || "–"}
            </span>
          </div>
        )}
      </div>

      {/* Corps */}
      <div className="px-2.5 pt-6 pb-2.5">
        <p className="font-bold text-gray-900 text-sm truncate">{commerce.name}</p>
        <p className="text-[10px] text-gray-400 truncate mt-0.5">{commerce.tags.slice(0, 2).join(" · ")}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Clock size={10} />
            <span>{commerce.deliveryMin}–{commerce.deliveryMax} min</span>
          </div>
          <div className="flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded-full">
            <Star size={9} fill="#FBBF24" stroke="#FBBF24" />
            <span className="text-[11px] font-bold text-amber-700">{commerce.rating.toFixed(1)}</span>
          </div>
        </div>
        <p className={`text-[11px] mt-1.5 font-medium ${commerce.deliveryFee === 0 ? "text-emerald-600" : "text-gray-400"}`}>
          {commerce.deliveryFee === 0 ? "🎉 Livraison offerte" : `Livraison ${commerce.deliveryFee.toFixed(2)}€`}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function MarketplaceHome() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategoryIcon, setActiveCategoryIcon] = useState<string | null>(null);
  const [activeSecondary, setActiveSecondary] = useState<string[]>([]);
  const [deliveryFeeFilter, setDeliveryFeeFilter] = useState("any");
  const [showDeliveryDropdown, setShowDeliveryDropdown] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [activeNavTab, setActiveNavTab] = useState("home");
  const [firebaseCommerces, setFirebaseCommerces] = useState<Commerce[] | null>(null);
  const cartCount = 0;

  // Chargement Firebase des établissements actifs
  useEffect(() => {
    const unsub = onSnapshot(collection(_db, "day_etablissements"), (snap) => {
      const data: Commerce[] = snap.docs
        .map((d) => {
          const raw = d.data();
          if (!raw.isActive) return null;
          return {
            id: d.id,
            name: raw.name || "",
            category: raw.category || "restauration",
            tags: raw.tags ? (raw.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean) : [],
            distanceKm: raw.distanceKm || 0,
            deliveryMin: raw.deliveryMin ?? 20,
            deliveryMax: raw.deliveryMax ?? 35,
            deliveryFee: raw.deliveryFee ?? 2,
            rating: raw.rating ?? 4.5,
            reviewCount: raw.reviewCount ?? 0,
            promo: raw.promo || undefined,
            isOpen: raw.isOpen !== undefined ? raw.isOpen : true,
            opensAt: raw.opensAt,
            closeTime: raw.closeTime,
            isComingSoon: raw.isComingSoon || false,
            isNew: raw.isNew || false,
            isPopular: raw.isPopular || false,
            emoji: raw.emoji || "🏪",
            bgColor: raw.bgColor || "#FEF3C7",
            logoUrl: raw.logoUrl || undefined,
            coverUrl: raw.coverUrl || undefined,
            slug: raw.slug || undefined,
          } as Commerce;
        })
        .filter(Boolean) as Commerce[];
      setFirebaseCommerces(data);
    });
    return () => unsub();
  }, []);

  // Utilise les données Firebase si disponibles, sinon les mock data
  const COMMERCES_DATA = firebaseCommerces !== null && firebaseCommerces.length > 0
    ? firebaseCommerces
    : COMMERCES;

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSecondary = (id: string) => {
    setActiveSecondary((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Section A: max 6, sorted by open first then distance
  const proximityCommerces = useMemo(
    () =>
      [...COMMERCES_DATA]
        .sort((a, b) => {
          if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
          return a.distanceKm - b.distanceKm;
        })
        .slice(0, 6),
    [COMMERCES_DATA]
  );

  // Section B: all, filtered by search + active chips
  const allCommerces = useMemo(() => {
    let filtered = [...COMMERCES_DATA];

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.category.toLowerCase().includes(q)
      );
    }

    if (activeFilter === "epicerie") {
      filtered = filtered.filter((c) => c.category === "epicerie");
    } else if (activeFilter === "restauration") {
      filtered = filtered.filter((c) =>
        ["fastfood", "pizza", "creole", "poulet", "cafe", "breakfast", "dessert", "sain"].includes(
          c.category
        )
      );
    } else if (activeFilter === "courses") {
      filtered = filtered.filter((c) => ["epicerie", "courses"].includes(c.category));
    }

    if (activeCategoryIcon) {
      filtered = filtered.filter((c) => c.category === activeCategoryIcon);
    }

    if (activeSecondary.includes("offers")) {
      filtered = filtered.filter((c) => !!c.promo);
    }

    if (deliveryFeeFilter === "free") filtered = filtered.filter((c) => c.deliveryFee === 0);
    else if (deliveryFeeFilter === "lt2") filtered = filtered.filter((c) => c.deliveryFee < 2);
    else if (deliveryFeeFilter === "lt5") filtered = filtered.filter((c) => c.deliveryFee < 5);

    return filtered.sort((a, b) => a.distanceKm - b.distanceKm);
  }, [search, activeFilter, activeCategoryIcon, activeSecondary, deliveryFeeFilter, COMMERCES_DATA]);

  const currentDeliveryLabel =
    DELIVERY_FEE_OPTIONS.find((o) => o.id === deliveryFeeFilter)?.label ?? "Livraison";

  return (
    <div className="min-h-screen font-sans max-w-md mx-auto relative" style={{ backgroundColor: "#F6F7F9" }}>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header
        className="bg-white px-4 pt-12 pb-3 sticky top-0 z-30"
        style={{ boxShadow: "0 1px 0 #EAECF0" }}
      >
        {/* Zone + Actions */}
        <div className="flex items-center justify-between mb-3">
          <button className="flex items-start gap-0 text-left">
            <div>
              <div className="flex items-center gap-1">
                <MapPin size={13} style={{ color: YASSALA_PINK }} />
                <span className="text-xs text-gray-400 font-medium">Zone de livraison</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="font-bold text-gray-900 text-[15px]">
                  {ZONE.name} {ZONE.code}
                </span>
                <ChevronDown size={15} className="text-gray-500" />
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1.5">
            {/* Bell */}
            <button className="relative w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#F1F3F6" }}>
              <Bell size={18} className="text-gray-700" />
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: YASSALA_PINK }}
              />
            </button>
            {/* Filters */}
            <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#F1F3F6" }}>
              <SlidersHorizontal size={17} className="text-gray-700" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ backgroundColor: "#F1F3F6" }}>
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Rechercher un commerce, plat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
      </header>

      {/* ── FILTER CHIPS ────────────────────────────────────────────────── */}
      <div
        className="bg-white sticky top-[116px] z-20"
        style={{ boxShadow: "0 1px 0 #EAECF0" }}
      >
        {/* Primary chips */}
        <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto no-scrollbar">
          {PRIMARY_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setActiveFilter(f.id);
                setActiveCategoryIcon(null);
              }}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
              style={
                activeFilter === f.id
                  ? { backgroundColor: YASSALA_PINK, color: "#fff" }
                  : { backgroundColor: "#F1F3F6", color: "#374151" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Category icons scroll */}
        <div className="flex gap-3 px-4 py-2.5 overflow-x-auto no-scrollbar">
          {CATEGORY_ICONS.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setActiveCategoryIcon((prev) => (prev === cat.id ? null : cat.id))
              }
              className="flex-shrink-0 flex flex-col items-center gap-1"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all"
                style={
                  activeCategoryIcon === cat.id
                    ? {
                        backgroundColor: "#FFE4ED",
                        border: `2px solid ${YASSALA_PINK}`,
                      }
                    : { backgroundColor: "#F1F3F6" }
                }
              >
                {cat.emoji}
              </div>
              <span className="text-[10px] text-gray-500 whitespace-nowrap font-medium">
                {cat.label}
              </span>
            </button>
          ))}
        </div>

        {/* Secondary chips + delivery fee dropdown */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {SECONDARY_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleSecondary(f.id)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all"
              style={
                activeSecondary.includes(f.id)
                  ? {
                      backgroundColor: "#FFE4ED",
                      borderColor: YASSALA_PINK,
                      color: YASSALA_PINK,
                    }
                  : { backgroundColor: "#fff", borderColor: "#E5E7EB", color: "#374151" }
              }
            >
              {f.label}
            </button>
          ))}

          {/* Delivery fee dropdown chip */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowDeliveryDropdown((prev) => !prev)}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all"
              style={
                deliveryFeeFilter !== "any"
                  ? {
                      backgroundColor: "#FFE4ED",
                      borderColor: YASSALA_PINK,
                      color: YASSALA_PINK,
                    }
                  : { backgroundColor: "#fff", borderColor: "#E5E7EB", color: "#374151" }
              }
            >
              {currentDeliveryLabel}
              <ChevronDown size={13} />
            </button>

            {showDeliveryDropdown && (
              <div
                className="absolute top-full left-0 mt-1 bg-white rounded-xl py-1 z-50 min-w-[120px]"
                style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}
              >
                {DELIVERY_FEE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-[#F6F7F9]"
                    style={
                      deliveryFeeFilter === opt.id
                        ? { color: YASSALA_PINK, fontWeight: 600 }
                        : {}
                    }
                    onClick={() => {
                      setDeliveryFeeFilter(opt.id);
                      setShowDeliveryDropdown(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <div className="pb-24 px-4 pt-4 space-y-6">
        {/* ── SECTION A: Commerces à proximité ──────────────────────────── */}
        {!search.trim() && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900 text-lg">Commerces à proximité</h2>
              <button
                className="flex items-center gap-0.5 text-sm font-semibold"
                style={{ color: YASSALA_PINK }}
              >
                Voir tout <ChevronRight size={15} />
              </button>
            </div>

            <div
              className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollPaddingLeft: "16px",
              }}
            >
              {proximityCommerces.map((c) => (
                <ProximityCard
                  key={c.id}
                  commerce={c}
                  isFavorite={favorites.has(c.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
              {/* Spacer for last-card peek */}
              <div className="flex-shrink-0 w-2" aria-hidden />
            </div>
          </section>
        )}

        {/* ── SECTION B: Tous les établissements ────────────────────────── */}
        <section>
          <h2 className="font-bold text-gray-900 text-lg mb-3">
            {search.trim() ? `Résultats pour "${search}"` : "Tous les établissements"}
          </h2>

          {allCommerces.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-semibold text-gray-500">Aucun résultat</p>
              <p className="text-sm mt-1">Essayez un autre terme ou filtre</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {allCommerces.map((c) => (
                <EstablishmentCard
                  key={c.id}
                  commerce={c}
                  isFavorite={favorites.has(c.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── BOTTOM NAV ──────────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white z-30"
        style={{ borderTop: "1px solid #EAECF0", boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center justify-around py-2 px-2">
          {(
            [
              { id: "home", Icon: Home, label: "Accueil", badge: 0 },
              { id: "categories", Icon: Grid3X3, label: "Catégories", badge: 0 },
              { id: "cart", Icon: ShoppingCart, label: "Panier", badge: cartCount },
              { id: "account", Icon: User, label: "Compte", badge: 0 },
            ] as Array<{
              id: string;
              Icon: React.ElementType;
              label: string;
              badge: number;
            }>
          ).map(({ id, Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActiveNavTab(id)}
              className="flex flex-col items-center gap-0.5 px-3 py-1 relative"
            >
              <div className="relative">
                <Icon
                  size={22}
                  style={activeNavTab === id ? { color: YASSALA_PINK } : { color: "#9CA3AF" }}
                />
                {badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                    style={{ backgroundColor: YASSALA_PINK }}
                  >
                    {badge}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] font-semibold"
                style={activeNavTab === id ? { color: YASSALA_PINK } : { color: "#9CA3AF" }}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
