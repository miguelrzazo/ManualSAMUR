import { getProceduresBySection, getProcedureMeta } from "@/lib/content";
import { ProcedureSidebar } from "@/components/manual/ProcedureSidebar";
import { SearchBar } from "@/components/manual/SearchBar";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  const proceduresBySection = getProceduresBySection();
  const allProcedures = getProcedureMeta();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)]">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-64 lg:w-72 flex-col border-r border-border/60 flex-shrink-0">
        <div className="p-3 border-b border-border/60">
          <SearchBar procedures={allProcedures} />
        </div>
        <ScrollArea className="flex-1">
          <ProcedureSidebar proceduresBySection={proceduresBySection} />
        </ScrollArea>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="md:hidden p-3 border-b border-border/60">
          <SearchBar procedures={allProcedures} />
        </div>
        {children}
      </div>
    </div>
  );
}
