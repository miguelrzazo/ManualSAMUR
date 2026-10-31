"use client";

import { diffLines, diffWords, type Change } from "diff";

type Row = { kind: "same" | "removed" | "added" | "changed"; before?: string; after?: string; words?: Change[] };

const lines = (value: string) => value.replace(/\n$/, "").split("\n");

/** Pair removed/added blocks line by line so edits inside a sentence show word-level highlights. */
function rows(before: string, after: string): Row[] {
  const parts = diffLines(before, after);
  const result: Row[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (!part.added && !part.removed) { for (const line of lines(part.value)) result.push({ kind: "same", before: line, after: line }); continue; }
    const next = parts[index + 1];
    if (part.removed && next?.added) {
      const removed = lines(part.value); const added = lines(next.value);
      for (let n = 0; n < Math.max(removed.length, added.length); n++) {
        if (n < removed.length && n < added.length) result.push({ kind: "changed", before: removed[n], after: added[n], words: diffWords(removed[n], added[n]) });
        else if (n < removed.length) result.push({ kind: "removed", before: removed[n] });
        else result.push({ kind: "added", after: added[n] });
      }
      index++; continue;
    }
    for (const line of lines(part.value)) result.push(part.added ? { kind: "added", after: line } : { kind: "removed", before: line });
  }
  return result;
}

function TextDiff({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const table = rows(before, after);
  const changed = table.filter(row => row.kind !== "same").length;
  if (!changed) return <p className="ed-field-hint">Sin diferencias.</p>;
  // Long unchanged stretches are collapsed to keep the reviewer on the edits.
  const visible = table.map((row, index) => row.kind !== "same" || table.slice(Math.max(0, index - 2), index + 3).some(near => near.kind !== "same"));
  return <div className="ed-diff" role="table" aria-label={`Diferencias: ${changed} líneas cambiadas`}>
    <section><h3>{beforeLabel}</h3><pre>{table.map((row, index) => !visible[index] ? (visible[index - 1] ? <span key={index} className="ed-diff-gap">…{"\n"}</span> : null) : row.kind === "added" ? <span key={index} className="ed-diff-empty">{"\n"}</span> :
      <span key={index} className={row.kind === "same" ? "" : "ed-removed"}>{row.kind === "same" ? "  " : "− "}{row.kind === "changed" ? row.words!.filter(word => !word.added).map((word, n) => <span key={n} className={word.removed ? "ed-word-removed" : ""}>{word.value}</span>) : row.before}{"\n"}</span>)}</pre></section>
    <section><h3>{afterLabel}</h3><pre>{table.map((row, index) => !visible[index] ? (visible[index - 1] ? <span key={index} className="ed-diff-gap">…{"\n"}</span> : null) : row.kind === "removed" ? <span key={index} className="ed-diff-empty">{"\n"}</span> :
      <span key={index} className={row.kind === "same" ? "" : "ed-added"}>{row.kind === "same" ? "  " : "+ "}{row.kind === "changed" ? row.words!.filter(word => !word.removed).map((word, n) => <span key={n} className={word.added ? "ed-word-added" : ""}>{word.value}</span>) : row.after}{"\n"}</span>)}</pre></section>
  </div>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function RevisionDiff({ original, current, originalLabel = "Versión anterior", currentLabel = "Tu propuesta" }: { original: unknown; current: unknown; originalLabel?: string; currentLabel?: string }) {
  // Procedures: compare the readable text first, then the remaining fields.
  const bodyKey = isRecord(original) && isRecord(current) ? ["content", "markdown", "body"].find(key => typeof original[key] === "string" && typeof current[key] === "string") : undefined;
  if (bodyKey && isRecord(original) && isRecord(current)) {
    const { [bodyKey]: beforeBody, ...beforeRest } = original;
    const { [bodyKey]: afterBody, ...afterRest } = current;
    const restChanged = JSON.stringify(beforeRest) !== JSON.stringify(afterRest);
    return <div>
      <TextDiff before={String(beforeBody)} after={String(afterBody)} beforeLabel={`${originalLabel} · texto`} afterLabel={`${currentLabel} · texto`} />
      <details className="ed-card"><summary>{restChanged ? "Otros campos (con cambios)" : "Otros campos (sin cambios)"}</summary>
        <TextDiff before={JSON.stringify(beforeRest, null, 2)} after={JSON.stringify(afterRest, null, 2)} beforeLabel={originalLabel} afterLabel={currentLabel} /></details>
    </div>;
  }
  return <TextDiff before={typeof original === "string" ? original : JSON.stringify(original, null, 2) || ""} after={typeof current === "string" ? current : JSON.stringify(current, null, 2) || ""} beforeLabel={originalLabel} afterLabel={currentLabel} />;
}
