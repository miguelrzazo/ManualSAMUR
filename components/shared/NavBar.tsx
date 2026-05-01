"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Code2, Map, FlaskConical } from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/manual", label: "Manual", icon: BookOpen },
  { href: "/codigos", label: "Códigos", icon: Code2 },
  { href: "/vademecum", label: "Vademécum", icon: FlaskConical },
  { href: "/mapa", label: "Mapa", icon: Map },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:flex sticky top-0 z-50 h-14 items-center border-b border-border/60 bg-background/80 backdrop-blur-sm px-6 gap-1">
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

        <ThemeToggle />
      </header>

      {/* Mobile top bar (just logo + theme) */}
      <header className="flex md:hidden sticky top-0 z-50 h-12 items-center border-b border-border/60 bg-background/80 backdrop-blur-sm px-4 justify-between">
        <Link href="/manual" className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-primary flex items-center justify-center">
            <span className="text-[9px] font-bold text-primary-foreground">S</span>
          </div>
          <span className="font-semibold text-sm">SAMUR Manual</span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border/60 bg-background/95 backdrop-blur-sm flex items-center justify-around px-2">
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
    </>
  );
}
