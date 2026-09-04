import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hasAcknowledgedDisclosure, parseAppearancePreference, type AppearancePreference } from "./preferences-logic";

export const FIRST_USE_DISCLOSURE_KEY = "manualsamur.firstUseDisclosure.v1";
export const APPEARANCE_PREFERENCE_KEY = "manualsamur.preferences.appearance.v1";

export type { AppearancePreference } from "./preferences-logic";

type PreferencesContextValue = {
  isHydrated: boolean;
  hasAcknowledgedFirstUse: boolean;
  acknowledgeFirstUse: () => Promise<void>;
  appearance: AppearancePreference;
  setAppearance: (preference: AppearancePreference) => void;
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
  const [appearance, setAppearanceState] = useState<AppearancePreference>("system");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [disclosure, storedAppearance] = await Promise.all([
          AsyncStorage.getItem(FIRST_USE_DISCLOSURE_KEY),
          AsyncStorage.getItem(APPEARANCE_PREFERENCE_KEY),
        ]);
        if (cancelled) return;
        setHasAcknowledgedFirstUse(hasAcknowledgedDisclosure(disclosure));
        setAppearanceState(parseAppearancePreference(storedAppearance));
      } catch {
        // A storage failure should never block a local-first launch.
        if (!cancelled) {
          setHasAcknowledgedFirstUse(false);
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

  const setAppearance = useCallback((preference: AppearancePreference) => {
    setAppearanceState(preference);
    void AsyncStorage.setItem(APPEARANCE_PREFERENCE_KEY, preference);
  }, []);

  const value = useMemo(() => ({
    isHydrated,
    hasAcknowledgedFirstUse,
    acknowledgeFirstUse,
    appearance,
    setAppearance,
  }), [acknowledgeFirstUse, appearance, hasAcknowledgedFirstUse, isHydrated, setAppearance]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
