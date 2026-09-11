import type { ManualUpdateEvent } from "./manual-tree-logic.ts";

const HISTORY_INDEX_CACHE_KEY = "manualsamur.history.index.v1";

export interface HistoryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface RemoteHistoryIndex {
  schema: "samur-manual.mobile-history";
  version: 1;
  publicationIdentity: string;
  generatedAt: string;
  pageSize: number;
  totalEvents: number;
  totalPages: number;
  pages: Array<{ page: number; path: string }>;
}

export interface RemoteHistoryPage {
  schema: "samur-manual.mobile-history";
  version: 1;
  publicationIdentity: string;
  page: number;
  pageSize: number;
  totalEvents: number;
  totalPages: number;
  events: ManualUpdateEvent[];
}

export interface HistoryPageResult {
  index: RemoteHistoryIndex;
  page: RemoteHistoryPage;
  fromCache: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isHistoryIndex(value: unknown): value is RemoteHistoryIndex {
  const record = asRecord(value);
  return Boolean(record
    && record.schema === "samur-manual.mobile-history"
    && record.version === 1
    && typeof record.publicationIdentity === "string"
    && typeof record.generatedAt === "string"
    && Number.isInteger(record.pageSize)
    && Number.isInteger(record.totalEvents)
    && Number.isInteger(record.totalPages)
    && Array.isArray(record.pages));
}

function isHistoryPage(value: unknown): value is RemoteHistoryPage {
  const record = asRecord(value);
  return Boolean(record
    && record.schema === "samur-manual.mobile-history"
    && record.version === 1
    && typeof record.publicationIdentity === "string"
    && Number.isInteger(record.page)
    && Array.isArray(record.events));
}

function cacheKey(publicationIdentity: string, page: number): string {
  return `manualsamur.history.page.v1:${publicationIdentity}:${page}`;
}

function absoluteUrl(origin: string, resourcePath: string): string {
  if (/^https?:\/\//i.test(resourcePath)) return resourcePath;
  return `${origin.replace(/\/$/, "")}/${resourcePath.replace(/^\//, "")}`;
}

async function readJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url, { cache: "no-store", headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`Historial: HTTP ${response.status}`);
  return response.json();
}

export async function loadRemoteHistoryPage(options: {
  origin: string;
  page: number;
  storage: HistoryStorage;
  fetchImpl?: typeof fetch;
}): Promise<HistoryPageResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!options.origin) throw new Error("No hay origen de contenido configurado");

  let index: RemoteHistoryIndex | undefined;
  try {
    const candidate = await readJson(fetchImpl, absoluteUrl(options.origin, "/mobile-history/index.json"));
    if (!isHistoryIndex(candidate)) throw new Error("El índice del historial no es válido");
    index = candidate;
    await options.storage.setItem(HISTORY_INDEX_CACHE_KEY, JSON.stringify(index));
  } catch (error) {
    const cached = options.storage ? await options.storage.getItem(HISTORY_INDEX_CACHE_KEY) : null;
    const parsed = cached ? JSON.parse(cached) as unknown : undefined;
    if (!isHistoryIndex(parsed)) throw error;
    index = parsed;
  }

  const pagePath = index.pages.find((item) => item.page === options.page)?.path
    ?? `/mobile-history/${index.publicationIdentity}/page-${String(options.page).padStart(4, "0")}.json`;
  const key = cacheKey(index.publicationIdentity, options.page);
  try {
    const candidate = await readJson(fetchImpl, absoluteUrl(options.origin, pagePath));
    if (!isHistoryPage(candidate) || candidate.publicationIdentity !== index.publicationIdentity || candidate.page !== options.page) {
      throw new Error("La página del historial no es válida");
    }
    await options.storage.setItem(key, JSON.stringify(candidate));
    return { index, page: candidate, fromCache: false };
  } catch (error) {
    const cached = await options.storage.getItem(key);
    const parsed = cached ? JSON.parse(cached) as unknown : undefined;
    if (!isHistoryPage(parsed) || parsed.publicationIdentity !== index.publicationIdentity || parsed.page !== options.page) throw error;
    return { index, page: parsed, fromCache: true };
  }
}
