"use client";

import { diffLines } from "diff";

export function RevisionDiff({ original, current, originalLabel = "Versión anterior", currentLabel = "Tu propuesta" }: { original: unknown; current: unknown; originalLabel?: string; currentLabel?: string }) {
  const parts = diffLines(JSON.stringify(original, null, 2) || "", JSON.stringify(current, null, 2) || "");
  return <div className="ed-diff"><section><h3>{originalLabel}</h3><pre>{parts.filter(part => !part.added).map((part, i) => <span className={part.removed ? "ed-removed" : ""} key={i}>{part.value.split("\n").map((line, n, lines) => n === lines.length - 1 && !line ? null : <span key={n}>{part.removed ? "− " : "  "}{line}{"\n"}</span>)}</span>)}</pre></section><section><h3>{currentLabel}</h3><pre>{parts.filter(part => !part.removed).map((part, i) => <span className={part.added ? "ed-added" : ""} key={i}>{part.value.split("\n").map((line, n, lines) => n === lines.length - 1 && !line ? null : <span key={n}>{part.added ? "+ " : "  "}{line}{"\n"}</span>)}</span>)}</pre></section></div>;
}
