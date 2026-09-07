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

/**
 * Quién mantiene esto, tal y como lo dice la web.
 *
 * Las mismas palabras que `components/shared/AppMenu.tsx`: si la app y el sitio se
 * presentan distinto, uno de los dos está desactualizado y no hay forma de saber cuál.
 */
export const ABOUT_AUTHOR = {
  name: "Miguel Rosa (Vol. 15970)",
  blurb: "Todo feedback es bienvenido: envía bugs o sugerencias al correo de contacto.",
  githubUrl: "https://github.com/miguelrzazo",
} as const;

/** El aviso de uso, literal de la web. */
export const ADAPTATION_DISCLAIMER =
  "Esta es una adaptación NO oficial del Manual de Procedimientos de SAMUR-Protección Civil de la ciudad de Madrid, con el fin de hacer una lectura más cómoda, especialmente para dispositivos móviles. Todo el contenido clínico pertenece a SAMUR-PC, sus autores y al Ayuntamiento de Madrid.";

export const PENDING_SETTINGS_LEGAL_METADATA: Readonly<SettingsLegalMetadata> = {
  publisher: SETTINGS_METADATA_PENDING,
  privacyPolicyUrl: SETTINGS_METADATA_PENDING,
  supportUrl: SETTINGS_METADATA_PENDING,
  supportEmail: SETTINGS_METADATA_PENDING,
};

export const SETTINGS_LEGAL_METADATA: Readonly<SettingsLegalMetadata> = {
  publisher: "Miguel Rosa Zazo",
  privacyPolicyUrl: "https://manual-proced-spc.vercel.app/privacidad",
  supportUrl: "https://manual-proced-spc.vercel.app/soporte",
  // El mismo buzón que la web publica en "Sobre mí". Estaba vacío, y `isPendingSettingsMetadata`
  // trata la cadena vacía como pendiente, así que la app se declaraba sin contacto
  // mientras el sitio sí lo daba.
  supportEmail: "feedback_manual_proc.duchess916@passinbox.com",
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

  if (metadata.supportEmail === SETTINGS_METADATA_PENDING) {
    issues.push({ field: "supportEmail", message: "Falta el correo de contacto de soporte." });
  } else if (metadata.supportEmail && !isContactEmail(metadata.supportEmail)) {
    issues.push({ field: "supportEmail", message: "El correo de contacto de soporte no es válido." });
  }

  return issues;
}

export function isSettingsReleaseReady(metadata: SettingsLegalMetadata): boolean {
  return validateSettingsReleaseMetadata(metadata).length === 0;
}
