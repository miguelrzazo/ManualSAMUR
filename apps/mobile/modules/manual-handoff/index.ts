import { requireOptionalNativeModule } from "expo";

export interface HandoffActivitySnapshot {
  activityType: string;
  webpageURL: string;
  title: string;
  isEligibleForHandoff: boolean;
  isEligibleForSearch: boolean;
}

interface ManualHandoffNativeModule {
  setCurrentActivity(activityType: string, url: string, title: string, eligibleForSearch: boolean): Promise<void>;
  clearCurrentActivity(): Promise<void>;
  getCurrentActivity(): Promise<HandoffActivitySnapshot | null>;
}

/** iOS only. Null on Android and in Expo Go, where every call becomes a no-op. */
const native = requireOptionalNativeModule<ManualHandoffNativeModule>("ManualHandoff");

export const isHandoffAvailable = native !== null;

export function setCurrentActivity(activityType: string, url: string, title: string, eligibleForSearch = true): Promise<void> {
  return native ? native.setCurrentActivity(activityType, url, title, eligibleForSearch) : Promise.resolve();
}

export function clearCurrentActivity(): Promise<void> {
  return native ? native.clearCurrentActivity() : Promise.resolve();
}

export function getCurrentActivity(): Promise<HandoffActivitySnapshot | null> {
  return native ? native.getCurrentActivity() : Promise.resolve(null);
}
