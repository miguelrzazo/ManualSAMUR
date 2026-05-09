"use client";

import dynamic from "next/dynamic";
import type { ManualAttachment } from "@/lib/manual-sync";

const ProcedureAttachmentsView = dynamic(
  () => import("./ProcedureAttachmentsView").then((module) => module.ProcedureAttachmentsView),
  {
    ssr: false,
    loading: () => (
      <div className="mt-8 rounded-xl border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
        Cargando anexos...
      </div>
    ),
  },
);

export function ProcedureAttachments({ attachments }: { attachments: ManualAttachment[] }) {
  return <ProcedureAttachmentsView attachments={attachments} />;
}
