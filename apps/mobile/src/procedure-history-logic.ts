import {
  asManualUpdateEvents,
  sortManualHistorial,
  type ManualUpdateEvent,
} from "./manual-tree-logic.ts";

export const PROCEDURE_HISTORY_TITLE = "Historial de este procedimiento";
export const PROCEDURE_HISTORY_EMPTY_MESSAGE = "Sin cambios registrados";

const CHANGE_KIND_LABELS: Readonly<Record<string, string>> = {
  nuevo: "Nuevo",
  actualizado: "Actualizado",
  revisado: "Revisado",
  eliminado: "Eliminado",
  sync: "Sincronizado",
};

export interface ProcedureHistoryItem {
  event: ManualUpdateEvent;
  date: string;
  changeLabel: string;
  diff?: string;
}

export interface ProcedureHistoryModel {
  title: typeof PROCEDURE_HISTORY_TITLE;
  emptyMessage: typeof PROCEDURE_HISTORY_EMPTY_MESSAGE;
  items: ProcedureHistoryItem[];
}

/**
 * Selects the global update events that explicitly name this procedure.
 * Parsing is deliberately repeated here even for typed callers: downloaded
 * content is still untrusted at runtime, regardless of its compile-time type.
 */
export function selectProcedureHistory(
  updates: unknown | readonly ManualUpdateEvent[],
  procedureId: string,
): ManualUpdateEvent[] {
  if (!procedureId) return [];
  return sortManualHistorial(
    asManualUpdateEvents(updates).filter((event) => event.procedureIds.includes(procedureId)),
  );
}

export function procedureHistoryChangeLabel(changeKind: string): string {
  const normalized = changeKind.trim().toLocaleLowerCase("es");
  const known = CHANGE_KIND_LABELS[normalized];
  if (known) return known;
  if (!normalized) return "Cambio";
  return normalized.charAt(0).toLocaleUpperCase("es") + normalized.slice(1);
}

export function procedureHistoryDate(event: ManualUpdateEvent): string {
  const value = event.approvedAt ?? event.effectiveDate;
  return value.slice(0, 10) || "Fecha no disponible";
}

export function procedureHistoryDiff(event: ManualUpdateEvent): string | undefined {
  const diff = event.diff?.trim();
  return diff || undefined;
}

export function buildProcedureHistoryModel(
  updates: unknown | readonly ManualUpdateEvent[],
  procedureId: string,
): ProcedureHistoryModel {
  return {
    title: PROCEDURE_HISTORY_TITLE,
    emptyMessage: PROCEDURE_HISTORY_EMPTY_MESSAGE,
    items: selectProcedureHistory(updates, procedureId).map((event) => ({
      event,
      date: procedureHistoryDate(event),
      changeLabel: procedureHistoryChangeLabel(event.changeKind),
      diff: procedureHistoryDiff(event),
    })),
  };
}
