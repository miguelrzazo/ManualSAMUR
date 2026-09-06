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

