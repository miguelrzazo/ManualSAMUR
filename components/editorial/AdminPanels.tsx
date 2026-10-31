"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { editorRequest, type AuditEntry, type EditorUser } from "./types";

const date = (value: string) => new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
const roleLabels: Record<EditorUser["role"], string> = { admin: "Administración", editor: "Edición" };
const actionLabels: Record<string, string> = {
  "document.create": "Creó la ficha", "document.save": "Guardó cambios", "document.resolve": "Resolvió una actualización oficial",
  "document.status": "Cambió el estado", "document.restore": "Restauró una revisión",
  "release.request": "Solicitó una publicación", "release.restore": "Solicitó una restauración", "release.cancel": "Canceló una publicación",
  "release.published": "Publicación activada",
  "user.create": "Dio de alta a un usuario", "user.update": "Modificó un usuario", "user.deactivate": "Desactivó a un usuario",
};

/** Solo visible para administración: el servidor rechaza igualmente a cualquier otro rol. */
export function UsersPanel({ me }: { me: string }) {
  const [users, setUsers] = useState<EditorUser[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<EditorUser["role"]>("editor");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const result = await editorRequest<{ users: EditorUser[]; owner: string | null }>("/users");
    setUsers(result.users); setOwner(result.owner);
  }, []);
  useEffect(() => {
    let active = true;
    editorRequest<{ users: EditorUser[]; owner: string | null }>("/users")
      .then(result => { if (active) { setUsers(result.users); setOwner(result.owner); } })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, []);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <>
    <div className="ed-section-heading"><div><span className="ed-eyebrow">SOLO ADMINISTRACIÓN</span><h2>Usuarios editoriales</h2><p>Quién puede entrar en la gestión editorial. Cloudflare Access verifica la identidad; esta lista decide si puede editar.</p></div><button aria-label="Actualizar usuarios" onClick={() => refresh().catch(e => setError((e as Error).message))}><RefreshCw size={18} /></button></div>
    {error && <p className="ed-alert ed-error" role="alert">{error}</p>}{notice && <p className="ed-alert" role="status">{notice}</p>}
    <section className="ed-card"><h3>Dar de alta</h3>
      <label htmlFor="user-email">Correo electrónico</label><input id="user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@ejemplo.es" />
      <label htmlFor="user-name">Nombre visible</label><input id="user-name" value={name} onChange={e => setName(e.target.value)} />
      <label htmlFor="user-role">Rol</label><select id="user-role" value={role} onChange={e => setRole(e.target.value as EditorUser["role"])}><option value="editor">Edición: redactar, revisar y publicar</option><option value="admin">Administración: además gestiona usuarios y ve el registro</option></select>
      <p className="ed-field-hint">El correo también debe estar permitido en la política de Cloudflare Access (ver docs/backend/README.md).</p>
      <button className="ed-primary" disabled={busy || !email.trim()} onClick={() => run(() => editorRequest("/users", "POST", { email, name, role }), "Usuario dado de alta.").then(() => { setEmail(""); setName(""); })}><UserPlus size={16} /> Dar de alta</button>
    </section>
    <div className="ed-document-list">
      {owner && <div className="ed-history-row"><div><strong>{owner}</strong><small>Propietaria · Administración permanente</small></div></div>}
      {users.length === 0 && <p className="ed-empty">Todavía no hay más usuarios.</p>}
      {users.map(user => <div className="ed-history-row" key={user.email}><div><strong>{user.name || user.email}</strong><small>{user.email} · {roleLabels[user.role]} · {user.active ? "Activo" : "Desactivado"} · alta {date(user.createdAt)} por {user.createdBy}</small></div>
        {user.email.toLowerCase() !== me.toLowerCase() && <>
          <button disabled={busy} onClick={() => run(() => editorRequest(`/users/${encodeURIComponent(user.email)}`, "PUT", { name: user.name, role: user.role === "admin" ? "editor" : "admin", active: !!user.active }), "Rol actualizado.")}>{user.role === "admin" ? "Pasar a edición" : "Hacer administración"}</button>
          <button disabled={busy} onClick={() => { if (!user.active || window.confirm(`¿Retirar el acceso de ${user.email}? Sus revisiones se conservan.`)) void run(() => editorRequest(`/users/${encodeURIComponent(user.email)}`, "PUT", { name: user.name, role: user.role, active: !user.active }), user.active ? "Acceso retirado." : "Acceso restablecido."); }}>{user.active ? "Retirar acceso" : "Restablecer acceso"}</button>
        </>}
      </div>)}
    </div>
  </>;
}

export function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const [actor, setActor] = useState("");
  const refresh = useCallback(async () => { setEntries((await editorRequest<{ entries: AuditEntry[] }>("/audit")).entries); }, []);
  useEffect(() => {
    let active = true;
    editorRequest<{ entries: AuditEntry[] }>("/audit")
      .then(result => { if (active) setEntries(result.entries); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, []);
  const actors = [...new Set(entries.map(entry => entry.actor))].sort();
  const visible = entries.filter(entry => !actor || entry.actor === actor);
  return <>
    <div className="ed-section-heading"><div><span className="ed-eyebrow">SOLO ADMINISTRACIÓN</span><h2>Registro de cambios</h2><p>Quién hizo qué y cuándo. El registro no se puede editar ni borrar y no incluye textos ni notas privadas.</p></div><button aria-label="Actualizar registro" onClick={() => refresh().catch(e => setError((e as Error).message))}><RefreshCw size={18} /></button></div>
    {error && <p className="ed-alert ed-error" role="alert">{error}</p>}
    <div className="ed-filters"><label><span className="ed-sr-only">Persona</span><select value={actor} onChange={e => setActor(e.target.value)}><option value="">Todas las personas</option>{actors.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    {visible.length === 0 && <p className="ed-empty">Sin actividad registrada.</p>}
    <div className="ed-document-list">{visible.map(entry => <div className="ed-history-row" key={entry.id}><div><strong>{actionLabels[entry.action] || entry.action} · {entry.target}</strong><small>{date(entry.at)} · {entry.actor}{entry.detail ? ` · ${entry.detail}` : ""}</small></div></div>)}</div>
  </>;
}
