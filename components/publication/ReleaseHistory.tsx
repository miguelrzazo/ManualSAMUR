"use client";

import { useEffect, useState } from "react";
interface Release { id: string; summary: string; publishedAt: string; changes: { kind: string; title: string; procedureIds: string[] }[] }
function isRelease(value: unknown): value is Release {
  if (!value || typeof value !== "object") return false;
  const item = value as Release;
  return typeof item.id === "string" && /^[a-zA-Z0-9-]+$/.test(item.id) && typeof item.summary === "string" && typeof item.publishedAt === "string" && Array.isArray(item.changes) && item.changes.every((change) => typeof change.kind === "string" && typeof change.title === "string" && Array.isArray(change.procedureIds) && change.procedureIds.every((id) => typeof id === "string"));
}
export function ReleaseHistory() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/releases", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (!Array.isArray(data.releases) || !data.releases.every(isRelease)) throw new Error("Invalid response");
      setReleases(data.releases);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert">No se han podido cargar los cambios publicados. Vuelve a intentarlo cuando tengas conexión.</p>;
  if (!releases) return <p role="status">Cargando publicaciones…</p>;
  if (!releases.length) return <p>Todavía no hay publicaciones disponibles.</p>;
  return <ol className="space-y-8">{releases.map((release) => <li key={release.id} className="rounded-xl border border-border p-5"><p className="text-sm text-muted-foreground"><time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}</time></p><h2 className="mt-2 text-xl font-semibold">{release.summary}</h2><ul className="mt-4 space-y-3">{release.changes.map((change, index) => <li key={index}><p>{change.title}</p><p className="text-xs text-muted-foreground">{({ add: "Alta", addition: "Alta", modify: "Modificación", update: "Modificación", archive: "Archivo", remove: "Retirada" } as Record<string, string>)[change.kind] || change.kind}{change.procedureIds.length > 0 ? ` · ${change.procedureIds.join(", ")}` : ""}</p></li>)}</ul><a className="mt-4 inline-flex min-h-11 items-center text-primary underline" href={`/api/public/releases/${encodeURIComponent(release.id)}/changelog.pdf`} download>Descargar resumen en PDF</a></li>)}</ol>;
}
