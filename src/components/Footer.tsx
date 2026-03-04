'use client';

import React from 'react';
import Link from 'next/link';
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, MessageCircle, Heart, ExternalLink } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="relative bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
      </div>
      
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-6 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-orange-500 rounded-full blur opacity-40 group-hover:opacity-60 transition-opacity" />
                <div className="relative flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-orange-500">
                  <span className="text-white font-black text-xl">Y</span>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold">
                  <span className="text-emerald-400">YASSALA</span>
                  <span className="text-white"> SHOP</span>
                </h3>
                <p className="text-xs text-slate-400">Chez nous, y&apos;a ça ici !</p>
              </div>
            </Link>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Votre marketplace de confiance en Guyane. Livraison fiable, rapide et suivie en temps réel.
            </p>
            <div className="flex gap-3">
              {[
                { icon: <Facebook className="h-5 w-5" />, href: '#', color: 'hover:bg-blue-500' },
                { icon: <Instagram className="h-5 w-5" />, href: '#', color: 'hover:bg-pink-500' },
                { icon: <MessageCircle className="h-5 w-5" />, href: '#', color: 'hover:bg-green-500' },
              ].map((social, index) => (
                <a 
                  key={index}
                  href={social.href}
                  className={`w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all ${social.color}`}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Connexions */}
          <div>
            <h4 className="font-bold text-white mb-5 flex items-center gap-2">
              <span className="w-8 h-0.5 bg-gradient-to-r from-emerald-500 to-orange-500 rounded-full" />
              Connexions
            </h4>

            {/* Espace Pro — accès chef d'établissement */}
            <Link
              href="/etablissement/login"
              className="group flex items-center gap-3 mb-5 rounded-xl border border-orange-500/40 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 px-4 py-3 hover:from-orange-500/20 hover:to-yellow-500/20 hover:border-orange-400/70 transition-all"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-yellow-400 text-lg shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-shadow">
                🏫
              </span>
              <div>
                <div className="text-sm font-bold text-orange-300 group-hover:text-orange-200 leading-tight transition-colors">
                  Espace Pro
                </div>
                <div className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                  Chef d&apos;établissement
                </div>
              </div>
              <ExternalLink className="ml-auto h-3.5 w-3.5 text-orange-500/50 group-hover:text-orange-400 transition-colors" />
            </Link>

            <ul className="space-y-3">
              {[
                { href: '/', label: 'Accueil' },
                { href: '/commercants', label: 'Nos commerçants' },
                { href: '/suivi', label: 'Suivre ma livraison' },
                { href: '/panier', label: 'Mon panier' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-2 group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-emerald-500 transition-colors" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Catégories */}
          <div>
            <h4 className="font-bold text-white mb-5 flex items-center gap-2">
              <span className="w-8 h-0.5 bg-gradient-to-r from-emerald-500 to-orange-500 rounded-full" />
              Catégories
            </h4>
            <ul className="space-y-3">
              {[
                { href: '/commercants?category=courses', label: 'Courses & Alimentation', icon: '🛒' },
                { href: '/commercants?category=cosmetiques', label: 'Cosmétiques & Beauté', icon: '💄' },
                { href: '/commercants?category=bricolage', label: 'Dépannage & Bricolage', icon: '🔧' },
                { href: '/commercants?category=restauration', label: 'Restauration', icon: '🍔' },
              ].map((link) => (
                <li key={link.href}>
                  <Link 
                    href={link.href}
                    className="text-slate-400 hover:text-orange-400 transition-colors flex items-center gap-2 group"
                  >
                    <span>{link.icon}</span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-white mb-5 flex items-center gap-2">
              <span className="w-8 h-0.5 bg-gradient-to-r from-emerald-500 to-orange-500 rounded-full" />
              Contact
            </h4>
            <ul className="space-y-4">
              {[
                { icon: <Phone className="h-4 w-4" />, label: '0694 XX XX XX', color: 'text-emerald-400' },
                { icon: <Mail className="h-4 w-4" />, label: 'contact@yassalashop.gf', color: 'text-orange-400' },
                { icon: <MapPin className="h-4 w-4" />, label: 'Cayenne, Guyane', color: 'text-blue-400' },
                { icon: <Clock className="h-4 w-4" />, label: '7j/7 - 8h à 22h', color: 'text-purple-400' },
              ].map((item, index) => (
                <li key={index} className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center ${item.color}`}>
                    {item.icon}
                  </div>
                  <span className="text-slate-300 text-sm">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-slate-700/50">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm text-center md:text-left">
              © {currentYear} <span className="text-emerald-400 font-semibold">YASSALA SHOP</span>. Tous droits réservés.
            </p>
            <p className="text-slate-500 text-sm flex items-center gap-1">
              Made with <Heart className="h-4 w-4 text-red-500 fill-red-500 animate-pulse" /> en Guyane 
              <span className="ml-1 text-lg">🇬🇫</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
