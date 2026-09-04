/**
 * Bounded, fail-closed dose conversion for the mobile vademecum.
 *
 * This module intentionally accepts only structured concentration and route
 * metadata.  It never attempts to extract numbers from the free-form dose or
 * presentation prose: prose is reference material, not calculator input.
 * The functions are pure and have no storage, clipboard, sharing, or network
 * side effects.
 */

export type DoseMassUnit = "g" | "mg" | "mcg" | "µg" | "ng" | "mEq" | "U" | "UI";
export type DoseVolumeUnit = "mL" | "L";
export type DoseTimeUnit = "min" | "h" | "day";
export type DoseDimension = "mass" | "electrolyte" | "activity";
export type DoseOperation = "amount-to-volume" | "dose-rate-to-pump-rate";
export type DoseRoundingMode = "nearest" | "floor" | "ceil";

export interface DoseNumberInput {
  value: number | string;
  unit: string;
}

export interface StructuredConcentration {
  amount?: number | string;
  amountUnit?: string;
  volume?: number | string;
  volumeUnit?: string;
  /** Alternate structured wire form: `{ value: 1, unit: "mg/mL" }`. */
  value?: number | string;
  unit?: string;
}

export interface DosePresentationMetadata {
  id: string;
  label: string;
  concentration: StructuredConcentration;
  routes: string[];
  /** Explicitly approved rounding for this presentation, in output units. */
  rounding: DoseRoundingPolicy;
}

export interface DoseSourceMetadata {
  revision: string;
  date: string;
  /** A named clinician/source owner or an equivalent approved source marker. */
  clinicianSource: string;
  url?: string;
  validUntil?: string;
  maxAgeDays?: number;
}

export interface DoseMedicationMetadata {
  id: string;
  name: string;
  eligible: boolean;
  presentation: DosePresentationMetadata;
  source: DoseSourceMetadata;
  excluded?: boolean;
  excludedReason?: string;
  /** A package can mark a record ambiguous/conflicted instead of dropping it. */
  ambiguous?: boolean;
  conflict?: boolean;
  conflicts?: string[];
}

export interface DoseRoundingPolicy {
  increment: number | string;
  mode: DoseRoundingMode;
  /** Must be mL for amount conversion and mL/h for rate conversion. */
  unit?: "mL" | "mL/h";
}

export interface DoseConversionRequest {
  operation: DoseOperation;
  medication: DoseMedicationMetadata | Record<string, unknown>;
  amount?: DoseNumberInput;
  /** `timeUnit` is preferred; a structured compound unit like `mg/kg/min` is also accepted. */
  doseRate?: DoseNumberInput & { timeUnit?: string; perKg?: boolean };
  weightKg?: number | string;
  enteredRoute: string;
  presentationConfirmed?: boolean;
  routeConfirmed?: boolean;
  sourceConfirmed?: boolean;
  clinicianSourceConfirmed?: boolean;
  /** Used by tests and deterministic callers; defaults to the device clock. */
  now?: string | Date;
  /** Caller may only repeat the approved policy, never invent one. */
  approvedRounding?: DoseRoundingPolicy;
}

export interface DoseAuditTrail {
  medication: { id: string; name: string };
  presentation: {
    id: string;
    label: string;
    concentration: StructuredConcentration;
    routes: string[];
  };
  source: { revision: string; date: string; clinicianSource: string; url?: string };
  inputs: {
    operation: DoseOperation;
    entered: Record<string, unknown>;
    normalized: Record<string, unknown>;
    route: string;
  };
  formula: string;
  fullPrecision: number;
  rounding: { increment: number; mode: DoseRoundingMode; unit: "mL" | "mL/h"; result: number };
  warnings: string[];
}

export interface DoseConversionSuccess {
  ok: true;
  operation: DoseOperation;
  value: number;
  unit: "mL" | "mL/h";
  fullPrecision: number;
  rounded: number;
  display: string;
  warnings: string[];
  audit: DoseAuditTrail;
}

export type DoseFailureCode =
  | "excluded"
  | "missing-structured-metadata"
  | "ambiguous-metadata"
  | "source-unconfirmed"
  | "presentation-unconfirmed"
  | "route-unconfirmed"
  | "route-mismatch"
  | "stale-source"
  | "invalid-input"
  | "unsupported-unit"
  | "dimension-mismatch"
  | "missing-weight"
  | "invalid-rounding";

export interface DoseConversionFailure {
  ok: false;
  code: DoseFailureCode;
  reason: string;
  warnings: string[];
}

export type DoseConversionResult = DoseConversionSuccess | DoseConversionFailure;

const MASS_FACTORS: Record<string, { dimension: DoseDimension; mg: number }> = {
  g: { dimension: "mass", mg: 1000 },
  mg: { dimension: "mass", mg: 1 },
  mcg: { dimension: "mass", mg: 0.001 },
  ug: { dimension: "mass", mg: 0.001 },
  ng: { dimension: "mass", mg: 0.000001 },
  meq: { dimension: "electrolyte", mg: 1 },
  u: { dimension: "activity", mg: 1 },
  ui: { dimension: "activity", mg: 1 },
};

const VOLUME_FACTORS: Record<string, number> = { ml: 1, l: 1000 };
const TIME_FACTORS_TO_HOURS: Record<string, number> = { min: 1 / 60, h: 1, day: 24 };

const failure = (code: DoseFailureCode, reason: string): DoseConversionFailure => ({
  ok: false,
  code,
  reason,
  warnings: ["No se ha calculado ningún resultado. Confirma la fuente clínica y la ficha publicada."],
});

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\u00a0/g, " ");
  // Deliberately reject signs, exponents and thousands separators. A single
  // Spanish decimal comma is accepted and normalized to a dot.
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return undefined;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function canonicalUnit(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[µμ]/g, "u")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function massUnit(value: unknown) {
  const key = canonicalUnit(value);
  const factor = MASS_FACTORS[key];
  return factor ? { key, ...factor } : undefined;
}

function volumeUnit(value: unknown) {
  const key = canonicalUnit(value);
  const factor = VOLUME_FACTORS[key];
  return factor ? { key, factor } : undefined;
}

function timeUnit(value: unknown) {
  const key = canonicalUnit(value);
  const factor = TIME_FACTORS_TO_HOURS[key];
  return factor ? { key, factor } : undefined;
}

function routeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-_/]+/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isFailure(value: unknown): value is DoseConversionFailure {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok?: unknown }).ok === false);
}

function validDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normaliseMetadata(raw: DoseMedicationMetadata | Record<string, unknown>): DoseMedicationMetadata | DoseConversionFailure {
  const value = raw as Record<string, unknown>;
  const structured = (value.doseConversion && typeof value.doseConversion === "object" ? value.doseConversion : value) as Record<string, unknown>;
  const presentations = structured.presentations;
  if (Array.isArray(presentations) && presentations.length !== 1) return failure("ambiguous-metadata", "La ficha contiene varias presentaciones y no se ha seleccionado una de forma explícita.");
  const presentation = (structured.presentation && typeof structured.presentation === "object" ? structured.presentation : structured) as Record<string, unknown>;
  const rawConcentration = presentation.concentration && typeof presentation.concentration === "object" ? presentation.concentration : undefined;
  const concentration = rawConcentration as Record<string, unknown> | undefined;
  const source = (structured.source && typeof structured.source === "object" ? structured.source : undefined) as Record<string, unknown> | undefined;
  const routeValue = presentation.routes ?? presentation.route ?? structured.routes ?? structured.route;
  const routes = Array.isArray(routeValue) ? routeValue : typeof routeValue === "string" ? [routeValue] : [];
  const concentrationUnit = typeof concentration?.unit === "string" ? concentration.unit : "";
  const compoundUnits = concentrationUnit.split("/");
  const concentrationAmount = concentration?.amount ?? (compoundUnits.length === 2 ? concentration?.value : undefined);
  const concentrationAmountUnit = concentration?.amountUnit ?? (compoundUnits.length === 2 ? compoundUnits[0] : undefined);
  const concentrationVolume = concentration?.volume ?? (compoundUnits.length === 2 ? 1 : undefined);
  const concentrationVolumeUnit = concentration?.volumeUnit ?? (compoundUnits.length === 2 ? compoundUnits[1] : undefined);
  const rawConflicts = structured.conflicts ?? value.conflicts;
  const medication: DoseMedicationMetadata = {
    id: asString(structured.id ?? value.id) ?? "",
    name: asString(structured.name ?? value.name) ?? "",
    eligible: structured.eligible === true || value.eligible === true,
    excluded: structured.excluded === true || value.excluded === true,
    excludedReason: asString(structured.excludedReason ?? value.excludedReason),
    ambiguous: structured.ambiguous === true || value.ambiguous === true || presentation.ambiguous === true,
    conflict: structured.conflict === true || value.conflict === true || presentation.conflict === true || concentration?.conflict === true,
    conflicts: Array.isArray(rawConflicts) ? rawConflicts.filter((item): item is string => typeof item === "string") : undefined,
    presentation: {
      id: asString(presentation.id) ?? "",
      label: asString(presentation.label) ?? "",
      concentration: {
        amount: typeof concentrationAmount === "number" || typeof concentrationAmount === "string" ? concentrationAmount : "",
        amountUnit: asString(concentrationAmountUnit) ?? "",
        volume: typeof concentrationVolume === "number" || typeof concentrationVolume === "string" ? concentrationVolume : "",
        volumeUnit: asString(concentrationVolumeUnit) ?? "",
      },
      routes: routes.filter((item): item is string => typeof item === "string"),
      rounding: (presentation.rounding ?? structured.rounding ?? value.rounding) as DoseRoundingPolicy,
    },
    source: {
      revision: asString(source?.revision ?? structured.sourceRevision ?? value.sourceRevision) ?? "",
      date: asString(source?.date ?? structured.sourceDate ?? value.sourceDate) ?? "",
      clinicianSource: asString(source?.clinicianSource ?? source?.clinician ?? structured.clinicianSource ?? value.clinicianSource)
        ?? ((source?.type === "clinician" || source?.kind === "clinician" || source?.type === "clinician-approved") ? String(source.type ?? source.kind) : ""),
      url: asString(source?.url),
      validUntil: asString(source?.validUntil),
      maxAgeDays: source?.maxAgeDays as number | undefined,
    },
  };

  if (!medication.id || !medication.name || !medication.presentation.id || !medication.presentation.label
    || !concentration || concentrationAmount === undefined || !concentrationAmountUnit
    || concentrationVolume === undefined || !concentrationVolumeUnit
    || medication.presentation.routes.length === 0 || !medication.source.revision || !medication.source.date
    || !medication.source.clinicianSource || !medication.presentation.rounding) {
    return failure("missing-structured-metadata", "La ficha no contiene concentración, vía, fuente o redondeo estructurados completos.");
  }
  return medication;
}

function freshnessFailure(source: DoseSourceMetadata, now: Date): DoseConversionFailure | undefined {
  const sourceDate = validDate(source.date);
  if (!sourceDate) return failure("stale-source", "La fecha de la fuente clínica no es válida.");
  if (sourceDate.getTime() > now.getTime() + 60_000) return failure("stale-source", "La fuente clínica tiene una fecha futura no verificable.");
  const validUntil = source.validUntil ? validDate(source.validUntil) : undefined;
  if (source.validUntil && !validUntil) return failure("stale-source", "La vigencia de la fuente clínica no es válida.");
  if (validUntil && now > validUntil) return failure("stale-source", "La fuente clínica está fuera de vigencia.");
  const maxAge = source.maxAgeDays ?? 365;
  if (!Number.isFinite(maxAge) || maxAge <= 0 || now.getTime() - sourceDate.getTime() > maxAge * 86_400_000) {
    return failure("stale-source", "La fuente clínica está desactualizada; no se permite extrapolar la conversión.");
  }
  return undefined;
}

function conversionFactor(concentration: StructuredConcentration): { dimension: DoseDimension; mgPerMl: number; display: string } | DoseConversionFailure {
  const amount = numberValue(concentration.amount);
  const volume = numberValue(concentration.volume);
  const unit = massUnit(concentration.amountUnit);
  const volumeUnitValue = volumeUnit(concentration.volumeUnit);
  if (!amount || !volume) return failure("invalid-input", "La concentración contiene valores positivos incompletos.");
  if (!unit || !volumeUnitValue) return failure("unsupported-unit", "La concentración usa una unidad no admitida.");
  const amountInMg = amount * unit.mg;
  const volumeInMl = volume * volumeUnitValue.factor;
  return { dimension: unit.dimension, mgPerMl: amountInMg / volumeInMl, display: `${amount} ${concentration.amountUnit}/${volume} ${concentration.volumeUnit}` };
}

function approvedRounding(policy: unknown, expectedUnit: "mL" | "mL/h"): { increment: number; mode: DoseRoundingMode; unit: "mL" | "mL/h" } | DoseConversionFailure {
  if (!policy || typeof policy !== "object") return failure("invalid-rounding", "No hay una política de redondeo clínicamente aprobada.");
  const value = policy as Record<string, unknown>;
  const increment = numberValue(value.increment);
  const mode = value.mode;
  const unit = value.unit ?? expectedUnit;
  if (!increment || (mode !== "nearest" && mode !== "floor" && mode !== "ceil") || unit !== expectedUnit) {
    return failure("invalid-rounding", "La política de redondeo no es compatible con el resultado.");
  }
  return { increment, mode, unit: expectedUnit };
}

function round(value: number, policy: { increment: number; mode: DoseRoundingMode }): number {
  const scaled = value / policy.increment;
  const rounded = policy.mode === "floor" ? Math.floor(scaled) : policy.mode === "ceil" ? Math.ceil(scaled) : Math.round(scaled);
  return rounded * policy.increment;
}

function display(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 6, useGrouping: false });
}

/** Calculate a single bounded conversion, or return a reasoned failure. */
export function calculateDoseConversion(request: DoseConversionRequest): DoseConversionResult {
  const medicationResult = normaliseMetadata(request.medication);
  if (isFailure(medicationResult)) return medicationResult;
  const medication = medicationResult;
  if (medication.excluded || medication.excludedReason) return failure("excluded", medication.excludedReason ?? "Esta ficha está excluida del cálculo.");
  if (!medication.eligible) return failure("excluded", "Esta ficha no está autorizada para conversiones.");
  if (medication.ambiguous || medication.conflict || medication.conflicts?.length) return failure("ambiguous-metadata", "La ficha tiene datos de presentación o concentración ambiguos/conflictivos.");
  if (!request.sourceConfirmed && !request.clinicianSourceConfirmed) return failure("source-unconfirmed", "Confirma la fuente clínica antes de calcular.");
  if (!request.presentationConfirmed) return failure("presentation-unconfirmed", "Confirma la presentación seleccionada.");
  if (!request.routeConfirmed) return failure("route-unconfirmed", "Confirma la vía de administración.");
  const enteredRoute = routeKey(request.enteredRoute);
  const routes = medication.presentation.routes.map(routeKey).filter(Boolean);
  if (!enteredRoute || !routes.includes(enteredRoute)) return failure("route-mismatch", "La vía introducida no coincide con las vías publicadas para esta presentación.");
  const now = validDate(request.now) ?? new Date();
  const freshness = freshnessFailure(medication.source, now);
  if (freshness) return freshness;
  const concentration = conversionFactor(medication.presentation.concentration);
  if (isFailure(concentration)) return concentration;

  const outputUnit = request.operation === "amount-to-volume" ? "mL" : "mL/h";
  const entered: Record<string, unknown> = { route: request.enteredRoute };
  const normalized: Record<string, unknown> = { concentration: concentration.display, route: enteredRoute };
  let fullPrecision: number;
  let formula: string;
  if (request.operation === "amount-to-volume") {
    if (!request.amount) return failure("invalid-input", "Introduce una cantidad y unidad de dosis completas.");
    const amount = numberValue(request.amount.value);
    const unit = massUnit(request.amount.unit);
    if (!amount) return failure("invalid-input", "La cantidad de dosis debe ser un número positivo finito.");
    if (!unit) return failure("unsupported-unit", "La dosis usa una unidad no admitida.");
    if (unit.dimension !== concentration.dimension) return failure("dimension-mismatch", "La unidad de dosis no es dimensionalmente compatible con la concentración.");
    entered.amount = { ...request.amount };
    const normalizedAmountValue = amount * unit.mg;
    const normalizedAmountUnit = unit.dimension === "mass" ? "mg" : unit.dimension === "activity" ? "UI" : "mEq";
    normalized.amount = { value: normalizedAmountValue, unit: normalizedAmountUnit };
    fullPrecision = normalizedAmountValue / concentration.mgPerMl;
    formula = `${normalizedAmountValue} ${normalizedAmountUnit} ÷ (${concentration.display}) = ${fullPrecision} mL`;
  } else {
    if (!request.doseRate) return failure("invalid-input", "Introduce una dosis por tiempo y unidad completas.");
    const dose = numberValue(request.doseRate.value);
    const compoundRateUnits = request.doseRate.unit.split("/").map((item) => item.trim()).filter(Boolean);
    const compoundTimeUnit = compoundRateUnits.length >= 2 ? compoundRateUnits.at(-1) : undefined;
    const compoundPerKg = compoundRateUnits.length === 3 && canonicalUnit(compoundRateUnits[1]) === "kg";
    const rateAmountUnit = compoundRateUnits.length >= 2 ? compoundRateUnits[0] : request.doseRate.unit;
    const unit = massUnit(rateAmountUnit);
    const time = timeUnit(request.doseRate.timeUnit ?? compoundTimeUnit);
    if (!dose) return failure("invalid-input", "La dosis por tiempo debe ser un número positivo finito.");
    if (!unit || !time) return failure("unsupported-unit", "La dosis por tiempo usa una unidad no admitida.");
    if (unit.dimension !== concentration.dimension) return failure("dimension-mismatch", "La unidad de dosis no es dimensionalmente compatible con la concentración.");
    const isPerKg = request.doseRate.perKg === true || compoundPerKg;
    const weight = isPerKg ? numberValue(request.weightKg) : undefined;
    if (isPerKg && !weight) return failure("missing-weight", "Una dosis por kg requiere un peso positivo finito.");
    const totalDosePerHour = (dose * (weight ?? 1) * unit.mg) / time.factor;
    entered.doseRate = { ...request.doseRate };
    if (isPerKg) entered.weightKg = request.weightKg;
    const normalizedDoseRateValue = dose * unit.mg / time.factor;
    const normalizedDoseRateUnit = unit.dimension === "mass" ? "mg/h" : unit.dimension === "activity" ? "UI/h" : "mEq/h";
    normalized.doseRate = { value: normalizedDoseRateValue, unit: normalizedDoseRateUnit };
    if (weight) normalized.weightKg = weight;
    fullPrecision = totalDosePerHour / concentration.mgPerMl;
    formula = `${totalDosePerHour} ${normalizedDoseRateUnit} ÷ (${concentration.display}) = ${fullPrecision} mL/h`;
  }
  if (!Number.isFinite(fullPrecision) || fullPrecision <= 0) return failure("invalid-input", "El resultado no es un número positivo finito.");
  const policy = approvedRounding(request.approvedRounding ?? medication.presentation.rounding, outputUnit);
  if (isFailure(policy)) return policy;
  const rounded = round(fullPrecision, policy);
  if (!Number.isFinite(rounded) || rounded <= 0) return failure("invalid-rounding", "El redondeo aprobado produce un resultado no utilizable.");
  const warnings = ["Resultado orientativo: confirma la pauta, el paciente y la fuente clínica vigente antes de administrar.", ...(rounded !== fullPrecision ? [`Redondeado según política aprobada a ${display(rounded)} ${outputUnit}.`] : [])];
  const audit: DoseAuditTrail = {
    medication: { id: medication.id, name: medication.name },
    presentation: { id: medication.presentation.id, label: medication.presentation.label, concentration: medication.presentation.concentration, routes: medication.presentation.routes },
    source: { revision: medication.source.revision, date: medication.source.date, clinicianSource: medication.source.clinicianSource, ...(medication.source.url ? { url: medication.source.url } : {}) },
    inputs: { operation: request.operation, entered, normalized, route: enteredRoute },
    formula,
    fullPrecision,
    rounding: { ...policy, result: rounded },
    warnings,
  };
  return { ok: true, operation: request.operation, value: rounded, unit: outputUnit, fullPrecision, rounded, display: `${display(rounded)} ${outputUnit}`, warnings, audit };
}

/** A stricter type guard useful to the UI and test harness. */
export function isDoseConversionSuccess(result: DoseConversionResult): result is DoseConversionSuccess {
  return result.ok;
}

/** Explicitly preserves the no-persistence contract for future callers. */
export function doseUtilityEligibility(medication: unknown): { eligible: boolean; reason?: string } {
  const result = normaliseMetadata((medication ?? {}) as Record<string, unknown>);
  if (isFailure(result)) return { eligible: false, reason: result.reason };
  if (result.excluded || result.excludedReason) return { eligible: false, reason: result.excludedReason ?? "Ficha excluida" };
  if (!result.eligible) return { eligible: false, reason: "Ficha no autorizada" };
  if (result.ambiguous || result.conflict || result.conflicts?.length) return { eligible: false, reason: "Datos ambiguos o conflictivos" };
  return { eligible: true };
}
