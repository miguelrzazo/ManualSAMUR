import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import bundledSnapshot from "./data/snapshot.json";
import bundledAttachmentManifest from "./data/attachment-manifest.json";
import {
  MOBILE_ATTACHMENT_MANIFEST_SCHEMA,
  MOBILE_ATTACHMENT_MANIFEST_VERSION,
  MOBILE_SNAPSHOT_SCHEMA,
  MOBILE_SNAPSHOT_VERSION,
  canonicalJson,
  mobileAttachmentEntries,
  mobilePackageHashPayload,
  isValidAttachment,
  isValidManifestAttachment,
  isValidMobileUpdateEvent,
  stableRouteKey,
  type MobileAttachmentManifest,
  type MobileContent,
  type MobileProcedure,
  type MobileSnapshot,
} from "./data/schema";
import { resolveProcedureReference } from "./procedure-logic";
import {
  activateStagedPackage,
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

type ContentContextValue = {
  content: MobileContent;
  snapshot: MobileSnapshot;
  favorites: string[];
  recents: string[];
  /** What the user last searched for, so Buscar has something to show before they type. */
  recentQueries: string[];
  isHydrated: boolean;
  isRefreshing: boolean;
  lastError?: string;
  syncState: SyncState;
  syncProgress: SyncProgress;
  stagedPackage?: StagedPackage;
  toggleFavorite: (routeKey: string) => void;
  remember: (routeKey: string) => void;
  removeRecent: (routeKey: string) => void;
  rememberQuery: (query: string) => void;
  forgetQuery: (query: string) => void;
  refresh: () => Promise<void>;
  cancelRefresh: () => void;
  resumeStaged: () => Promise<void>;
  discardStaged: () => Promise<void>;
};

export type SyncState = "idle" | "checking" | "downloading" | "validating" | "activating" | "success" | "stale" | "offline" | "failure" | "recovery";
export interface SyncProgress {
  downloadedBytes?: number;
  totalBytes?: number;
}

const ContentContext = createContext<ContentContextValue | null>(null);

async function snapshotIsValid(candidate: unknown, expectedManifest?: MobileAttachmentManifest): Promise<boolean> {
  if (!candidate || typeof candidate !== "object") return false;
  const snapshot = candidate as Partial<MobileSnapshot>;
  if (snapshot.schema !== MOBILE_SNAPSHOT_SCHEMA || snapshot.version !== MOBILE_SNAPSHOT_VERSION || !snapshot.content) return false;
  if (typeof snapshot.generatedAt !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.hash ?? "")) return false;
  if (snapshot.contentHash !== undefined && snapshot.contentHash !== snapshot.hash) return false;
  if (!/^[a-f0-9]{64}$/.test(snapshot.packageHash ?? "")) return false;
  const content = snapshot.content as MobileContent;
  if (!Array.isArray(content.procedures)) return false;
  if (!Array.isArray(content.updates) || content.updates.some((event) => !isValidMobileUpdateEvent(event))) return false;
  if (content.procedures.some((procedure) => !Array.isArray(procedure.updates) || procedure.updates.some((event) => !isValidMobileUpdateEvent(event)))) return false;
  if (new Set(content.procedures.map((procedure) => procedure.id)).size !== content.procedures.length) return false;
  if (new Set(content.procedures.map((procedure) => procedure.routeKey)).size !== content.procedures.length) return false;
  if (content.procedures.some((procedure) => procedure.routeKey !== stableRouteKey(procedure.id))) return false;
  if (content.procedures.some((procedure) => procedure.attachments.some((attachment) => !isValidAttachment(attachment)))) return false;
  const attachments = mobileAttachmentEntries(content);
  if (new Set(attachments.map((attachment) => attachment.id)).size !== attachments.length) return false;
  if (attachments.some((attachment) => !isValidManifestAttachment(attachment))) return false;
  if (expectedManifest && (canonicalJson(expectedManifest) !== canonicalJson({
    schema: MOBILE_ATTACHMENT_MANIFEST_SCHEMA,
    version: MOBILE_ATTACHMENT_MANIFEST_VERSION,
    generatedAt: snapshot.generatedAt,
    contentHash: snapshot.hash,
    packageHash: snapshot.packageHash,
    attachments,
  }))) return false;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(content));
  if (digest !== snapshot.hash) return false;
  const manifestDigest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(attachments));
  const packageDigest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalJson(mobilePackageHashPayload(snapshot as MobileSnapshot, manifestDigest)));
  return packageDigest === snapshot.packageHash;
}

function endpoint(name: "contentEndpoint" | "metadataEndpoint"): string {
  const envName = name === "contentEndpoint" ? "EXPO_PUBLIC_CONTENT_ENDPOINT" : "EXPO_PUBLIC_METADATA_ENDPOINT";
  if (typeof process.env[envName] === "string") return process.env[envName];
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return typeof extra?.[name] === "string" ? extra[name] as string : "";
}

export function useContent(): ContentContextValue {
  const value = useContext(ContentContext);
  if (!value) throw new Error("useContent must be used inside ContentProvider");
  return value;
}

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MobileSnapshot>(bundledSnapshot as MobileSnapshot);
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
        readTransaction(AsyncStorage, snapshotIsValid),
      ]);
      if (cancelled) return;
      setRecentQueries(parseRecentQueries(storedQueries));
      if (transaction.snapshot) {
        setSnapshot(transaction.snapshot);
      } else {
        try {
          const migrated = await migrateLegacySnapshot(AsyncStorage, snapshotIsValid);
          if (migrated) setSnapshot(migrated);
        } catch { /* Keep the bundled snapshot if legacy storage is corrupt. */ }
      }
      if (transaction.staged) {
        setStagedPackage(transaction.staged);
        setSyncProgress({ downloadedBytes: transaction.staged.downloadedBytes, totalBytes: transaction.staged.totalBytes });
        setSyncState(transaction.stagedSnapshot ? "recovery" : "failure");
      } else if (transaction.warning) {
        setLastError(transaction.warning);
        setSyncState("stale");
      } else if (contentFreshness(transaction.snapshot?.generatedAt ?? (bundledSnapshot as MobileSnapshot).generatedAt) !== "fresh") {
        setSyncState("stale");
      }
      if (!await snapshotIsValid(bundledSnapshot, bundledAttachmentManifest as MobileAttachmentManifest)) {
        setLastError("El paquete local no supera la validación de integridad");
        setSyncState("failure");
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
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      responseReceived = true;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSyncState("downloading");
      const totalBytes = Number(response.headers.get("content-length") ?? "");
      const candidate: unknown = await response.json();
      setSyncState("validating");
      throwIfCancelled(controller.signal);
      const staged = await stagePackage(AsyncStorage, candidate as MobileSnapshot, snapshotIsValid, new Date().toISOString(), Number.isFinite(totalBytes) ? { downloadedBytes: totalBytes, totalBytes } : {}, controller.signal);
      setStagedPackage(staged);
      setSyncProgress({ downloadedBytes: staged.downloadedBytes, totalBytes: staged.totalBytes });
      setSyncState("activating");
      await activateStagedPackage(AsyncStorage, staged, snapshotIsValid, new Date().toISOString(), controller.signal);
      setSnapshot(candidate as MobileSnapshot);
      setStagedPackage(undefined);
      setSyncState("success");
      setSyncProgress({ downloadedBytes: totalBytes || undefined, totalBytes: totalBytes || undefined });
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "No se pudo actualizar el contenido");
      if (controller.signal.aborted || error instanceof ContentUpdateCancelledError) {
        const transaction = await readTransaction(AsyncStorage, snapshotIsValid);
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
  }, []);

  const cancelRefresh = useCallback(() => {
    // Once activation starts, cancellation is disabled so the pointer write
    // cannot be interrupted between validation and commit.
    if (syncState === "activating") return;
    refreshController.current?.abort();
  }, [syncState]);

  const resumeStaged = useCallback(async () => {
    setIsRefreshing(true);
    setLastError(undefined);
    setSyncState("activating");
    try {
      const result = await resumeStagedPackage(AsyncStorage, snapshotIsValid);
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

  const value = useMemo<ContentContextValue>(() => ({
    content: snapshot.content,
    snapshot,
    favorites,
    recents,
    recentQueries,
    isHydrated,
    isRefreshing,
    lastError,
    syncState,
    syncProgress,
    stagedPackage,
    toggleFavorite,
    remember,
    removeRecent,
    rememberQuery,
    forgetQuery,
    refresh,
    cancelRefresh,
    resumeStaged,
    discardStaged,
  }), [cancelRefresh, discardStaged, favorites, forgetQuery, isHydrated, isRefreshing, lastError, recentQueries, recents, refresh, remember, rememberQuery, removeRecent, snapshot, stagedPackage, syncProgress, syncState, toggleFavorite, resumeStaged]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function findProcedure(content: MobileContent, id: string): MobileProcedure | undefined {
  return resolveProcedureReference(content.procedures, id);
}
