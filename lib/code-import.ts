/** Parsers for the structured code tables in SAMUR's official radio PDF exports. */

export interface ImportedCode {
  code: string;
  name: string;
  category?: string;
  description?: string;
}

export interface RadioCodeImport {
  claves: ImportedCode[];
  indicativos: ImportedCode[];
}

export class CodeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeImportError";
  }
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[│|]+$/g, "").trim();
}

function unique(rows: ImportedCode[]): ImportedCode[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.code.toLocaleLowerCase("es");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Parse the two right-hand columns from pdftotext -layout output. */
export function parseRadioCodePdfText(text: string): RadioCodeImport {
  const claves: ImportedCode[] = [];
  const indicativos: ImportedCode[] = [];
  let inClave = false;
  let inIndicativos = false;
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/\t/g, " ");
    if (/\bClave\s+Descripci[oó]n\b/i.test(line)) inClave = true;
    if (/Indicativos\s+propios/i.test(line)) inIndicativos = true;
    if (/Indicativos\s+otros\s+organismos/i.test(line)) inIndicativos = false;

    if (inClave) {
      const match = line.match(/│\s*([A-Za-z0-9][A-Za-z0-9. ]*?)\s{2,}(.+?)\s*│/);
      if (match) {
        const code = clean(match[1]);
        const name = clean(match[2]);
        if (/^(?:\d+(?:\.\d+)?|[A-Z]{1,4})$/.test(code) && name && !/^estatus\b/i.test(code)) {
          claves.push({ code, name });
        }
      }
    }
    if (inIndicativos) {
      const match = line.match(/│\s*([A-Za-zÁÉÍÓÚÑ0-9][^│]{1,28}?)\s{2,}([^│]{3,})\s*$/);
      if (match) {
        const code = clean(match[1]);
        const name = clean(match[2]);
        if (code && name && !/^(?:indicativos|letras|números|nº base)$/i.test(code)) indicativos.push({ code, name });
      }
    }
  }
  const result = { claves: unique(claves), indicativos: unique(indicativos) };
  if (result.claves.length < 10) throw new CodeImportError(`No se pudo reconocer la tabla Clave (${result.claves.length} filas).`);
  if (result.indicativos.length < 5) throw new CodeImportError(`No se pudo reconocer la tabla de indicativos (${result.indicativos.length} filas).`);
  return result;
}

/** Refuse a parsed replacement when a source layout or export is implausibly incomplete. */
export function assertImportedCodeCoverage(before: number, after: number, minimum = 0.2): void {
  if (before <= 0) return;
  if (after < before * minimum) throw new CodeImportError(`La importación conservaría solo ${after} de ${before} entradas.`);
}
