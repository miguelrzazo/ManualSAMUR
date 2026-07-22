"use client";

import { ContentDiff } from "@/components/manual/ContentDiff";
import { parseLocalDate } from "@/lib/manual-updates-logic";
import { useNow } from "@/lib/hooks/use-now";

const DEFAULT_WINDOW_DAYS = 30;

interface Props {
  changeKind: "nuevo" | "revisado" | "actualizado" | "eliminado" | "sync";
  /** Fecha efectiva del cambio, "YYYY-MM-DD". */
  changedAt: string;
  summary: string;
  diff?: string;
  windowDays?: number;
}

/**
 * Muestra el aviso de "actualizado recientemente" solo si el cambio entra en la
 * ventana, medida contra el reloj del usuario.
 *
 * Antes esto se resolvía en el componente servidor con `Date.now()` y un
 * `eslint-disable react-hooks/purity`. Con output: "export" eso significaba
 * congelar el corte en tiempo de build, así que el aviso seguía apareciendo unos
 * 30 días más de la cuenta según lo vieja que fuera la publicación.
 *
 * Arranca oculto para que el HTML servido y la primera pasada de hidratación
 * coincidan; se decide ya montado.
 */
export function RecentUpdateBadge({ changeKind, changedAt, summary, diff, windowDays = DEFAULT_WINDOW_DAYS }: Props) {
  const now = useNow();

  const changed = parseLocalDate(changedAt).getTime();
  const ageMs = now === null ? null : now - changed;
  const visible = ageMs !== null
    && !Number.isNaN(changed)
    && ageMs >= 0
    && ageMs <= windowDays * 24 * 60 * 60 * 1000;

  if (!visible) return null;

  return <ContentDiff changeKind={changeKind} changedAt={changedAt} summary={summary} diff={diff} />;
}
