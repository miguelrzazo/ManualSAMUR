import test from "node:test";
import assert from "node:assert/strict";
import { generateLlmsFullTxt, generateLlmsTxt, type ProcedureMeta } from "../scripts/generate-llms.ts";

const procedure: ProcedureMeta = {
  id: "101",
  title: "Procedimiento de prueba",
  section: "Operativos",
  slug: "101-procedimiento-de-prueba",
  updated: "2026-09-01",
  content: "Contenido sintético para verificar la exportación.",
  filePath: "content/procedures/101.md",
};

test("LLMS compact and full exports share corpus date, never wall-clock date", () => {
  const OriginalDate = globalThis.Date;
  class WallClockDate extends OriginalDate {
    constructor(value?: string | number) {
      super(value ?? "2099-12-31T00:00:00.000Z");
    }
  }
  Object.defineProperty(globalThis, "Date", { value: WallClockDate, configurable: true, writable: true });
  try {
    const compact = generateLlmsTxt([procedure]);
    const full = generateLlmsFullTxt([procedure]);
    assert.match(compact, /Última actualización: 2026-09-01/);
    assert.match(full, /Actualizado: 2026-09-01/);
    assert.doesNotMatch(compact, /2099-12-31/);
    assert.doesNotMatch(full, /2099-12-31/);
  } finally {
    Object.defineProperty(globalThis, "Date", { value: OriginalDate, configurable: true, writable: true });
  }
});

test("compact LLMS export includes every supported procedure section", () => {
  const procedures = [
    { ...procedure, id: "drp_01", section: "DRP", title: "Procedimiento DRP" },
    { ...procedure, id: "115", section: "Intervinientes", title: "Procedimiento intervinientes" },
  ];

  const compact = generateLlmsTxt(procedures, "2026-09-01");

  assert.match(compact, /## DRP \(1 procedimientos\)/);
  assert.match(compact, /- \[drp_01\] Procedimiento DRP:/);
  assert.match(compact, /## Intervinientes \(1 procedimientos\)/);
  assert.match(compact, /- \[115\] Procedimiento intervinientes:/);
});
