"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { type MobileContentSnapshot } from "@/packages/manual-content/src/schema";
import bundledSeed from "@/apps/mobile/src/data/seed.json";
import { readContentBoot, validateSnapshotOnce } from "@/packages/manual-content/src/lifecycle/content-boot";
import { activateStagedPackage, stagePackage, type ContentStorage } from "@/packages/manual-content/src/lifecycle/content-transaction";
import { syncContentRelease, type ActiveContent } from "@/packages/manual-content/src/lifecycle/content-update-runtime";
import { browserContentStorage } from "./browser-content-storage";
import { NavBar } from "@/components/shared/NavBar";
import type { MainLinksData } from "@/lib/main-content";
import type { ProcedureSidebarSection } from "@/lib/content";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { PublicationBoundary } from "./PublicationBoundary";
import { PublishedContent } from "./PublishedContent";
import { PublicationSkeleton } from "./PublicationSkeleton";
import { readVerifiedSnapshot } from "./snapshot-cache";

const contentRoute = (path: string) => path === "/" || path === "/manual" || path.startsWith("/manual/") || ["/codigos", "/vademecum", "/abreviaturas"].includes(path);
// "stale": the last verified snapshot, shown from IndexedDB while the network check runs.
type State = { status: "loading" | "stale" | "live" | "cached" | "static" | "unavailable"; snapshot: MobileContentSnapshot | null };

export function PublicationShell({ children, fallbackNavigation, mainLinks, sidebarSections }: { children: React.ReactNode; fallbackNavigation: React.ReactNode; mainLinks: MainLinksData; sidebarSections: ProcedureSidebarSection[] }) {
  const route = usePathname();
  const [pathname, setPathname] = useState(route);
  const [state, setState] = useState<State>({ status: "loading", snapshot: null });
  useEffect(() => { queueMicrotask(() => { setPathname(window.location.pathname.replace(/\/$/, "") || "/"); }); }, [route]);
  useEffect(() => {
    if (route.startsWith("/gestion-editorial")) return;
    let disposed = false;
    let refreshing = false;
    let active: ActiveContent = { snapshot: bundledSeed as MobileContentSnapshot, isSeed: true };
    let generation = 0;
    let storage: ContentStorage;
    const controller = new AbortController();
    const boot = async () => {
      try { storage = await browserContentStorage(); }
      catch {
        // Private browsing may disable persistent storage; keep the live release
        // usable for this session without claiming it is available offline.
        const values = new Map<string, string>();
        storage = {
          getItem: async (key) => values.get(key) ?? null,
          setItem: async (key, value) => { values.set(key, value); },
          removeItem: async (key) => { values.delete(key); },
        };
      }
      const result = await readContentBoot(storage, active.snapshot);
      if (disposed) return;
      if (result.transaction.snapshot) {
        active = { snapshot: result.transaction.snapshot, release: result.transaction.release, isSeed: false };
        setState({ status: "stale", snapshot: active.snapshot });
        const candidate = active.snapshot;
        const bootGeneration = generation;
        void validateSnapshotOnce(candidate).then((valid) => {
          if (!disposed && !valid && generation === bootGeneration) {
            active = { snapshot: bundledSeed as MobileContentSnapshot, isSeed: true };
            setState({ status: "static", snapshot: null });
          }
        });
      } else {
        // Migrate the previous web cache only after strict validation.
        const cached = await readVerifiedSnapshot();
        if (disposed) return;
        if (cached) {
          try {
            const staged = await stagePackage(storage, cached, validateSnapshotOnce);
            await activateStagedPackage(storage, staged, validateSnapshotOnce);
            active = { snapshot: cached, isSeed: false };
            setState({ status: "stale", snapshot: cached });
          } catch { /* An old or incomplete cache cannot be migrated. */ }
        }
        if (active.isSeed) setState({ status: "static", snapshot: null });
      }
    };
    const ready = boot();
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await ready;
        if (disposed) return;
        const result = await syncContentRelease({ origin: "", active, storage, validate: validateSnapshotOnce, signal: controller.signal });
        if (disposed) return;
        if (result.kind === "updated") {
          generation += 1;
          active = { snapshot: result.snapshot, release: result.release, isSeed: false };
        }
        setState(active.isSeed ? { status: "static", snapshot: null } : { status: "live", snapshot: active.snapshot });
      } catch {
        if (!disposed) setState(active.isSeed ? { status: "static", snapshot: null } : { status: "cached", snapshot: active.snapshot });
      } finally { refreshing = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { disposed = true; controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [route]);

  if (route.startsWith("/gestion-editorial")) return <>{children}</>;
  const isContent = contentRoute(pathname);
  const snapshot = state.snapshot;
  return <div className="flex min-h-screen flex-col">
    {state.status === "static" ? fallbackNavigation : <NavBar procedures={snapshot?.content.procedures ?? []} mainLinks={mainLinks} snapshot={snapshot} />}
    {isContent && state.status === "cached" && <p role="status" className="border-b border-border bg-muted px-4 py-3 text-sm">Sin conexión con la publicación. Mostrando la última versión verificada: {snapshot?.generatedAt.slice(0, 10)}.</p>}
    <main className="min-h-0 flex-1 pb-16 md:pb-0">{!isContent || state.status === "static" ? children : snapshot ? <Suspense fallback={<PublicationSkeleton />}><PublicationBoundary key={`${snapshot.hash}:${pathname}`}><PublishedContent snapshot={snapshot} pathname={pathname} sidebarSections={sidebarSections} /></PublicationBoundary></Suspense> : state.status === "loading" ? <PublicationSkeleton /> : <section className="mx-auto max-w-3xl px-4 py-12" role="status"><h1 className="text-2xl font-semibold">Publicación no disponible</h1><p className="mt-3">No se ha podido verificar una publicación. Comprueba la conexión e inténtalo de nuevo.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-md border border-border px-4">Reintentar</button></section>}</main>
    <SiteFooter mainLinks={mainLinks} />
  </div>;
}
