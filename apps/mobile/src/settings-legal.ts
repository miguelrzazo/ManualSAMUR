/**
 * Legal and support metadata shown by the native Settings sheet.
 *
 * These deliberately noisy sentinel values make unfinished store metadata
 * visible in development and impossible to mistake for release-ready copy.
 */
export const SETTINGS_METADATA_PENDING = "__PENDING_BEFORE_RELEASE__" as const;

export interface SettingsLegalMetadata {
  publisher: string;
  privacyPolicyUrl: string;
  supportUrl: string;
  supportEmail: string;
}

export const PENDING_SETTINGS_LEGAL_METADATA: Readonly<SettingsLegalMetadata> = {
  publisher: SETTINGS_METADATA_PENDING,
  privacyPolicyUrl: SETTINGS_METADATA_PENDING,
  supportUrl: SETTINGS_METADATA_PENDING,
  supportEmail: SETTINGS_METADATA_PENDING,
};

export type SettingsLegalMetadataField = keyof SettingsLegalMetadata;

export interface SettingsReleaseIssue {
  field: SettingsLegalMetadataField;
  message: string;
}

export function isPendingSettingsMetadata(value: string): boolean {
  return value.trim() === "" || value === SETTINGS_METADATA_PENDING;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function isContactEmail(value: string): boolean {
  // Store contact addresses are deliberately restricted to a conventional,
  // whitespace-free mailbox. Delivery remains an operational release check.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Pure strict-release validation; no network calls and no UI dependencies. */
export function validateSettingsReleaseMetadata(metadata: SettingsLegalMetadata): SettingsReleaseIssue[] {
  const issues: SettingsReleaseIssue[] = [];

  if (isPendingSettingsMetadata(metadata.publisher)) {
    issues.push({ field: "publisher", message: "Falta identificar a la entidad editora." });
  }

  if (isPendingSettingsMetadata(metadata.privacyPolicyUrl)) {
    issues.push({ field: "privacyPolicyUrl", message: "Falta la URL de la política de privacidad." });
  } else if (!isHttpsUrl(metadata.privacyPolicyUrl)) {
    issues.push({ field: "privacyPolicyUrl", message: "La política de privacidad debe usar una URL HTTPS válida." });
  }

  if (isPendingSettingsMetadata(metadata.supportUrl)) {
    issues.push({ field: "supportUrl", message: "Falta la URL de soporte." });
  } else if (!isHttpsUrl(metadata.supportUrl)) {
    issues.push({ field: "supportUrl", message: "La página de soporte debe usar una URL HTTPS válida." });
  }

  if (isPendingSettingsMetadata(metadata.supportEmail)) {
    issues.push({ field: "supportEmail", message: "Falta el correo de contacto de soporte." });
  } else if (!isContactEmail(metadata.supportEmail)) {
    issues.push({ field: "supportEmail", message: "El correo de contacto de soporte no es válido." });
  }

  return issues;
}

export function isSettingsReleaseReady(metadata: SettingsLegalMetadata): boolean {
  return validateSettingsReleaseMetadata(metadata).length === 0;
}

