/**
 * Emite public/graph.json: el grafo de procedimientos que la vista de grafo
 * (global y local) descarga bajo demanda. Nunca se pasa en props desde el
 * servidor, para no inflar el HTML de cada página.
 *
 * Usage:
 *   node --experimental-strip-types scripts/generate-graph.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProcedureCorpus } from "../lib/procedure-compiler.ts";
import { buildProcedureGraph, type ProcedureGraph } from "../lib/procedure-graph.ts";

export function generateProcedureGraph(cwd = process.cwd()): ProcedureGraph {
  return buildProcedureGraph(compileProcedureCorpus(cwd));
}

export function writeProcedureGraph(cwd = process.cwd(), outFile = path.join(cwd, "public", "graph.json")) {
  const graph = generateProcedureGraph(cwd);
  if (!graph.nodes.length) {
    throw new Error("[generate-graph] No se encontró ningún procedimiento.");
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(graph), "utf8");
  return { graph, bytes: fs.statSync(outFile).size, outFile };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { graph, bytes } = writeProcedureGraph();
    console.log(
      `[generate-graph] ${graph.nodes.length} nodos, ${graph.edges.length} aristas → public/graph.json (${(bytes / 1024).toFixed(1)} KB)`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
