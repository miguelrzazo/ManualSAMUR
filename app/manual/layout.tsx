import { getProcedureSidebarSections } from "@/lib/content";
import { ProcedureSidebar } from "@/components/manual/ProcedureSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  const sidebarSections = getProcedureSidebarSections();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)]">
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
  );
}
