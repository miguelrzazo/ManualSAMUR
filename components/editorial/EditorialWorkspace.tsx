"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, FileText, History, Search, Send, ShieldCheck, RefreshCw } from "lucide-react";
import { editorRequest, statusLabels, type DocumentSummary, type Release } from "./types";
import { DocumentEditor } from "./DocumentEditor";

const categoryLabel = (value: string) => ({ procedure: "Procedimientos", dataset: "Datos de consulta" } as Record<string, string>)[value] || value;
const date = (value: string) => new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
export function EditorialWorkspace() {
  const [email, setEmail] = useState("");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"documents" | "releases">("documents");
  const [releases, setReleases] = useState<Release[]>([]);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSection, setNewSection] = useState("Generales");
  const refresh = useCallback(async () => {
    const result = await editorRequest<{ documents: DocumentSummary[] }>("/documents");
    setDocuments(result.documents);
  }, []);
  const refreshReleases = useCallback(async () => {
    const result = await editorRequest<{ releases: Release[] }>("/releases");
    setReleases(result.releases);
  }, []);
  useEffect(() => {
    let active = true;
    editorRequest<{ email: string }>("/session").then(async session => {
      if (!active) return;
      setEmail(session.email);
      await refresh();
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    if (view !== "releases") return;
    const initial = setTimeout(() => { refreshReleases().catch(e => setError(e.message)); }, 0);
    const timer = setInterval(() => { refreshReleases().catch(e => setError(e.message)); }, 15000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [view, refreshReleases]);
  function leaveEditor(action: () => void) {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Quieres salir y descartarlos?")) return;
    setDirty(false); action();
  }
  async function createDocument() {
    if (!/^[a-zA-Z0-9_-]+$/.test(newId) || !newTitle.trim()) { setError("Introduce un identificador estable con letras, números, guiones o guiones bajos y un título."); return; }
    setBusy(true); setError("");
    try {
      const day = new Date().toISOString().slice(0, 10);
      const slug = `${newId}-${newTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      const result = await editorRequest<{ document: DocumentSummary }>("/documents", "POST", { id: `procedure:${newId}`, category: "procedure", title: newTitle.trim(), data: { id: newId, title: newTitle.trim(), section: newSection, slug, routeKey: `procedure:${newId}`, tags: [], synonyms: [], related: [], backlinks: [], relations: [], editorialBlocks: [], updated: day, sourceUpdated: "", source: "", attachments: [], content: `## ${newTitle.trim()}\n\n`, searchText: "" }, privateNotes: "", references: [] });
      await refresh(); setSelected(result.document.id); setCreating(false); setNewId(""); setNewTitle("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function cancelPreparation(release: Release) {
    if (!window.confirm("¿Cancelar la preparación de esta publicación? Esta entrega no se activará y podrás preparar una nueva publicación.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await editorRequest<{ release: Release }>(`/releases/${encodeURIComponent(release.id)}/cancel`, "POST");
      setReleases(current => current.map(item => item.id === release.id ? result.release : item));
      setNotice("Preparación cancelada. Ya puedes revisar los contenidos y solicitar una nueva publicación.");
      await refreshReleases(); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function publish(restoreId?: string) {
    if (!window.confirm(restoreId ? "Se preparará una publicación con el contenido de esta versión. ¿Continuar?" : "Se preparará una publicación con todos los documentos listos. ¿Continuar?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await editorRequest<{ release: Release }>(restoreId ? `/releases/${encodeURIComponent(restoreId)}/restore` : "/releases", "POST", restoreId ? {} : { summary });
      setNotice(`Publicación ${result.release.id} solicitada. El contenido será público cuando termine la compilación y su estado sea Publicado.`);
      setSummary(""); await refreshReleases();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const filtered = documents.filter(d => (!category || category === d.category) && (!status || status === d.status) && `${d.title} ${d.id}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es")));
  return <div className="editorial-workspace">
    <header className="ed-header"><div className="ed-brand"><span className="ed-brand-icon"><BookOpen size={24} /></span><div><span className="ed-eyebrow">MANUAL SAMUR · ESPACIO PRIVADO</span><h1>Gestión editorial</h1></div></div><div className="ed-identity"><ShieldCheck size={17} /><span>{email || "Cloudflare Access"}</span></div></header>
    <div className="ed-shell"><aside className="ed-sidebar"><nav aria-label="Gestión editorial"><button className={view === "documents" ? "ed-nav active" : "ed-nav"} onClick={() => leaveEditor(() => setView("documents"))}><FileText size={18} /> Contenidos <span>{documents.length}</span></button><button className={view === "releases" ? "ed-nav active" : "ed-nav"} onClick={() => leaveEditor(() => setView("releases"))}><Send size={18} /> Publicaciones</button></nav>
      <div className="ed-sidebar-caption">FLUJO EDITORIAL</div><ol className="ed-workflow"><li>Redacta y guarda un borrador</li><li>Revisa los cambios y las fuentes</li><li>Marca el contenido como listo</li><li>Prepara y verifica la publicación</li></ol><p className="ed-private-note"><ShieldCheck size={16} /> Las notas privadas y las referencias de trabajo no se incluyen en la web pública.</p></aside>
      <main className="ed-main">
        {error && <div className="ed-alert ed-error" role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError("")}>×</button></div>}
        {notice && <p className="ed-alert" role="status">{notice}</p>}
        {loading ? <p className="ed-loading" role="status">Comprobando acceso y cargando contenidos…</p> : !email ? <div className="ed-empty"><ShieldCheck size={32} /><h2>Acceso editorial</h2><p>Inicia sesión a través de Cloudflare Access con la identidad autorizada.</p><button onClick={() => window.location.reload()}>Volver a comprobar</button></div> : view === "releases" ? <>
          <div className="ed-section-heading"><div><span className="ed-eyebrow">ENTREGA Y RECUPERACIÓN</span><h2>Publicaciones</h2><p>Una solicitud inicia la compilación. Comprueba aquí el resultado antes de dar la entrega por terminada.</p></div><button aria-label="Actualizar publicaciones" onClick={() => refreshReleases().catch(e => setError(e.message))}><RefreshCw size={18} /></button></div>
          <section className="ed-card ed-release-form"><h3>Preparar publicación</h3><p>{documents.filter(d => d.status === "ready").length} documentos listos para publicar.</p><label htmlFor="release-summary">Resumen de esta entrega</label><textarea id="release-summary" value={summary} onChange={e => setSummary(e.target.value)} placeholder="Qué cambia y qué se ha revisado" rows={3} /><button className="ed-primary" disabled={busy || releases.some(release => release.status === "preparing") || !summary.trim() || !documents.some(d => d.status === "ready")} onClick={() => publish()}><Send size={16} /> Solicitar publicación</button>{releases.some(release => release.status === "preparing") && <p role="status">Hay una publicación en preparación. Espera a que termine o cancélala desde su ficha para preparar otra entrega.</p>}</section>
          <div className="ed-release-list">{releases.length === 0 && <p className="ed-empty">Todavía no hay publicaciones.</p>}{releases.map(release => <article className="ed-card" key={release.id}><div className="ed-section-heading"><h3>{release.summary || release.id}</h3><span className={`ed-badge ${release.status === "published" ? "published" : release.status === "failed" ? "failed" : "draft"}`}>{({ queued: "En cola", pending: "Pendiente", building: "Compilando", preparing: "Preparando", published: "Publicado", failed: "Error", cancelled: "Cancelada", restored: "Restaurado" } as Record<string, string>)[release.status] || release.status}</span></div><p>{date(release.createdAt)} · {release.id}</p>{release.error && <p className="ed-error" role="alert">{release.error}</p>}{release.publishedAt && <p>Publicado el {date(release.publishedAt)}</p>}{release.status === "published" && <p><a className="ed-download-link" href={`/api/public/releases/${encodeURIComponent(release.id)}/changelog.pdf`} download>Descargar registro de cambios en PDF</a></p>}{release.status === "preparing" && <button disabled={busy} onClick={() => cancelPreparation(release)}>Cancelar preparación</button>}{["failed", "cancelled"].includes(release.status) && <button disabled={busy || releases.some(item => item.status === "preparing")} onClick={() => { setSummary(release.summary || ""); window.document.getElementById("release-summary")?.focus(); }}>Preparar nueva publicación</button>}{release.status === "published" && <button disabled={busy} onClick={() => publish(release.id)}><History size={16} /> Preparar restauración de esta publicación</button>}</article>)}</div>
        </> : selected ? <DocumentEditor key={selected} id={selected} onBack={() => leaveEditor(() => setSelected(null))} onDirtyChange={setDirty} onSaved={refresh} /> : <>
          <div className="ed-section-heading"><div><span className="ed-eyebrow">BIBLIOTECA EDITORIAL</span><h2>Contenidos</h2><p>Procedimientos, medicamentos y todos los conjuntos de datos del manual.</p></div><button aria-label="Actualizar contenidos" onClick={() => refresh().catch(e => setError(e.message))}><RefreshCw size={18} /></button><button className="ed-primary" onClick={() => setCreating(!creating)}>Nueva ficha</button></div>
          {creating && <section className="ed-card"><h3>Nuevo procedimiento</h3><p>El identificador y la ruta deben ser únicos. Puedes editar todos los datos después de crear el borrador.</p><label htmlFor="new-id">Identificador estable</label><input id="new-id" value={newId} onChange={e => setNewId(e.target.value)} placeholder="Ej. 101_nuevo" /><label htmlFor="new-title">Título</label><input id="new-title" value={newTitle} onChange={e => setNewTitle(e.target.value)} /><label htmlFor="new-section">Sección</label><input id="new-section" value={newSection} onChange={e => setNewSection(e.target.value)} /><div><button className="ed-primary" disabled={busy || !newId.trim() || !newTitle.trim()} onClick={createDocument}>Crear borrador</button><button onClick={() => setCreating(false)}>Cancelar</button></div></section>}
          <div className="ed-filters"><label className="ed-search"><Search size={18} /><span className="ed-sr-only">Buscar contenido</span><input placeholder="Buscar por título o identificador" value={query} onChange={e => setQuery(e.target.value)} /></label><label><span className="ed-sr-only">Categoría</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas las categorías</option>{[...new Set(documents.map(d => d.category))].sort().map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label><label><span className="ed-sr-only">Estado</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <p className="ed-results">{filtered.length} contenidos</p><div className="ed-document-list">{filtered.map(d => <button className="ed-document-row" key={d.id} onClick={() => setSelected(d.id)}><span className="ed-document-icon"><FileText size={20} /></span><span className="ed-document-title"><strong>{d.title}</strong><small>{categoryLabel(d.category)} · {d.id}</small></span><span className={`ed-badge ${d.status}`}>{statusLabels[d.status]}</span><span className="ed-row-date">Rev. {d.revision}<small>{d.updatedAt ? date(d.updatedAt) : ""}</small></span><span aria-hidden="true">→</span></button>)}{filtered.length === 0 && <p className="ed-empty">No hay contenidos que coincidan con estos filtros.</p>}</div>
        </>}
      </main></div>
  </div>;
}
