import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { xwikiToMarkdown, parseProcedureSpacesXml, resolveStableProcedureIdForSource, isContainerSpace, extractAttachmentLinks, rewriteAttachmentLinks, getSectionFromXWikiUrl } from '../../lib/manual-sync.ts';
import { parseAbbreviationsFromHtml, parseMainLinksFromHtml, parseCollaboratorsFromHtml } from '../../lib/main-content.ts';
import { parsePathologyCodes, parseRadioProcedure, reconcileCodeRecords, type ReferenceRecord } from '../../lib/reference-dataset-sync.ts';
import { mergeImportedDrugs, parseWikiDrugsFromHtml, extractVademecumAttachmentLinks, parsePerfusionsFromText, parseFluidsFromText, parseCommercialRowsFromText, type DrugRecord } from '../../lib/vademecum-sync.ts';
import { canonicalJson, type MobileProcedure } from '../../packages/manual-content/src/index.ts';
import { putPart, type JobEnv, type Job, type Task, type Scope } from './jobs.ts';
import { boundedBody, digest, officialFetch, officialUrl, retainAsset } from './storage.ts';
const BASE = 'https://servpub.madrid.es/manualsamur';
const MAIN = `${BASE}/bin/view/Menu/Cabecera%20principal`;
const encoder = new TextEncoder();
export async function sourceText(url: string) { return new TextDecoder().decode(await boundedBody(await officialFetch(url),1_500_000)); }
export async function propose(env: JobEnv, job: Job, id: string, title: string, data: unknown) {
  const body = canonicalJson(JSON.parse(JSON.stringify(data)));
  if (encoder.encode(body).length > 450000) throw new Error('Documento demasiado grande: requiere revisión manual.');
  const sourceHash = await digest(body);
  // Guard the final mutation too, so cancellation cannot race a slow source fetch.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO documents(id,category,title,data_json,status,source_json,source_hash,updated_at)
      SELECT ?,?,?,?,'draft',?,?,? WHERE EXISTS(SELECT 1 FROM content_jobs WHERE id=? AND generation=? AND status='running')
      ON CONFLICT(id) DO UPDATE SET incoming_source_json=excluded.source_json,revision=documents.revision+1,updated_at=excluded.updated_at,updated_by=NULL
      WHERE documents.source_hash IS NOT excluded.source_hash AND documents.incoming_source_json IS NOT excluded.source_json`).bind(id,id.startsWith('procedure:')?'procedure':'dataset',title,body,body,sourceHash,new Date().toISOString(),job.id,job.generation),
    env.DB.prepare(`UPDATE documents SET incoming_source_json=NULL,revision=revision+1,updated_at=?,updated_by=NULL WHERE id=? AND source_hash=? AND incoming_source_json IS NOT NULL AND EXISTS(SELECT 1 FROM content_jobs WHERE id=? AND generation=? AND status='running')`).bind(new Date().toISOString(),id,sourceHash,job.id,job.generation),
  ]);
}
export async function discover(env: JobEnv, job: Job) {
  const scope = JSON.parse(job.scope_json) as Scope;
  const domains = scope.domains || [];
  const pending = new Map<string,{id:string;title:string;payload:unknown}>();
  const add = (id:string,title:string,payload:unknown) => pending.set(id,{id,title,payload});
  if (domains.includes('procedures')) {
    const rows = (await env.DB.prepare("SELECT id,title,source_json,data_json FROM documents WHERE category='procedure'").all<{id:string;title:string;source_json:string|null;data_json:string}>()).results;
    const bySource = new Map(rows.map(r=>[String(JSON.parse(r.source_json||r.data_json).source),r.id]));
    for (const row of rows) {
      const p = JSON.parse(row.source_json||row.data_json) as MobileProcedure;
      if (!p.source || (scope.ids?.length && !scope.ids.includes(p.id))) continue;
      add(row.id,row.title,{type:'procedure',id:row.id,url:p.source,title:row.title});
    }
    for (const id of scope.ids || []) {
      if (!pending.has(`procedure:${id}`)) add(`missing:${id}`, `Procedimiento ${id}`, {type:'missing'});
    }
    // Selective checks do not need discovery and never infer withdrawals.
    if (!scope.ids?.length) {
      try {
        const xml = await sourceText(`${BASE}/rest/wikis/xwiki/spaces`);
        if (!/<(?:\w+:)?spaces\b/.test(xml) || !/<\/(?:\w+:)?spaces>/.test(xml)) throw new Error('Inventario incompleto.');
        const spaces = parseProcedureSpacesXml(xml);
        const allHtml=await sourceText(`${BASE}/bin/view/Main/AllDocs`);
        const $=cheerio.load(allHtml);
        if (!$('a[href*="/bin/view/"]').length) throw new Error('Inventario AllDocs incompleto.');
        $('a[href*="/bin/view/"]').each((_,el)=>{
          const href=$(el).attr('href')||'';
          const url=new URL(href,BASE).href.split('?')[0].replace(/\/WebHome$/,'');
          const parts=decodeURIComponent(new URL(url).pathname.split('/bin/view/')[1]||'').split('/').filter(Boolean);
          const title=parts.at(-1)||'';
          if(parts.length<2 || /^(?:xwiki|main|blog|menu|panels|webhome|otros|authservice|exportar)$/i.test(title)) return;
          const id=bySource.get(url)||resolveStableProcedureIdForSource(title,url);
          if(id && !spaces.some(s=>s.url===url)) spaces.push({title,url,section:getSectionFromXWikiUrl(url),depth:parts.length});
        });
        if(spaces.length<rows.length*0.8) throw new Error('Descubrimiento implausiblemente pequeño.');
        const inventory=[];
        for (const space of spaces.filter(s=>!isContainerSpace(s,spaces,c=>resolveStableProcedureIdForSource(c.title,c.url)!==null))) {
          const rawId = resolveStableProcedureIdForSource(space.title,space.url);
          const id = bySource.get(space.url) || (rawId ? `procedure:${rawId}` : '');
          if (!id) { add(`unassigned:${await digest(space.url)}`,space.title,{type:'unassigned',url:space.url}); continue; }
          add(id,space.title,{type:'procedure',id,url:space.url,title:space.title,section:space.section});
          inventory.push(env.DB.prepare('INSERT OR IGNORE INTO source_inventory VALUES(?,?,?)').bind(job.id,space.url,id));
        }
        for(let at=0;at<inventory.length;at+=50) await env.DB.batch(inventory.slice(at,at+50));
        // Discovery absence is only a review signal, never an automatic deletion.
        for(const row of rows) {
          const source=JSON.parse(row.source_json||row.data_json).source;
          if(source && !spaces.some(s=>s.url===source)) add(`withdrawal:${row.id}`,row.title,{type:'withdrawal',id:row.id});
        }
      } catch {
        add('discovery:inventory','Inventario de fuentes',{type:'discovery'});
      }
    }
  }
  if (domains.includes('main')) {
    add('dataset:abbreviations','Abreviaturas',{type:'abbreviations',url:`${MAIN}/Abreviaturas/WebHome`});
    add('dataset:links','Enlaces y edición del manual',{type:'links',url:`${BASE}/bin/view/Main/`});
    add('source:collaborators','Colaboradores',{type:'collaborators',url:`${MAIN}/Colaboradores/WebHome`});
  }
  if (domains.includes('vademecum')) add('dataset:drugs','Vademécum y documentos asociados',{type:'drugs',url:`${MAIN}/Vadem%C3%A9cum/WebHome`});
  if (domains.includes('codigos')) add('dataset:codes','Códigos y claves',{type:'codes'});
  const statements=[...pending.values()].map(t=>env.DB.prepare('INSERT OR IGNORE INTO content_job_tasks(job_id,id,title,payload_json) VALUES(?,?,?,?)').bind(job.id,t.id,t.title,JSON.stringify(t.payload)));
  for(let at=0;at<statements.length;at+=50) await env.DB.batch(statements.slice(at,at+50));
}
async function dataset(env:JobEnv,id:string) {
  const row=await env.DB.prepare('SELECT source_json,data_json FROM documents WHERE id=?').bind(`dataset:${id}`).first<{source_json:string|null;data_json:string}>();
  return row?JSON.parse(row.source_json||row.data_json).value:[];
}
async function pdfText(env:JobEnv,job:Job,url:string,id:string) {
  if(!env.AI) throw new Error('Conversión PDF sin configurar. El PDF original permanece disponible.');
  const asset=await retainAsset(env,url,decodeURIComponent(new URL(url).pathname.split('/').at(-1)||'adjunto.pdf'),id);
  const bytes=await env.CONTENT_ASSETS!.get(asset.sha256,'arrayBuffer');
  if(!bytes) throw new Error('PDF pendiente de propagación. Reintenta más tarde.');
  const result=await env.AI.toMarkdown({name:'document.pdf',blob:new Blob([bytes],{type:'application/pdf'})},{output:{format:'text'}});
  if(result.format==='error'||!result.data?.trim()) throw new Error('No se pudo extraer texto fiable del PDF. Revisión manual necesaria.');
  await putPart(env,job.id,`pdf:${id}`,result.data);
  return result.data;
}
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export async function checkTask(env: JobEnv, job: Job, task: Task) {
  const payload = JSON.parse(task.payload_json) as {type:string;url:string;id:string;title:string;section?:string};
  if (payload.type === 'missing') throw new Error('No hay una ficha con este identificador y una fuente oficial configurada.');
  if (payload.type === 'unassigned') throw new Error('Nueva fuente sin identificador estable. Asigna una ficha editorial antes de importarla.');
  if (payload.type === 'withdrawal') throw new Error('La ficha no aparece en el inventario completo. Comprueba la fuente y archiva manualmente si procede.');
  if (payload.type === 'discovery') throw new Error('Revisión manual: verificar inventario AllDocs y páginas anidadas. No se proponen bajas con descubrimiento parcial.');
  if (payload.type === 'codes') {
    const before=await dataset(env,'codes') as Record<string,ReferenceRecord[]>;
    const row=await env.DB.prepare("SELECT source_json,data_json FROM documents WHERE id='procedure:121'").first<{source_json:string|null;data_json:string}>();
    if(!row) throw new Error('Procedimiento 121 no disponible.');
    const p=JSON.parse(row.source_json||row.data_json) as MobileProcedure;
    const candidates={...before};
    const radio=parseRadioProcedure(p.content);
    candidates.claves=reconcileCodeRecords(before.claves||[],radio.claves);
    candidates.indicativos=reconcileCodeRecords(before.indicativos||[],radio.indicativos);
    candidates.incidente=reconcileCodeRecords(before.incidente||[],radio.incidente);
    for(const name of ['121_codigos_USVA.pdf','121_codigos_USVB.pdf','121_codigos_psicologia.pdf']) {
      const attachment=p.attachments.find(a=>a.filename===name);
      if(!attachment) throw new Error(`Falta el PDF ${name}.`);
      const parsed=parsePathologyCodes(await pdfText(env,job,attachment.sourceUrl,`dataset:codes:${name}`));
      if(name.includes('USVA')) {candidates.sva=reconcileCodeRecords(before.sva||[],parsed.filter(r=>!r.code.startsWith('AS.')));candidates.lima=reconcileCodeRecords(before.lima||[],parsed.filter(r=>r.code.startsWith('AS.')));}
      else if(name.includes('USVB')) {candidates.svb=reconcileCodeRecords(before.svb||[],parsed.filter(r=>!r.code.startsWith('P.')&&!r.code.startsWith('AS.')));candidates.upsq=reconcileCodeRecords(before.upsq||[],parsed.filter(r=>r.code.startsWith('P.')));}
      else candidates.upsi=reconcileCodeRecords(before.upsi||[],parsed);
    }
    await propose(env,job,'dataset:codes','Códigos',{value:candidates});return;
  }
  const html = await sourceText(payload.url);
  if (payload.type === 'procedure') {
    const row = await env.DB.prepare('SELECT data_json,source_json FROM documents WHERE id=?').bind(payload.id).first<{data_json:string;source_json:string|null}>();
    const previous = row ? JSON.parse(row.source_json || row.data_json) as MobileProcedure : null;
    const plain = await sourceText(`${payload.url.replace(/\/?$/,'/')}?xpage=plain&raw=1`);
    const $plain = cheerio.load(plain);
    const raw = $plain('pre').first().text();
    const $ = cheerio.load(html);
    let content = raw ? xwikiToMarkdown(raw) : new TurndownService({headingStyle:'atx'}).turndown($('#xwikicontent').html() || '');
    if (content.length < 100 || /xwiki:login|j_username|<html/i.test(content)) throw new Error('Contenido incompleto o no reconocido. Revisión manual necesaria.');
    const extracted = extractAttachmentLinks(raw || html,payload.url,payload.id.slice(10));
    const attachments = [];
    const mappings = [];
    const warnings: string[] = [];
    for (const attachment of extracted) {
      officialUrl(attachment.sourceUrl);
      let frozen;
      try { frozen = await retainAsset(env,attachment.sourceUrl,attachment.localPath.split('/').at(-1)||'adjunto',payload.id); }
      catch (error) {
        const retained = previous?.attachments.find(a=>a.sourceUrl===attachment.sourceUrl && a.sha256 && a.byteLength!==undefined);
        if (!retained) throw error;
        frozen = retained;
        warnings.push('Se conserva un adjunto anterior que no pudo verificarse de nuevo en origen.');
      }
      attachments.push({id:(await digest(`${payload.id}:${attachment.sourceUrl}`)).slice(0,16),sourceUrl:attachment.sourceUrl,...frozen});
      mappings.push({...attachment,localPath:frozen.localPath});
    }
    content = rewriteAttachmentLinks(content,mappings);
    if (previous && previous.content.length>1000 && content.length<previous.content.length*0.2) throw new Error('La fuente parece incompleta: revisión manual antes de proponer cambios.');
    const id = payload.id.slice(10);
    const title = payload.title || previous?.title || id;
    const slug = previous?.slug || `${id}-${title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'').slice(0,70)}`;
    const next: MobileProcedure = {...previous,id,title,slug,section:previous?.section||payload.section||'',routeKey:`procedure:${id}`,tags:previous?.tags||[],synonyms:previous?.synonyms||[],related:previous?.related||[],backlinks:previous?.backlinks||[],relations:previous?.relations||[],editorialBlocks:[],updated:previous?.updated||'',sourceUpdated:previous?.sourceUpdated||'',source:payload.url,attachments,content,searchText:content.replace(/[*#_`]/g,'').replace(/\s+/g,' ').trim()};
    await propose(env,job,payload.id,title,next);
    if (warnings.length) throw new Error(`${warnings.length} adjunto(s) conservados desde la revisión anterior; el candidato requiere revisión manual.`);
  } else if (payload.type === 'abbreviations') {
    const value = parseAbbreviationsFromHtml(html);
    if (value.length < 5) throw new Error('Lista de abreviaturas incompleta.');
    await propose(env,job,'dataset:abbreviations','Abreviaturas',{value});
  } else if (payload.type === 'links') {
    const value = parseMainLinksFromHtml(html);
    // Do not introduce a new change on every check just because of a timestamp.
    const row = await env.DB.prepare("SELECT source_json,data_json FROM documents WHERE id='dataset:links'").first<{source_json:string|null;data_json:string}>();
    const before = row ? JSON.parse(row.source_json||row.data_json).value : {};
    await propose(env,job,'dataset:links','Enlaces oficiales',{value:{...value,updatedAt:before.updatedAt||''}});
    if (value.manualVersion) await propose(env,job,'dataset:manual','Versión del manual',{value:{manualVersion:value.manualVersion,manualVersionCurrent:value.manualVersion}});
  } else if (payload.type === 'collaborators') {
    const value = parseCollaboratorsFromHtml(html);
    await propose(env,job,'dataset:collaborators','Colaboradores',{value});
  } else if (payload.type === 'drugs') {
    const row = await env.DB.prepare("SELECT source_json,data_json FROM documents WHERE id='dataset:drugs'").first<{source_json:string|null;data_json:string}>();
    const before = row ? JSON.parse(row.source_json||row.data_json).value as DrugRecord[] : [];
    const imported = parseWikiDrugsFromHtml(html);
    if (imported.length < before.length*0.8 || imported.length < 20) throw new Error('Vademécum incompleto. Se conserva la versión anterior.');
    const value = mergeImportedDrugs(before,imported);
    await propose(env,job,'dataset:drugs','Vademécum',{value});
    const links = extractVademecumAttachmentLinks(html);
    const drugs=value;
    const drugId=(name:string)=>drugs.find(d=>[d.name,...d.synonyms].some(s=>norm(s)===norm(name)))?.id;
    if(!links.perfusionsPdf||!links.fluidsPdf||!links.commercialNamesPdf) throw new Error('Vademécum HTML propuesto, pero faltan enlaces a tablas PDF. Revisión manual necesaria.');
    const perfusions=parsePerfusionsFromText(await pdfText(env,job,links.perfusionsPdf,'dataset:perfusions'));
    const fluids=parseFluidsFromText(await pdfText(env,job,links.fluidsPdf,'dataset:fluids'));
    const commercial=parseCommercialRowsFromText(await pdfText(env,job,links.commercialNamesPdf,'dataset:commercialNames'));
    const oldPerf=await dataset(env,'perfusions') as Array<Record<string,unknown>>;
    const oldFluids=await dataset(env,'fluids') as Array<Record<string,unknown>>;
    const oldCommercial=await dataset(env,'commercialNames') as Array<Record<string,unknown>>;
    // Column extraction must be complete before making any structured PDF proposal.
    if(perfusions.length<Math.max(3,oldPerf.length*0.8)||fluids.length<Math.max(3,oldFluids.length*0.8)||commercial.length<Math.max(3,oldCommercial.length*0.8)) throw new Error('Tablas PDF ambiguas o incompletas. Se conserva el texto extraído para revisión y los datos aprobados siguen vigentes.');
    const nextPerf=perfusions.map(r=>{
      const before=oldPerf.find(p=>norm(String(p.drug))===norm(r.drug));
      return {...before,id:before?.id||`${drugId(r.drug)||norm(r.drug)}-perf`,drug:r.drug,drugId:drugId(r.drug)||'',category:before?.category||'Otros',indication:`Dosis anexo: ${r.dose}`,dilucion:r.dilution,rate:r.infusionRate,preparacion:r.presentation,notes:before?.notes||''};
    });
    const nextFluids=fluids.map(r=>{
      const before=oldFluids.find(p=>norm(String(p.name))===norm(r.name));
      return {...before,...r,id:before?.id||norm(r.name),presentation:before?.presentation||'',type:before?.type||'Cristaloide',sodium:r.sodium||'',chloride:r.chloride||'',glucose:r.glucose||'',calcium:before?.calcium||'',potassium:before?.potassium||'',lactate:before?.lactate||'',ph:r.ph||''};
    });
    const nextCommercial=commercial.map(r=>({...r,drugId:drugId(r.activeIngredient)||''}));
    if(nextCommercial.some(r=>!r.drugId)||new Set(nextPerf.map(r=>r.id)).size!==nextPerf.length||new Set(nextFluids.map(r=>r.id)).size!==nextFluids.length) throw new Error('Identidades ambiguas en tablas PDF: revisión manual necesaria.');
    await propose(env,job,'dataset:perfusions','Perfusiones',{value:nextPerf});
    await propose(env,job,'dataset:fluids','Fluidos',{value:nextFluids});
    await propose(env,job,'dataset:commercialNames','Nombres comerciales',{value:nextCommercial});
  }
}
