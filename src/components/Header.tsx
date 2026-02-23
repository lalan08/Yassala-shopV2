'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShoppingCart, Search, Menu, X, MapPin, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/context/CartContext';
import { useState as useReactState } from 'react';

export function Header() {
  const { getItemCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const itemCount = getItemCount();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled 
          ? 'bg-white/90 backdrop-blur-xl shadow-lg border-b border-emerald-100/50' 
          : 'bg-white/70 backdrop-blur-md'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 md:h-20 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-orange-500 rounded-full blur opacity-30 group-hover:opacity-50 transition-opacity" />
              <div className="relative flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-emerald-500 via-emerald-400 to-orange-500 shadow-lg">
                <span className="text-white font-black text-xl">Y</span>
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl md:text-2xl font-black">
                <span className="gradient-text">YASSALA</span>
                <span className="text-gray-800"> SHOP</span>
              </h1>
              <p className="text-xs text-gray-500 -mt-0.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-500" />
                Chez nous, y&apos;a ça ici !
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { href: '/', label: 'Accueil' },
              { href: '/commercants', label: 'Commerçants' },
              { href: '/suivi', label: 'Suivi' },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <Button 
                  variant="ghost" 
                  className="text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-full px-5 font-medium"
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          {/* Search Bar - Desktop */}
          <div className="hidden lg:flex items-center flex-1 max-w-md mx-6">
            <div className="relative w-full group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-orange-500 rounded-full blur opacity-0 group-focus-within:opacity-30 transition-opacity" />
              <div className="relative flex items-center bg-gray-50 hover:bg-gray-100 transition-colors rounded-full border border-gray-200 focus-within:border-emerald-300 focus-within:bg-white">
                <Search className="absolute left-4 text-gray-400 h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 pr-4 py-2 w-full bg-transparent border-0 focus:ring-0 focus:outline-none text-sm"
                />
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* Location */}
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-full px-4 py-2">
              <MapPin className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">Guyane</span>
              <span className="text-lg">🇬🇫</span>
            </div>

            {/* Cart */}
            <Link href="/panier">
              <Button 
                variant="ghost" 
                className="relative p-2 md:p-3 rounded-full hover:bg-emerald-50 group"
              >
                <ShoppingCart className="h-5 w-5 md:h-6 md:w-6 text-gray-700 group-hover:text-emerald-600 transition-colors" />
                {itemCount > 0 && (
                  <span className="notification-badge">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </Button>
            </Link>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              className="md:hidden p-2 rounded-full hover:bg-emerald-50"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6 text-gray-700" />
              ) : (
                <Menu className="h-6 w-6 text-gray-700" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="lg:hidden pb-3">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-orange-500 rounded-full blur opacity-0 group-focus-within:opacity-30 transition-opacity" />
            <div className="relative flex items-center bg-gray-50 rounded-full border border-gray-200">
              <Search className="absolute left-4 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 pr-4 py-2.5 w-full bg-transparent border-0 focus:ring-0 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100 animate-slide-up">
            <nav className="flex flex-col gap-1">
              {[
                { href: '/', label: 'Accueil', icon: '🏠' },
                { href: '/commercants', label: 'Commerçants', icon: '🏪' },
                { href: '/suivi', label: 'Suivi livraison', icon: '📦' },
                { href: '/panier', label: 'Mon panier', icon: '🛒' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl py-3 font-medium"
                  >
                    <span className="mr-3 text-xl">{item.icon}</span>
                    {item.label}
                  </Button>
                </Link>
              ))}
              <div className="flex items-center gap-2 text-gray-600 text-sm py-3 px-4 mt-2 bg-gray-50 rounded-xl">
                <MapPin className="h-4 w-4 text-emerald-500" />
                <span>Livraison en Guyane</span>
                <span className="text-lg">🇬🇫</span>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
