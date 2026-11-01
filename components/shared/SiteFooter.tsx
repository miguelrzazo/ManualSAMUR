import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { MainLinksData } from "@/lib/main-content";

const APP_VERSION = "1.0";

const consulta = [
  ["/manual", "Manual de procedimientos"],
  ["/codigos", "Códigos y claves"],
  ["/vademecum", "Vademécum"],
  ["/abreviaturas", "Abreviaturas"],
  ["/mapa", "Mapa de hospitales y bases"],
] as const;

const proyecto = [
  ["/acerca-de", "Acerca de"],
  ["/cambios", "Cambios publicados"],
  ["/colaboradores", "Colaboradores originales del manual oficial"],
  ["/soporte", "Soporte"],
  ["/privacidad", "Privacidad"],
] as const;

function Column({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}>
    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
    <ul className="mt-3 space-y-1">{children}</ul>
  </div>;
}

const linkClass = "inline-flex min-h-9 items-center text-sm text-foreground/80 transition-colors hover:text-primary";

export function SiteFooter({ mainLinks }: { mainLinks: MainLinksData }) {
  const official = [
    [mainLinks.sourceUrl, "Manual oficial"],
    [mainLinks.officialWebUrl, "Web oficial de SAMUR-PC"],
    [mainLinks.avisoImportanteUrl, "Aviso importante (PDF)"],
  ].filter(([href]) => href);

  return <footer className="mt-12 border-t border-border bg-muted/30" data-print-hide>
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 md:pb-10">
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 min-w-0 space-y-4 md:col-span-1">
          <div className="flex items-center gap-3">
            <Image src="/favicon.png" alt="" width={40} height={40} className="rounded-xl" />
            <div>
              <p className="font-semibold leading-tight">Manual SAMUR</p>
              <p className="text-xs text-muted-foreground">Versión {APP_VERSION}{mainLinks.manualVersion ? ` · Manual ${mainLinks.manualVersion}` : ""}</p>
            </div>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Lectura rápida y sin conexión del Manual de Procedimientos de SAMUR-Protección Civil, pensada para el móvil y la guardia.
          </p>
          <a href="https://www.apta-academy.com" target="_blank" rel="noopener noreferrer" className="flex max-w-sm items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
            <Image src="/assets/apta-blue-tutor.png" alt="Lince de APTA Academy" width={44} height={44} className="shrink-0 object-contain" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Creada por APTA Academy</span>
              <span className="block text-xs text-muted-foreground">Una forma inteligente de preparar tu oposición ↗</span>
            </span>
          </a>
        </div>

        <Column title="Consulta">
          {consulta.map(([href, label]) => <li key={href}><Link href={href} className={linkClass}>{label}</Link></li>)}
        </Column>

        <Column title="Proyecto">
          {proyecto.map(([href, label]) => <li key={href}><Link href={href} className={linkClass}>{label}</Link></li>)}
        </Column>

        <Column title="Fuente oficial" className="col-span-2 md:col-span-1">
          {official.map(([href, label]) => <li key={href}><a href={href} target="_blank" rel="noopener noreferrer" className={`${linkClass} gap-1.5`}>{label}<ExternalLink className="h-3 w-3 opacity-60" /></a></li>)}
          {mainLinks.samurEmail && <li><a href={`mailto:${mainLinks.samurEmail}`} className={linkClass}>Escribir a SAMUR-PC</a></li>}
          <li><a href="/llms.txt" className={linkClass}>Contenido para IA (llms.txt)</a></li>
        </Column>
      </div>

      <div className="mt-10 flex flex-col gap-2 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>Proyecto independiente y no oficial. No representa a SAMUR-Protección Civil ni al Ayuntamiento de Madrid.</p>
        <p>El contenido clínico pertenece a SAMUR-PC, sus autores y el Ayuntamiento de Madrid.</p>
      </div>
    </div>
  </footer>;
}
