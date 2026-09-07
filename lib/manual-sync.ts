import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { capMobileUpdateEvents, MAX_MOBILE_UPDATE_EVENTS } from "../packages/manual-content/src/index.ts";

const _MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/**
 * Versión por defecto del manual cuando manual-sync.json no trae una.
 *
 * Es una función, no una constante: como constante se evaluaba al cargar el módulo,
 * es decir en tiempo de build bajo output: "export", y quedaba congelada para siempre
 * en el HTML estático.
 */
export function getDefaultManualVersion(referenceNow = new Date()): string {
  return `${_MONTHS_ES[referenceNow.getMonth()]} ${referenceNow.getFullYear()}`;
}
export const DEFAULT_MANUAL_METADATA_PATH = "content/data/manual-sync.json";
export const DEFAULT_MANUAL_UPDATES_PATH = "content/data/manual-updates.json";
/** Keep the shipped event stream bounded; it is embedded in every mobile package. */
export const MAX_MANUAL_UPDATE_EVENTS = MAX_MOBILE_UPDATE_EVENTS;

export type SyncDomain = "procedures" | "vademecum" | "codigos" | "main";
export type ChangeType = "created" | "updated" | "unchanged" | "blocked_by_editorial" | "deleted";
export type AttachmentKind = "image" | "pdf" | "other";
export type AttachmentAvailability = "available" | "unavailable";
export type EditorialStatus = "source" | "enhanced";
export type ManualUpdateOrigin = "wiki" | "official-pdf";
export type ManualUpdateChangeKind = "nuevo" | "revisado" | "actualizado" | "eliminado" | "sync";

export interface ManualAttachment {
  sourceUrl: string;
  localPath: string;
  kind: AttachmentKind;
  availability?: AttachmentAvailability;
  error?: string;
}

export interface AttachmentDownloadFailure {
  sourceUrl: string;
  localPath: string;
  error: string;
}

/** Keep an attachment in the corpus while making an upstream failure explicit. */
export function markAttachmentUnavailable(
  attachment: ManualAttachment,
  failure: Pick<AttachmentDownloadFailure, "error">,
): ManualAttachment {
  return { ...attachment, availability: "unavailable", error: failure.error };
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
  category?: ManualUpdateCategory;
  routeKey?: string;
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
  attachmentFailures?: AttachmentDownloadFailure[];
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
  isRecent: boolean;
  routeKey?: string;
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
  category?: string;
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
  "actuacion en casos de violencia de genero": "209_02",
  "administracion de comprimido bucodispersable": "601_05",
  "administracion de farmacos por via inhalatoria": "602_11",
  "administracion de farmacos con camara de inhalacion": "602_14",
  "abdominal": "412_04",
  "airtraq y monitor airtraq": "602_05",
  "apoyo psicologico a intervinientes": "115",
  "asistencia psicologica en violencia de genero": "509",
  "atencion al menor bajo los efectos de alcohol o drogas": "314_09",
  "atencion sociosanitaria a menores": "209",
  "atencion sociosanitaria a mayores": "209_01",
  "autoproteccion en casos sospechos de viruela del mono": "114",
  "circulacion de unidades en convoy": "206_01",
  "canalizacion de vias venosas perifericas": "604_03",
  "canalizacion de vias venosas perifericas guiada por ecografia": "604_04",
  "codigo 18 codigo sepsis": "214_05",
  "codigo 19 codigo tep": "214_04",
  "codigo 15 1": "214_03",
  "codigo 151": "214_03",
  "codigo 16": "213_01",
  "codigo 9 donacion en asistolia": "212",
  "codigo crisis": "214_06",
  "codigo infarto": "213",
  "codigo visem": "211",
  "codigo visnna": "214_07",
  "colico renoureteral nefritico": "307_01",
  "columna vertebral": "412_02",
  "conduccion de vehiculos sanitarios en emergencias": "203",
  "craneoencefalico": "412_01",
  "codigos 13131 reperfusion precoz en el ictus agudo": "214",
  "crisis estatus epileptico": "306_03",
  "crisis convulsivas": "314_05",
  "determinacion de inr medidor mission": "604_14",
  "desfibrilacion de doble secuencia": "603_03",
  "dificultad respiratoria": "314_04",
  "disturbios urbanos y actos antisociales": "217_00",
  "con bomberos": "217_04",
  "con metro": "217_09",
  "con policia municipal": "217_01",
  "con policia nacional": "217_07",
  "con renfe": "217_08",
  "con samur social": "217_06",
  "con seam": "217_05",
  "con uapf": "217_03",
  "con unidad de medio ambiente": "217_10",
  "actuaciones conjuntas": "217",
  "via intraosea sistema ez io": "604_07",
  "via intraosea sistema ez-io": "604_07",
  "dispositivo de compresiones toracicas automatico lucas 3": "603_10",
  "edema agudo de pulmon": "309_05",
  "electrocardiograma de 12 derivaciones": "603_01",
  "electrodiagrama de 12 derivaciones": "603_01",
  "episiotomia mediolateral": "609_02",
  "episotomia mediolateral": "609_02",
  "exploracion ecografica extrahospitalaria": "607",
  "extraccion de lentes de contacto rigidas y blandas": "608_02",
  "hiponatremia": "312_03",
  "hipotermia terapeutica en la parada cardiaca": "603_09",
  "incidentes con multiples victimas y triaje imv": "207",
  "instrumental adultos": "403",
  "instrumental pediatrico": "404",
  "introductor de frova 140 fr adultos": "602_04",
  "introductor de frova 14 0 fr adultos": "602_04",
  "inmovilizacion nino sipe": "606_09",
  "insuficiencia cardiaca aguda cronica agudizada": "309_04",
  "manejo del ictus en la edad pediatrica": "314_07",
  "marcapasos temporal no invasivo": "603_05",
  "manejo avanzado de via aerea": "302",
  "medicion de temperatura central mediante sonda esofagica": "601_04",
  "obstruccion de la via aerea por cuerpo extrano": "405",
  "parche oclusivo toracico": "606_04",
  "patologias de origen cardiovascular": "407",
  "pcr traumatica": "301_02",
  "parada cardiorrespiratoria": "301",
  "policia municipal dispositivo electrico de control dec": "217_02",
  "posible enfermedad vascular cerebral aguda ictus": "410_01",
  "procedimiento de comunicaciones en un drp": "126_01",
  "procedimiento general de los drp": "700_01",
  "procedimiento de despliege de un drp": "700_02",
  "procedimiento de despliegue de un drp": "700_02",
  "procedimiento de cecor en un dispositivo de riesgo previsible": "700_03",
  "procedimiento de \"cecor\" en un dispositivo de riesgo previsible": "700_03",
  "procedimiento de incidentes complejos codigo pic": "217",
  "procedimiento de incidentes complejos": "217",
  "procedimiento en caso de accidente con unidades": "203_01",
  "reaccion alergica": "316",
  "sindrome escrotal agudo": "307_02",
  "sindrome coronario agudo con elevacion del st scacest": "309_02",
  "sindrome coronario agudo sin elevacion del sr scacest": "309_03",
  "sindrome coronario agudo sin elevacion del st scacest": "309_03",
  "test de troponina de alta sensibilidad analizador siemens healthineers": "604_15",
  "test rapido de antigeno de sars cov 2": "601_06",
  "tecnica de escarotomia": "606_06",
  "toracico": "412_03",
  "toracostomia con sonda kit de drenaje toracico portex": "602_07",
  "traumatismo pelvico": "304_09",
  "traumatismo craneoencefalico": "304_03",
  "traumatismos vertebro medulares": "304_06",
  "urticaria angioedema y anafilaxia en pediatria": "314_08",
  "valoracion del nino grave": "314_00",
  "valoracion del paciente adulto": "402",
  "valoracion del paciente pediatrico politraumatizado": "314_03",
  "ventilacion mecanica no invasiva": "602_13",
  "quemaduras": "314_06",
  "paciente con posible alteracion de niveles de glucemia capilar": "415",
  "transferencia de pacientes entre profesionales sanitarios": "219",
};

export function createDefaultManualSyncMetadata(): ManualSyncMetadata {
  return {
    manualVersionCurrent: getDefaultManualVersion(),
    manualVersion: getDefaultManualVersion(),
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
    const manualVersionCurrent = parsed.manualVersionCurrent || parsed.manualVersion || getDefaultManualVersion();
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
    // Sin comparación temporal aquí: con output: "export" se evaluaría en tiempo de
    // build y el banner se quedaría fijo (ha estado visible 40 días después de su
    // enabledUntil). Se publica la intención editorial y BreakingNewsTicker comprueba
    // la caducidad en cliente contra el reloj real.
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
      // NO se llama aquí a applyRecencyWindow. Este módulo se ejecuta en servidor y,
      // con output: "export", eso significa "una vez, en tiempo de build": el booleano
      // quedaba congelado en el HTML estático y la insignia "nuevo" no caducaba nunca
      // (se han llegado a mostrar 117 novedades de hace 47 días). Se fuerza a false y
      // el cliente recalcula con el reloj del usuario mediante applyRecencyWindow.
      events: Array.isArray(parsed.events)
        ? capManualUpdateEvents((parsed.events as ManualUpdateEvent[]).map((event) => ({ ...event, isRecent: false })))
        : [],
    };
  } catch {
    return createDefaultManualUpdatesDataset();
  }
}

export function writeManualUpdatesDataset(dataset: ManualUpdatesDataset, cwd = process.cwd()) {
  const filePath = path.join(cwd, DEFAULT_MANUAL_UPDATES_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ ...dataset, events: capManualUpdateEvents(dataset.events) }, null, 2)}\n`, "utf8");
}

export function capManualUpdateEvents(events: readonly ManualUpdateEvent[], maxEvents = MAX_MANUAL_UPDATE_EVENTS): ManualUpdateEvent[] {
  return capMobileUpdateEvents(events, maxEvents) as ManualUpdateEvent[];
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

/**
 * Expuesto solo para que un test pueda comprobar que ningún valor de la tabla se
 * queda apuntando a un id que ya no existe. No lo uses en runtime: la resolución
 * correcta pasa por `resolveStableProcedureIdForSource`, que además desambigua
 * los títulos repetidos entre SVA y SVB.
 */
export const STABLE_PROCEDURE_IDS_FOR_TESTS: Readonly<Record<string, string>> = STABLE_PROCEDURE_IDS;

/**
 * ¿Es este espacio una carpeta del wiki y no una ficha?
 *
 * El wiki agrupa los procedimientos en carpetas ("Urgencias cardiovasculares",
 * "Vasculares", "Sondajes"...) que el descubrimiento devuelve mezcladas con las
 * fichas reales. Son 20 de los 244 espacios. Antes se colaban y acababan con
 * `slugify(titulo)` de identificador; la alternativa era ir listándolas a mano en
 * `CATEGORY_SPACE_RE`, que hay que mantener cada vez que el wiki añade una.
 *
 * La regla es estructural: una carpeta es un espacio que tiene hijos. Pero no
 * basta con eso —"Actuaciones conjuntas" tiene hijos (217_01..217_10) y además es
 * el procedimiento 217—, así que la condición es *tener hijos y no tener id
 * asignado*. Un espacio con id es una ficha, tenga hijos o no.
 */
export function isContainerSpace(
  space: ProcedureSpace,
  allSpaces: readonly ProcedureSpace[],
  hasAssignedId: (space: ProcedureSpace) => boolean,
): boolean {
  if (hasAssignedId(space)) return false;
  const prefix = `${normalizeSpaceUrl(space.url)}/`;
  return allSpaces.some((other) => other.url !== space.url && normalizeSpaceUrl(other.url).startsWith(prefix));
}

function normalizeSpaceUrl(url: string): string {
  return decodeURIComponent(url).replace(/\/+$/, "");
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
    return decodedSource.includes("procedimientos svb") ? "402_01" : "314_00";
  }

  return resolveStableProcedureId(title);
}

/**
 * ¿Ha cambiado de verdad el procedimiento?
 *
 * `sourceUpdated` NO entra en la comparación a propósito. La wiki republica
 * páginas subiendo solo esa fecha, sin tocar una coma del contenido, y contarlo
 * como cambio salía caro: el sync reescribía los 230 ficheros, el PR mensual se
 * abría sin nada que revisar y el historial se llenaba de entradas «revisado»
 * vacías — 492 de las 500 que cabían, desalojando las reales.
 *
 * Con la fecha fuera, `updated` en el frontmatter se queda en la del último
 * cambio de contenido real, que es lo que la ficha dice mostrar y lo que el
 * lector entiende al leerla.
 *
 * `contentHash` sí se sigue escribiendo: isDeletionCandidate (lib/sync-guards.ts)
 * lo necesita no vacío para distinguir una baja real de una importación que
 * nunca llegó a sincronizarse.
 */
export function classifyProcedureChange(
  existing: ProcedureSnapshot | null,
  incoming: ProcedureSnapshot,
): ChangeType {
  if (!existing) return "created";
  if (
    existing.title !== incoming.title
    || existing.source !== incoming.source
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
  // "revisado" queda reservado para el bloqueo editorial, donde significa algo:
  // origen ha cambiado pero mantenemos nuestra versión. El caso de "solo cambió
  // la fecha" ya no llega hasta aquí — classifyProcedureChange lo devuelve como
  // "unchanged" y el sync ni siquiera escribe el fichero.
  if (changeType === "blocked_by_editorial") return "revisado";
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
    manualVersionCurrent: metadata.manualVersionCurrent || metadata.manualVersion || getDefaultManualVersion(),
    manualVersion: metadata.manualVersion || metadata.manualVersionCurrent || getDefaultManualVersion(),
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
    if (event.changeKind === "revisado") return false;
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

// Reexportado desde lib/manual-updates-logic.ts (puro, sin Node) para que los
// componentes cliente puedan usarlo sin arrastrar node:fs al bundle del navegador.
export { applyRecencyWindow, RECENT_WINDOW_MS, isTickerWithinWindow } from "./manual-updates-logic.ts";

/**
 * La seccion sale de la carpeta raiz del wiki, no de cualquier parte de la URL.
 *
 * Antes se comprobaban los patrones contra la URL entera y por orden, asi que
 * "Central de Comunicaciones/Tecnicas de comunicacion/" casaba con /Técnicas/ —
 * que va antes— y el procedimiento 123 se archivaba en Tecnicas. Como el fichero
 * se escribia en la carpeta de su seccion, aparecia un `tecnicas/123.md` junto al
 * `comunicaciones/123.md` que ya existia: dos ficheros con el mismo id, y el
 * paquete movil dejaba de validar por ids duplicados.
 *
 * Solo SVA y SVB necesitan mirar el segundo segmento, porque cuelgan de la misma
 * raiz ("Procedimientos asistenciales").
 */
export function getSectionFromXWikiUrl(url: string): string {
  const decoded = decodeURIComponent(url);
  const pathMatch = decoded.match(/\/bin\/view\/(.+?)\/?$/);
  const segments = (pathMatch ? pathMatch[1] : decoded)
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "WebHome");
  const root = segments[0] ?? "";
  const rest = segments.slice(1).join("/");

  if (/Dispositivos de Riesgo Previsible|DRP/i.test(root)) return "DRP";
  // El wiki tambien expone SVA y SVB como raiz, sin colgar de "asistenciales".
  if (/Procedimientos SVA|\bSVA\b/i.test(root)) return "SVA";
  if (/Procedimientos SVB|\bSVB\b/i.test(root)) return "SVB";
  if (/Procedimientos asistenciales/i.test(root)) {
    if (/Procedimientos SVA|\bSVA\b/i.test(rest)) return "SVA";
    if (/Procedimientos SVB|\bSVB\b/i.test(rest)) return "SVB";
    if (/Psicol/i.test(rest)) return "Psicológicos";
    return "General";
  }
  if (/^Técnicas$/i.test(root)) return "Técnicas";
  if (/Procedimientos Operativos/i.test(root)) return "Operativos";
  if (/Procedimientos Administrativos/i.test(root)) return "Administrativos";
  if (/Central de Comunicaciones|Comunicaciones/i.test(root)) return "Comunicaciones";
  if (/Intervinientes/i.test(root)) return "Intervinientes";
  if (/Psicol/i.test(root)) return "Psicológicos";
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

/**
 * Marcado de XWiki a markdown.
 *
 * Vive aqui, y no en el script del sync, porque es logica pura y es donde las
 * pruebas pueden alcanzarla: el script ejecuta `main()` al importarlo.
 *
 * Tres formas se le escapaban y llegaban al lector como texto:
 *
 *  - `[[etiqueta>>attach:fichero||target="_blank"]]` perdia los corchetes y se
 *    quedaba en `etiqueta>>/docs/...`, con el `>>` a la vista. Eran 440.
 *  - `[[⇧ Inicio pagina>>doc:]]` trae el destino vacio, y el patron de `doc:`
 *    exigia al menos un caracter detras. Eran 262, una al pie de casi cada ficha.
 *  - `(((` y `)))` solo se quitaban solos en su linea, y en el corpus casi
 *    siempre vienen dentro de una viñeta (`* (((`). Eran 600.
 *
 * Los anexos salen como `attach:fichero` y las imagenes como `image:fichero` a
 * proposito: `rewriteAttachmentLinks` es quien los convierte despues en la ruta
 * local, y hacerlo aqui duplicaria esa decision.
 */
export function xwikiToMarkdown(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    // XWiki escapa un caracter poniendole `~` delante. Se aparta antes de tocar
    // los enlaces y se restaura al final: si no, un `~]` dentro de una etiqueta
    // cuenta como el `]` que cierra el enlace y el patron corta donde no debe,
    // que es como "Ver Anexo I (... ~[NNA~])" se quedaba sin convertir.
    .replace(/~\[/g, "\u0001").replace(/~\]/g, "\u0002").replace(/~\|/g, "\u0003")
    // Los gif transparentes de 1x1 que el wiki usa para separar. No son contenido.
    .replace(/image:data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+(?:\|\|[^\n]*)?/gi, "")
    .replace(/\{\{html[\s\S]*?\{\{\/html\}\}/gi, "")
    .replace(/\(%[\s\S]*?%\)/g, "")
    .replace(/^\s*\(%[^)]*%\)\s*$/gm, "")
    // Los marcadores de grupo de XWiki. Antes solo se quitaban cuando estaban
    // solos en su linea, y en el corpus casi siempre vienen dentro de una viñeta
    // ("* ((("), asi que 600 de ellos llegaban al lector como texto literal.
    .replace(/^(\s*\*+\s+)?\(\(\(\s*$/gm, "")
    .replace(/^(\s*\*+\s+)?\)\)\)\s*$/gm, "")
    .replace(/\(\(\(\s*/g, "")
    .replace(/\s*\)\)\)/g, "")
    .replace(/^======\s*(.+?)\s*======\s*$/gm, "##### $1")
    .replace(/^=====\s*(.+?)\s*=====\s*$/gm, "##### $1")
    .replace(/^====\s*(.+?)\s*====\s*$/gm, "#### $1")
    .replace(/^===\s*(.+?)\s*===\s*$/gm, "### $1")
    .replace(/^==\s*(.+?)\s*==\s*$/gm, "## $1")
    .replace(/^=\s*(.+?)\s*=\s*$/gm, "# $1")
    .replace(/^(\*+)\s+(.+)$/gm, (_match, stars: string, text: string) => `${"  ".repeat(stars.length - 1)}* ${text}`)
    .replace(/\/\/([^/\n]+?)\/\//g, "*$1*")
    .replace(/__([^_\n]+?)__/g, "*$1*")
    .replace(/,,([^,\n]*?),,/g, "$1")
    .replace(/\^\^([^\^\n]*?)\^\^/g, "$1")
    .replace(/\{\{popoverV[^}]*?(?:anchorId|link)="([^"]+)"[^}]*?\}\}\{\{\/popoverV\}\}/g, (_match, drugName: string) => `<DrugLink name="${drugName}" />`)
    .replace(/\[\[([^\]]+?)>>url:([^\]|]+?)(?:\|\|[^\]]*)?\]\]/g, "[$1]($2)")
    .replace(/\[\[([^\]]+?)>>(https?:[^\]|]+?)(?:\|\|[^\]]*)?\]\]/g, "[$1]($2)")
    // El destino de un enlace `doc:` puede venir vacio —asi es el "Inicio pagina"
    // que remata casi todas las fichas—, y el `+` de antes no casaba con eso: 262
    // enlaces se quedaban en el texto como "Inicio pagina>>doc:".
    .replace(/\[\[([^\]]+?)>>doc:[^\]]*?\]\]/g, "$1")
    // Un anexo conserva su enlace en lugar de perder los corchetes y quedarse en
    // "etiqueta>>attach:fichero". `rewriteAttachmentLinks` convierte despues
    // `attach:fichero` en la ruta local, con lo que sale un enlace de verdad.
    .replace(/\[\[([^\]]+?)>>(attach:[^\]|]+?)(?:\|\|[^\]]*)?\]\]/g, "[$1]($2)")
    // Una imagen se queda como `image:fichero`, que es lo que rewriteAttachmentLinks
    // sabe convertir en `![](ruta)`. Aqui solo se le quitan corchetes y parametros.
    // El salto de linea no es cosmetico: dos imagenes seguidas se pegaban en
    // "image:aimage:b", y el extractor de adjuntos leia eso como un solo fichero
    // con un nombre imposible que despues daba 404 al descargarlo.
    .replace(/\[\[image:([^\]|]+?)(?:\|\|[^\]]*)?\]\]/g, "\nimage:$1\n")
    // Cualquier otro esquema: se conserva como enlace en vez de dejar el ">>" suelto.
    .replace(/\[\[([^\]]+?)>>([^\]|]+?)(?:\|\|[^\]]*)?\]\]/g, "[$1]($2)")
    .replace(/\[\[([^\]]+?)(?:\|\|[^\]]*)?\]\]/g, "$1")
    // "Inicio pagina" es la navegacion del wiki, no contenido de la ficha. Puede
    // venir partida en varias lineas dentro de los corchetes, asi que se limpia
    // sobre el texto completo y no linea a linea.
    .replace(/\[?\[?\s*[⇧↑]?\s*Inicio p[aá]gina\s*(?:>>doc:[^\]\n]*)?\s*\]?\]?/gi, "")
    // Una imagen que solo existe como URL remota: `rewriteAttachmentLinks` no la
    // sustituye si la descarga falla, y se quedaba como texto "image:https://...".
    // Como markdown al menos es una imagen, y el linter admite origen servpub.
    .replace(/image:(https?:\/\/[^\s|)\]]+)(?:\|\|[^\n]*)?/gi, "![]($1)")
    .replace(/^\s*\[\[\s*$/gm, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<(?!\/?DrugLink\b)/g, "&lt;")
    // Red de seguridad. El marcado del wiki no siempre viene bien formado —hay
    // enlaces partidos en dos lineas y corchetes de apertura que no existen— y lo
    // que quede suelto no significa nada en markdown, solo se ve como ruido.
    .replace(/^\s*Inicio p[aá]gina.*$/gim, "")
    .replace(/>>doc:[^\s\]]*/g, "")
    .replace(/\[\[|\]\]/g, "")
    // Una viñeta que se ha quedado sin contenido. Pasa cuando lo unico que
    // contenia era una imagen y esta se ha separado a su propia linea.
    .replace(/^\s*(?:[*-]|\d+[.)])\s*$\n?/gm, "")
    .replace(/\u0001/g, "[").replace(/\u0002/g, "]").replace(/\u0003/g, "|")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    const filename = decodeURIComponent(new URL(value).pathname.split("/").at(-1) ?? "adjunto");
    return filename.split("@").at(-1) || filename;
  } catch {
    const filename = value.split("/").at(-1) ?? "adjunto";
    return filename.split("@").at(-1) || filename;
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
