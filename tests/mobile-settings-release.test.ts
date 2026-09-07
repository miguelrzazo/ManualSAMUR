import assert from "node:assert/strict";
import test from "node:test";
import {
  PENDING_SETTINGS_LEGAL_METADATA,
  SETTINGS_METADATA_PENDING,
  isPendingSettingsMetadata,
  isSettingsReleaseReady,
  validateSettingsReleaseMetadata,
  type SettingsLegalMetadata,
} from "../apps/mobile/src/settings-legal.ts";

test("placeholder Settings metadata blocks a strict release", () => {
  assert.equal(isSettingsReleaseReady(PENDING_SETTINGS_LEGAL_METADATA), false);
  assert.deepEqual(
    validateSettingsReleaseMetadata(PENDING_SETTINGS_LEGAL_METADATA).map((issue) => issue.field),
    ["publisher", "privacyPolicyUrl", "supportUrl", "supportEmail"],
  );
  assert.equal(isPendingSettingsMetadata(SETTINGS_METADATA_PENDING), true);
});

test("valid HTTPS legal links and support contact pass strict release", () => {
  const metadata: SettingsLegalMetadata = {
    publisher: "Entidad editora de ejemplo",
    privacyPolicyUrl: "https://example.org/privacidad",
    supportUrl: "https://example.org/soporte",
    supportEmail: "soporte@example.org",
  };

  assert.deepEqual(validateSettingsReleaseMetadata(metadata), []);
  assert.equal(isSettingsReleaseReady(metadata), true);
});

test("non-HTTPS links and malformed support contacts are rejected", () => {
  const metadata: SettingsLegalMetadata = {
    publisher: "Entidad editora de ejemplo",
    privacyPolicyUrl: "http://example.org/privacidad",
    supportUrl: "not-a-url",
    supportEmail: "soporte.example.org",
  };

  assert.deepEqual(
    validateSettingsReleaseMetadata(metadata).map((issue) => issue.field),
    ["privacyPolicyUrl", "supportUrl", "supportEmail"],
  );
  assert.equal(isSettingsReleaseReady(metadata), false);
});


/**
 * El hueco de la academia (#98) se construye vacio: hasta que haya creatividad,
 * la app no debe cambiar en nada. Estas condiciones son las que lo garantizan.
 */
test("el hueco de la academia no se enseña mientras no este configurado", async () => {
  const { academySlot, shouldShowAcademyEntry, shouldShowAcademySplash } = await import("../apps/mobile/src/academy-slot.ts");

  assert.equal(academySlot, undefined, "no debe entrar creatividad en el repositorio sin decidirlo");
  assert.equal(shouldShowAcademyEntry(undefined), false);
  assert.equal(shouldShowAcademySplash(undefined, true, false), false);

  const configurado = { title: "Academia", detail: "Cursos", url: "https://ejemplo.example", splashImage: "a.png" };
  assert.equal(shouldShowAcademyEntry(configurado), true);
  // Nunca antes de aceptar el aviso de primer uso.
  assert.equal(shouldShowAcademySplash(configurado, false, false), false);
  // Y una sola vez por sesion: la pantalla de lanzamiento vuelve en cada reactivacion.
  assert.equal(shouldShowAcademySplash(configurado, true, false), true);
  assert.equal(shouldShowAcademySplash(configurado, true, true), false);
  // Sin imagen de arranque hay entrada en ajustes pero no interrupcion al abrir.
  assert.equal(shouldShowAcademySplash({ ...configurado, splashImage: undefined }, true, false), false);
});
