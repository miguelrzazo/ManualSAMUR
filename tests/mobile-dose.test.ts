import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDoseConversion,
  doseUtilityEligibility,
  type DoseConversionRequest,
  type DoseMedicationMetadata,
} from "../apps/mobile/src/dose-logic.ts";

const medication: DoseMedicationMetadata = {
  id: "adrenalina",
  name: "Adrenalina",
  eligible: true,
  presentation: {
    id: "adrenalina-1mg-1ml",
    label: "Ampolla 1 mg / 1 ml",
    concentration: { amount: 1, amountUnit: "mg", volume: 1, volumeUnit: "mL" },
    routes: ["IV", "IO"],
    rounding: { increment: 0.1, mode: "nearest", unit: "mL" },
  },
  source: {
    revision: "SAMUR-2026.09",
    date: "2026-09-01",
    clinicianSource: "Comisión clínica SAMUR",
    url: "https://servpub.madrid.es/manualsamur/",
    maxAgeDays: 30,
  },
};

const base = (overrides: Partial<DoseConversionRequest> = {}): DoseConversionRequest => ({
  operation: "amount-to-volume",
  medication,
  amount: { value: "12,5", unit: "mg" },
  enteredRoute: "iv",
  presentationConfirmed: true,
  routeConfirmed: true,
  clinicianSourceConfirmed: true,
  now: "2026-09-05T12:00:00Z",
  ...overrides,
});

function success(request: DoseConversionRequest) {
  const result = calculateDoseConversion(request);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

test("golden amount to volume accepts Spanish decimal comma and audits the full calculation", () => {
  const result = success(base());
  assert.equal(result.unit, "mL");
  assert.equal(result.fullPrecision, 12.5);
  assert.equal(result.rounded, 12.5);
  assert.equal(result.display, "12,5 mL");
  assert.match(result.audit.formula, /12\.5 mg/);
  assert.equal(result.audit.medication.id, "adrenalina");
  assert.equal(result.audit.presentation.id, "adrenalina-1mg-1ml");
  assert.equal(result.audit.source.revision, "SAMUR-2026.09");
  assert.equal(result.audit.inputs.entered.amount?.value, "12,5");
  assert.equal((result.audit.inputs.normalized.amount as { value: number }).value, 12.5);
  assert.equal(result.audit.rounding.increment, 0.1);
});

test("golden dose-rate conversion handles weight-based rates and normalizes to mL/h", () => {
  const result = success(base({
    operation: "dose-rate-to-pump-rate",
    amount: undefined,
    doseRate: { value: "0,1", unit: "mg", timeUnit: "min", perKg: true },
    weightKg: "70,0",
    approvedRounding: { increment: 1, mode: "nearest", unit: "mL/h" },
  }));
  assert.equal(result.unit, "mL/h");
  assert.equal(result.fullPrecision, 420);
  assert.equal(result.rounded, 420);
  assert.equal(result.display, "420 mL/h");
  assert.match(result.audit.formula, /420/);
  assert.equal((result.audit.inputs.normalized.weightKg as number), 70);
});

test("accepts an explicit structured compound rate unit for weight-based dosing", () => {
  const result = success(base({
    operation: "dose-rate-to-pump-rate",
    amount: undefined,
    doseRate: { value: "0,1", unit: "mg/kg/min" },
    weightKg: "70",
    approvedRounding: { increment: 1, mode: "nearest", unit: "mL/h" },
  }));
  assert.equal(result.rounded, 420);
});

test("golden conversion applies only the approved rounding policy and retains full precision", () => {
  const result = success(base({
    amount: { value: "1", unit: "g" },
    approvedRounding: { increment: "0,5", mode: "nearest", unit: "mL" },
  }));
  assert.equal(result.fullPrecision, 1000);
  assert.equal(result.rounded, 1000);
  assert.equal(result.audit.rounding.mode, "nearest");
});

test("accepts the compact structured package form without falling back to prose", () => {
  const result = success(base({
    medication: {
      id: "morfina",
      name: "Morfina",
      doseConversion: {
        eligible: true,
        presentation: {
          id: "morfina-15mg-1ml",
          label: "Ampolla 15 mg / 1 ml",
          concentration: { value: "15", unit: "mg/mL" },
          route: "IV",
          rounding: { increment: 0.1, mode: "nearest", unit: "mL" },
        },
        source: { revision: "CLIN-9", date: "2026-09-01", type: "clinician" },
      },
    },
    amount: { value: "30", unit: "mg" },
  }));
  assert.equal(result.fullPrecision, 2);
  assert.equal(result.audit.presentation.routes[0], "IV");
  assert.equal(result.audit.source.clinicianSource, "clinician");
});

const rejectionCases: Array<[string, Partial<DoseConversionRequest>, string]> = [
  ["requires source confirmation", { clinicianSourceConfirmed: false, sourceConfirmed: false }, "source-unconfirmed"],
  ["requires presentation confirmation", { presentationConfirmed: false }, "presentation-unconfirmed"],
  ["requires route confirmation", { routeConfirmed: false }, "route-unconfirmed"],
  ["rejects route mismatch", { enteredRoute: "IM" }, "route-mismatch"],
  ["rejects unsupported dose unit", { amount: { value: 5, unit: "tablet" } }, "unsupported-unit"],
  ["rejects dimensional mismatch", { amount: { value: 5, unit: "mEq" } }, "dimension-mismatch"],
  ["rejects missing weight for weight-based rate", { operation: "dose-rate-to-pump-rate", amount: undefined, doseRate: { value: 1, unit: "mg", timeUnit: "min", perKg: true }, approvedRounding: { increment: 1, mode: "nearest", unit: "mL/h" } }, "missing-weight"],
  ["rejects invalid and non-positive input", { amount: { value: "0", unit: "mg" } }, "invalid-input"],
  ["rejects stale source", { now: "2027-01-01T00:00:00Z" }, "stale-source"],
];

for (const [name, overrides, code] of rejectionCases) {
  test(name, () => {
    const result = calculateDoseConversion(base(overrides));
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unexpected successful conversion");
    assert.equal(result.code, code);
    assert.equal(result.warnings.length > 0, true);
  });
}

test("fails closed for excluded, ambiguous, and unstructured medication records", () => {
  const excluded = calculateDoseConversion(base({ medication: { ...medication, excluded: true, excludedReason: "Presentación no autorizada" } }));
  assert.equal(excluded.ok, false);
  if (!excluded.ok) assert.equal(excluded.code, "excluded");

  const ambiguous = calculateDoseConversion(base({ medication: { ...medication, ambiguous: true } }));
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.equal(ambiguous.code, "ambiguous-metadata");

  const proseOnly = calculateDoseConversion(base({ medication: {
    id: medication.id,
    name: medication.name,
    presentation: "1 mg / 1 ml",
    route: ["IV"],
    dose: "12,5 mg IV",
  } as unknown as DoseMedicationMetadata }));
  assert.equal(proseOnly.ok, false);
  if (!proseOnly.ok) assert.equal(proseOnly.code, "missing-structured-metadata");
  assert.deepEqual(doseUtilityEligibility(proseOnly.ok ? proseOnly.audit.medication : proseOnly), { eligible: false, reason: "La ficha no contiene concentración, vía, fuente o redondeo estructurados completos." });
});

test("does not mutate medication metadata or expose a persistence mechanism", () => {
  const before = JSON.stringify(medication);
  const result = success(base());
  assert.equal(JSON.stringify(medication), before);
  assert.equal("save" in result, false);
  assert.equal("copy" in result, false);
  assert.equal("share" in result, false);
  assert.equal("export" in result, false);
});
