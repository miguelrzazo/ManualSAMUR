import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MANUAL_VERSION = "Abril 2026";
export const DEFAULT_MANUAL_METADATA_PATH = "content/data/manual-sync.json";
export const DEFAULT_MANUAL_UPDATES_PATH = "content/data/manual-updates.json";

export type SyncDomain = "procedures" | "vademecum" | "codigos" | "main";
export type ChangeType = "created" | "updated" | "unchanged" | "blocked_by_editorial" | "deleted";
export type AttachmentKind = "image" | "pdf" | "other";
export type EditorialStatus = "source" | "enhanced";
export type ManualUpdateOrigin = "wiki" | "official-pdf";
export type ManualUpdateChangeKind = "nuevo" | "revisado" | "actualizado" | "eliminado" | "sync";

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
  changeKind?: ManualUpdateChangeKind;
  blockedByEditorial?: boolean;
  procedurePath?: string;
  sourceUpdated?: string;
  source?: string;
  diff?: string;
}

export interface SyncDomainSummary {
  discovered?: number;
  created: number;
  updated: number;
  unchanged: number;
  blocked?: number;
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

export interface PendingChange {
  key: string;
  domain: SyncDomain;
  id: string;
  title: string;
  changeType: ChangeType;
  detectedAt: string;
  sourceUpdated?: string;
  source?: string;
  blockedByEditorial?: boolean;
}

export interface ApprovedChange extends PendingChange {
  approvedAt: string;
  runId?: string;
}

export type ManualUpdateCategory = "procedure" | "codigo" | "vademecum";

export interface ManualUpdateEvent {
  eventId: string;
  origin: ManualUpdateOrigin;
  officialUrl?: string;
  procedureIds: string[];
  changeKind: ManualUpdateChangeKind;
  summary: string;
  effectiveDate: string;
  approvedAt?: string;
  isNewThisWeek: boolean;
  diff?: string;
  category?: ManualUpdateCategory;
}

export interface ManualUpdatesDataset {
  generatedAt: string;
  events: ManualUpdateEvent[];
}

export interface ManualHistoryEntry {
  id: string;
  procedureId: string;
  procedureTitle: string;
  section: string;
  slug: string;
  changeKind: ManualUpdateChangeKind;
  changedAt: string;
  summary: string;
  diff?: string;
}

export interface ManualHistoryDataset {
  generatedAt: string;
  entries: ManualHistoryEntry[];
}

export interface ManualTickerItem {
  label: string;
  href: string;
  eventId?: string;
  procedureId?: string;
}

export interface ManualTickerState {
  enabledUntil: string;
  items: ManualTickerItem[];
}

export interface ManualSyncMetadata {
  manualVersionCurrent: string;
  manualVersion: string;
  lastSyncAt: string;
  lastApprovedAt: string;
  ticker: ManualTickerState;
  tickerEnabled: boolean;
  tickerItems: string[];
  pendingChanges: PendingChange[];
  approvedChanges: ApprovedChange[];
  globalUpdateTimeline: string[];
  runs: ManualSyncRun[];
}

export interface ProcedureSpace {
  title: string;
  url: string;
  section: string;
  depth: number;
}

const SYSTEM_SPACE_RE = /^(xwiki|main|blog|menu|authservice|panels|exportar|etiquetas|cabecera|cabeceraetiquetas|mapa|colaboradores|calendario|prueba|tipos de asistencia|tipos de asistencia psicológica>tipos de asistencia|abreviaturas|vademécum|vademecum|webhome|otros)$/i;
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
  "procedimiento general de los drp": "drp_01",
  "procedimiento de despliege de un drp": "drp_02",
  "procedimiento de despliegue de un drp": "drp_02",
  "procedimiento de cecor en un dispositivo de riesgo previsible": "drp_03",
  "procedimiento de \"cecor\" en un dispositivo de riesgo previsible": "drp_03",
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
    manualVersionCurrent: DEFAULT_MANUAL_VERSION,
    manualVersion: DEFAULT_MANUAL_VERSION,
    lastSyncAt: "",
    lastApprovedAt: "",
    ticker: {
      enabledUntil: "",
      items: [],
    },
    tickerEnabled: false,
    tickerItems: [],
    pendingChanges: [],
    approvedChanges: [],
    globalUpdateTimeline: [],
    runs: [],
  };
}

export function createDefaultManualUpdatesDataset(): ManualUpdatesDataset {
  return {
    generatedAt: "",
    events: [],
  };
}

export function filterUserFacingTickerItems(items: ManualTickerItem[]): ManualTickerItem[] {
  return items.filter((item) => {
    if (item.procedureId) return true;
    if (item.href.startsWith("/manual/")) return true;
    if (item.href.startsWith("/codigos")) return true;
    if (item.href.startsWith("/vademecum")) return true;

    const label = normalizeProcedureLookupKey(item.label);
    if (label.includes("llms")) return false;
    if (label.includes("colaboradores")) return false;
    if (label.includes("main links")) return false;
    if (label.includes("abreviaturas")) return false;
    if (label.includes("mobile assets")) return false;
    if (label.includes("attachment") || label.includes("adjunto")) return false;
    if (label.includes("main actualizado")) return false;

    return (
      label.includes("manual") ||
      label.includes("procedimiento") ||
      label.includes("codigo") ||
      label.includes("codigos") ||
      label.includes("vademecum") ||
      label.includes("farmaco")
    );
  });
}

export function readManualSyncMetadata(cwd = process.cwd()): ManualSyncMetadata {
  const metadataPath = path.join(cwd, DEFAULT_MANUAL_METADATA_PATH);
  if (!fs.existsSync(metadataPath)) return createDefaultManualSyncMetadata();

  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Partial<ManualSyncMetadata>;
    const manualVersionCurrent = parsed.manualVersionCurrent || parsed.manualVersion || DEFAULT_MANUAL_VERSION;
    const legacyTickerItems = Array.isArray(parsed.tickerItems) ? parsed.tickerItems.filter(isString) : [];
    const parsedTickerItems = Array.isArray(parsed.ticker?.items)
      ? parsed.ticker.items.filter((item): item is ManualTickerItem => !!item && typeof item.label === "string" && typeof item.href === "string")
      : [];
    const tickerItemsRaw = parsedTickerItems.length > 0
      ? parsedTickerItems
      : legacyTickerItems.map((label, index) => ({
        label,
        href: `/manual?update=${index}`,
      }));
    const tickerItems = filterUserFacingTickerItems(tickerItemsRaw);
    const tickerEnabled = parsed.tickerEnabled ?? tickerItems.length > 0;

    return {
      manualVersionCurrent,
      manualVersion: parsed.manualVersion || manualVersionCurrent,
      lastSyncAt: parsed.lastSyncAt || "",
      lastApprovedAt: parsed.lastApprovedAt || "",
      ticker: {
        enabledUntil: parsed.ticker?.enabledUntil || "",
        items: tickerItems,
      },
      tickerEnabled,
      tickerItems: tickerItems.map((item) => item.label),
      pendingChanges: Array.isArray(parsed.pendingChanges) ? parsed.pendingChanges as PendingChange[] : [],
      approvedChanges: Array.isArray(parsed.approvedChanges) ? parsed.approvedChanges as ApprovedChange[] : [],
      globalUpdateTimeline: Array.isArray(parsed.globalUpdateTimeline) ? parsed.globalUpdateTimeline.filter(isString) : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs as ManualSyncRun[] : [],
    };
  } catch {
    return createDefaultManualSyncMetadata();
  }
}

export function readManualUpdatesDataset(cwd = process.cwd()): ManualUpdatesDataset {
  const filePath = path.join(cwd, DEFAULT_MANUAL_UPDATES_PATH);
  if (!fs.existsSync(filePath)) return createDefaultManualUpdatesDataset();

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<ManualUpdatesDataset>;
    return {
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
      events: Array.isArray(parsed.events) ? parsed.events as ManualUpdateEvent[] : [],
    };
  } catch {
    return createDefaultManualUpdatesDataset();
  }
}

export function writeManualUpdatesDataset(dataset: ManualUpdatesDataset, cwd = process.cwd()) {
  const filePath = path.join(cwd, DEFAULT_MANUAL_UPDATES_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
}

export const DEFAULT_MANUAL_HISTORY_PATH = "content/data/manual-history.json";

export function readManualHistoryDataset(cwd = process.cwd()): ManualHistoryDataset {
  const filePath = path.join(cwd, DEFAULT_MANUAL_HISTORY_PATH);
  if (!fs.existsSync(filePath)) return { generatedAt: "", entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<ManualHistoryDataset>;
    return {
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
      entries: Array.isArray(parsed.entries) ? parsed.entries as ManualHistoryEntry[] : [],
    };
  } catch {
    return { generatedAt: "", entries: [] };
  }
}

export function appendToManualHistory(
  newEntries: ManualHistoryEntry[],
  maxEntries = 500,
  cwd = process.cwd(),
): void {
  if (newEntries.length === 0) return;
  const dataset = readManualHistoryDataset(cwd);
  const merged = [...newEntries, ...dataset.entries]
    .filter((entry, index, arr) => arr.findIndex((e) => e.id === entry.id) === index)
    .slice(0, maxEntries);
  const filePath = path.join(cwd, DEFAULT_MANUAL_HISTORY_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ generatedAt: new Date().toISOString(), entries: merged }, null, 2)}\n`, "utf8");
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
    existing.title !== incoming.title
    || existing.source !== incoming.source
    || existing.sourceUpdated !== incoming.sourceUpdated
    || existing.contentHash !== incoming.contentHash
    || JSON.stringify(existing.attachments) !== JSON.stringify(incoming.attachments)
  ) {
    return "updated";
  }
  return "unchanged";
}

export function classifyProcedureUpdateKind(
  existing: ProcedureSnapshot | null,
  incoming: ProcedureSnapshot,
  changeType: ChangeType,
): ManualUpdateChangeKind {
  if (changeType === "created") return "nuevo";
  if (changeType === "unchanged") return "sync";
  if (changeType === "blocked_by_editorial") return "revisado";
  if (existing && existing.contentHash === incoming.contentHash && existing.sourceUpdated !== incoming.sourceUpdated) {
    return "revisado";
  }
  return "actualizado";
}

export function appendSyncRun(
  metadata: ManualSyncMetadata,
  run: ManualSyncRun,
  maxRuns = 25,
): ManualSyncMetadata {
  const tickerItems = [
    ...run.changes.procedures
      .filter((change) => change.changeType !== "unchanged")
      .slice(0, 8)
      .map((change) => ({
        label: `${change.changeKind === "nuevo" || change.changeType === "created" ? "Nuevo" : change.changeKind === "revisado" ? "Revisado" : change.changeType === "blocked_by_editorial" ? "Bloqueado editorial" : "Actualizado"}: ${change.id} ${change.title}`,
        href: change.id ? `/manual?procedure=${encodeURIComponent(change.id)}` : "/manual",
        procedureId: change.id,
      })),
  ].slice(0, 12);

  return {
    ...metadata,
    manualVersionCurrent: metadata.manualVersionCurrent || metadata.manualVersion || DEFAULT_MANUAL_VERSION,
    manualVersion: metadata.manualVersion || metadata.manualVersionCurrent || DEFAULT_MANUAL_VERSION,
    lastSyncAt: run.finishedAt,
    tickerEnabled: tickerItems.length > 0,
    tickerItems: tickerItems.map((item) => item.label),
    ticker: {
      enabledUntil: metadata.ticker?.enabledUntil ?? "",
      items: tickerItems,
    },
    runs: [run, ...metadata.runs].slice(0, maxRuns),
  };
}

export function withPendingChanges(metadata: ManualSyncMetadata, run: ManualSyncRun): ManualSyncMetadata {
  const detectedAt = run.finishedAt;
  const pendingByKey = new Map<string, PendingChange>(
    metadata.pendingChanges.map((change) => [change.key, change]),
  );

  for (const domain of ["procedures", "vademecum", "codigos", "main"] as const) {
    for (const change of run.changes[domain]) {
      if (change.changeType === "unchanged") continue;
      const key = `${domain}:${change.id}`;
      pendingByKey.set(key, {
        key,
        domain,
        id: change.id,
        title: change.title,
        changeType: change.changeType,
        detectedAt,
        sourceUpdated: change.sourceUpdated,
        source: change.source,
        blockedByEditorial: change.blockedByEditorial,
      });
    }
  }

  return {
    ...metadata,
    pendingChanges: [...pendingByKey.values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
  };
}

export function approvePendingChanges(
  metadata: ManualSyncMetadata,
  predicate: (change: PendingChange) => boolean,
  approvedAt: string,
  runId?: string,
): ManualSyncMetadata {
  const approved: ApprovedChange[] = [];
  const remaining: PendingChange[] = [];

  for (const change of metadata.pendingChanges) {
    if (predicate(change)) {
      approved.push({ ...change, approvedAt, runId });
    } else {
      remaining.push(change);
    }
  }

  return {
    ...metadata,
    lastApprovedAt: approved.length > 0 ? approvedAt : metadata.lastApprovedAt,
    pendingChanges: remaining,
    approvedChanges: [...approved, ...metadata.approvedChanges],
  };
}

export function buildTickerFromEvents(events: ManualUpdateEvent[], referenceNow: Date) {
  const approvedEvents = filterUserFacingTickerEvents(events)
    .filter((event) => event.approvedAt)
    .sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""));

  const items: ManualTickerItem[] = approvedEvents
    .slice(0, 12)
    .map((event) => ({
      label: event.summary,
      href: event.procedureIds[0] ? `/manual?procedure=${encodeURIComponent(event.procedureIds[0])}#update-${event.eventId}` : `/manual#historial-global`,
      eventId: event.eventId,
      procedureId: event.procedureIds[0],
    }));

  const newestApproved = approvedEvents[0]?.approvedAt ?? "";
  const enabledUntil = newestApproved ? new Date(new Date(newestApproved).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : "";
  const tickerEnabled = !!enabledUntil && new Date(enabledUntil).getTime() > referenceNow.getTime() && items.length > 0;

  return {
    tickerEnabled,
    ticker: {
      enabledUntil,
      items,
    },
    tickerItems: items.map((item) => item.label),
  };
}

export function filterUserFacingTickerEvents(events: ManualUpdateEvent[]): ManualUpdateEvent[] {
  return events.filter((event) => {
    if (event.procedureIds.length > 0) return true;

    const summary = normalizeProcedureLookupKey(event.summary);
    if (summary.includes("vademecum")) return false;
    if (summary.includes("main actualizado")) return false;
    if (summary.includes("llms")) return false;
    if (summary.includes("colaboradores")) return false;
    if (summary.includes("main links")) return false;
    if (summary.includes("abreviaturas")) return false;
    if (summary.includes("mobile assets")) return false;
    if (summary.includes("attachment") || summary.includes("adjunto")) return false;

    return summary.includes("codigos") || summary.includes("manual") || summary.includes("procedimiento");
  });
}

export function applyNewThisWeek(events: ManualUpdateEvent[], referenceNow = new Date()): ManualUpdateEvent[] {
  return events.map((event) => {
    if (!event.approvedAt) return { ...event, isNewThisWeek: false };
    const approved = new Date(event.approvedAt).getTime();
    const diff = referenceNow.getTime() - approved;
    return {
      ...event,
      isNewThisWeek: diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000,
    };
  });
}

export function getSectionFromXWikiUrl(url: string): string {
  const decoded = decodeURIComponent(url);
  if (/Dispositivos de Riesgo Previsible|DRP/i.test(decoded)) return "DRP";
  if (/Procedimientos SVA|SVA/i.test(decoded)) return "SVA";
  if (/Procedimientos SVB|SVB/i.test(decoded)) return "SVB";
  if (/Técnicas/i.test(decoded)) return "Técnicas";
  if (/Procedimientos Operativos/i.test(decoded)) return "Operativos";
  if (/Procedimientos Administrativos/i.test(decoded)) return "Administrativos";
  if (/Central de Comunicaciones|Comunicaciones/i.test(decoded)) return "Comunicaciones";
  if (/\/Intervinientes\//i.test(decoded)) return "Intervinientes";
  if (/Psicol/i.test(decoded)) return "Psicológicos";
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
      .replace(new RegExp(`attach:${escapedFilename}(?:\\|\\|[^\\n\\]]+)?`, "g"), attachment.localPath)
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
    blocked: changes.filter((change) => change.changeType === "blocked_by_editorial").length,
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
