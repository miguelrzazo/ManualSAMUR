import { jsPDF } from 'jspdf';
import { canonicalJson, isValidAttachment, isValidMobileUpdateEvent, buildCodeRelationsIndex, MOBILE_SNAPSHOT_SCHEMA, MOBILE_SNAPSHOT_VERSION, mobilePackageHashPayload, type MobileProcedure, type MobileUpdateEvent, type MobileManifestAttachment, type MobileCodeReferenceSource } from '../../packages/manual-content/src/index.ts';
import { digest } from './storage.ts';
import { liveJob, putPart, readPart, textChunks, type JobEnv, type Job } from './jobs.ts';
export interface Frozen { document_id:string; revision:number; title:string; category:string; data_json:string }
export interface FrozenRelease { id:string; status:string; summary:string; parent_id:string|null; created_at:string }
export const codeFiles: Record<string,string> = {incidente:'codigos-incidente',sva:'codigos-sva',svb:'codigos-svb',upsi:'codigos-upsi',upsq:'codigos-upsq',icao:'codigos-icao',indicativos:'codigos-indicativos',claves:'codigos-pc',lima:'codigos-lima',cheatsheet:'codigos-cheatsheet'};
const datasetNames: Record<string,string> = {drugs:'vademecum',perfusions:'perfusiones',fluids:'fluidos',commercialNames:'vademecum-comerciales',abbreviations:'abreviaturas',hospitals:'hospitals',bases:'bases',status4:'status4',manual:'manual',links:'main-links',updates:'manual-updates',procedures:'procedures',collaborators:'colaboradores'};
export async function frozenRelease(env:JobEnv, id:string) {
  const release = await env.DB.prepare('SELECT id,status,summary,parent_id,created_at FROM releases WHERE id=?').bind(id).first<FrozenRelease>();
  if (!release || release.status!=='preparing') throw new Error('La publicación ya no está en preparación.');
  return release;
}
export async function frozenRows(env:JobEnv, id:string) {
  return (await env.DB.prepare('SELECT rd.document_id,rd.revision,r.title,d.category,r.data_json FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision JOIN documents d ON d.id=rd.document_id WHERE rd.release_id=? ORDER BY rd.document_id').bind(id).all<Frozen>()).results;
}
export function publicProcedure(data:MobileProcedure,title:string,validIds:Set<string>):MobileProcedure {
  const p = structuredClone(data); p.title=title;
  if (!p.id || !p.slug || !/^[A-Za-z0-9_-]+$/.test(p.id) || !/^[A-Za-z0-9_-]+$/.test(p.slug) || typeof p.content!=='string' || !Array.isArray(p.attachments)) throw new Error('Ficha pública no válida.');
  if (p.attachments.some(a=>!isValidAttachment(a))) throw new Error('Metadatos de adjunto no válidos.');
  p.related = (p.related||[]).filter(id=>validIds.has(id));
  p.backlinks = (p.backlinks||[]).filter(id=>validIds.has(id));
  p.relations = (p.relations||[]).filter(r=>validIds.has(r.id));
  p.editorialBlocks ||= []; p.tags ||= []; p.synonyms ||= []; p.routeKey=`procedure:${p.id}`;
  p.searchText=`${title} ${p.content}`.replace(/<[^>]+>/g,' ').replace(/[*#_`]/g,'').replace(/\s+/g,' ').trim();
  return p;
}
export async function compileDocument(env:JobEnv,job:Job,release:FrozenRelease,row:Frozen,index:number,validIds:string[]) {
  await liveJob(env,job.id,job.generation); await frozenRelease(env,release.id);
  const data = JSON.parse(row.data_json);
  if (row.category==='procedure') {
    if (data.id!==row.document_id.slice(10)) throw new Error('Identidad de ficha incoherente.');
    const p=publicProcedure(data,row.title,new Set(validIds));
    for (const a of p.attachments) {
      if (!a.sha256) continue;
      if (a.localPath.startsWith('/docs/_cloud/')) {
        const stored=await env.DB.prepare('SELECT verified,bytes FROM content_assets WHERE hash=?').bind(a.sha256).first<{verified:number;bytes:number}>();
        if (!stored?.verified || stored.bytes!==a.byteLength || !env.CONTENT_ASSETS || !await env.CONTENT_ASSETS.get(a.sha256,'stream')) throw new Error('Adjunto aún no disponible para publicar.');
        await env.DB.prepare('INSERT OR IGNORE INTO content_asset_refs VALUES(?,?,?)').bind(a.sha256,row.document_id,release.id).run();
      }
    }
    const body=canonicalJson(p);
    await env.DB.prepare(`INSERT OR REPLACE INTO public_documents SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM releases WHERE id=? AND status='preparing') AND EXISTS(SELECT 1 FROM content_jobs WHERE id=? AND generation=? AND status='running')`).bind(release.id,row.document_id,p.slug,p.title,body,release.id,job.id,job.generation).run();
    await putPart(env,job.id,'procedures',body,index*100);
    await putPart(env,job.id,`attachments:${p.id}`,canonicalJson(p.attachments.map(a=>({...a,procedureId:p.id}))));
    const previous = release.parent_id ? await env.DB.prepare('SELECT data_json FROM public_documents WHERE release_id=? AND id=?').bind(release.parent_id,row.document_id).first<{data_json:string}>() : null;
    if (!previous || canonicalJson({...JSON.parse(previous.data_json),searchText:''})!==canonicalJson({...p,searchText:''})) {
      const before=previous ? JSON.parse(previous.data_json) as MobileProcedure : null;
      const event:MobileUpdateEvent={eventId:`${release.id}:${p.id}`,procedureIds:[p.id],changeKind:before?'actualizado':'nuevo',summary:p.title,effectiveDate:release.created_at,approvedAt:release.created_at,category:'procedure',routeKey:p.routeKey,scope:'procedimiento'};
      if (before) event.diff=`Antes: ${before.content.slice(0,4000)}\n\nDespués: ${p.content.slice(0,4000)}`;
      await putPart(env,job.id,`event:${row.document_id}`,JSON.stringify(event));
    }
  } else {
    const key=row.document_id.slice(8);
    if (!(key in datasetNames) && key!=='codes') throw new Error('Conjunto de datos desconocido.');
    let value=data.value;
    if (value===undefined) throw new Error('Conjunto de datos incompleto.');
    if (!['codes','manual','links','collaborators'].includes(key) && !Array.isArray(value)) throw new Error('El conjunto debe contener una lista.');
    if (['codes','manual','links','collaborators'].includes(key) && (!value || typeof value!=='object' || Array.isArray(value))) throw new Error('El conjunto debe contener un objeto.');
    if (key==='updates' && value.some((event:unknown)=>!isValidMobileUpdateEvent(event))) throw new Error('Anuncio de novedades no válido.');
    if (key==='manual') value={...value,lastApprovedAt:release.created_at};
    await putPart(env,job.id,`content:${key}`,canonicalJson(value));
    if (key==='codes'||key==='drugs') {
      const previous = release.parent_id ? await env.DB.prepare('SELECT r.data_json FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision WHERE rd.release_id=? AND rd.document_id=?').bind(release.parent_id,row.document_id).first<{data_json:string}>():null;
      if (!previous || canonicalJson(JSON.parse(previous.data_json).value)!==canonicalJson(value)) await putPart(env,job.id,`event:${row.document_id}`,JSON.stringify({eventId:`${release.id}:${row.document_id}`,procedureIds:[],changeKind:previous?'actualizado':'nuevo',summary:row.title,effectiveDate:release.created_at,approvedAt:release.created_at,category:key==='codes'?'codigo':'vademecum'}));
    }
  }
}
async function parts(env:JobEnv,jobId:string,name:string) { return (await env.DB.prepare('SELECT part,body FROM content_job_parts WHERE job_id=? AND name=? ORDER BY part').bind(jobId,name).all<{part:number;body:string}>()).results; }
export async function writeArtifact(env:JobEnv,releaseId:string,name:string,body:string) {
  const statements=[env.DB.prepare("DELETE FROM release_artifacts WHERE release_id=? AND name=? AND EXISTS(SELECT 1 FROM releases WHERE id=? AND status='preparing')").bind(releaseId,name,releaseId),
    ...textChunks(body).map((chunk,index)=>env.DB.prepare("INSERT OR REPLACE INTO release_artifacts SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM releases WHERE id=? AND status='preparing')").bind(releaseId,name,index,chunk,releaseId))];
  for(let at=0;at<statements.length;at+=50) await env.DB.batch(statements.slice(at,at+50));
}
export async function compileRelations(env:JobEnv,job:Job,release:FrozenRelease,id:string) {
  const p=await env.DB.prepare('SELECT data_json FROM public_documents WHERE release_id=? AND id=?').bind(release.id,id).first<{data_json:string}>();
  if(!p) throw new Error('Ficha congelada ausente.');
  const codes=JSON.parse(await readPart(env,job.id,'content:codes')) as Record<string,MobileCodeReferenceSource[]>;
  const refs=Object.entries(codes).flatMap(([tab,values])=>values.filter(r=>typeof r.code==='string'&&typeof r.name==='string').map(r=>({...r,tab})));
  await putPart(env,job.id,`relations:${id}`,JSON.stringify(buildCodeRelationsIndex([JSON.parse(p.data_json)],refs)));
}
export async function assembleContent(env:JobEnv,job:Job,release:FrozenRelease) {
  const raw=await parts(env,job.id,'procedures');
  const procedures=raw.map((p,i)=>`${i && Math.floor(p.part/100)!==Math.floor(raw[i-1].part/100)?',':''}${p.body}`).join('');
  if (!procedures) throw new Error('No se puede publicar un manual vacío.');
  await putPart(env,job.id,'content:procedures',`[${procedures}]`);
  const events = (await env.DB.prepare("SELECT name,body FROM content_job_parts WHERE job_id=? AND name LIKE 'event:%' ORDER BY name,part").bind(job.id).all<{name:string;body:string}>()).results;
  const grouped=new Map<string,string>(); for(const row of events) grouped.set(row.name,(grouped.get(row.name)||'')+row.body);
  // A restored release reuses frozen document revisions; history remains additive.
  const removed = release.parent_id ? (await env.DB.prepare('SELECT id,title,data_json FROM public_documents WHERE release_id=? AND id NOT IN (SELECT document_id FROM release_documents WHERE release_id=?)').bind(release.parent_id,release.id).all<{id:string;title:string;data_json:string}>()).results:[];
  const updates = [...grouped.values()].map(x=>JSON.parse(x) as MobileUpdateEvent);
  for(const row of removed) updates.push({eventId:`${release.id}:${row.id}`,procedureIds:[JSON.parse(row.data_json).id],changeKind:'eliminado',summary:row.title,effectiveDate:release.created_at,approvedAt:release.created_at,category:'procedure',scope:'procedimiento'});
  // Explicitly reviewed announcement overrides are an ordinary versioned dataset.
  const overrides=await readPart(env,job.id,'content:updates');
  if(overrides) {
    const custom=JSON.parse(overrides) as MobileUpdateEvent[];
    if(!Array.isArray(custom)) throw new Error('El historial de novedades debe ser una lista.');
    const map=new Map(updates.map(e=>[e.eventId,e])); for(const e of custom) map.set(e.eventId,e);
    updates.splice(0,updates.length,...map.values());
  }
  await putPart(env,job.id,'content:updates',canonicalJson(updates.sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).slice(0,500)));
  const relationRows=(await env.DB.prepare("SELECT name,body FROM content_job_parts WHERE job_id=? AND name LIKE 'relations:%' ORDER BY name,part").bind(job.id).all<{name:string;body:string}>()).results;
  const groupedRelations=new Map<string,string>(); for(const r of relationRows) groupedRelations.set(r.name,(groupedRelations.get(r.name)||'')+r.body);
  const codes:Record<string,unknown[]>={};
  for(const body of groupedRelations.values()) for(const [key,mentions] of Object.entries(JSON.parse(body).codes as Record<string,unknown[]>)) (codes[key]||=[]).push(...mentions);
  await putPart(env,job.id,'content:relationsIndex',canonicalJson({codes}));
}
export async function publishDataset(env:JobEnv,job:Job,release:FrozenRelease,key:string) {
  const body=await readPart(env,job.id,`content:${key}`);
  if(!body) throw new Error(`Falta el conjunto ${key}.`);
  const entries:Record<string,{sha256:string;bytes:number;count:number|null}>={};
  const write=async(name:string,text:string)=>{
    const value=JSON.parse(text);
    entries[name]={sha256:await digest(text),bytes:new TextEncoder().encode(text).length,count:Array.isArray(value)?value.length:null};
    await writeArtifact(env,release.id,`datasets/${name}.json`,text);
  };
  if(key==='codes') { const codes=JSON.parse(body); for(const [group,name] of Object.entries(codeFiles)) await write(name,canonicalJson(codes[group]||[])); }
  else if(key==='manual') { const manual=JSON.parse(body); await write('manual',canonicalJson(Object.fromEntries(Object.entries(manual).filter(([name])=>['manualVersion','manualVersionCurrent','lastApprovedAt'].includes(name))))); }
  else await write(datasetNames[key],body);
  await putPart(env,job.id,`manifest:${key}`,JSON.stringify(entries));
}
export async function finalizeRelease(env:JobEnv,job:Job,release:FrozenRelease) {
  await liveJob(env,job.id,job.generation); await frozenRelease(env,release.id);
  const keys=['abbreviations','bases','codes','commercialNames','drugs','fluids','hospitals','links','manual','perfusions','procedures','relationsIndex','status4','updates'];
  if(await readPart(env,job.id,'content:collaborators')) keys.push('collaborators');
  keys.sort();
  const fields:Array<[string,string]>=[];
  for(const key of keys) { const body=await readPart(env,job.id,`content:${key}`); if(!body) throw new Error(`Falta ${key}.`); fields.push([key,body]); }
  // Each field is already canonical; no full-corpus parse or recursive sort.
  const content=`{${fields.map(([key,body])=>`${JSON.stringify(key)}:${body}`).join(',')}}`;
  const hash=await digest(content);
  const attachmentRows=(await env.DB.prepare("SELECT name,body FROM content_job_parts WHERE job_id=? AND name LIKE 'attachments:%' ORDER BY name,part").bind(job.id).all<{name:string;body:string}>()).results;
  const grouped=new Map<string,string>(); for(const r of attachmentRows) grouped.set(r.name,(grouped.get(r.name)||'')+r.body);
  const attachments=[...grouped.values()].flatMap(body=>JSON.parse(body) as MobileManifestAttachment[]);
  if(new Set(attachments.map(a=>a.id)).size!==attachments.length) throw new Error('Identidades de adjuntos duplicadas.');
  const attachmentHash=await digest(canonicalJson(attachments));
  const packageHash=await digest(canonicalJson(mobilePackageHashPayload({hash},attachmentHash)));
  const metadata={schema:MOBILE_SNAPSHOT_SCHEMA,version:MOBILE_SNAPSHOT_VERSION,generatedAt:release.created_at,hash,contentHash:hash,packageHash};
  await writeArtifact(env,release.id,'snapshot.json',`${JSON.stringify(metadata).slice(0,-1)},"content":${content}}`);
  const datasetRows=(await env.DB.prepare("SELECT name,body FROM content_job_parts WHERE job_id=? AND name LIKE 'manifest:%' ORDER BY name,part").bind(job.id).all<{name:string;body:string}>()).results;
  const manifestParts=new Map<string,string>(); for(const row of datasetRows) manifestParts.set(row.name,(manifestParts.get(row.name)||'')+row.body);
  const datasets:Record<string,unknown>={};
  for(const body of manifestParts.values()) for(const [name,value] of Object.entries(JSON.parse(body))) datasets[name]={...(value as object),url:`/api/public/datasets/${name}.json`,immutableUrl:`/api/public/releases/${release.id}/datasets/${name}.json`};
  const manual=JSON.parse(fields.find(([key])=>key==='manual')![1]);
  await writeArtifact(env,release.id,'manifest.json',JSON.stringify({schema:'samur-manual.public-manifest',version:1,releaseId:release.id,publishedAt:null,generatedAt:release.created_at,contentHash:hash,packageHash,manualVersion:manual.manualVersionCurrent||manual.manualVersion||null,snapshot:{url:'/api/public/content',immutableUrl:`/api/public/releases/${release.id}/snapshot`},datasets}));
  const updates=JSON.parse(fields.find(([key])=>key==='updates')![1]) as MobileUpdateEvent[];
  await putPart(env,job.id,'release-metadata',JSON.stringify({metadata,hash,packageHash,changes:updates.map(e=>({kind:e.changeKind,title:e.summary,procedureIds:e.procedureIds}))}));
}
export async function auxiliaryArtifacts(env:JobEnv,job:Job,release:FrozenRelease) {
  const rows=(await env.DB.prepare('SELECT data_json FROM public_documents WHERE release_id=? ORDER BY id').bind(release.id).all<{data_json:string}>()).results;
  const ps=rows.map(r=>JSON.parse(r.data_json) as MobileProcedure);
  if(new Set(ps.map(p=>p.slug)).size!==ps.length) throw new Error('Rutas de procedimientos duplicadas.');
  await writeArtifact(env,release.id,'llms.txt',`# Manual SAMUR\n\nAdaptación no oficial.\n\n${ps.map(p=>`- [${p.id}: ${p.title}](/procedures/${p.slug}.md)`).join('\n')}`);
  await writeArtifact(env,release.id,'llms-full.txt',ps.map(p=>`# ${p.id}: ${p.title}\n\n${p.content}`).join('\n\n---\n\n'));
  const updates=JSON.parse(await readPart(env,job.id,'content:updates')) as MobileUpdateEvent[];
  const pdf=new jsPDF(); pdf.setFontSize(18); pdf.text('Manual SAMUR - Cambios',15,20); pdf.setFontSize(11); let y=30;
  for(const line of [release.summary,...updates.map(e=>`${e.changeKind}: ${e.summary}`)]) {
    for(const part of pdf.splitTextToSize(line,180)) { if(y>280) {pdf.addPage();y=20;} pdf.text(String(part),15,y);y+=6; } y+=4;
  }
  const bytes=new Uint8Array(pdf.output('arraybuffer'));
  await env.DB.prepare('DELETE FROM release_artifacts WHERE release_id=? AND name=\'changelog.pdf\'').bind(release.id).run();
  for(let at=0;at<bytes.length;at+=12000) { let binary=''; for(const b of bytes.subarray(at,at+12000)) binary+=String.fromCharCode(b); await env.DB.prepare('INSERT INTO release_artifacts VALUES(?,?,?,?)').bind(release.id,'changelog.pdf',at/12000,btoa(binary)).run(); }
  const state=JSON.parse(await readPart(env,job.id,'release-metadata'));
  const previous=release.parent_id ? (await env.DB.prepare("SELECT body FROM release_artifacts WHERE release_id=? AND name LIKE 'history/page-%' ORDER BY name,part").bind(release.parent_id).all<{body:string}>()).results:[];
  // Prior history is copied using its index/page boundaries, preserving complete events.
  const all=new Map(updates.map(e=>[e.eventId,e]));
  if(previous.length) {
    const names=(await env.DB.prepare("SELECT DISTINCT name FROM release_artifacts WHERE release_id=? AND name LIKE 'history/page-%' ORDER BY name").bind(release.parent_id).all<{name:string}>()).results;
    for(const {name} of names) {
      const body=(await env.DB.prepare('SELECT body FROM release_artifacts WHERE release_id=? AND name=? ORDER BY part').bind(release.parent_id,name).all<{body:string}>()).results.map(r=>r.body).join('');
      for(const event of JSON.parse(body).events as MobileUpdateEvent[]) if(!all.has(event.eventId)) all.set(event.eventId,event);
    }
  }
  const events=[...all.values()].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate));
  const totalPages=Math.max(1,Math.ceil(events.length/100));
  const base={schema:'samur-manual.mobile-history',version:1,publicationIdentity:state.packageHash,pageSize:100,totalEvents:events.length,totalPages};
  await writeArtifact(env,release.id,'history/index.json',JSON.stringify({...base,generatedAt:release.created_at,pages:Array.from({length:totalPages},(_,page)=>({page,path:`/mobile-history/${state.packageHash}/page-${String(page).padStart(4,'0')}.json`}))}));
  for(let page=0;page<totalPages;page++) await writeArtifact(env,release.id,`history/page-${String(page).padStart(4,'0')}.json`,JSON.stringify({...base,page,events:events.slice(page*100,(page+1)*100)}));
}
export async function activateRelease(env:JobEnv,job:Job,release:FrozenRelease) {
  await liveJob(env,job.id,job.generation);
  const state=JSON.parse(await readPart(env,job.id,'release-metadata'));
  // Triggers enforce parent compare-and-swap, preparing status and required artifacts.
  const visibility=release.parent_id ? env.DB.prepare("UPDATE publication_pointer SET release_id=? WHERE singleton=1 AND release_id=? AND EXISTS(SELECT 1 FROM releases WHERE id=? AND status='preparing') AND EXISTS(SELECT 1 FROM content_jobs WHERE id=? AND generation=? AND status='running')").bind(release.id,release.parent_id,release.id,job.id,job.generation) : env.DB.prepare("INSERT INTO publication_pointer SELECT 1,? WHERE NOT EXISTS(SELECT 1 FROM publication_pointer) AND EXISTS(SELECT 1 FROM releases WHERE id=? AND status='preparing') AND EXISTS(SELECT 1 FROM content_jobs WHERE id=? AND generation=? AND status='running')").bind(release.id,release.id,job.id,job.generation);
  await env.DB.batch([
    env.DB.prepare("UPDATE releases SET hash=?,package_hash=?,metadata_json=?,changelog_json=?,error=NULL WHERE id=? AND status='preparing' AND EXISTS(SELECT 1 FROM content_jobs WHERE id=? AND generation=? AND status='running')").bind(state.hash,state.packageHash,JSON.stringify({...state.metadata,releaseId:release.id,contentUrl:`/api/public/releases/${release.id}/snapshot`}),JSON.stringify(state.changes),release.id,job.id,job.generation),
    visibility,
  ]);
  // D1 affected-row counts include trigger work and differ from SQLite's
  // direct-statement count. The committed pointer is the authoritative result.
  const active=await env.DB.prepare('SELECT p.release_id,r.status,r.hash FROM publication_pointer p JOIN releases r ON r.id=p.release_id WHERE singleton=1').first<{release_id:string;status:string;hash:string}>();
  if(active?.release_id!==release.id || active.status!=='published' || active.hash!==state.hash) throw new Error('La publicación fue cancelada o su publicación padre ha cambiado.');
}
