export type AppearancePreference = "system" | "light" | "dark";

export const appearancePreferences: readonly AppearancePreference[] = ["system", "light", "dark"];

export function parseAppearancePreference(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function hasAcknowledgedDisclosure(value: string | null): boolean {
  return value === "acknowledged";
}
