"use client";

import { useEffect } from "react";
import {
  pushRecentId,
  readCollectionCookie,
  RECENT_COOKIE,
  writeCollectionCookie,
} from "@/lib/manual-cookies";

interface Props {
  procedureId: string;
  validIds: string[];
}

export function ProcedureVisitTracker({ procedureId, validIds }: Props) {
  useEffect(() => {
    const current = readCollectionCookie(RECENT_COOKIE, new Set(validIds));
    const next = pushRecentId(current, procedureId);
    writeCollectionCookie(RECENT_COOKIE, next);
  }, [procedureId, validIds]);

  return null;
}
