import { ReleaseHistory } from "@/components/publication/ReleaseHistory";
export const metadata = { title: "Cambios publicados — Manual SAMUR", description: "Historial público de publicaciones del manual y resúmenes descargables en PDF." };
export default function ChangesPage() {
  return <section className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-3xl font-bold">Cambios publicados</h1><p className="mb-8 mt-3 text-muted-foreground">Publicaciones compartidas por la web y la aplicación móvil.</p><ReleaseHistory /></section>;
}
