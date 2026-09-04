import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import bundledSnapshot from "./data/snapshot.json";
import type { MobileContent, MobileProcedure, MobileSnapshot } from "./data/schema";

const SNAPSHOT_KEY = "manualsamur.content.snapshot.v2";
const FAVORITES_KEY = "manualsamur.preferences.favorites";
const RECENTS_KEY = "manualsamur.preferences.recents";
const MAX_RECENTS = 12;

type ContentContextValue = {
  content: MobileContent;
  snapshot: MobileSnapshot;
  favorites: string[];
  recents: string[];
  isHydrated: boolean;
  isRefreshing: boolean;
  lastError?: string;
  toggleFavorite: (id: string) => void;
  remember: (id: string) => void;
  refresh: () => Promise<void>;
};

const ContentContext = createContext<ContentContextValue | null>(null);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function snapshotIsValid(candidate: unknown): Promise<boolean> {
  if (!candidate || typeof candidate !== "object") return false;
  const snapshot = candidate as Partial<MobileSnapshot>;
  if (snapshot.schema !== "samur-manual.mobile-content" || snapshot.version !== 2 || !snapshot.content) return false;
  if (typeof snapshot.hash !== "string" || snapshot.hash.length < 32) return false;
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, stableJson(snapshot.content));
  return digest === snapshot.hash;
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
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastError, setLastError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedSnapshot, storedFavorites, storedRecents] = await Promise.all([
        AsyncStorage.getItem(SNAPSHOT_KEY),
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(RECENTS_KEY),
      ]);
      if (cancelled) return;
      if (storedSnapshot) {
        try {
          const parsed = JSON.parse(storedSnapshot);
          if (await snapshotIsValid(parsed)) setSnapshot(parsed as MobileSnapshot);
        } catch { /* Keep the bundled snapshot if storage is corrupt. */ }
      }
      if (storedFavorites) {
        try { setFavorites(JSON.parse(storedFavorites)); } catch { /* ignore */ }
      }
      if (storedRecents) {
        try { setRecents(JSON.parse(storedRecents)); } catch { /* ignore */ }
      }
      setIsHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      void AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const remember = useCallback((id: string) => {
    setRecents((current) => {
      const next = [id, ...current.filter((item) => item !== id)].slice(0, MAX_RECENTS);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const url = endpoint("contentEndpoint");
    if (!url) return;
    setIsRefreshing(true);
    setLastError(undefined);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const candidate: unknown = await response.json();
      if (!await snapshotIsValid(candidate)) throw new Error("El paquete no supera la validación de integridad");
      setSnapshot(candidate as MobileSnapshot);
      await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(candidate));
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "No se pudo actualizar el contenido");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const value = useMemo<ContentContextValue>(() => ({
    content: snapshot.content,
    snapshot,
    favorites,
    recents,
    isHydrated,
    isRefreshing,
    lastError,
    toggleFavorite,
    remember,
    refresh,
  }), [favorites, isHydrated, isRefreshing, lastError, recents, refresh, remember, snapshot, toggleFavorite]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function findProcedure(content: MobileContent, id: string): MobileProcedure | undefined {
  return content.procedures.find((procedure) => procedure.id === id || procedure.slug === id || procedure.routeKey === id);
}
