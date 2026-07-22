/**
 * Lógica pura de "novedades", sin dependencias de Node.
 *
 * Vive fuera de lib/manual-sync.ts a propósito: ese módulo importa node:fs,
 * node:crypto y node:path, así que no puede entrar en un componente cliente. Y
 * estas decisiones *tienen* que evaluarse en cliente: el sitio se publica como
 * export estático (output: "export"), de modo que cualquier comparación de fechas
 * hecha en servidor se congela en tiempo de build y no vuelve a caducar.
 */

import type { ManualTickerState, ManualUpdateChangeKind } from "./manual-sync.ts";

/**
 * Lo único de manual-sync.json que la interfaz necesita.
 *
 * ManualSyncMetadata completo se serializaba entero en /manual: `runs` ocupa
 * 1,07 MB y `approvedChanges` otros 193 KB, ninguno de los dos se lee en cliente.
 * Son bitácora de sincronización, no datos de interfaz.
 */
export interface ManualSyncClientMetadata {
  manualVersionCurrent: string;
  lastSyncAt: string;
  ticker: ManualTickerState;
  tickerEnabled: boolean;
}

export const RECENT_WINDOW_DAYS = 30;
export const RECENT_WINDOW_MS = RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Lo mínimo que /manual necesita servir para decidir la píldora "N nuevos".
 *
 * Los eventos completos (630, con ~663 KB de diffs) ya no viajan en el HTML: se
 * descargan de public/manual-updates.json al abrir el diálogo.
 */
export interface UpdatePillEvent {
  eventId: string;
  approvedAt: string;
  changeKind: ManualUpdateChangeKind;
  isRecent?: boolean;
}

/** Forma mínima que necesita applyRecencyWindow; ManualUpdateEvent la cumple. */
export interface RecencyCandidate {
  approvedAt?: string;
  isRecent?: boolean;
}

/**
 * Marca los eventos aprobados dentro de la ventana de 7 días respecto a
 * `referenceNow`. El genérico conserva el tipo concreto que entra y garantiza
 * que `isRecent` sale ya resuelto.
 */
export function applyRecencyWindow<T extends RecencyCandidate>(
  events: T[],
  referenceNow = new Date(),
): Array<T & { isRecent: boolean }> {
  return events.map((event) => {
    if (!event.approvedAt) return { ...event, isRecent: false };
    const approved = new Date(event.approvedAt).getTime();
    if (Number.isNaN(approved)) return { ...event, isRecent: false };
    const diff = referenceNow.getTime() - approved;
    return {
      ...event,
      isRecent: diff >= 0 && diff <= RECENT_WINDOW_MS,
    };
  });
}

/** ¿Sigue vigente el banner? Se evalúa en cliente para que caduque de verdad. */
export function isTickerWithinWindow(enabledUntil: string, referenceNow = new Date()): boolean {
  if (!enabledUntil) return true;
  const deadline = new Date(enabledUntil).getTime();
  if (Number.isNaN(deadline)) return true;
  return deadline > referenceNow.getTime();
}

/**
 * Parsea "YYYY-MM-DD" como fecha *local*, no UTC.
 *
 * `new Date("2026-06-04")` se interpreta como medianoche UTC y luego se renderiza
 * en la zona del usuario, así que con desfase negativo se veía el día anterior.
 * Además provocaba desajustes de hidratación entre el runner UTC y el navegador.
 */
export function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
