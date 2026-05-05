import { getProcedureMeta, getProcedureSidebarSections } from "@/lib/content";
import { ManualHomeClient } from "@/components/manual/ManualHomeClient";
import { readManualSyncMetadata } from "@/lib/manual-sync";

interface PageProps {
  searchParams: Promise<{
    section?: string | string[];
    group?: string | string[];
    subgroup?: string | string[];
  }>;
}

function getFirstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.find(Boolean) : value;
}

export default async function ManualPage({ searchParams }: PageProps) {
  const routeState = await searchParams;
  const sidebarSections = getProcedureSidebarSections();
  const allProcedures = getProcedureMeta();
  const syncMetadata = readManualSyncMetadata();

  return (
    <ManualHomeClient
      sidebarSections={sidebarSections}
      allProcedures={allProcedures}
      syncMetadata={syncMetadata}
      initialSection={getFirstValue(routeState.section)}
      initialGroup={getFirstValue(routeState.group)}
      initialSubgroup={getFirstValue(routeState.subgroup)}
    />
  );
}
