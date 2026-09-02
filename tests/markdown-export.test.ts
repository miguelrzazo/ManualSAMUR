import test from "node:test";
import assert from "node:assert/strict";
import { canonicalProcedureMarkdown, resolveCanonicalSiteUrl } from "../lib/markdown-export.ts";

test("resolveCanonicalSiteUrl prefers configured origins and normalizes slashes", () => {
  assert.equal(resolveCanonicalSiteUrl({ SITE_URL: "https://example.test///" }), "https://example.test");
  assert.equal(resolveCanonicalSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://public.test/" }), "https://public.test");
  assert.equal(resolveCanonicalSiteUrl({ VERCEL_URL: "preview.vercel.app" }), "https://preview.vercel.app");
});

test("canonicalProcedureMarkdown preserves metadata, tables, links and attachment references", () => {
  const markdown = canonicalProcedureMarkdown({
    id: "301",
    title: "Parada cardiorrespiratoria",
    section: "SVA",
    slug: "301-parada-cardiorrespiratoria",
    source: "https://servpub.madrid.es/source",
    attachments: [{ sourceUrl: "https://servpub.madrid.es/a.pdf", localPath: "/docs/a.pdf", kind: "pdf" }],
    content: "## Valoración\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[Procedimiento](/manual/302-otro)",
  });

  assert.match(markdown, /^---\nid: "301"/);
  assert.match(markdown, /## Valoración/);
  assert.match(markdown, /\| A \| B \|/);
  assert.match(markdown, /\[Procedimiento\]\(\/manual\/302-otro\)/);
  assert.match(markdown, /https:\/\/servpub\.madrid\.es\/a\.pdf/);
});
