import { AbreviaturasView } from "@/components/abreviaturas/AbreviaturasView";
import { readAbbreviationsData } from "@/lib/main-content";

export const metadata = {
  title: "Abreviaturas — SAMUR Manual",
  description: "Abreviaturas oficiales del Manual SAMUR-Protección Civil",
};

export default function AbreviaturasPage() {
  const sections = readAbbreviationsData();
  return <AbreviaturasView sections={sections} />;
}
