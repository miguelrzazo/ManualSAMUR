import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MANUAL_VERSION = "Abril 2026";
export const DEFAULT_MANUAL_METADATA_PATH = "content/data/manual-sync.json";

export type SyncDomain = "procedures" | "vademecum" | "codigos";
export type ChangeType = "created" | "updated" | "unchanged";
export type AttachmentKind = "image" | "pdf" | "other";

export interface ManualAttachment {
  sourceUrl: string;
  localPath: string;
  kind: AttachmentKind;
}

export interface AttachmentDownloadFailure {
  sourceUrl: string;
  localPath: string;
  error: string;
}

export interface ProcedureSnapshot {
  id: string;
  title: string;
  source: string;
  sourceUpdated: string;
  contentHash: string;
  attachments: ManualAttachment[];
}

export interface SyncChange {
  id: string;
  title: string;
  changeType: ChangeType;
}

export interface SyncDomainSummary {
  discovered?: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  skipped: number;
}

export interface ManualSyncRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  summary: Record<SyncDomain, SyncDomainSummary>;
  changes: Record<SyncDomain, SyncChange[]>;
  errors: string[];
}

export interface ManualSyncMetadata {
  manualVersion: string;
  lastSyncAt: string;
  tickerEnabled: boolean;
  tickerItems: string[];
  runs: ManualSyncRun[];
}

export interface ProcedureSpace {
  title: string;
  url: string;
  section: string;
  depth: number;
}

const SYSTEM_SPACE_RE = /^(xwiki|main|blog|menu|authservice|panels|exportar|etiquetas|cabecera|cabeceraetiquetas|mapa|colaboradores|calendario|prueba|tipos de asistencia|tipos de asistencia psicológica>tipos de asistencia|abreviaturas|vademécum|vademecum|webhome|otros)$/i;
// Only filter top-level structural containers, not procedure sub-categories
const CATEGORY_SPACE_RE = /^(Procedimientos SVA|Procedimientos SVB|Procedimientos Administrativos|Procedimientos Operativos|Procedimientos asistenciales)$/i;

const STABLE_PROCEDURE_IDS: Record<string, string> = {
  "actuacion en casos de violencia de genero": "209c",
  "administracion de comprimido bucodispersable": "601_05",
  "administracion de farmacos por via inhalatoria": "602_11",
  "administracion de farmacos con camara de inhalacion": "602_14",
  "abdominal": "412_04",
  "airtraq y monitor airtraq": "602_05",
  "apoyo psicologico a intervinientes": "115",
  "asistencia psicologica en violencia de genero": "509",
  "atencion al menor bajo los efectos de alcohol o drogas": "314_09",
  "atencion sociosanitaria a menores": "209",
  "atencion sociosanitaria a mayores": "209b",
  "autoproteccion en casos sospechos de viruela del mono": "114",
  "circulacion de unidades en convoy": "206b",
  "canalizacion de vias venosas perifericas": "604_02",
  "canalizacion de vias venosas perifericas guiada por ecografia": "604_02b",
  "codigo 18 codigo sepsis": "214f",
  "codigo 19 codigo tep": "214e",
  "codigo 15 1": "214c",
  "codigo 151": "214c",
  "codigo 16": "213a",
  "codigo 9 donacion en asistolia": "212",
  "codigo crisis": "214g",
  "codigo infarto": "213",
  "codigo visem": "211",
  "codigo visnna": "214h",
  "colico renoureteral nefritico": "307_01",
  "columna vertebral": "412_02",
  "conduccion de vehiculos sanitarios en emergencias": "203",
  "craneoencefalico": "412_01",
  "codigos 13131 reperfusion precoz en el ictus agudo": "214",
  "crisis estatus epileptico": "306_03",
  "crisis convulsivas": "314_05",
  "determinacion de inr medidor mission": "604_11",
  "desfibrilacion de doble secuencia": "603_02b",
  "dificultad respiratoria": "314_04",
  "disturbios urbanos y actos antisociales": "217_00",
  "con bomberos": "217_03",
  "con metro": "217_08",
  "con policia municipal": "217_01",
  "con policia nacional": "217_06",
  "con renfe": "217_07",
  "con samur social": "217_05",
  "con seam": "217_04",
  "con uapf": "217_02",
  "con unidad de medio ambiente": "217_09",
  "actuaciones conjuntas": "217",
  "via intraosea sistema ez io": "604_05b",
  "via intraosea sistema ez-io": "604_05b",
  "dispositivo de compresiones toracicas automatico lucas 3": "603_09",
  "edema agudo de pulmon": "309_03",
  "electrocardiograma de 12 derivaciones": "603_01",
  "electrodiagrama de 12 derivaciones": "603_01",
  "episiotomia mediolateral": "609_02",
  "episotomia mediolateral": "609_02",
  "exploracion ecografica extrahospitalaria": "607",
  "extraccion de lentes de contacto rigidas y blandas": "608_02",
  "hiponatremia": "312_02b",
  "hipotermia terapeutica en la parada cardiaca": "603_08",
  "incidentes con multiples victimas y triaje imv": "207",
  "instrumental adultos": "403",
  "instrumental pediatrico": "404",
  "introductor de frova 140 fr adultos": "602_04",
  "introductor de frova 14 0 fr adultos": "602_04",
  "inmovilizacion nino sipe": "606_07",
  "insuficiencia cardiaca aguda cronica agudizada": "309_02c",
  "manejo del ictus en la edad pediatrica": "314_07",
  "marcapasos temporal no invasivo": "603_04",
  "manejo avanzado de via aerea": "302",
  "medicion de temperatura central mediante sonda esofagica": "601_03b",
  "obstruccion de la via aerea por cuerpo extrano": "405",
  "parche oclusivo toracico": "606_03a",
  "patologias de origen cardiovascular": "407",
  "pcr traumatica": "301b",
  "parada cardiorrespiratoria": "301",
  "policia municipal dispositivo electrico de control dec": "217_01b",
  "posible enfermedad vascular cerebral aguda ictus": "410a",
  "procedimiento de comunicaciones en un drp": "126a",
  "procedimiento de incidentes complejos codigo pic": "217",
  "procedimiento de incidentes complejos": "217",
  "procedimiento en caso de accidente con unidades": "203b",
  "reaccion alergica": "316",
  "sindrome escrotal agudo": "307_02",
  "sindrome coronario agudo con elevacion del st scacest": "309_02",
  "sindrome coronario agudo sin elevacion del sr scacest": "309_02b",
  "sindrome coronario agudo sin elevacion del st scacest": "309_02b",
  "test de troponina de alta sensibilidad analizador siemens healthineers": "604_12",
  "test rapido de antigeno de sars cov 2": "601_06",
  "tecnica de escarotomia": "606_04a",
  "toracico": "412_03",
  "toracostomia con sonda kit de drenaje toracico portex": "602_08",
  "traumatismo pelvico": "304_08",
  "traumatismo craneoencefalico": "304_02",
  "traumatismos vertebro medulares": "304_05",
  "urticaria angioedema y anafilaxia en pediatria": "314_08",
  "valoracion del nino grave": "314_00",
  "valoracion del paciente adulto": "402",
  "valoracion del paciente pediatrico politraumatizado": "314_03",
  "ventilacion mecanica no invasiva": "602_13",
  "quemaduras": "314_06",
};

export function createDefaultManualSyncMetadata(): ManualSyncMetadata {
  return {
    manualVersion: DEFAULT_MANUAL_VERSION,
    lastSyncAt: "",
    tickerEnabled: false,
    tickerItems: [],
    runs: [],
  };
}

export function readManualSyncMetadata(cwd = process.cwd()): ManualSyncMetadata {
  const metadataPath = path.join(cwd, DEFAULT_MANUAL_METADATA_PATH);
  if (!fs.existsSync(metadataPath)) return createDefaultManualSyncMetadata();

  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Partial<ManualSyncMetadata>;
    return {
      manualVersion: parsed.manualVersion || DEFAULT_MANUAL_VERSION,
      lastSyncAt: parsed.lastSyncAt || "",
      tickerEnabled: parsed.tickerEnabled ?? false,
      tickerItems: Array.isArray(parsed.tickerItems) ? parsed.tickerItems.filter(isString) : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs as ManualSyncRun[] : [],
    };
  } catch {
    return createDefaultManualSyncMetadata();
  }
}

export function stableContentHash(content: string): string {
  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return createHash("sha256").update(normalized).digest("hex");
}

export function normalizeProcedureLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveStableProcedureId(title: string): string | null {
  return STABLE_PROCEDURE_IDS[normalizeProcedureLookupKey(title)] ?? null;
}

export function resolveStableProcedureIdForSource(title: string, sourceUrl: string): string | null {
  const key = normalizeProcedureLookupKey(title);
  const decodedSource = decodeURIComponent(sourceUrl).toLowerCase();

  if (key === "valoracion inicial del paciente politraumatizado") {
    return decodedSource.includes("procedimientos svb") ? "412_00" : "304_01";
  }

  if (key === "valoracion del nino grave") {
    return decodedSource.includes("procedimientos svb") ? "402b" : "314_00";
  }

  return resolveStableProcedureId(title);
}

export function classifyProcedureChange(
  existing: ProcedureSnapshot | null,
  incoming: ProcedureSnapshot,
): ChangeType {
  if (!existing) return "created";
  if (
    existing.title !== incoming.title ||
    existing.source !== incoming.source ||
    existing.sourceUpdated !== incoming.sourceUpdated ||
    existing.contentHash !== incoming.contentHash ||
    JSON.stringify(existing.attachments) !== JSON.stringify(incoming.attachments)
  ) {
    return "updated";
  }
  return "unchanged";
}

export function appendSyncRun(
  metadata: ManualSyncMetadata,
  run: ManualSyncRun,
  maxRuns = 25,
): ManualSyncMetadata {
  const changes = [
    ...run.changes.procedures.map((change) =>
      `${change.changeType === "created" ? "Nuevo" : "Actualizado"}: ${change.id} ${change.title}`,
    ),
    ...run.changes.vademecum.map((change) =>
      `Vademécum ${change.changeType === "created" ? "nuevo" : "actualizado"}: ${change.title}`,
    ),
    ...run.changes.codigos.map((change) =>
      `Códigos ${change.changeType === "created" ? "nuevo" : "actualizado"}: ${change.title}`,
    ),
  ].slice(0, 12);

  return {
    manualVersion: metadata.manualVersion || DEFAULT_MANUAL_VERSION,
    lastSyncAt: run.finishedAt,
    tickerEnabled: changes.length > 0,
    tickerItems: changes,
    runs: [run, ...metadata.runs].slice(0, maxRuns),
  };
}

export function getSectionFromXWikiUrl(url: string): string {
  const decoded = decodeURIComponent(url);
  if (/Procedimientos SVA|SVA/i.test(decoded)) return "SVA";
  if (/Procedimientos SVB|SVB/i.test(decoded)) return "SVB";
  if (/Técnicas/i.test(decoded)) return "Técnicas";
  if (/Procedimientos Operativos/i.test(decoded)) return "Operativos";
  if (/Procedimientos Administrativos/i.test(decoded)) return "Administrativos";
  if (/Central de Comunicaciones|Comunicaciones/i.test(decoded)) return "Comunicaciones";
  if (/Intervinientes|Psicol/i.test(decoded)) return "Psicológicos";
  return "General";
}

export function parseProcedureSpacesXml(xml: string): ProcedureSpace[] {
  const spaces: ProcedureSpace[] = [];
  const spaceRegex = /<space>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<xwikiAbsoluteUrl>([^<]+)<\/xwikiAbsoluteUrl>[\s\S]*?<\/space>/g;
  let match: RegExpExecArray | null;

  while ((match = spaceRegex.exec(xml)) !== null) {
    const title = decodeXml(match[1]).trim();
    const url = decodeXml(match[2]).trim();
    const pathMatch = url.match(/\/bin\/view\/(.+?)(?:\/?$)/);
    if (!pathMatch) continue;

    const pathParts = decodeURIComponent(pathMatch[1])
      .split("/")
      .filter((part) => part && part !== "WebHome");
    const depth = pathParts.length;
    const section = getSectionFromXWikiUrl(url);

    if (depth < 2) continue;
    if (SYSTEM_SPACE_RE.test(title)) continue;
    if (CATEGORY_SPACE_RE.test(title)) continue;
    if (section === "General" && depth < 3) continue;

    spaces.push({ title, url, section, depth });
  }

  const seen = new Set<string>();
  return spaces.filter((space) => {
    if (seen.has(space.url)) return false;
    seen.add(space.url);
    return true;
  });
}

export function extractAttachmentLinks(
  content: string,
  sourceUrl: string,
  procedureId: string,
): ManualAttachment[] {
  const attachments = new Map<string, ManualAttachment>();
  const linkedAttachRegex = /\[\[[^\]]+?>>attach:([^\]]+?)\]\]/g;
  const attachRegex = /attach:([^\]\s|)"]+)/g;
  const linkedImageRegex = /image:([^\]\n|]+?\.(?:png|jpe?g|gif|webp|svg))(?:\|\|[^\]\n]*)?/gi;
  const imageRegex = /image:([^\]\s|)"]+)/g;
  const downloadRegex = /https?:\/\/servpub\.madrid\.es\/manualsamur\/bin\/download\/[^\]\s|)"]+/g;

  for (const match of content.matchAll(linkedAttachRegex)) {
    addAttachment(attachments, sourceUrl, procedureId, normalizeAttachmentReference(match[1]));
  }

  for (const match of content.matchAll(attachRegex)) {
    if (isPartialLinkedAttachment(content, match.index ?? 0, match[0].length)) continue;
    addAttachment(attachments, sourceUrl, procedureId, normalizeAttachmentReference(match[1]));
  }

  for (const match of content.matchAll(linkedImageRegex)) {
    addAttachment(attachments, sourceUrl, procedureId, normalizeAttachmentReference(match[1]));
  }

  for (const match of content.matchAll(imageRegex)) {
    addAttachment(attachments, sourceUrl, procedureId, normalizeAttachmentReference(match[1]));
  }

  for (const match of content.matchAll(downloadRegex)) {
    const source = match[0];
    const filename = decodeURIComponent(source.split("/").at(-1)?.split("?")[0] ?? "adjunto");
    attachments.set(source, {
      sourceUrl: source,
      localPath: localAttachmentPath(procedureId, filename),
      kind: attachmentKind(filename),
    });
  }

  return [...attachments.values()];
}

export function rewriteAttachmentLinks(content: string, attachments: ManualAttachment[]): string {
  return attachments.reduce((nextContent, attachment) => {
    const escapedSource = escapeRegExp(attachment.sourceUrl);
    const escapedFilename = escapeRegExp(decodeURIComponent(attachment.sourceUrl.split("/").at(-1)?.split("?")[0] ?? ""));

    return nextContent
      .replace(new RegExp(`attach:${escapedFilename}(?:\\|\\|[^\\]]+)?`, "g"), attachment.localPath)
      .replace(new RegExp(`attach:${escapedFilename}(?=\\]\\])`, "g"), attachment.localPath)
      .replace(new RegExp(`attach:${escapedFilename}`, "g"), attachment.localPath)
      .replace(new RegExp(`image:${escapedFilename}(?:\\|\\|[^\\n]+)?`, "g"), `![](${attachment.localPath})`)
      .replace(new RegExp(escapedSource, "g"), attachment.localPath);
  }, content);
}

export function summarizeChanges(changes: SyncChange[], discovered?: number): SyncDomainSummary {
  return {
    discovered,
    created: changes.filter((change) => change.changeType === "created").length,
    updated: changes.filter((change) => change.changeType === "updated").length,
    unchanged: changes.filter((change) => change.changeType === "unchanged").length,
    failed: 0,
    skipped: 0,
  };
}

function addAttachment(
  attachments: Map<string, ManualAttachment>,
  sourceUrl: string,
  procedureId: string,
  filename: string,
) {
  if (!isSupportedAttachment(filename)) return;

  const source = isRemoteUrl(filename) ? filename : buildXWikiAttachmentUrl(sourceUrl, filename);
  const localFilename = isRemoteUrl(filename) ? remoteFilename(filename) : filename;
  attachments.set(source, {
    sourceUrl: source,
    localPath: localAttachmentPath(procedureId, localFilename),
    kind: attachmentKind(localFilename),
  });
}

function normalizeAttachmentReference(value: string) {
  return decodeURIComponent(value).split("||")[0]?.trim().replace(/[*_]+$/g, "") ?? "";
}

function isSupportedAttachment(filename: string) {
  return /\.(pdf|png|jpe?g|gif|webp|svg)$/i.test(filename) && !/^data:/i.test(filename);
}

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function remoteFilename(value: string) {
  try {
    return decodeURIComponent(new URL(value).pathname.split("/").at(-1) ?? "adjunto");
  } catch {
    return value.split("/").at(-1) ?? "adjunto";
  }
}

function buildXWikiAttachmentUrl(sourceUrl: string, filename: string) {
  const pagePath = sourceUrl
    .replace("/bin/view/", "/bin/download/")
    .replace(/\/WebHome\/?$/i, "")
    .replace(/\/?$/, "/WebHome/");
  return `${pagePath}${encodeURIComponent(filename)}`;
}

function isPartialLinkedAttachment(content: string, index: number, matchLength: number) {
  const next = content[index + matchLength];
  if (next !== " ") return false;

  const closingLink = content.indexOf("]]", index);
  if (closingLink === -1) return false;

  const nextLine = content.indexOf("\n", index);
  return nextLine === -1 || closingLink < nextLine;
}

function localAttachmentPath(procedureId: string, filename: string) {
  const cleanFilename = filename.replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ]+/g, "-");
  const kind = attachmentKind(filename);
  if (kind === "image") return `/images/procedures/${procedureId}/${cleanFilename}`;
  if (kind === "pdf") return `/docs/procedures/${procedureId}/${cleanFilename}`;
  return `/docs/procedures/${procedureId}/${cleanFilename}`;
}

function attachmentKind(filename: string): AttachmentKind {
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) return "image";
  if (/\.pdf$/i.test(filename)) return "pdf";
  return "other";
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
