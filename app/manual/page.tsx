import { getProceduresBySection, getProcedureMeta } from "@/lib/content";
import { ManualHomeClient } from "@/components/manual/ManualHomeClient";

export default function ManualPage() {
  const proceduresBySection = getProceduresBySection();
  const allProcedures = getProcedureMeta();

  return (
    <ManualHomeClient
      proceduresBySection={proceduresBySection}
      allProcedures={allProcedures}
    />
  );
}
