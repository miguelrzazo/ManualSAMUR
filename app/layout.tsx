import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { NavBar } from "@/components/shared/NavBar";
import { ViewportHeightObserver } from "@/components/shared/ViewportHeightObserver";
import { SuppressNextThemesWarning } from "@/components/shared/SuppressNextThemesWarning";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SAMUR Manual",
  description: "Manual de procedimientos SAMUR-Protección Civil",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SAMUR Manual" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1117" },
  ],
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-visual",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ViewportHeightObserver />
          <SuppressNextThemesWarning />
          <div className="flex flex-col min-h-screen">
            <NavBar />
            <main className="min-h-0 flex-1 pb-16 md:pb-0">
              {children}
            </main>
          </div>
          <Toaster />
        </ThemeProvider>
        {/* <Script id="sw-registration" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`}
        </Script> */}
      </body>
    </html>
  );
}
