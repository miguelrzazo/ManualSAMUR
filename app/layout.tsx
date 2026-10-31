import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { PublicationShell } from "@/components/publication/PublicationShell";
import { NavBar } from "@/components/shared/NavBar";
import { ViewportHeightObserver } from "@/components/shared/ViewportHeightObserver";
import { SuppressNextThemesWarning } from "@/components/shared/SuppressNextThemesWarning";
import { Toaster } from "@/components/ui/toaster";
import { getProcedureNavMeta } from "@/lib/content";
import { readMainLinksData } from "@/lib/main-content";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manual Procedimientos SAMUR-PC",
  description: "Manual de procedimientos SAMUR-Protección Civil (Versión NO Oficial)",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    // apple-touch-icon has to be its own 180x180: iOS ignores sizes it has to
    // downscale itself, and the old value pointed at a 1254px favicon.
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Manual SAMUR" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1117" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const procedures = getProcedureNavMeta();
  const mainLinks = readMainLinksData();

  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ViewportHeightObserver />
          <SuppressNextThemesWarning />
          <PublicationShell fallbackNavigation={<NavBar procedures={procedures} mainLinks={mainLinks} />}>
            {children}
          </PublicationShell>
          <Toaster />
        </ThemeProvider>
        <Script id="sw-registration" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(function () {});
  });
}`}
        </Script>
      </body>
    </html>
  );
}
