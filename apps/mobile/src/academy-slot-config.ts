import aptaBlueTutor from "../assets/apta-blue-tutor.png";
import type { AcademySlot } from "./academy-slot.ts";

export const academyBrand = {
  creator: "Esta aplicación está creada por APTA Academy.",
  claim: "Una forma inteligente de preparar tu oposición.",
  cta: "Prepara tu oposición con nosotros",
} as const;

/**
 * Creatividad local de APTA Academy. No se descarga ni se consulta una URL para
 * decidir si aparece: el manual debe poder abrirse igual sin cobertura.
 */
export const academySlot: AcademySlot = {
  title: "APTA Academy",
  detail: "Ruta de estudio, tests y tutor virtual",
  url: "https://www.apta-academy.com",
  splashImage: aptaBlueTutor,
};
