import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildProcedureGraph,
  edgeKey,
  localSubgraph,
  matchGraphNodes,
  type ProcedureGraphSource,
} from "../lib/procedure-graph.ts";
import { generateProcedureGraph, writeProcedureGraph } from "../scripts/generate-graph.ts";
import { compileProcedureCorpus } from "../lib/procedure-compiler.ts";

function source(id: string, section: string, relations: ProcedureGraphSource["relations"] = []): ProcedureGraphSource {
  return { id, title: `Procedimiento ${id}`, slug: `${id}-slug`, section, relations };
}

const out = (id: string, kind = "body") => ({ id, direction: "outgoing", kind });

test("graph keeps real outgoing links, dedupes pairs and drops suggested, incoming, self and unknown", () => {
  const graph = buildProcedureGraph([
    source("101", "SVA", [out("102"), out("103", "suggested"), out("101"), out("999")]),
    source("102", "SVB", [out("101"), { id: "101", direction: "incoming", kind: "body" }, out("103", "editorial")]),
    source("103", "SVA"),
  ]);
  assert.deepEqual(graph.sections, ["SVA", "SVB"]);
  assert.deepEqual(graph.nodes.map((node) => node.id), ["101", "102", "103"]);
  assert.deepEqual(graph.nodes[0], { id: "101", title: "Procedimiento 101", slug: "101-slug", section: "SVA" });
  assert.deepEqual(graph.edges, [
    { source: "101", target: "102" },
    { source: "102", target: "103" },
  ]);
});

test("local subgraph expands by hops and keeps only edges among included nodes", () => {
  const graph = buildProcedureGraph([
    source("a", "SVA", [out("b")]),
    source("b", "SVA", [out("c")]),
    source("c", "SVB", [out("d")]),
    source("d", "Técnicas"),
    source("e", "Técnicas"),
  ]);
  const one = localSubgraph(graph, "b", 1);
  assert.deepEqual(one.nodes.map((node) => node.id).sort(), ["a", "b", "c"]);
  assert.equal(one.edges.length, 2);
  assert.deepEqual(one.sections, ["SVA", "SVB"]);
  const two = localSubgraph(graph, "a", 2);
  assert.deepEqual(two.nodes.map((node) => node.id).sort(), ["a", "b", "c"]);
  assert.deepEqual(localSubgraph(graph, "e", 2).nodes.map((node) => node.id), ["e"]);
  assert.deepEqual(localSubgraph(graph, "missing", 1).nodes, []);
});

test("search matches id and title ignoring accents and case", () => {
  const graph = buildProcedureGraph([
    { id: "301", title: "Parada cardiorrespiratoria", slug: "301", section: "SVA", relations: [] },
    { id: "412", title: "Intoxicación etílica", slug: "412", section: "SVA", relations: [] },
  ]);
  assert.deepEqual(matchGraphNodes(graph, "INTOXICACION"), ["412"]);
  assert.deepEqual(matchGraphNodes(graph, "301"), ["301"]);
  assert.deepEqual(matchGraphNodes(graph, "  "), []);
});

test("generator over the real corpus covers every procedure with valid, unique edges", () => {
  const graph = generateProcedureGraph();
  const procedures = compileProcedureCorpus();
  assert.equal(graph.nodes.length, procedures.length);
  assert.ok(graph.edges.length > 0, "the manual should have internal links");
  const ids = new Set(graph.nodes.map((node) => node.id));
  const keys = new Set<string>();
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.source) && ids.has(edge.target), `dangling edge ${edge.source}→${edge.target}`);
    assert.notEqual(edge.source, edge.target);
    const key = edgeKey(edge.source, edge.target);
    assert.ok(!keys.has(key), `duplicate edge ${key}`);
    keys.add(key);
  }
  // Same rule as the "Enlaces salientes" card: every non-suggested outgoing link is an edge.
  for (const procedure of procedures) {
    for (const relation of procedure.relations) {
      if (relation.direction !== "outgoing" || relation.kind === "suggested" || relation.id === procedure.id) continue;
      assert.ok(keys.has(edgeKey(procedure.id, relation.id)), `missing edge ${procedure.id}→${relation.id}`);
    }
  }
  // Only the narrow fields ship: no body text leaks into the client dataset.
  for (const node of graph.nodes) assert.deepEqual(Object.keys(node).sort(), ["id", "section", "slug", "title"]);
});

test("writeProcedureGraph emits compact JSON to the requested file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samur-graph-"));
  try {
    const outFile = path.join(dir, "nested", "graph.json");
    const { graph, bytes } = writeProcedureGraph(process.cwd(), outFile);
    const parsed = JSON.parse(fs.readFileSync(outFile, "utf8"));
    assert.deepEqual(parsed, graph);
    assert.ok(bytes < 200 * 1024, `graph.json should stay small, got ${bytes} bytes`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
