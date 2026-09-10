import test from "node:test";
import assert from "node:assert/strict";
import {
  readableChangeKindLabel,
  readableChangeTitle,
  readableContentChange,
} from "../packages/manual-content/src/content-diff.ts";

test("readable change titles remove the feed prefix", () => {
  assert.equal(readableChangeTitle("Actualizado: 123 Técnicas de comunicación"), "123 Técnicas de comunicación");
  assert.equal(readableChangeTitle("Contenido nuevo"), "Contenido nuevo");
});

test("readable change labels use non-technical language", () => {
  assert.equal(readableChangeKindLabel("nuevo"), "Contenido añadido");
  assert.equal(readableChangeKindLabel("eliminado"), "Contenido retirado");
  assert.equal(readableChangeKindLabel("actualizado"), "Contenido actualizado");
  assert.equal(readableChangeKindLabel("sync"), "Actualización del manual");
});

test("readable content changes keep only cleaned before and after fragments", () => {
  assert.deepEqual(
    readableContentChange("Index: 123\n--- 123\n+++ 123\n@@ -1 +1 @@\n-# (((//Antes//)))\n+**Después**\n contexto"),
    { before: ["Antes"], after: ["Después"] },
  );
});

test("readable content changes remove inline wiki emphasis even when the sentence contains slashes", () => {
  assert.deepEqual(readableContentChange("- //Buenos días / tardes / noches//"), { before: ["Buenos días / tardes / noches"], after: [] });
});

test("readable content changes support additions and removals", () => {
  assert.deepEqual(readableContentChange("- Se retira esta pauta"), { before: ["Se retira esta pauta"], after: [] });
  assert.deepEqual(readableContentChange("+ * Se añade esta pauta"), { before: [], after: ["• Se añade esta pauta"] });
});

test("readable content changes mark separate paragraphs instead of stitching them together", () => {
  assert.deepEqual(readableContentChange("@@ -1 +1 @@\n-Primera pauta\n+Primera pauta revisada\n@@ -40 +40 @@\n-Segunda pauta\n+Segunda pauta revisada"), {
    before: ["Primera pauta", "…", "Segunda pauta"],
    after: ["Primera pauta revisada", "…", "Segunda pauta revisada"],
  });
});
