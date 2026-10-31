export interface DocumentRow {
  id: string; category: 'procedure' | 'dataset'; title: string; data_json: string;
  private_notes: string; references_json: string; status: string; revision: number;
  source_json: string | null; source_hash: string | null; incoming_source_json: string | null; updated_at: string;
}

export function documentView(row: DocumentRow) {
  return {
    id: row.id, category: row.category, title: row.title, data: JSON.parse(row.data_json),
    privateNotes: row.private_notes, references: JSON.parse(row.references_json), status: row.status,
    revision: row.revision, sourceData: row.source_json ? JSON.parse(row.source_json) : null,
    incomingSourceData: row.incoming_source_json ? JSON.parse(row.incoming_source_json) : null,
    updatedAt: row.updated_at,
  };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const transitions: Record<string, string[]> = {
  draft: ['in_review', 'archived'], in_review: ['draft', 'ready', 'archived'],
  ready: ['draft', 'archived'], published: ['draft', 'archived'], archived: ['draft'],
};

export function validateSave(input: Record<string, unknown>, document: DocumentRow) {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== document.revision)
    throw new HttpError(409, 'Ha cambiado el documento. Recarga y compara antes de guardar.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500
    || !input.data || typeof input.data !== 'object' || Array.isArray(input.data)
    || typeof input.privateNotes !== 'string' || input.privateNotes.length > 20000
    || !Array.isArray(input.references) || input.references.length > 100
    || !input.references.every((url) => typeof url === 'string' && /^https?:\/\//.test(url) && url.length <= 2048))
    throw new HttpError(400, 'Revisa el título, contenido, notas y referencias.');
  const data = input.data as Record<string, unknown>;
  if (document.category === 'procedure' && (data.id !== JSON.parse(document.data_json).id
    || typeof data.content !== 'string' || typeof data.slug !== 'string' || !data.slug
    || !Array.isArray(data.attachments) || !Array.isArray(data.related)))
    throw new HttpError(400, 'La ficha debe conservar su identificador, ruta y estructura.');
  if (document.category === 'dataset' && !Object.hasOwn(data, 'value'))
    throw new HttpError(400, 'El conjunto de datos debe contener value.');
  const json = JSON.stringify({ ...data, ...(document.category === 'procedure' ? { title: input.title.trim() } : {}) });
  // Three public/source projections plus private fields must fit a 2 MB D1 row.
  if (new TextEncoder().encode(json).byteLength > 450000) throw new HttpError(413, 'Documento demasiado grande.');
  return { title: input.title.trim(), json, notes: input.privateNotes, references: JSON.stringify(input.references) };
}
