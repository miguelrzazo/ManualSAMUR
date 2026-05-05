import { getProcedureSidebarSections } from "@/lib/content";
import { ProcedureSidebar } from "@/components/manual/ProcedureSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BreakingNewsTicker } from "@/components/shared/BreakingNewsTicker";
import { readManualSyncMetadata } from "@/lib/manual-sync";

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  const sidebarSections = getProcedureSidebarSections();
  const manualSyncMetadata = readManualSyncMetadata();

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)]">
      <BreakingNewsTicker metadata={manualSyncMetadata} />
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 md:px-6 md:text-sm dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        Aviso: La informacion esta en revision y desarrollo y puede no corresponderse con el manual oficial.
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — hidden on mobile */}
        <aside className="hidden md:flex w-64 lg:w-72 flex-col border-r border-border/60 flex-shrink-0" data-print-hide>
          <ScrollArea className="flex-1">
            <ProcedureSidebar sections={sidebarSections} />
          </ScrollArea>
        </aside>

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
