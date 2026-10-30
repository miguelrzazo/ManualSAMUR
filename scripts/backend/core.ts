import { createHash } from 'node:crypto';
import type { MobileContent, MobileContentSnapshot } from '../../packages/manual-content/src/index.ts';
import { canonicalJson } from '../../packages/manual-content/src/index.ts';

export const datasetFiles: Record<string, string> = {
  drugs: 'vademecum', perfusions: 'perfusiones', fluids: 'fluidos', commercialNames: 'vademecum-comerciales',
  abbreviations: 'abreviaturas', hospitals: 'hospitals', bases: 'bases', status4: 'status4',
  manual: 'manual-sync', links: 'main-links', updates: 'manual-updates',
};
export const codeFiles: Record<string, string> = {
  incidente: 'codigos-incidente', sva: 'codigos-sva', svb: 'codigos-svb', upsi: 'codigos-upsi',
  upsq: 'codigos-upsq', icao: 'codigos-icao', indicativos: 'codigos-indicativos', claves: 'codigos-pc',
  lima: 'codigos-lima', cheatsheet: 'codigos-cheatsheet',
};
export function hash(value: string | Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
export function sql(value: unknown): string { return value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`; }

export interface ImportedDocument { id: string; category: 'procedure' | 'dataset'; title: string; data: Record<string, unknown> }
export function importDocuments(snapshot: MobileContentSnapshot): ImportedDocument[] {
  const documents: ImportedDocument[] = snapshot.content.procedures.map((procedure) => ({
    id: `procedure:${procedure.id}`, category: 'procedure', title: procedure.title, data: { ...procedure },
  }));
  for (const [key, value] of Object.entries(snapshot.content)) {
    if (['procedures', 'relationsIndex', 'updates'].includes(key)) continue;
    // Scrape runs, errors and timestamps are neither editorial data nor versions.
    const publicValue = key === 'manual' ? Object.fromEntries(Object.entries(value as MobileContent['manual'])
      .filter(([name]) => ['manualVersion', 'manualVersionCurrent'].includes(name))) : value;
    const titles: Record<string, string> = { codes: 'Códigos', drugs: 'Vademécum', perfusions: 'Perfusiones',
      fluids: 'Fluidos', commercialNames: 'Nombres comerciales', abbreviations: 'Abreviaturas', hospitals: 'Hospitales',
      bases: 'Bases', status4: 'Estado 4', manual: 'Versión del manual', links: 'Enlaces oficiales' };
    documents.push({ id: `dataset:${key}`, category: 'dataset', title: titles[key] || key, data: { value: publicValue } });
  }
  return documents;
}

/** Chunk by Unicode code points, keeping every generated SQL statement <100 KB. */
export function chunks(value: string, size = 20000): string[] {
  const points = Array.from(value); const result: string[] = [];
  for (let offset = 0; offset < points.length; offset += size) result.push(points.slice(offset, offset + size).join(''));
  return result.length ? result : [''];
}

export function stageText(batch: string, name: string, text: string) {
  const statements = chunks(text).map((part, index) => `INSERT INTO ingest_parts VALUES(${sql(batch)},${sql(name)},${index},${sql(part)});`);
  const expression = `(SELECT group_concat(body,'') FROM (SELECT body FROM ingest_parts WHERE batch=${sql(batch)} AND name=${sql(name)} ORDER BY part))`;
  return { statements, expression };
}

/** Proposals never mutate the reviewed body, notes, title or published pointer. */
export function proposalSql(documents: ImportedDocument[], existingIds: string[], now: string, batch: string) {
  const statements: string[] = [];
  for (const document of documents) {
    const canonical = canonicalJson(document.data);
    if (Buffer.byteLength(canonical) > 450000) throw new Error(`Source document too large: ${document.id}`);
    const staged = stageText(batch, document.id, canonical); statements.push(...staged.statements);
    statements.push(`INSERT INTO documents(id,category,title,data_json,status,source_json,source_hash,updated_at)
      VALUES(${sql(document.id)},${sql(document.category)},${sql(document.title)},${staged.expression},'draft',${staged.expression},${sql(hash(canonical))},${sql(now)})
      ON CONFLICT(id) DO UPDATE SET incoming_source_json=excluded.source_json,updated_by=NULL,revision=documents.revision+1,updated_at=excluded.updated_at
      WHERE documents.source_hash IS NOT excluded.source_hash AND documents.incoming_source_json IS NOT excluded.source_json;`);
    statements.push(`UPDATE documents SET incoming_source_json=NULL,updated_by=NULL,revision=revision+1,updated_at=${sql(now)} WHERE id=${sql(document.id)} AND source_hash=${sql(hash(canonical))} AND incoming_source_json IS NOT NULL;`);
  }
  const present = new Set(documents.map((document) => document.id));
  for (const id of existingIds.filter((id) => id.startsWith('procedure:') && !present.has(id))) {
    statements.push(`UPDATE documents SET incoming_source_json='{"$removed":true}',updated_by=NULL,revision=revision+1,updated_at=${sql(now)} WHERE id=${sql(id)} AND source_json IS NOT NULL AND source_json IS NOT '{"$removed":true}' AND incoming_source_json IS NOT '{"$removed":true}';`);
  }
  statements.push(`DELETE FROM ingest_parts WHERE batch=${sql(batch)};`);
  return statements.join('\n');
}
