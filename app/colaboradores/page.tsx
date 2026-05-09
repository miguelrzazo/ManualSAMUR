import { ColaboradoresView } from "@/components/colaboradores/ColaboradoresView";
import { readCollaboratorsData } from "@/lib/main-content";

export const metadata = {
  title: "Colaboradores — SAMUR Manual",
  description: "Listado de colaboradores del Manual SAMUR-Protección Civil",
};

export default function ColaboradoresPage() {
  const collaborators = readCollaboratorsData();
  return <ColaboradoresView collaborators={collaborators} />;
}
