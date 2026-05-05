import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Props {
  section: string;
  group: string;
  subgroup: string;
}

export function Breadcrumbs({ section, group, subgroup }: Props) {
  const sectionHref = `/manual?section=${encodeURIComponent(section)}`;
  const groupHref = `${sectionHref}&group=${encodeURIComponent(group)}`;
  const subgroupHref = `${groupHref}&subgroup=${encodeURIComponent(subgroup)}`;
  const crumbs = [
    { label: "Manual", href: "/manual" },
    { label: section, href: sectionHref },
    group && { label: group, href: groupHref },
    subgroup && subgroup !== group && { label: subgroup, href: subgroupHref },
  ].filter(Boolean) as { label: string; href: string | null }[];

  return (
    <nav aria-label="Breadcrumb" data-print-hide className="flex items-center gap-1 text-xs text-muted-foreground mb-4 flex-wrap">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-50" />}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span>{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
