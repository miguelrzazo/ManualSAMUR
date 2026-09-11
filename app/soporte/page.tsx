import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Soporte · Manual SAMUR" };

export default function SupportPage() {
  return <article className="mx-auto max-w-3xl space-y-6 px-4 py-8 leading-relaxed">
    <header><h1 className="text-3xl font-semibold">Soporte de Manual SAMUR</h1><p className="mt-2 text-muted-foreground">Aplicación independiente mantenida por Miguel Rosa Zazo.</p></header>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Comunicar un problema</h2><p>Describe los pasos para reproducirlo, el dispositivo y sistema operativo, la versión de la app y, si afecta al contenido, el procedimiento o referencia. Encontrarás la versión y el estado del contenido en Ajustes.</p><p><a className="underline" href="https://github.com/miguelrzazo/ManualSAMUR/issues/new">Abrir una incidencia en GitHub</a> · <a className="underline" href="https://github.com/miguelrzazo/ManualSAMUR/issues">Consultar incidencias existentes</a></p><p>Las incidencias son públicas. No adjuntes datos de pacientes, ubicaciones personales, contraseñas ni capturas con información identificable. Para la prueba interna también puedes enviar comentarios mediante TestFlight.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Contenido y funcionamiento sin conexión</h2><p>Si falla una actualización, el último paquete válido permanece disponible. Reintenta con conexión desde Ajustes. Los anexos externos y la primera descarga de cartografía requieren red; la app muestra los estados de disponibilidad y recuperación.</p><p>Si observas una discrepancia, contrasta la referencia con el <a className="underline" href="https://servpub.madrid.es/manualsamur/bin/view/Main/">manual oficial</a> e incluye su enlace en la incidencia.</p></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Alcance</h2><p>Este canal ofrece soporte de la aplicación, no asistencia sanitaria ni instrucciones operativas. Manual SAMUR no es una aplicación oficial y no sustituye los protocolos vigentes ni el criterio profesional.</p><Link className="underline" href="/privacidad">Política de privacidad</Link></section>
  </article>;
}
