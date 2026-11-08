import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { HttpError } from './model.ts';
export interface JobEnv {
  DB: D1Database;
  CONTENT_ASSETS?: KVNamespace;
  CONTENT_WORKFLOW?: { create(options: { id: string; params: { jobId: string; generation: number; stage?: string; cursor?: number } }): Promise<unknown> };
  AI?: { toMarkdown(file: { name: string; blob: Blob }, options?: { output: { format: 'text' } }): Promise<{ format: string; data?: string; error?: string }> };
}
export interface Job { id: string; kind: 'check'|'publish'; status: string; scope_json: string; actor: string; generation: number; created_at: string }
export interface Task { id: string; title: string; status: string; payload_json: string }
export interface Scope { domains?: string[]; ids?: string[]; releaseId?: string }
export const DOMAINS = ['procedures','vademecum','codigos','main'];
export function checkScope(body: Record<string, unknown>): Scope {
  const domains = body.domains === undefined ? DOMAINS : body.domains;
  const ids = body.ids === undefined ? [] : body.ids;
  if (!Array.isArray(domains) || !domains.length || domains.some(x => typeof x !== 'string' || !DOMAINS.includes(x)) || !Array.isArray(ids) || ids.length > 300 || ids.some(x => typeof x !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(x))) throw new HttpError(400, 'Selecciona dominios e identificadores válidos.');
  if (ids.length && (domains.length !== 1 || domains[0] !== 'procedures')) throw new HttpError(400, 'Los identificadores solo se admiten al comprobar procedimientos.');
  return { domains: [...new Set(domains)], ids: [...new Set(ids)] };
}
export async function enqueueJob(env: JobEnv, kind: Job['kind'], scope: Scope, actor: string, id = crypto.randomUUID()) {
  if (!env.CONTENT_WORKFLOW || !env.CONTENT_ASSETS) throw new HttpError(503, 'Las tareas de contenido todavía no están configuradas.');
  const now = new Date().toISOString();
  try { await env.DB.batch([
    env.DB.prepare('INSERT INTO content_jobs(id,kind,scope_json,actor,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id,kind,JSON.stringify(scope),actor,now,now),
    env.DB.prepare('INSERT INTO audit_log(at,actor,action,target,detail) VALUES(?,?,?,?,?)').bind(now,actor,`${kind}.request`,id,''),
  ]); } catch (e) { if (String(e).includes('UNIQUE')) throw new HttpError(409, 'Ya hay una tarea de este tipo en curso.'); throw e; }
  try { await env.CONTENT_WORKFLOW.create({ id: `${id}-1`, params: { jobId: id, generation: 1 } }); }
  catch { await env.DB.prepare("UPDATE content_jobs SET status='failed',error='No se pudo iniciar la tarea. Reintenta desde el editor.',updated_at=? WHERE id=?").bind(now,id).run(); throw new HttpError(503, 'No se pudo iniciar la tarea en segundo plano.'); }
  return id;
}
export async function liveJob(env: JobEnv, id: string, generation: number): Promise<Job> {
  const job = await env.DB.prepare('SELECT * FROM content_jobs WHERE id=? AND generation=?').bind(id,generation).first<Job>();
  if (!job || !['queued','running'].includes(job.status)) throw new Error('Tarea cancelada o sustituida.');
  return job;
}
export async function tasks(env: JobEnv, jobId: string) { return (await env.DB.prepare('SELECT id,title,status,payload_json FROM content_job_tasks WHERE job_id=? ORDER BY id').bind(jobId).all<Task>()).results; }
export async function addTask(env: JobEnv, jobId: string, id: string, title: string, payload: unknown) {
  await env.DB.prepare('INSERT OR IGNORE INTO content_job_tasks(job_id,id,title,payload_json) VALUES(?,?,?,?)').bind(jobId,id,title,JSON.stringify(payload)).run();
}
export function textChunks(value: string, size = 12000): string[] {
  const result: string[] = [];
  for (let at=0; at<value.length;) {
    let end=Math.min(at+size,value.length);
    const last=value.charCodeAt(end-1);
    if(end<value.length && last>=0xd800 && last<=0xdbff) end--;
    result.push(value.slice(at,end)); at=end;
  }
  return result.length?result:[''];
}
export async function putPart(env: JobEnv, jobId: string, name: string, value: string, part = 0) {
  const chunks=textChunks(value);
  const statements=[env.DB.prepare('DELETE FROM content_job_parts WHERE job_id=? AND name=? AND part>=? AND part<?').bind(jobId,name,part,part===0 && name!=='procedures'?2147483647:part+100),
    ...chunks.map((body,index)=>env.DB.prepare('INSERT OR REPLACE INTO content_job_parts VALUES(?,?,?,?)').bind(jobId,name,part+index,body))];
  for(let at=0;at<statements.length;at+=50) await env.DB.batch(statements.slice(at,at+50));
}
export async function readPart(env: JobEnv, jobId: string, name: string) {
  return (await env.DB.prepare('SELECT body FROM content_job_parts WHERE job_id=? AND name=? ORDER BY part').bind(jobId,name).all<{ body: string }>()).results.map(x=>x.body).join('');
}
export async function jobRoutes(request: Request, env: JobEnv, path: string, role: string, actor: string, body?: Record<string, unknown>): Promise<Response> {
  const reply = (data: unknown, status=200) => Response.json(data, { status, headers: { 'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow' } });
  if (path === '/api/editor/checks' && request.method === 'GET') {
    const jobs = (await env.DB.prepare("SELECT j.*, (SELECT COUNT(*) FROM content_job_tasks t WHERE t.job_id=j.id) AS total,(SELECT COUNT(*) FROM content_job_tasks t WHERE t.job_id=j.id AND t.status='completed') AS completed,(SELECT COUNT(*) FROM content_job_tasks t WHERE t.job_id=j.id AND t.status='failed') AS failed FROM content_jobs j WHERE kind='check' ORDER BY created_at DESC LIMIT 30").all()).results;
    const now = new Date(); const next = new Date(now); next.setUTCDate(1); next.setUTCHours(4,0,0,0); if(next<=now) next.setUTCMonth(next.getUTCMonth()+1);
    return reply({ jobs, configured: !!env.CONTENT_WORKFLOW && !!env.CONTENT_ASSETS, nextCheck: next.toISOString() });
  }
  if (role !== 'admin') throw new HttpError(403,'Solo administración puede gestionar comprobaciones.');
  if (path === '/api/editor/checks' && request.method === 'POST') return reply({ id: await enqueueJob(env,'check',checkScope(body || {}),actor) },202);
  const match = /^\/api\/editor\/checks\/([a-zA-Z0-9-]+)(?:\/(retry|cancel|extractions))?$/.exec(path);
  if (!match) throw new HttpError(404,'Comprobación no encontrada.');
  const job = await env.DB.prepare("SELECT * FROM content_jobs WHERE id=? AND kind='check'").bind(match[1]).first<Job>();
  if (!job) throw new HttpError(404,'Comprobación no encontrada.');
  if (match[2] === 'extractions' && request.method === 'GET') {
    const name = new URL(request.url).searchParams.get('name') || '';
    if (!name.startsWith('pdf:') || name.length > 200) throw new HttpError(400, 'Extracción no válida.');
    const text = await readPart(env,job.id,name);
    return reply({ text: text.slice(0,150000), truncated: text.length>150000 });
  }
  if (!match[2] && request.method === 'GET') return reply({ job, extractions: (await env.DB.prepare("SELECT DISTINCT name FROM content_job_parts WHERE job_id=? AND name LIKE 'pdf:%' ORDER BY name").bind(job.id).all()).results, tasks: (await env.DB.prepare('SELECT id,title,status,error FROM content_job_tasks WHERE job_id=? ORDER BY id LIMIT 1000').bind(job.id).all()).results });
  if (request.method !== 'POST') throw new HttpError(405,'Método no permitido.');
  if (match[2] === 'cancel') {
    await env.DB.batch([
      env.DB.prepare("UPDATE content_jobs SET status='cancelled',generation=generation+1,updated_at=? WHERE id=? AND status IN ('queued','running')").bind(new Date().toISOString(),job.id),
      env.DB.prepare('INSERT INTO audit_log(at,actor,action,target,detail) VALUES(?,?,?,?,?)').bind(new Date().toISOString(),actor,'check.cancel',job.id,''),
    ]);
  } else if (match[2] === 'retry') {
    if (!['failed','completed_with_warnings'].includes(job.status)) throw new HttpError(409,'Esta tarea no se puede reintentar.');
    if (!env.CONTENT_WORKFLOW) throw new HttpError(503,'Las tareas no están configuradas.');
    const generation = job.generation+1;
    try { await env.DB.batch([
      env.DB.prepare("UPDATE content_jobs SET status='queued',generation=?,error=NULL,updated_at=? WHERE id=? AND generation=?").bind(generation,new Date().toISOString(),job.id,job.generation),
      env.DB.prepare("UPDATE content_job_tasks SET status='queued',error=NULL WHERE job_id=? AND status='failed'").bind(job.id),
      env.DB.prepare('INSERT INTO audit_log(at,actor,action,target,detail) VALUES(?,?,?,?,?)').bind(new Date().toISOString(),actor,'check.retry',job.id,''),
    ]); } catch { throw new HttpError(409,'Ya hay una comprobación en curso.'); }
    try { await env.CONTENT_WORKFLOW.create({ id:`${job.id}-${generation}`,params:{jobId:job.id,generation} }); }
    catch { await env.DB.prepare("UPDATE content_jobs SET status='failed',error='No se pudo reintentar.' WHERE id=? AND generation=?").bind(job.id,generation).run(); throw new HttpError(503,'No se pudo iniciar el reintento.'); }
  } else throw new HttpError(405,'Método no permitido.');
  return reply({ ok:true });
}
