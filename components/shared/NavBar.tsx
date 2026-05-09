"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Code2, Map, FlaskConical } from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { AppMenu } from "@/components/shared/AppMenu";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProcedureMeta } from "@/lib/content";

const navItems = [
  { href: "/manual", label: "Manual", icon: BookOpen },
  { href: "/codigos", label: "Códigos", icon: Code2 },
  { href: "/vademecum", label: "Vademécum", icon: FlaskConical },
  { href: "/mapa", label: "Mapa", icon: Map },
];

interface Props {
  procedures: ProcedureMeta[];
}

export function NavBar({ procedures }: Props) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:flex sticky top-0 z-50 items-center border-b border-border/60 bg-background/80 backdrop-blur-sm px-6 gap-4 pt-[env(safe-area-inset-top)] h-[calc(3.5rem+env(safe-area-inset-top))]">
        <Link href="/manual" className="mr-6 flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary-foreground">S</span>
          </div>
          <span className="font-semibold text-sm tracking-tight">SAMUR Manual</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 w-64 px-3 py-2 rounded-lg border border-border/60 bg-muted/40 text-muted-foreground text-sm hover:bg-muted transition-colors"
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="flex-1 text-left">Buscar...</span>
            <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-border bg-background font-mono">
              ⌘K
            </kbd>
          </button>
          <AppMenu />
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile top bar (just logo + search + theme) */}
      <header className="flex md:hidden sticky top-0 z-50 items-center border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 justify-between pt-[env(safe-area-inset-top)] h-[calc(3rem+env(safe-area-inset-top))]">
        <Link href="/manual" className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-primary flex items-center justify-center">
            <span className="text-[9px] font-bold text-primary-foreground">S</span>
          </div>
          <span className="font-semibold text-sm">SAMUR Manual</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <AppMenu />
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-sm flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] h-[calc(4rem+env(safe-area-inset-bottom))]">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors min-w-[4rem]",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <GlobalSearch isOpen={searchOpen} onOpenChange={setSearchOpen} procedures={procedures} />
    </>
  );
}
