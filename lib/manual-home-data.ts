import { getProcedureNavMeta } from "./content.ts";
import { readManualHistoryDataset, readManualSyncMetadata, readManualUpdatesDataset } from "./manual-sync.ts";
import type { ManualHomeData, UpdatePillEvent } from "./manual-updates-logic.ts";

/**
 * Lo que /manual necesita para el banner rojo y el botón de historial.
 *
 * Lo usan la página estática y public/manual-home.json. La portada publicada
 * (PublicationShell) sustituye a la página estática y no recibe sus props, así que
 * descarga este fichero: sin él, el banner y el historial desaparecían en la web.
 */
export function buildManualHomeData(): ManualHomeData {
  const syncMetadata = readManualSyncMetadata();
  const updatesDataset = readManualUpdatesDataset();
  const historyCount = readManualHistoryDataset().entries.length;

  // Los IDs que el banner considera "pendientes de ver" son los de sus propios
  // elementos. Antes se filtraba por isRecent, que ahora se calcula en cliente
  // (en servidor quedaba congelado en tiempo de build), así que aquí siempre saldría
  // vacío y el banner nunca podría descartarse al haberlo visto.
  const tickerEventIds = syncMetadata.ticker.items
    .map((item) => item.eventId)
    .filter((id): id is string => Boolean(id));

  // Solo lo mínimo para decidir la píldora "N nuevos" en cliente. Los eventos
  // completos —con sus diffs— pesaban ~2,5 MB en el HTML de esta página; ahora
  // viven en public/manual-updates.json y se descargan al abrir el diálogo.
  const pillEvents: UpdatePillEvent[] = updatesDataset.events
    .filter((event) => event.approvedAt && event.changeKind !== "revisado")
    .map((event) => ({
      eventId: event.eventId,
      approvedAt: event.approvedAt!,
      changeKind: event.changeKind,
    }));

  // Resolve ticker hrefs to direct procedure pages using the slug map
  const idToSlug = new Map(getProcedureNavMeta().map((p) => [p.id, p.slug]));
  return {
    syncMetadata: {
      manualVersionCurrent: syncMetadata.manualVersionCurrent,
      lastSyncAt: syncMetadata.lastSyncAt,
      tickerEnabled: syncMetadata.tickerEnabled,
      ticker: {
        ...syncMetadata.ticker,
        items: syncMetadata.ticker.items.map((item) => ({
          ...item,
          href: item.procedureId && idToSlug.has(item.procedureId)
            ? `/manual/${idToSlug.get(item.procedureId)}`
            : item.href,
        })),
      },
    },
    pillEvents,
    historyCount,
    tickerEventIds,
  };
}
