import { getProcedureSidebarSections } from "@/lib/content";
import { ProcedureSidebar } from "@/components/manual/ProcedureSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BackToTop } from "@/components/shared/BackToTop";

export default function ManualLayout({ children }: { children: React.ReactNode }) {
  const sidebarSections = getProcedureSidebarSections();

  return (
    <div className="flex flex-col">
      <div className="flex">
        {/* Sidebar — hidden on mobile, sticky so it stays visible while page scrolls */}
        <aside className="hidden md:flex w-64 lg:w-72 flex-col border-r border-border/60 flex-shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)]" data-print-hide>
          <ScrollArea className="flex-1">
            <ProcedureSidebar sections={sidebarSections} />
          </ScrollArea>
        </aside>

        {/* Main content — no overflow-auto so the page scrolls as one */}
        <div className="flex-1 min-w-0">
          {children}
          <BackToTop />
        </div>
      </div>
    </div>
  );
}
