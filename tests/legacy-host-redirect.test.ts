import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_ORIGIN, legacyHostRedirect } from "../backend/src/worker.ts";

const legacy = "https://manualsamur.miguelrzazo13.workers.dev";

test("legacy host pages redirect permanently to the APTA subdomain, keeping path and query", () => {
  const response = legacyHostRedirect(new Request(`${legacy}/vademecum?farmaco=adrenalina`));
  assert.equal(response?.status, 301);
  assert.equal(response?.headers.get("Location"), `${CANONICAL_ORIGIN}/vademecum?farmaco=adrenalina`);
  assert.equal(legacyHostRedirect(new Request(`${legacy}/`))?.headers.get("Location"), `${CANONICAL_ORIGIN}/`);
});

test("data, files and the AASA keep being served on the legacy host for installed apps", () => {
  for (const path of ["/api/public/manifest", "/api/mobile/content/v3", "/.well-known/apple-app-site-association", "/mobile-history/x.json", "/procedures/301.md", "/docs/a.pdf", "/llms.txt", "/_next/static/x.js", "/gestion-editorial"]) {
    assert.equal(legacyHostRedirect(new Request(`${legacy}${path}`)), null, path);
  }
  assert.equal(legacyHostRedirect(new Request(`${legacy}/manual`, { method: "POST" })), null);
});

test("the canonical host is never redirected", () => {
  assert.equal(legacyHostRedirect(new Request(`${CANONICAL_ORIGIN}/manual`)), null);
});
