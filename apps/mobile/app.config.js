// Expo loads native build configuration through CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { expo } = require("./app.json");

module.exports = () => {
  const origin = process.env.EXPO_PUBLIC_MANUAL_CONTENT_ORIGIN || expo.extra?.manualContentOrigin;
  if ((process.env.EAS_BUILD_PROFILE === "production" || process.env.NODE_ENV === "production") && !origin) {
    throw new Error("Configura EXPO_PUBLIC_MANUAL_CONTENT_ORIGIN con el origen Cloudflare antes de generar la release.");
  }
  if (origin) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.endsWith(".vercel.app")) throw new Error("EXPO_PUBLIC_MANUAL_CONTENT_ORIGIN debe ser un origen HTTPS de Cloudflare sin ruta.");
  }
  return { ...expo, extra: { ...expo.extra, manualContentOrigin: origin ?? "" } };
};
