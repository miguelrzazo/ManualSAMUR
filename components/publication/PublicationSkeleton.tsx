const bar = "animate-pulse rounded-md bg-muted";

export function PublicationSkeleton() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8" role="status" aria-busy="true" aria-label="Cargando contenido">
      <div className={`${bar} h-4 w-24`} />
      <div className={`${bar} mt-6 h-8 w-2/3`} />
      <div className={`${bar} mt-3 h-4 w-1/3`} />
      <div className="mt-8 space-y-3">
        <div className={`${bar} h-4 w-full`} />
        <div className={`${bar} h-4 w-11/12`} />
        <div className={`${bar} h-4 w-4/5`} />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className={`${bar} h-24`} />)}
      </div>
    </section>
  );
}
