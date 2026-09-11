import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees de agentes: contienen sus propios .next/out y copias del árbol,
    // que inundaban `npm run lint` con cientos de errores de ficheros generados.
    ".claude/**",
    // pdf.worker.min.mjs es un bundle minificado de pdfjs-dist copiado por
    // scripts/sync-public-docs.ts, no código fuente de este repo.
    "public/pdf.worker.min.mjs",
    // Los config plugins de Expo los carga el prebuild con `require`, así que
    // tienen que ser CommonJS. La config de Next los mide con reglas de módulo
    // ES y marca cada import como error.
    "apps/mobile/plugins/**",
  ]),
]);

export default eslintConfig;
