import { createContext, useContext } from "react";
import type { MobileContent, MobileSnapshot } from "../../../packages/manual-content/src/index.ts";
import type { StagedPackage } from "./content-transaction";
import type { ContentCheckRecord } from "./content-update-logic";

export type SyncState = "idle" | "checking" | "downloading" | "validating" | "activating" | "success" | "stale" | "offline" | "failure" | "recovery";

export interface SyncProgress {
  downloadedBytes?: number;
  totalBytes?: number;
}

/** Immutable package data. It intentionally has no user or lifecycle state. */
export interface ContentDataContextValue {
  content: MobileContent;
  snapshot: MobileSnapshot;
}

/** Persisted user state kept independent from the content package. */
export interface ContentPreferencesContextValue {
  favorites: string[];
  recents: string[];
  /** What the user last searched for, so Buscar has something to show before they type. */
  recentQueries: string[];
  toggleFavorite: (routeKey: string) => void;
  remember: (routeKey: string) => void;
  removeRecent: (routeKey: string) => void;
  rememberQuery: (query: string) => void;
  forgetQuery: (query: string) => void;
}

/** Hydration, update, and staged-package state kept independent from content data. */
export interface ContentSyncContextValue {
  isHydrated: boolean;
  isRefreshing: boolean;
  lastError?: string;
  lastCheck?: ContentCheckRecord;
  isBackgroundRefreshing: boolean;
  syncState: SyncState;
  syncProgress: SyncProgress;
  stagedPackage?: StagedPackage;
  refresh: (options?: { background?: boolean }) => Promise<void>;
  cancelRefresh: () => void;
  activateStagedUpdate: () => Promise<void>;
  discardStaged: () => Promise<void>;
}

export const ContentDataContext = createContext<ContentDataContextValue | null>(null);
export const ContentPreferencesContext = createContext<ContentPreferencesContextValue | null>(null);
export const ContentSyncContext = createContext<ContentSyncContextValue | null>(null);

function useRequiredContext<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} must be used inside ContentProvider`);
  return value;
}

export function useContentData(): ContentDataContextValue {
  return useRequiredContext(useContext(ContentDataContext), "useContentData");
}

export function useContentPreferences(): ContentPreferencesContextValue {
  return useRequiredContext(useContext(ContentPreferencesContext), "useContentPreferences");
}

export function useContentSync(): ContentSyncContextValue {
  return useRequiredContext(useContext(ContentSyncContext), "useContentSync");
}

// Small selectors give future consumers an explicit migration target without
// making them depend on the compatibility aggregate returned by useContent().
export const selectContent = (value: ContentDataContextValue): MobileContent => value.content;
export const selectSnapshot = (value: ContentDataContextValue): MobileSnapshot => value.snapshot;
export const selectFavorites = (value: ContentPreferencesContextValue): string[] => value.favorites;
export const selectRecents = (value: ContentPreferencesContextValue): string[] => value.recents;
export const selectRecentQueries = (value: ContentPreferencesContextValue): string[] => value.recentQueries;
export const selectSyncState = (value: ContentSyncContextValue): SyncState => value.syncState;
