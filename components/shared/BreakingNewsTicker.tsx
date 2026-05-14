import type { ManualSyncMetadata } from "@/lib/manual-sync";

interface Props {
  metadata: ManualSyncMetadata;
}

function domainIcon(href: string): string {
  if (href.startsWith("/vademecum")) return "💊";
  if (href.startsWith("/codigos")) return "📻";
  return "📋";
}

export function BreakingNewsTicker({ metadata }: Props) {
  if (!metadata.tickerEnabled) return null;

  const items = (metadata.ticker?.items ?? [])
    .map((item) => ({ label: item.label.trim(), href: item.href }))
    .filter((item) => item.label);
  if (items.length === 0) return null;

  return (
    <div className="sticky top-0 z-40 border-b border-red-900/20 bg-red-600 text-white shadow-sm" data-print-hide>
      <div className="flex h-9 items-center overflow-hidden">
        <div className="flex h-full shrink-0 items-center bg-red-800 px-3 text-[11px] font-black uppercase tracking-[0.2em]">
          Actualización
        </div>
        <div className="manual-news-mask min-w-0 flex-1 overflow-hidden">
          <div className="manual-news-track flex w-max items-center gap-8 whitespace-nowrap px-4 text-sm font-semibold">
            {[...items, ...items].map((item, index) => (
              <span key={`${item.label}-${index}`} className="inline-flex items-center gap-8">
                <a href={item.href} className="inline-flex items-center gap-1.5 underline decoration-red-200/70 underline-offset-2 hover:text-red-100">
                  <span aria-hidden="true" className="text-base leading-none">{domainIcon(item.href)}</span>
                  {item.label}
                </a>
                <span aria-hidden="true" className="text-red-200">/</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
