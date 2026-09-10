import {
  asManualUpdateEvents,
  isUserFacingUpdate,
  sortManualHistorial,
  type ManualUpdateEvent,
} from "./manual-tree-logic.ts";
import { readableChangeKindLabel } from "../../../packages/manual-content/src/content-diff.ts";

export const PROCEDURE_HISTORY_TITLE = "Cambios de este procedimiento";
export const PROCEDURE_HISTORY_EMPTY_MESSAGE = "Sin cambios registrados";

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
  selector: string | ((event: ManualUpdateEvent) => boolean),
): ManualUpdateEvent[] {
  const predicate = typeof selector === "function"
    ? selector
    : (event: ManualUpdateEvent) => event.procedureIds.includes(selector);
  if (typeof selector === "string" && !selector) return [];
  return sortManualHistorial(
    asManualUpdateEvents(updates).filter((event) => isUserFacingUpdate(event) && predicate(event)),
  );
}

export function procedureHistoryChangeLabel(changeKind: string): string {
  return readableChangeKindLabel(changeKind);
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
  selector: string | ((event: ManualUpdateEvent) => boolean),
): ProcedureHistoryModel {
  return {
    title: PROCEDURE_HISTORY_TITLE,
    emptyMessage: PROCEDURE_HISTORY_EMPTY_MESSAGE,
    items: selectProcedureHistory(updates, selector).map((event) => ({
      event,
      date: procedureHistoryDate(event),
      changeLabel: procedureHistoryChangeLabel(event.changeKind),
      diff: procedureHistoryDiff(event),
    })),
  };
}
