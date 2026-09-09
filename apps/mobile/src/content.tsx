import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import bundledSnapshot from "./data/snapshot.json";
import {
  type MobileContent,
  type MobileProcedure,
  type MobileSnapshot,
} from "../../../packages/manual-content/src/index.ts";
import {
  ContentDataContext,
  ContentPreferencesContext,
  ContentSyncContext,
  type ContentDataContextValue,
  type ContentPreferencesContextValue,
  type ContentSyncContextValue,
  type SyncProgress,
  type SyncState,
} from "./content-context";
import { readContentBoot, scheduleAfterFirstFrame, validateBootSnapshot, validateSnapshotOnce } from "./content-boot";
import { resolveProcedureReference } from "./procedure-logic";
import {
  ContentUpdateCancelledError,
  contentFreshness,
  discardStagedPackage,
  migrateLegacySnapshot,
  readTransaction,
  resumeStagedPackage,
  stagePackage,
  throwIfCancelled,
  type StagedPackage,
} from "./content-transaction";
import {
  FAVORITES_STORAGE_KEY,
  RECENTS_STORAGE_KEY,
  parseSavedRouteKeys,
  parseRecentQueries,
  pushRecentQuery,
  pushRecentRouteKey,
  RECENT_QUERIES_STORAGE_KEY,
  removeRecentQuery,
  serializeSavedRouteKeys,
  toggleSavedRouteKey,
} from "./saved-logic";

export type ContentContextValue = ContentDataContextValue & ContentPreferencesContextValue & ContentSyncContextValue;
export type { SyncProgress, SyncState } from "./content-context";

function endpoint(name: "contentEndpoint" | "metadataEndpoint"): string {
  const envName = name === "contentEndpoint" ? "EXPO_PUBLIC_CONTENT_ENDPOINT" : "EXPO_PUBLIC_METADATA_ENDPOINT";
  if (typeof process.env[envName] === "string") return process.env[envName];
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return typeof extra?.[name] === "string" ? extra[name] as string : "";
}

interface PublishedContentMetadata {
  schema: string;
  version: number;
  hash: string;
  packageHash?: string;
  generatedAt: string;
}

function isPublishedContentMetadata(value: unknown): value is PublishedContentMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<PublishedContentMetadata>;
  return typeof metadata.schema === "string"
    && typeof metadata.version === "number"
    && typeof metadata.hash === "string"
    && (metadata.packageHash === undefined || typeof metadata.packageHash === "string")
    && typeof metadata.generatedAt === "string";
}

/**
 * Compatibility aggregate for existing screens. New consumers should choose
 * useContentData, useContentPreferences, or useContentSync instead.
 */
export function useContent(): ContentContextValue {
  const data = useContext(ContentDataContext);
  const preferences = useContext(ContentPreferencesContext);
  const sync = useContext(ContentSyncContext);
  if (!data || !preferences || !sync) throw new Error("useContent must be used inside ContentProvider");
  return useMemo(() => ({ ...data, ...preferences, ...sync }), [data, preferences, sync]);
}

export {
  selectContent,
  selectFavorites,
  selectRecentQueries,
  selectRecents,
  selectSnapshot,
  selectSyncState,
  useContentData,
  useContentPreferences,
  useContentSync,
} from "./content-context";

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MobileSnapshot>(bundledSnapshot as unknown as MobileSnapshot);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string>();
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({});
  const [stagedPackage, setStagedPackage] = useState<StagedPackage>();
  const refreshController = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedFavorites, storedRecents, storedQueries, transaction] = await Promise.all([
        AsyncStorage.getItem(FAVORITES_STORAGE_KEY),
        AsyncStorage.getItem(RECENTS_STORAGE_KEY),
        AsyncStorage.getItem(RECENT_QUERIES_STORAGE_KEY),
        readContentBoot(AsyncStorage, bundledSnapshot as unknown as MobileSnapshot),
      ]);
      if (cancelled) return;
      const transactionResult = transaction.transaction;
      setRecentQueries(parseRecentQueries(storedQueries));
      if (transactionResult.snapshot) setSnapshot(transaction.snapshot);
      if (transactionResult.staged) {
        setStagedPackage(transactionResult.staged);
        setSyncProgress({ downloadedBytes: transactionResult.staged.downloadedBytes, totalBytes: transactionResult.staged.totalBytes });
        setSyncState(transactionResult.stagedSnapshot ? "recovery" : "failure");
      } else if (transactionResult.warning) {
        setLastError(transactionResult.warning);
        setSyncState("stale");
      } else if (contentFreshness(transactionResult.snapshot?.generatedAt ?? (bundledSnapshot as unknown as MobileSnapshot).generatedAt) !== "fresh") {
        setSyncState("stale");
      }
      if (storedFavorites) {
        const migratedFavorites = parseSavedRouteKeys(storedFavorites);
        setFavorites(migratedFavorites);
        const normalized = serializeSavedRouteKeys(migratedFavorites);
        if (normalized !== storedFavorites) void AsyncStorage.setItem(FAVORITES_STORAGE_KEY, normalized);
      }
      if (storedRecents) {
        const migratedRecents = parseSavedRouteKeys(storedRecents);
        setRecents(migratedRecents);
        const normalized = serializeSavedRouteKeys(migratedRecents);
        if (normalized !== storedRecents) void AsyncStorage.setItem(RECENTS_STORAGE_KEY, normalized);
      }
      setIsHydrated(true);
      scheduleAfterFirstFrame(() => {
        if (transactionResult.snapshot) {
          void validateBootSnapshot(transactionResult.snapshot, bundledSnapshot as unknown as MobileSnapshot)
            .then((verifiedSnapshot) => {
              if (!cancelled && verifiedSnapshot !== transactionResult.snapshot) {
                setSnapshot(verifiedSnapshot);
                setLastError("El contenido activo no supera la validación; se mantiene el paquete local.");
                setSyncState("stale");
              }
            })
            .catch(() => undefined);
        } else {
          void migrateLegacySnapshot(AsyncStorage, validateSnapshotOnce)
            .then((migrated) => { if (!cancelled && migrated) setSnapshot(migrated); })
            .catch(() => undefined);
        }
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleFavorite = useCallback((routeKey: string) => {
    setFavorites((current) => {
      const next = toggleSavedRouteKey(current, routeKey);
      void AsyncStorage.setItem(FAVORITES_STORAGE_KEY, serializeSavedRouteKeys(next));
      return next;
    });
  }, []);

  const remember = useCallback((routeKey: string) => {
    setRecents((current) => {
      const next = pushRecentRouteKey(current, routeKey);
      void AsyncStorage.setItem(RECENTS_STORAGE_KEY, serializeSavedRouteKeys(next));
      return next;
    });
  }, []);

  const rememberQuery = useCallback((query: string) => {
    setRecentQueries((current) => {
      const next = pushRecentQuery(current, query);
      void AsyncStorage.setItem(RECENT_QUERIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const forgetQuery = useCallback((query: string) => {
    setRecentQueries((current) => {
      const next = removeRecentQuery(current, query);
      void AsyncStorage.setItem(RECENT_QUERIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeRecent = useCallback((routeKey: string) => {
    setRecents((current) => {
      const next = current.filter((item) => item !== routeKey);
      void AsyncStorage.setItem(RECENTS_STORAGE_KEY, serializeSavedRouteKeys(next));
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const url = endpoint("contentEndpoint");
    if (!url) {
      setLastError("No hay conexión de actualización configurada; se mantiene el paquete local.");
      setSyncState("offline");
      return;
    }
    setIsRefreshing(true);
    setLastError(undefined);
    setSyncState("checking");
    setSyncProgress({});
    const controller = new AbortController();
    refreshController.current = controller;
    let responseReceived = false;
    try {
      const metadataUrl = endpoint("metadataEndpoint");
      if (metadataUrl) {
        const metadataResponse = await fetch(metadataUrl, { headers: { Accept: "application/json" }, signal: controller.signal });
        responseReceived = true;
        if (!metadataResponse.ok) throw new Error(`HTTP ${metadataResponse.status}`);
        const metadata: unknown = await metadataResponse.json();
        if (!isPublishedContentMetadata(metadata)) throw new Error("La metadata publicada no es válida");
        if (metadata.packageHash && metadata.packageHash === snapshot.packageHash) {
          setSyncState("success");
          setSyncProgress({});
          return;
        }
      }

      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      responseReceived = true;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSyncState("downloading");
      const totalBytes = Number(response.headers.get("content-length") ?? "");
      const candidate: unknown = await response.json();
      setSyncState("validating");
      throwIfCancelled(controller.signal);
      const staged = await stagePackage(AsyncStorage, candidate as MobileSnapshot, validateSnapshotOnce, new Date().toISOString(), Number.isFinite(totalBytes) ? { downloadedBytes: totalBytes, totalBytes } : {}, controller.signal);
      setStagedPackage(staged);
      setSyncProgress({ downloadedBytes: staged.downloadedBytes, totalBytes: staged.totalBytes });
      setSyncState("recovery");
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "No se pudo actualizar el contenido");
      if (controller.signal.aborted || error instanceof ContentUpdateCancelledError) {
        const transaction = await readTransaction(AsyncStorage, validateSnapshotOnce);
        if (transaction.staged) {
          setStagedPackage(transaction.staged);
          setSyncProgress({ downloadedBytes: transaction.staged.downloadedBytes, totalBytes: transaction.staged.totalBytes });
          setSyncState(transaction.stagedSnapshot ? "recovery" : "failure");
        } else {
          setSyncState("stale");
        }
      } else {
        setSyncState(responseReceived ? "failure" : "offline");
      }
    } finally {
      setIsRefreshing(false);
      if (refreshController.current === controller) refreshController.current = null;
    }
  }, [snapshot.packageHash]);

  const cancelRefresh = useCallback(() => {
    // Once activation starts, cancellation is disabled so the pointer write
    // cannot be interrupted between validation and commit.
    if (syncState === "activating") return;
    refreshController.current?.abort();
  }, [syncState]);

  const activateStagedUpdate = useCallback(async () => {
    setIsRefreshing(true);
    setLastError(undefined);
    setSyncState("activating");
    try {
      const result = await resumeStagedPackage(AsyncStorage, validateSnapshotOnce);
      if (!result) throw new Error("No hay ningún paquete pendiente de recuperación");
      setSnapshot(result.snapshot);
      setStagedPackage(undefined);
      setSyncState("success");
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "No se pudo recuperar el paquete pendiente");
      setSyncState("failure");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const discardStaged = useCallback(async () => {
    await discardStagedPackage(AsyncStorage);
    setStagedPackage(undefined);
    setSyncProgress({});
    setSyncState("stale");
  }, []);

  const dataValue = useMemo<ContentDataContextValue>(() => ({
    content: snapshot.content,
    snapshot,
  }), [snapshot]);

  const preferencesValue = useMemo<ContentPreferencesContextValue>(() => ({
    favorites,
    recents,
    recentQueries,
    toggleFavorite,
    remember,
    removeRecent,
    rememberQuery,
    forgetQuery,
  }), [favorites, forgetQuery, recentQueries, recents, remember, rememberQuery, removeRecent, toggleFavorite]);

  const syncValue = useMemo<ContentSyncContextValue>(() => ({
    isHydrated,
    isRefreshing,
    lastError,
    syncState,
    syncProgress,
    stagedPackage,
    refresh,
    cancelRefresh,
    activateStagedUpdate,
    discardStaged,
  }), [activateStagedUpdate, cancelRefresh, discardStaged, isHydrated, isRefreshing, lastError, refresh, stagedPackage, syncProgress, syncState]);

  return (
    <ContentDataContext.Provider value={dataValue}>
      <ContentPreferencesContext.Provider value={preferencesValue}>
        <ContentSyncContext.Provider value={syncValue}>
          {children}
        </ContentSyncContext.Provider>
      </ContentPreferencesContext.Provider>
    </ContentDataContext.Provider>
  );
}

export function findProcedure(content: MobileContent, id: string): MobileProcedure | undefined {
  return resolveProcedureReference(content.procedures, id);
}
