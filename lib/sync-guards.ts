/**
 * Comprobaciones de plausibilidad para la sincronización con el wiki.
 *
 * Viven aquí, y no en scripts/sync-manualsamur.ts, porque ese módulo ejecuta
 * `main()` al importarlo: nada de lo que contiene se puede cubrir con tests.
 */

/**
 * Proporción máxima del corpus local que un solo sync puede declarar eliminada
 * antes de considerarlo un fallo de descubrimiento en lugar de un borrado real.
 *
 * El wiki publica ~234 procedimientos y las bajas llegan de una en una, así que un
 * 20% (unas 46 bajas a la vez) es holgado para cambios legítimos y muy inferior al
 * 100% que produce un descubrimiento roto.
 */
export const MAX_DELETION_RATIO = 0.2;

/**
 * ¿Puede este sync declarar de baja el procedimiento si deja de aparecer?
 *
 * Solo si viene del wiki y se llegó a sincronizar de él (contentHash no vacío).
 * El descubrimiento recorre únicamente el wiki, así que un procedimiento
 * importado de otra fuente falta de sus resultados por definición, no por haber
 * sido retirado.
 *
 * En la primera ejecución real esto separaba 2 bajas verdaderas (ambas 404 en
 * origen) de 9 falsos positivos: 7 importaciones de samurpc.net y 2 fichas con
 * source truncado que nunca se sincronizaron.
 */
export function isDeletionCandidate(source: string, contentHash: string, wikiHost: string): boolean {
  return source.includes(wikiHost) && contentHash.trim().length > 0;
}

export class DiscoveryImplausibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryImplausibleError";
  }
}

export interface DiscoveryPlausibility {
  ok: boolean;
  reason?: string;
}

/**
 * Decide si el resultado de un descubrimiento es creíble.
 *
 * Falla cuando no se descubre nada habiendo corpus local (síntoma clásico de que
 * `parseProcedureSpacesXml` ha devuelto [] ante XML inesperado, una página de
 * mantenimiento o un login), o cuando la proporción de desaparecidos supera
 * MAX_DELETION_RATIO.
 */
export function checkDiscoveryPlausibility(
  discoveredCount: number,
  existingCount: number,
  missingCount: number,
  maxRatio = MAX_DELETION_RATIO,
): DiscoveryPlausibility {
  // Primer sync (o corpus local vacío): no hay nada que proteger.
  if (existingCount === 0) return { ok: true };

  if (discoveredCount === 0) {
    return {
      ok: false,
      reason: `El descubrimiento no devolvió ningún procedimiento pero hay ${existingCount} en local. `
        + "Probablemente el wiki esté caído, haya cambiado de estructura o haya respondido con una página de mantenimiento.",
    };
  }

  const ratio = missingCount / existingCount;
  if (ratio > maxRatio) {
    return {
      ok: false,
      reason: `El sync marcaría ${missingCount} de ${existingCount} procedimientos como eliminados `
        + `(${(ratio * 100).toFixed(1)}%, por encima del ${(maxRatio * 100).toFixed(0)}% permitido). `
        + `Solo se descubrieron ${discoveredCount}.`,
    };
  }

  return { ok: true };
}

/** Variante que lanza, para cortar el sync antes de escribir eventos "eliminado". */
export function assertDiscoveryIsPlausible(
  discoveredCount: number,
  existingCount: number,
  missingCount: number,
  maxRatio = MAX_DELETION_RATIO,
): void {
  const result = checkDiscoveryPlausibility(discoveredCount, existingCount, missingCount, maxRatio);
  if (!result.ok) {
    throw new DiscoveryImplausibleError(
      `${result.reason} Se aborta para no corromper el changelog. `
      + "Si el borrado masivo es real, vuelve a lanzarlo con --ids= para los procedimientos concretos.",
    );
  }
}
