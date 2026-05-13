import { getProcedureSidebarSections } from "@/lib/content";
import { ProcedureSidebar } from "@/components/manual/ProcedureSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  const sidebarSections = getProcedureSidebarSections();

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)]">
      <div className="construction-banner border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="construction-banner-track">
          <span className="construction-banner-item">&gt;&gt;&gt;&gt; EN REVISION Y DESARROLLO — LA INFORMACION PUEDE NO CORRESPONDERSE CON EL MANUAL OFICIAL &lt;&lt;&lt;&lt;</span>
          <span className="construction-banner-item">&gt;&gt;&gt;&gt; EN REVISION Y DESARROLLO — LA INFORMACION PUEDE NO CORRESPONDERSE CON EL MANUAL OFICIAL &lt;&lt;&lt;&lt;</span>
        </div>
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
