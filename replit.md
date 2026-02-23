# YASSALA NIGHT SHOP

## Overview
A drink delivery service for French Guiana (Guyane) built with Next.js. Features a neon punk aesthetic with dynamic product catalog loaded from Firebase Firestore, cart, WhatsApp/Stripe ordering, authentication, and admin panel.

## Recent Changes
- **2026-02-23**: Driver management system
  - Created /livreur page with phone+password login for accepted drivers
  - Drivers can see pending orders, take them, mark as delivered, view stats
  - Admin generates password when accepting a driver application (shown in admin)
  - "Devenir livreur" button in navbar + floating button on main shop page
  - Driver application form saves to Firebase `driver_applications` collection
  - Admin LIVREURS tab with filter by status, accept/refuse/delete actions
- **2026-02-23**: Admin panel modernization
  - Replaced CRT scanline effect with clean modern design
  - Added Inter font, updated all section headers and buttons
  - Glassmorphism cards, modern border-radius, smooth transitions
  - Collapsible sidebar sections (closed by default)
- **2026-02-22**: Fixed deployment build
  - Switched from Bun to Node.js runtime (Bun's worker_threads incompatible with Next.js build)
  - Removed unused pages (/commande, /panier, /commercant, /commercants) that caused build errors
  - Configured deployment: `npm run build` + standalone server
  - Added CLIENTS tab in admin panel, removed Bannière Promo Catalogue from settings
- **2026-02-22**: Restored original Firebase-based code
  - Restored `_app_old/page.tsx` (Firebase Firestore, Auth, real product images) to `src/app/`
  - Restored API routes (checkout, notify, webhook) and admin/preview/suivi/succes pages
  - Fixed globals.css from Tailwind v4 to v3 syntax
  - Simplified layout.tsx (removed CartProvider/Toaster - page.tsx manages own state)
- **2026-02-22**: Initial Replit setup
  - Configured Next.js for Replit (allowedDevOrigins, port 5000, standalone output)

## Project Architecture
- **Framework**: Next.js 16.1.6 (Turbopack)
- **Package Manager**: npm (Node.js 20)
- **CSS**: Tailwind CSS v3 with PostCSS + autoprefixer; page.tsx uses inline <style> tag
- **Backend**: Firebase (Firestore for products/orders/settings, Auth for users)
- **Payments**: Stripe (checkout API route) + WhatsApp ordering
- **Notifications**: Telegram bot (notify API route)
- **Data**: Dynamic from Firebase Firestore (products, packs, banners, categories, settings, coupons)
- **State Management**: Local state in page.tsx (cart, auth, likes via localStorage)

## Key Files
- `next.config.ts` - Next.js config with Replit origins, standalone output
- `tailwind.config.js` - Tailwind v3 config
- `postcss.config.mjs` - PostCSS with tailwindcss + autoprefixer
- `src/app/page.tsx` - Main page (1750 lines) with Firebase integration, all product/cart/auth UI
- `src/app/layout.tsx` - Root layout (minimal, no providers)
- `src/app/globals.css` - Global styles, animations, glow effects
- `src/app/admin/page.tsx` - Admin dashboard
- `src/app/api/checkout/route.ts` - Stripe checkout session creation
- `src/app/api/notify/route.ts` - Telegram notification for orders
- `src/app/api/webhook/route.ts` - Stripe webhook handler
- `src/app/preview/page.tsx` - Preview page
- `src/app/suivi/page.tsx` - Order tracking
- `src/app/succes/page.tsx` - Order success page

## Pages
- `/` - Main page (products, packs, cart modal, auth, ordering, driver application form)
- `/admin` - Admin dashboard (with LIVREURS tab for managing driver applications)
- `/livreur` - Driver portal (login with phone+password, view/take orders, mark delivered, stats)
- `/preview` - Preview page
- `/suivi` - Order tracking
- `/succes` - Order success page

## Environment Variables Needed
- `STRIPE_SECRET_KEY` - Stripe secret key for payments
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `TELEGRAM_BOT_TOKEN` - Telegram bot token for order notifications
- `TELEGRAM_CHAT_ID` - Telegram chat ID for notifications

## Workflow
- **Start application**: `npm run dev` (Next.js dev server on port 5000)

## Deployment
- **Build**: `npm run build`
- **Start**: `npm run start` (Node.js standalone server on port 5000)
- **Target**: autoscale

## Notes
- Firebase config is hardcoded in page.tsx (client-side API key, standard practice)
- `_app_old/` contains backup of original app directory
- typescript.ignoreBuildErrors is enabled in next.config.ts
- Unused pages (commande, panier, commercant, commercants) removed to fix build errors
