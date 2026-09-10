import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, type AppStateStatus } from "react-native";
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
import {
  CONTENT_CHECK_STORAGE_KEY,
  automaticRefreshAllowed,
  AUTOMATIC_REFRESH_COOLDOWN_MS,
  contentCheckRecordFor,
  parseContentCheckRecord,
  serializeContentCheckRecord,
  userFacingContentCheckError,
  shouldRefreshOnResume,
  type ContentCheckRecord,
} from "./content-update-logic";
import { checkAndStageContent, ContentUpdateRuntimeError } from "./content-update-runtime";
import { resolveProcedureReference } from "./procedure-logic";
import {
  ContentUpdateCancelledError,
  contentFreshness,
  discardStagedPackage,
  migrateLegacySnapshot,
  readTransaction,
  resumeStagedPackage,
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
  const [lastCheck, setLastCheck] = useState<ContentCheckRecord>();
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({});
  const [stagedPackage, setStagedPackage] = useState<StagedPackage>();
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const refreshController = useRef<AbortController | null>(null);
  const refreshTask = useRef<Promise<void> | null>(null);
  const automaticRefreshStarted = useRef(false);
  const lastAutomaticRefreshAt = useRef<number | undefined>(undefined);
  const previousAppState = useRef<AppStateStatus>(AppState.currentState);
  const recoveredPackageNeedsActivation = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedFavorites, storedRecents, storedQueries, storedCheck, transaction] = await Promise.all([
        AsyncStorage.getItem(FAVORITES_STORAGE_KEY),
        AsyncStorage.getItem(RECENTS_STORAGE_KEY),
        AsyncStorage.getItem(RECENT_QUERIES_STORAGE_KEY),
        AsyncStorage.getItem(CONTENT_CHECK_STORAGE_KEY),
        readContentBoot(AsyncStorage, bundledSnapshot as unknown as MobileSnapshot),
      ]);
      if (cancelled) return;
      const transactionResult = transaction.transaction;
      setRecentQueries(parseRecentQueries(storedQueries));
      setLastCheck(parseContentCheckRecord(storedCheck));
      if (transactionResult.snapshot) setSnapshot(transaction.snapshot);
      if (transactionResult.staged) {
        setStagedPackage(transactionResult.staged);
        setSyncProgress({ downloadedBytes: transactionResult.staged.downloadedBytes, totalBytes: transactionResult.staged.totalBytes });
        setSyncState(transactionResult.stagedSnapshot ? "activating" : "failure");
        recoveredPackageNeedsActivation.current = Boolean(transactionResult.stagedSnapshot);
      } else if (transactionResult.warning) {
        setLastError(transactionResult.warning);
        setSyncState("stale");
      } else if (parseContentCheckRecord(storedCheck)?.outcome === "up-to-date") {
        setSyncState("success");
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

  const persistCheck = useCallback((record: ContentCheckRecord) => {
    setLastCheck(record);
    void AsyncStorage.setItem(CONTENT_CHECK_STORAGE_KEY, serializeContentCheckRecord(record));
  }, []);

  const refresh = useCallback((options: { background?: boolean } = {}) => {
    if (refreshTask.current) return refreshTask.current;
    const background = options.background === true;
    const task = (async () => {
      const controller = new AbortController();
      refreshController.current = controller;
      setIsRefreshing(true);
      if (background) lastAutomaticRefreshAt.current = Date.now();
      setIsBackgroundRefreshing(background);
      setLastError(undefined);
      setSyncState("checking");
      setSyncProgress({});
      try {
        const result = await checkAndStageContent({
          contentUrl: endpoint("contentEndpoint"),
          metadataUrl: endpoint("metadataEndpoint"),
          activeSnapshot: snapshot,
          storage: AsyncStorage,
          validate: validateSnapshotOnce,
          signal: controller.signal,
          onPhase: (phase) => setSyncState(phase),
          onProgress: (progress) => setSyncProgress(progress),
        });
        persistCheck(result.record);
        setLastError(undefined);
        if (result.kind === "up-to-date") {
          setSyncProgress({});
          setSyncState("success");
        } else if (result.staged) {
          setStagedPackage(result.staged);
          setSyncProgress({ downloadedBytes: result.staged.downloadedBytes, totalBytes: result.staged.totalBytes });
          setSyncState("activating");
          const activated = await resumeStagedPackage(AsyncStorage, validateSnapshotOnce);
          if (!activated) throw new Error("No hay ningún paquete pendiente de activar");
          setSnapshot(activated.snapshot);
          setStagedPackage(undefined);
          persistCheck({
            checkedAt: new Date().toISOString(),
            outcome: "up-to-date",
            remoteIdentity: activated.snapshot.packageHash,
            remoteGeneratedAt: activated.snapshot.generatedAt,
          });
          setSyncProgress({});
          setSyncState("success");
        }
      } catch (error) {
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
          const outcome = error instanceof ContentUpdateRuntimeError ? error.outcome : "failure";
          const record = error instanceof ContentUpdateRuntimeError
            ? error.record
            : contentCheckRecordFor(outcome, new Date().toISOString());
          persistCheck(record);
          setLastError(error instanceof ContentUpdateRuntimeError ? userFacingContentCheckError(error.outcome) : "No se pudo comprobar el contenido; se mantiene el último paquete local.");
          setSyncState(outcome === "offline" ? "offline" : "failure");
        }
      } finally {
        setIsRefreshing(false);
        setIsBackgroundRefreshing(false);
        if (refreshController.current === controller) refreshController.current = null;
      }
    })();
    refreshTask.current = task;
    void task.then(
      () => { if (refreshTask.current === task) refreshTask.current = null; },
      () => { if (refreshTask.current === task) refreshTask.current = null; },
    );
    return task;
  }, [persistCheck, snapshot]);

  useEffect(() => {
    if (!isHydrated || automaticRefreshStarted.current || stagedPackage) return;
    automaticRefreshStarted.current = true;
    scheduleAfterFirstFrame(() => {
      if (!automaticRefreshAllowed(lastAutomaticRefreshAt.current)) return;
      void refresh({ background: true });
    });
  }, [isHydrated, refresh, stagedPackage]);

  useEffect(() => {
    if (!isHydrated) return;
    const onAppStateChange = (status: AppStateStatus) => {
      const previous = previousAppState.current;
      previousAppState.current = status;
      const now = Date.now();
      if (stagedPackage || refreshTask.current || !shouldRefreshOnResume(previous, status, lastAutomaticRefreshAt.current, now, AUTOMATIC_REFRESH_COOLDOWN_MS)) return;
      lastAutomaticRefreshAt.current = now;
      void refresh({ background: true });
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [isHydrated, refresh, stagedPackage]);

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
      persistCheck({
        checkedAt: new Date().toISOString(),
        outcome: "up-to-date",
        remoteIdentity: result.snapshot.packageHash,
        remoteGeneratedAt: result.snapshot.generatedAt,
      });
      setSyncState("success");
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "No se pudo recuperar el paquete pendiente");
      setSyncState("failure");
    } finally {
      setIsRefreshing(false);
    }
  }, [persistCheck]);

  const discardStaged = useCallback(async () => {
    await discardStagedPackage(AsyncStorage);
    setStagedPackage(undefined);
    setSyncProgress({});
    setSyncState("stale");
  }, []);

  useEffect(() => {
    if (!isHydrated || !stagedPackage || !recoveredPackageNeedsActivation.current) return;
    recoveredPackageNeedsActivation.current = false;
    scheduleAfterFirstFrame(() => { void activateStagedUpdate(); });
  }, [activateStagedUpdate, isHydrated, stagedPackage]);

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
    lastCheck,
    isBackgroundRefreshing,
    syncState,
    syncProgress,
    stagedPackage,
    refresh,
    cancelRefresh,
    activateStagedUpdate,
    discardStaged,
  }), [activateStagedUpdate, cancelRefresh, discardStaged, isBackgroundRefreshing, isHydrated, isRefreshing, lastCheck, lastError, refresh, stagedPackage, syncProgress, syncState]);

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
