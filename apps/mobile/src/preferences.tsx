import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hasAcknowledgedDisclosure, parseAppearancePreference, type AppearancePreference } from "./preferences-logic";
import { addSeenEventIds, parseSeenEventIds, serializeSeenEventIds } from "./manual-tree-logic";

export const FIRST_USE_DISCLOSURE_KEY = "manualsamur.firstUseDisclosure.v1";
export const ACADEMY_PROMO_SEEN_KEY = "manualsamur.academyPromoSeen.v1";
export const APPEARANCE_PREFERENCE_KEY = "manualsamur.preferences.appearance.v1";
export const SEEN_EVENTS_STORAGE_KEY = "manualsamur.preferences.seenEvents.v1";

export type { AppearancePreference } from "./preferences-logic";

type PreferencesContextValue = {
  isHydrated: boolean;
  hasAcknowledgedFirstUse: boolean;
  acknowledgeFirstUse: () => Promise<void>;
  hasSeenAcademyPromo: boolean;
  markAcademyPromoSeen: () => Promise<void>;
  appearance: AppearancePreference;
  setAppearance: (preference: AppearancePreference) => void;
  seenEventIds: string[];
  markEventSeen: (eventId: string) => void;
  markAllEventsSeen: (eventIds: readonly string[]) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasAcknowledgedFirstUse, setHasAcknowledgedFirstUse] = useState(false);
  const [hasSeenAcademyPromo, setHasSeenAcademyPromo] = useState(false);
  const [appearance, setAppearanceState] = useState<AppearancePreference>("system");
  const [seenEventIds, setSeenEventIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [disclosure, academyPromoSeen, storedAppearance, storedSeenEvents] = await Promise.all([
          AsyncStorage.getItem(FIRST_USE_DISCLOSURE_KEY),
          AsyncStorage.getItem(ACADEMY_PROMO_SEEN_KEY),
          AsyncStorage.getItem(APPEARANCE_PREFERENCE_KEY),
          AsyncStorage.getItem(SEEN_EVENTS_STORAGE_KEY),
        ]);
        if (cancelled) return;
        setHasAcknowledgedFirstUse(hasAcknowledgedDisclosure(disclosure));
        setHasSeenAcademyPromo(academyPromoSeen === "seen");
        setAppearanceState(parseAppearancePreference(storedAppearance));
        setSeenEventIds(parseSeenEventIds(storedSeenEvents));
      } catch {
        // A storage failure should never block a local-first launch.
        if (!cancelled) {
          setHasAcknowledgedFirstUse(false);
          setHasSeenAcademyPromo(false);
          setAppearanceState("system");
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(appearance === "system" ? "unspecified" : appearance);
  }, [appearance]);

  const acknowledgeFirstUse = useCallback(async () => {
    setHasAcknowledgedFirstUse(true);
    await AsyncStorage.setItem(FIRST_USE_DISCLOSURE_KEY, "acknowledged");
  }, []);

  const markAcademyPromoSeen = useCallback(async () => {
    setHasSeenAcademyPromo(true);
    await AsyncStorage.setItem(ACADEMY_PROMO_SEEN_KEY, "seen");
  }, []);

  const setAppearance = useCallback((preference: AppearancePreference) => {
    setAppearanceState(preference);
    void AsyncStorage.setItem(APPEARANCE_PREFERENCE_KEY, preference);
  }, []);

  const markEventSeen = useCallback((eventId: string) => {
    setSeenEventIds((current) => {
      const next = addSeenEventIds(current, [eventId]);
      if (next.length !== current.length) void AsyncStorage.setItem(SEEN_EVENTS_STORAGE_KEY, serializeSeenEventIds(next));
      return next;
    });
  }, []);

  const markAllEventsSeen = useCallback((eventIds: readonly string[]) => {
    setSeenEventIds((current) => {
      const next = addSeenEventIds(current, eventIds);
      if (next.length !== current.length) void AsyncStorage.setItem(SEEN_EVENTS_STORAGE_KEY, serializeSeenEventIds(next));
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    isHydrated,
    hasAcknowledgedFirstUse,
    acknowledgeFirstUse,
    hasSeenAcademyPromo,
    markAcademyPromoSeen,
    appearance,
    setAppearance,
    seenEventIds,
    markEventSeen,
    markAllEventsSeen,
  }), [acknowledgeFirstUse, appearance, hasAcknowledgedFirstUse, hasSeenAcademyPromo, isHydrated, markAcademyPromoSeen, markAllEventsSeen, markEventSeen, seenEventIds, setAppearance]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
