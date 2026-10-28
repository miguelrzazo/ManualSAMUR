"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";
import { buildVademecumHref, resolveDrugIdReference } from "@/lib/vademecum-utils";
import type { MedicationRecord } from "@/packages/manual-content/src/schema";

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Published text is data: no MDX compiler, JavaScript expressions or component evaluation. */
export function SafeMarkdown({ content, drugs = [] }: { content: string; drugs?: MedicationRecord[] }) {
  const html = useMemo(() => {
    const markdown = content
      .replace(/<DrugLink\s+name=["']([^"']+)["']\s*\/>/g, (_, name: string) => {
        const drugId = resolveDrugIdReference(name, drugs);
        const drug = drugs.find((item) => item.id === drugId);
        return drug ? `<a href="${buildVademecumHref(drug.id)}">${escape(drug.name)}</a>` : escape(name);
      })
      .replace(/<(KeyPoints|Warning|Caution|Note)\b[^>]*>/g, (_, tag: string) => `\n\n> **${({ KeyPoints: "Puntos clave", Warning: "Advertencia", Caution: "Precaución", Note: "Nota" } as Record<string, string>)[tag]}**\n\n`)
      .replace(/<\/(?:KeyPoints|Warning|Caution|Note)>/g, "\n\n")
      .replace(/<Step\s+number=["'{]?(\d+)["'}]?\s*>/g, "\n\n**Paso $1**\n\n")
      .replace(/<\/?(?:Steps|Step|Collapsible|AlgoritmoLabel)\b[^>]*>/g, "\n\n");
    return DOMPurify.sanitize(marked.parse(markdown, { async: false, gfm: true }), {
      USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
      FORBID_ATTR: ["style"],
    });
  }, [content, drugs]);
  return <div className="prose dark:prose-invert max-w-none break-words [&_table]:block [&_table]:overflow-x-auto [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: html }} />;
}
