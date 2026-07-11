import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import bundledSnapshot from "@/assets/data/content-snapshot.json";
import { fetchContentUpdate, isContentSnapshot, readCachedSnapshot, replaceCachedSnapshot } from "@/lib/content-cache";
import type { ContentSnapshot } from "@/lib/types";

type ContentState = {
  snapshot: ContentSnapshot;
  source: "bundled" | "cached";
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const bundled = bundledSnapshot as ContentSnapshot;
if (!isContentSnapshot(bundled)) throw new Error("La instantánea incluida no es válida.");

const ContentContext = createContext<ContentState | null>(null);
const BASE_URL = (process.env.EXPO_PUBLIC_CONTENT_BASE_URL ?? "https://manualsamur.es").replace(/\/$/, "");

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(bundled);
  const [source, setSource] = useState<ContentState["source"]>("bundled");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const update = await fetchContentUpdate(BASE_URL, snapshot.hash);
      if (update) {
        await replaceCachedSnapshot(update);
        setSnapshot(update);
        setSource("cached");
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el contenido.");
    } finally {
      setRefreshing(false);
    }
  }, [snapshot.hash]);

  useEffect(() => {
    void (async () => {
      const cached = await readCachedSnapshot();
      if (cached) {
        setSnapshot(cached);
        setSource("cached");
      }
      void refresh();
    })();
  }, [refresh]);

  const value = useMemo(() => ({ snapshot, source, refreshing, error, refresh }), [snapshot, source, refreshing, error, refresh]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentState {
  const value = useContext(ContentContext);
  if (!value) throw new Error("useContent debe utilizarse dentro de ContentProvider.");
  return value;
}
