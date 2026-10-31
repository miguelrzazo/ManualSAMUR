import Image from "next/image";

export function AcademyPromo() {
  return <section aria-label="APTA Academy" className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
    <Image src="/assets/apta-blue-tutor.png" alt="Lince de APTA Academy" width={72} height={72} className="shrink-0 object-contain" />
    <div><p className="font-semibold">Creada por APTA Academy</p><p className="mt-1 text-sm text-muted-foreground">Una forma inteligente de preparar tu oposición.</p><a href="https://www.apta-academy.com" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline">Conoce APTA Academy ↗</a></div>
  </section>;
}
