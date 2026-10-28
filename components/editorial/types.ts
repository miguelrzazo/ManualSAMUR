export type Status = "draft" | "in_review" | "ready" | "published" | "archived";
export const statusLabels: Record<Status, string> = { draft: "Borrador", in_review: "En revisión", ready: "Listo para publicar", published: "Publicado", archived: "Archivado" };
export interface DocumentSummary { id: string; category: string; title: string; status: Status; revision: number; updatedAt: string }
export interface EditorialDocument extends DocumentSummary { data: Record<string, unknown>; privateNotes: string; references: string[]; sourceData: Record<string, unknown> | null; incomingSourceData: Record<string, unknown> | null }
export interface Revision { revision: number; title: string; data: Record<string, unknown>; status: Status; createdAt: string }
export interface Release { id: string; status: string; summary: string; createdAt: string; publishedAt?: string; error?: string }
export class EditorialApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function editorRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/editor${path}`, { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new EditorialApiError(response.status === 409 ? "Este documento ha cambiado en otra sesión. Tu texto sigue aquí: cópialo o descárgalo antes de cargar la revisión actual." : (typeof payload.error === "string" ? payload.error : payload.error?.message) || (response.status === 401 || response.status === 403 ? "Acceso no autorizado. Abre esta dirección con la identidad autorizada en Cloudflare Access." : `No se pudo completar la operación (${response.status}).`), response.status);
  return payload as T;
}
