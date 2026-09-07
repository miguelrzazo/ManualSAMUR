export interface CodeChange {
  id: string;
  title: string;
  changeType: "created" | "updated" | "deleted";
  changeKind: "nuevo" | "actualizado" | "eliminado";
  category: "codigo";
  routeKey: string;
}

export class CodeDatasetImplausibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeDatasetImplausibleError";
  }
}

function codeRecords(value: unknown): Array<Record<string, unknown> & { code: string; name: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.code !== "string" || !record.code.trim()) return [];
    return [{ ...record, code: record.code, name: typeof record.name === "string" ? record.name : record.code }];
  });
}

export function assertCodeDatasetIsPlausible(beforeCount: number, afterCount: number, maxDeletionRatio = 0.2): void {
  if (beforeCount === 0) return;
  const ratio = (beforeCount - afterCount) / beforeCount;
  if (ratio > maxDeletionRatio) {
    throw new CodeDatasetImplausibleError(
      `El parser de códigos perdería ${beforeCount - afterCount} de ${beforeCount} entradas (${(ratio * 100).toFixed(1)}%). Se aborta para no emitir bajas masivas.`,
    );
  }
}

export function diffCodeDataset(before: unknown, after: unknown, group: string): CodeChange[] {
  const beforeRecords = codeRecords(before);
  const afterRecords = codeRecords(after);
  if (!Array.isArray(before) && beforeRecords.length === 0) {
    // A missing file is equivalent to an empty first baseline, not a mass delete.
  } else if (!Array.isArray(after)) {
    throw new CodeDatasetImplausibleError(`El dataset de códigos ${group} no es un array válido.`);
  }
  assertCodeDatasetIsPlausible(beforeRecords.length, afterRecords.length);

  const beforeByCode = new Map(beforeRecords.map((record) => [record.code, record]));
  const afterByCode = new Map(afterRecords.map((record) => [record.code, record]));
  const changes: CodeChange[] = [];
  const routeKey = (code: string) => `code:${group}:${code}`;
  for (const [code, record] of afterByCode) {
    const old = beforeByCode.get(code);
    if (!old) changes.push({ id: routeKey(code), routeKey: routeKey(code), title: record.name, changeType: "created", changeKind: "nuevo", category: "codigo" });
    else if (JSON.stringify(old) !== JSON.stringify(record)) changes.push({ id: routeKey(code), routeKey: routeKey(code), title: record.name, changeType: "updated", changeKind: "actualizado", category: "codigo" });
  }
  for (const [code, record] of beforeByCode) {
    if (!afterByCode.has(code)) changes.push({ id: routeKey(code), routeKey: routeKey(code), title: record.name, changeType: "deleted", changeKind: "eliminado", category: "codigo" });
  }
  return changes.sort((left, right) => left.id.localeCompare(right.id, "es", { numeric: true }));
}
