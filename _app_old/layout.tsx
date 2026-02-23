import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { CartProvider } from "@/context/CartContext";

export const viewport: Viewport = {
  themeColor: "#ff2d78",
};

export const metadata: Metadata = {
  title: "YASSALA NIGHT - Livraison de nuit en Guyane 🌙",
  description: "Service de livraison de boissons de nuit en Guyane. Bières, cocktails, spiritueux... Ouvert de 22h à 6h. Livraison express à Cayenne, Kourou, Remire-Montjoly.",
  keywords: ["Yassala Night", "Guyane", "Boissons nuit", "Livraison nuit", "Cayenne", "Kourou", "Cocktails", "Bières", "Rhum", "Spiritueux"],
  authors: [{ name: "YASSALA NIGHT" }],
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "YASSALA NIGHT - Livraison de nuit en Guyane 🌙",
    description: "Bières, cocktails, spiritueux... Livraison de 22h à 6h en Guyane !",
    url: "https://yassalashop.gf",
    siteName: "YASSALA NIGHT",
    type: "website",
    images: [{ url: "https://yassalashop.gf/logo.png", width: 512, height: 512, alt: "Yassala Night Shop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "YASSALA NIGHT - Livraison de nuit en Guyane 🌙",
    description: "Bières, cocktails, spiritueux... Livraison de 22h à 6h en Guyane !",
    images: ["https://yassalashop.gf/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Yassala" />
      </head>
      <body className="antialiased bg-background text-foreground">
        <CartProvider>
          {children}
        </CartProvider>
        <Toaster />
        <script dangerouslySetInnerHTML={{__html:`
          if('serviceWorker' in navigator){
            window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
          }
        `}} />
      </body>
    </html>
  );
}
