import Constants from "expo-constants";

/** Expo only inlines public environment variables accessed by their literal name. */
export function manualContentOrigin(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = process.env.EXPO_PUBLIC_MANUAL_CONTENT_ORIGIN ?? extra?.manualContentOrigin;
  if (typeof value !== "string" || !value) throw new Error("Falta EXPO_PUBLIC_MANUAL_CONTENT_ORIGIN: configura el origen de Cloudflare y recompila la aplicación.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.endsWith(".vercel.app")) throw new Error("El origen de contenido debe ser una URL HTTPS de Cloudflare sin ruta ni credenciales.");
  return url.origin;
}
