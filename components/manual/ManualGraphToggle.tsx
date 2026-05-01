"use client";

import { useState } from "react";
import { List, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { GraficaGlobal } from "@/components/manual/GraficaGlobal";
import type { ProcedureMeta } from "@/lib/content";

interface Props {
  procedures: ProcedureMeta[];
  children: React.ReactNode;
}

export function ManualGraphToggle({ procedures, children }: Props) {
  const [view, setView] = useState<"list" | "graph">("list");

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => setView("list")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            view === "list"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-3.5 w-3.5" />
          Lista
        </button>
        <button
          onClick={() => setView("graph")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            view === "graph"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Network className="h-3.5 w-3.5" />
          Gráfica
        </button>
      </div>

      {view === "list" ? children : <GraficaGlobal procedures={procedures} />}
    </div>
  );
}
