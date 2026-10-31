"use client";
import Link from "next/link";
import { Component, type ReactNode } from "react";
export class PublicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section role="alert" className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-2xl font-semibold">No se puede mostrar este contenido</h1><p className="mt-3">La publicación necesita una revisión de formato. Puedes volver al manual o reintentar la carga.</p><Link className="mt-4 inline-flex min-h-11 items-center text-primary underline" href="/manual">Volver al manual</Link><button className="ml-4 min-h-11 rounded border border-border px-3" onClick={() => window.location.reload()}>Reintentar</button></section> : this.props.children;
  }
}
