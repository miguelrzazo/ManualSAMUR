"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { isMobileContentSnapshot, type MobileContentSnapshot } from "@/packages/manual-content/src/schema";
import { NavBar } from "@/components/shared/NavBar";
import type { MainLinksData } from "@/lib/main-content";
import type { ProcedureSidebarSection } from "@/lib/content";
import { AcademyPromo } from "@/components/shared/AcademyPromo";
import { PublicationBoundary } from "./PublicationBoundary";
import { PublishedContent } from "./PublishedContent";
import { readVerifiedSnapshot, saveVerifiedSnapshot } from "./snapshot-cache";

const contentRoute = (path: string) => path === "/" || path === "/manual" || path.startsWith("/manual/") || ["/codigos", "/vademecum", "/abreviaturas"].includes(path);
type State = { status: "loading" | "live" | "cached" | "static" | "unavailable"; snapshot: MobileContentSnapshot | null };

export function PublicationShell({ children, fallbackNavigation, mainLinks, sidebarSections }: { children: React.ReactNode; fallbackNavigation: React.ReactNode; mainLinks: MainLinksData; sidebarSections: ProcedureSidebarSection[] }) {
  const route = usePathname();
  const [pathname, setPathname] = useState(route);
  const [state, setState] = useState<State>({ status: "loading", snapshot: null });
  useEffect(() => { queueMicrotask(() => { setPathname(window.location.pathname.replace(/\/$/, "") || "/"); }); }, [route]);
  useEffect(() => {
    if (route.startsWith("/gestion-editorial")) return;
    let disposed = false;
    let refreshing = false;
    let active: MobileContentSnapshot | null = null;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch("/api/mobile/content/metadata", { cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("Publication metadata unavailable");
        const metadata = await response.json();
        if (!metadata.releaseId) {
          if (!disposed) setState({ status: "static", snapshot: null });
          return;
        }
        if (active?.hash === metadata.hash) {
          if (!disposed) setState({ status: "live", snapshot: active });
          return;
        }
        if (typeof metadata.contentUrl !== "string" || !/^\/api\/public\/releases\/[a-zA-Z0-9-]+\/snapshot$/.test(metadata.contentUrl)) throw new Error("Invalid publication URL");
        const result = await fetch(metadata.contentUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!result.ok) throw new Error("Publication unavailable");
        const candidate: unknown = await result.json();
        if (!isMobileContentSnapshot(candidate) || candidate.hash !== metadata.hash) throw new Error("Invalid publication integrity");
        active = candidate;
        if (!disposed) setState({ status: "live", snapshot: candidate });
        await saveVerifiedSnapshot(candidate);
      } catch {
        if (!active) active = await readVerifiedSnapshot();
        if (!disposed) setState({ status: active ? "cached" : "unavailable", snapshot: active });
      } finally { refreshing = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { disposed = true; window.clearInterval(interval); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [route]);

  if (route.startsWith("/gestion-editorial")) return <>{children}</>;
  const isContent = contentRoute(pathname);
  const snapshot = state.snapshot;
  return <div className="flex min-h-screen flex-col">
    {state.status === "static" ? fallbackNavigation : <NavBar procedures={snapshot?.content.procedures ?? []} mainLinks={mainLinks} snapshot={snapshot} />}
    {isContent && state.status === "cached" && <p role="status" className="border-b border-border bg-muted px-4 py-3 text-sm">Sin conexión con la publicación. Mostrando la última versión verificada: {snapshot?.generatedAt.slice(0, 10)}.</p>}
    <main className="min-h-0 flex-1 pb-16 md:pb-0">{!isContent || state.status === "static" ? children : snapshot ? <Suspense fallback={<p role="status" className="p-6">Cargando contenido…</p>}><PublicationBoundary key={`${snapshot.hash}:${pathname}`}><PublishedContent snapshot={snapshot} pathname={pathname} sidebarSections={sidebarSections} /></PublicationBoundary></Suspense> : <section className="mx-auto max-w-3xl px-4 py-12" role="status"><h1 className="text-2xl font-semibold">{state.status === "loading" ? "Cargando el manual publicado…" : "Publicación no disponible"}</h1>{state.status === "unavailable" && <><p className="mt-3">No se ha podido verificar una publicación. Comprueba la conexión e inténtalo de nuevo.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-md border border-border px-4">Reintentar</button></>}</section>}</main>
    <footer className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 pb-24 md:pb-8"><AcademyPromo /><nav aria-label="Información" className="flex flex-wrap gap-5 text-sm"><a href="/acerca-de" className="underline">Acerca de</a><a href="/cambios" className="underline">Cambios publicados</a><a href="/privacidad" className="underline">Privacidad</a><a href="/soporte" className="underline">Soporte</a></nav><p className="text-xs text-muted-foreground">Proyecto independiente. Versión no oficial del manual SAMUR-Protección Civil.</p></footer>
  </div>;
}
