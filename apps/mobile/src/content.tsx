import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { manualContentOrigin } from "./content-origin";
import { AppState, Platform, type AppStateStatus } from "react-native";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AttachmentUpdatesProvider } from "./attachment-updates";
import { OfflineDataBanner } from "./components/OfflineDataBanner";
// Only the reduced first-launch seed is bundled (see content-seed.ts). The
// full snapshot.json next to it is a build artefact for tests and release
// evidence, never imported by the app.
import bundledSeed from "./data/seed.json";
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
  automaticSyncDue,
  contentCheckRecordFor,
  mergeCheckRecord,
  parseContentCheckRecord,
  serializeContentCheckRecord,
  userFacingContentCheckError,
  type ContentCheckRecord,
} from "./content-update-logic";
import { syncContentRelease, ContentUpdateRuntimeError } from "./content-update-runtime";
import type { ReleaseInfo } from "./content-release";
import { resolveProcedureReference } from "./procedure-logic";
import {
  ContentUpdateCancelledError,
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

const seedSnapshot = bundledSeed as unknown as MobileSnapshot;

/** Cloudflare blocks generic agents; identify the app and its version. */
function contentUserAgent(): string {
  return `ManualSAMUR-${Platform.OS === "ios" ? "iOS" : "Android"}/${Constants.expoConfig?.version ?? "1.0.0"}`;
}

const nativeSha256 = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX });

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

/**
 * Owns the active content. `useContentData().snapshot` is always the single
 * active snapshot: either the bundled seed (first launch, never synced) or a
 * release downloaded from Cloudflare and verified before its pointer switch.
 */
export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MobileSnapshot>(seedSnapshot);
  const [release, setRelease] = useState<ReleaseInfo>();
  const [isSeed, setIsSeed] = useState(true);
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
  const previousAppState = useRef<AppStateStatus>(AppState.currentState);
  const recoveredPackageNeedsActivation = useRef(false);
  // Read by the AppState listener, which must not re-subscribe on every change.
  const lastCheckRef = useRef<ContentCheckRecord | undefined>(undefined);
  const isSeedRef = useRef(true);
  useEffect(() => {
    lastCheckRef.current = lastCheck;
    isSeedRef.current = isSeed;
  }, [isSeed, lastCheck]);

  const activate = useCallback((next: MobileSnapshot, nextRelease: ReleaseInfo | undefined) => {
    setSnapshot(next);
    setRelease(nextRelease);
    setIsSeed(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedFavorites, storedRecents, storedQueries, storedCheck, transaction] = await Promise.all([
        AsyncStorage.getItem(FAVORITES_STORAGE_KEY),
        AsyncStorage.getItem(RECENTS_STORAGE_KEY),
        AsyncStorage.getItem(RECENT_QUERIES_STORAGE_KEY),
        AsyncStorage.getItem(CONTENT_CHECK_STORAGE_KEY),
        readContentBoot(AsyncStorage, seedSnapshot),
      ]);
      if (cancelled) return;
      const transactionResult = transaction.transaction;
      const check = parseContentCheckRecord(storedCheck);
      setRecentQueries(parseRecentQueries(storedQueries));
      setLastCheck(check);
      lastCheckRef.current = check;
      // Any downloaded release wins over the seed, whatever their dates: the
      // seed is only ever a stand-in until the first successful sync.
      if (transactionResult.snapshot) {
        activate(transactionResult.snapshot, transactionResult.release);
        isSeedRef.current = false;
      }
      if (transactionResult.staged) {
        setStagedPackage(transactionResult.staged);
        setSyncProgress({ downloadedBytes: transactionResult.staged.downloadedBytes, totalBytes: transactionResult.staged.totalBytes });
        setSyncState(transactionResult.stagedSnapshot ? "activating" : "failure");
        recoveredPackageNeedsActivation.current = Boolean(transactionResult.stagedSnapshot);
      } else if (transactionResult.warning) {
        setLastError(transactionResult.warning);
        setSyncState("stale");
      } else if (check?.outcome === "offline") {
        setSyncState("offline");
      } else if (check?.outcome === "up-to-date" && transactionResult.snapshot) {
        setSyncState("success");
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
          void validateBootSnapshot(transactionResult.snapshot, seedSnapshot)
            .then((verifiedSnapshot) => {
              if (!cancelled && verifiedSnapshot !== transactionResult.snapshot) {
                setSnapshot(verifiedSnapshot);
                setRelease(undefined);
                setIsSeed(true);
                setLastError("El contenido activo no supera la validación; se usan los datos incluidos en la app.");
                setSyncState("stale");
              }
            })
            .catch(() => undefined);
        } else {
          void migrateLegacySnapshot(AsyncStorage, validateSnapshotOnce)
            .then((migrated) => { if (!cancelled && migrated) activate(migrated, undefined); })
            .catch(() => undefined);
        }
      });
    })();
    return () => { cancelled = true; };
  }, [activate]);

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
    const merged = mergeCheckRecord(lastCheckRef.current, record);
    lastCheckRef.current = merged;
    setLastCheck(merged);
    void AsyncStorage.setItem(CONTENT_CHECK_STORAGE_KEY, serializeContentCheckRecord(merged));
  }, []);

  const refresh = useCallback((options: { background?: boolean } = {}) => {
    if (refreshTask.current) return refreshTask.current;
    const background = options.background === true;
    const task = (async () => {
      const controller = new AbortController();
      refreshController.current = controller;
      setIsRefreshing(true);
      setIsBackgroundRefreshing(background);
      setLastError(undefined);
      setSyncState("checking");
      setSyncProgress({});
      try {
        const result = await syncContentRelease({
          origin: manualContentOrigin(),
          userAgent: contentUserAgent(),
          active: { snapshot, release, isSeed },
          storage: AsyncStorage,
          validate: validateSnapshotOnce,
          sha256: nativeSha256,
          signal: controller.signal,
          onPhase: (phase) => setSyncState(phase),
          onProgress: (progress) => setSyncProgress(progress),
        });
        if (result.kind === "updated") {
          activate(result.snapshot, result.release);
          isSeedRef.current = false;
          setStagedPackage(undefined);
        }
        persistCheck(result.record);
        setLastError(undefined);
        setSyncProgress({});
        setSyncState("success");
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
          setLastError(error instanceof ContentUpdateRuntimeError ? userFacingContentCheckError(error.outcome) : error instanceof Error && error.message.includes("EXPO_PUBLIC_MANUAL_CONTENT_ORIGIN") ? error.message : "No se pudo comprobar el contenido; se mantienen los datos guardados.");
          setSyncProgress({});
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
  }, [activate, isSeed, persistCheck, release, snapshot]);

  // Launch: check unless the persisted record says we did so recently. The
  // seed is always due, so a first launch syncs as soon as there is network.
  useEffect(() => {
    if (!isHydrated || automaticRefreshStarted.current || stagedPackage) return;
    automaticRefreshStarted.current = true;
    scheduleAfterFirstFrame(() => {
      if (!automaticSyncDue(lastCheckRef.current, isSeedRef.current)) return;
      void refresh({ background: true });
    });
  }, [isHydrated, refresh, stagedPackage]);

  // Foreground: same throttle (~6 h after a good check, sooner after a failure).
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!isHydrated) return;
    const onAppStateChange = (status: AppStateStatus) => {
      const previous = previousAppState.current;
      previousAppState.current = status;
      if (status !== "active" || previous === "active") return;
      if (stagedPackage || refreshTask.current || !automaticSyncDue(lastCheckRef.current, isSeedRef.current)) return;
      void refreshRef.current({ background: true });
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, [isHydrated, stagedPackage]);

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
      activate(result.snapshot, result.release);
      isSeedRef.current = false;
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
  }, [activate, persistCheck]);

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
    release,
    isSeed,
    refresh,
    cancelRefresh,
    activateStagedUpdate,
    discardStaged,
  }), [activateStagedUpdate, cancelRefresh, discardStaged, isBackgroundRefreshing, isHydrated, isRefreshing, isSeed, lastCheck, lastError, refresh, release, stagedPackage, syncProgress, syncState]);

  return (
    <ContentDataContext.Provider value={dataValue}>
      <ContentPreferencesContext.Provider value={preferencesValue}>
        <ContentSyncContext.Provider value={syncValue}>
          <AttachmentUpdatesProvider content={snapshot.content} enabled={isHydrated}>{children}<OfflineDataBanner /></AttachmentUpdatesProvider>
        </ContentSyncContext.Provider>
      </ContentPreferencesContext.Provider>
    </ContentDataContext.Provider>
  );
}

export function findProcedure(content: MobileContent, id: string): MobileProcedure | undefined {
  return resolveProcedureReference(content.procedures, id);
}
