import assert from "node:assert/strict";
import test from "node:test";
import { loadRemoteHistoryPage, type HistoryStorage } from "../apps/mobile/src/remote-history-logic.ts";

class MemoryStorage implements HistoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return Promise.resolve(this.values.get(key) ?? null); }
  setItem(key: string, value: string) { this.values.set(key, value); return Promise.resolve(); }
}

const index = {
  schema: "samur-manual.mobile-history" as const,
  version: 1 as const,
  publicationIdentity: "publication-1",
  generatedAt: "2026-09-09T10:00:00.000Z",
  pageSize: 100,
  totalEvents: 1,
  totalPages: 1,
  pages: [{ page: 0, path: "/mobile-history/publication-1/page-0000.json" }],
};

const page = {
  ...index,
  page: 0,
  events: [{
    eventId: "event-1",
    procedureIds: ["101"],
    changeKind: "actualizado",
    summary: "Procedimiento actualizado",
    effectiveDate: "2026-09-09",
  }],
};

test("remote mobile history caches pages by publication identity for offline use", async () => {
  const storage = new MemoryStorage();
  let online = true;
  const fetchImpl: typeof fetch = async (url) => {
    if (!online) throw new TypeError("network unavailable");
    return new Response(JSON.stringify(String(url).endsWith("index.json") ? index : page), { status: 200 });
  };

  const first = await loadRemoteHistoryPage({ origin: "https://example.test", page: 0, storage, fetchImpl });
  assert.equal(first.fromCache, false);
  assert.equal(first.page.events[0].eventId, "event-1");

  online = false;
  const offline = await loadRemoteHistoryPage({ origin: "https://example.test", page: 0, storage, fetchImpl });
  assert.equal(offline.fromCache, true);
  assert.equal(offline.page.publicationIdentity, "publication-1");
});
