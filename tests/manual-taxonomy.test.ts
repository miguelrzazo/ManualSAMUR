import test from "node:test";
import assert from "node:assert/strict";

import { getAllProcedures } from "../lib/content.ts";
import { getProcedureSidebarMeta } from "../lib/manual-data.ts";

test("no procedure lands in the phantom 'Sin clasificar' fallback", () => {
  const procedures = getAllProcedures();
  const offenders: string[] = [];

  for (const procedure of procedures) {
    const meta = getProcedureSidebarMeta(procedure.section, procedure.id, procedure.title);
    if (meta.subgroup === "Sin clasificar") {
      offenders.push(procedure.id);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Procedimientos sin clasificar explícitamente en getProcedureSidebarMeta (revisar la rama "SVA" en lib/manual-data.ts): ${offenders.join(", ")}`,
  );
});

test("every procedure resolves to a non-empty group and subgroup", () => {
  const procedures = getAllProcedures();
  const offenders: string[] = [];

  for (const procedure of procedures) {
    const meta = getProcedureSidebarMeta(procedure.section, procedure.id, procedure.title);
    if (!meta.group || !meta.subgroup) {
      offenders.push(procedure.id);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Procedimientos con group/subgroup vacío o indefinido: ${offenders.join(", ")}`,
  );
});
