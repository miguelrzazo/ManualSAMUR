"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FAVORITES_COOKIE,
  readCollectionCookie,
  toggleFavoriteId,
  writeCollectionCookie,
} from "@/lib/manual-cookies";

interface Props {
  procedureId: string;
  validIds?: string[];
  className?: string;
  onToggle?: (isFavorite: boolean) => void;
}

export function FavoriteButton({ procedureId, validIds, className, onToggle }: Props) {
  const validIdSet = useMemo(() => new Set(validIds ?? [procedureId]), [procedureId, validIds]);
  const [isFavorite, setIsFavorite] = useState(() =>
    readCollectionCookie(FAVORITES_COOKIE, validIdSet).includes(procedureId),
  );

  function handleToggle() {
    const current = readCollectionCookie(FAVORITES_COOKIE, validIdSet);
    const next = toggleFavoriteId(current, procedureId);
    writeCollectionCookie(FAVORITES_COOKIE, next);
    const nextValue = next.includes(procedureId);
    setIsFavorite(nextValue);
    onToggle?.(nextValue);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border/60 bg-background px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted",
        isFavorite && "border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        className,
      )}
      aria-label={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
      title={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
    >
      <Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
    </button>
  );
}
