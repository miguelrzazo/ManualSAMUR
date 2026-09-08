import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  selectContent,
  selectFavorites,
  selectRecentQueries,
  selectRecents,
  selectSnapshot,
  selectSyncState,
  type ContentDataContextValue,
  type ContentPreferencesContextValue,
  type ContentSyncContextValue,
} from "../apps/mobile/src/content-context.ts";

const content = { procedures: [] } as unknown as ContentDataContextValue["content"];
const snapshot = { content } as ContentDataContextValue["snapshot"];

test("focused content selectors keep data, preferences, and sync state separate", () => {
  const data: ContentDataContextValue = { content, snapshot };
  const preferences: ContentPreferencesContextValue = {
    favorites: ["procedure:1"],
    recents: ["procedure:2"],
    recentQueries: ["anafilaxia"],
    toggleFavorite: () => undefined,
    remember: () => undefined,
    removeRecent: () => undefined,
    rememberQuery: () => undefined,
    forgetQuery: () => undefined,
  };
  const sync: ContentSyncContextValue = {
    isHydrated: true,
    isRefreshing: false,
    syncState: "idle",
    syncProgress: {},
    refresh: async () => undefined,
    cancelRefresh: () => undefined,
    activateStagedUpdate: async () => undefined,
    discardStaged: async () => undefined,
  };

  assert.equal(selectContent(data), content);
  assert.equal(selectSnapshot(data), snapshot);
  assert.deepEqual(selectFavorites(preferences), ["procedure:1"]);
  assert.deepEqual(selectRecents(preferences), ["procedure:2"]);
  assert.deepEqual(selectRecentQueries(preferences), ["anafilaxia"]);
  assert.equal(selectSyncState(sync), "idle");
});

test("the compatibility hook is composed from focused providers", () => {
  const source = readFileSync(path.join(process.cwd(), "apps/mobile/src/content.tsx"), "utf8");
  assert.match(source, /ContentDataContext\.Provider/);
  assert.match(source, /ContentPreferencesContext\.Provider/);
  assert.match(source, /ContentSyncContext\.Provider/);
  assert.match(source, /const data = useContext\(ContentDataContext\)/);
  assert.match(source, /const preferences = useContext\(ContentPreferencesContext\)/);
  assert.match(source, /const sync = useContext\(ContentSyncContext\)/);
  assert.doesNotMatch(source, /createContext<ContentContextValue/);
});
