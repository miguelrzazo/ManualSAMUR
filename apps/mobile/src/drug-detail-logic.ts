/**
 * Cómo se lee la ficha de un fármaco.
 *
 * La pantalla dibujaba ocho bloques `etiqueta / valor` idénticos, en el orden en que
 * estaban escritos: "Función", "Indicación", "Presentación", "Vía", "Dosis",
 * "Contraindicaciones", "Efectos secundarios", "Notas". Las dos cosas que
 * se consultan con el paciente delante —por dónde va y cuánto— tenían exactamente el
 * mismo peso visual que "Notas", y la dosis llegaba como un párrafo de cinco líneas
 * con guiones dentro, sin saltos, porque el valor se pintaba tal cual.
 *
 * Este módulo conserva los adaptadores que puede probarse sin montar la app. La
 * interpretación compartida de la posología vive en `packages/manual-content` para
 * que web y móvil no acaben separando adultos y niños con reglas distintas.
 */

import { parseMedicationDose, type MedicationDoseLine } from "../../../packages/manual-content/src/index.ts";

export type { MedicationDoseLine, MedicationDoseSection } from "../../../packages/manual-content/src/index.ts";

/**
 * Las vías de administración, una por chapa.
 *
 * El corpus las trae de tres formas —`["IV"]`, `["IV","IM"]` y la cadena `"IV,IM"`— y
 * la pantalla las unía con `" · "` en una sola línea de texto gris. Como chapas se
 * cuentan de un vistazo, que es la pregunta real ("¿esto se puede poner IM?").
 */
export function parseDrugRoutes(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(
    parts
      .flatMap((part) => String(part ?? "").split(/[,/·]/))
      .map((part) => part.trim())
      .filter(Boolean),
  )];
}

export type DoseLine = MedicationDoseLine;

/**
 * La posología, en líneas.
 *
 * El campo `dose` del paquete es texto plano con saltos y viñetas dentro:
 *
 *   "iv lenta.\n- Dosis de Ataque: 150 mg/kg: …\n- Dosis sucesivas: 50 mg/kg …"
 *
 * Pintado como una sola cadena, las cinco pautas de la Acetilcisteína salen como un
 * bloque corrido en el que hay que buscar el guion con el dedo. Devolver las líneas
 * deja que la pantalla las dibuje como lo que son.
 *
 * No se reordena ni se reescribe nada: la posología es contenido clínico y sale del
 * manual tal cual, sólo que separada.
 */
export function parseDoseLines(value: unknown): DoseLine[] {
  return parseMedicationDose(value).flatMap((section) => section.lines);
}

export { parseMedicationDose } from "../../../packages/manual-content/src/index.ts";

/**
 * Los campos informativos que quedan bajo la posología, en el orden en que se leen.
 *
 * "Vía" y "Dosis" ya no están en la lista: la pantalla los dibuja arriba y con otro
 * tratamiento. Estaban aquí, entre "Presentación" y "Contraindicaciones",
 * indistinguibles de sus vecinos.
 */
export const DRUG_DETAIL_FIELDS: readonly (readonly [label: string, key: string])[] = [
  ["Indicación", "indication"],
  ["Función", "funcion"],
  ["Presentación", "presentation"],
] as const;

export const DRUG_SAFETY_FIELDS: readonly (readonly [label: string, key: string])[] = [
  ["Contraindicaciones", "contraindications"],
  ["Efectos secundarios", "efectos_secundarios"],
  ["Precauciones", "precauciones"],
  ["Interacciones", "interacciones"],
  ["Incompatibilidades", "incompatibilidades"],
] as const;

export const DRUG_NOTE_FIELDS: readonly (readonly [label: string, key: string])[] = [
  ["Notas", "notes"],
] as const;

/** Un valor del paquete puede ser cadena o lista; ambas se leen igual. */
export function drugFieldText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean).join(" · ");
  return typeof value === "string" ? value.trim() : "";
}
