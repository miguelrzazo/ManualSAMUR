import test from "node:test";
import assert from "node:assert/strict";

import { getAllProcedures } from "../lib/content.ts";

/**
 * Un procedimiento sin cuerpo y sin adjuntos se renderiza como una página vacía:
 * cabecera, nada, y navegación. No hay ninguno así ahora mismo y no debería
 * aparecer uno sin que salte esto.
 */
test("ningún procedimiento se queda sin cuerpo y sin adjuntos", () => {
  const huerfanos = getAllProcedures()
    .filter((procedure) => procedure.content.trim().length === 0)
    .filter((procedure) => procedure.attachments.length === 0)
    .map((procedure) => procedure.id);

  assert.deepEqual(huerfanos, []);
});

/**
 * 101 y 102 son organigramas cuyo contenido ES el PDF. La página omite la tarjeta
 * de cuerpo y abre el adjunto por defecto (`hasBody` en app/manual/[slug]/page.tsx).
 * Si alguno recuperase texto propio, esa decisión deja de aplicar y conviene
 * revisarla en vez de seguir escondiendo el cuerpo.
 */
test("los procedimientos sin cuerpo llevan al menos un PDF que mostrar", () => {
  const sinCuerpo = getAllProcedures().filter((procedure) => procedure.content.trim().length === 0);

  assert.ok(sinCuerpo.length > 0, "Se esperaba al menos 101/102; ¿ha cambiado el corpus?");

  for (const procedure of sinCuerpo) {
    const pdfs = procedure.attachments.filter(
      (attachment) => attachment.kind === "pdf" || attachment.localPath.toLowerCase().endsWith(".pdf"),
    );
    assert.ok(
      pdfs.length > 0,
      `${procedure.id} no tiene cuerpo ni PDF: la página quedaría vacía.`,
    );
  }
});
