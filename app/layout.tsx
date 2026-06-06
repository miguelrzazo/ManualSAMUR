import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { NavBar } from "@/components/shared/NavBar";
import { ViewportHeightObserver } from "@/components/shared/ViewportHeightObserver";
import { SuppressNextThemesWarning } from "@/components/shared/SuppressNextThemesWarning";
import { Toaster } from "@/components/ui/toaster";
import { getProcedureMeta } from "@/lib/content";
import { readMainLinksData } from "@/lib/main-content";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Manual Procedimientos SAMUR-PC",
  description: "Manual de procedimientos SAMUR-Protección Civil (Versión NO Oficial)",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.png", apple: "/favicon.png" },
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
  const procedures = getProcedureMeta();
  const mainLinks = readMainLinksData();

  return (
    <html lang="es" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ViewportHeightObserver />
          <SuppressNextThemesWarning />
          <div className="flex flex-col min-h-screen">
            <NavBar procedures={procedures} mainLinks={mainLinks} />
            <main className="min-h-0 flex-1 pb-16 md:pb-0">
              {children}
            </main>
          </div>
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
