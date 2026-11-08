"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScanSearch, RotateCcw, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { editorRequest } from "./types";
interface Job { id:string;status:string;created_at:string;updated_at:string;error?:string;actor:string;total:number;completed:number;failed:number }
interface Task { id:string;title:string;status:string;error?:string }
const labels:Record<string,string>={queued:"En cola",running:"Comprobando",completed:"Completada",completed_with_warnings:"Requiere revisión",failed:"Interrumpida",cancelled:"Cancelada"};
const date=(s:string)=>new Date(s).toLocaleString("es-ES",{dateStyle:"medium",timeStyle:"short"});
export function ChecksPanel({onReview,onOpenProposals}:{onReview:(id:string)=>void;onOpenProposals:()=>void}) {
  const [jobs,setJobs]=useState<Job[]>([]);
  const [next,setNext]=useState("");
  const [configured,setConfigured]=useState<boolean|null>(null);
  const [ids,setIds]=useState("");
  const [domain,setDomain]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [details,setDetails]=useState<Task[]>([]);
  const [extractions,setExtractions]=useState<Array<{name:string}>>([]);
  const [extractedText,setExtractedText]=useState("");
  const refresh=useCallback(async()=>{
    const result=await editorRequest<{jobs:Job[];configured:boolean;nextCheck:string}>("/checks");
    setJobs(result.jobs);setConfigured(result.configured);setNext(result.nextCheck);
  },[]);
  useEffect(()=>{
    let active=true;
    const update=()=>{if(active) refresh().catch(e=>setError(e.message));};
    const initial=setTimeout(update,0),timer=setInterval(update,10000);
    return()=>{active=false;clearTimeout(initial);clearInterval(timer);};
  },[refresh]);
  useEffect(()=>{
    if(!selected) return;
    let active=true;
    const update=()=>editorRequest<{tasks:Task[];extractions:Array<{name:string}>}>(`/checks/${selected}`).then(r=>{if(active){setDetails(r.tasks);setExtractions(r.extractions||[]);}}).catch(e=>{if(active)setError(e.message);});
    const initial=setTimeout(update,0),timer=setInterval(update,10000);
    return()=>{active=false;clearTimeout(initial);clearInterval(timer);};
  },[selected]);
  async function action(path:string,body:unknown={}) {
    setBusy(true);setError("");
    try {await editorRequest(path,"POST",body);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const running=jobs.some(j=>["queued","running"].includes(j.status));
  return <section className="flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2>Comprobaciones</h2><p className="text-muted-foreground">Consulta las fuentes oficiales y revisa sus propuestas antes de publicar.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>refresh().catch(e=>setError(e.message))}><RefreshCw data-icon="inline-start"/>Actualizar</Button><Button variant="outline" onClick={onOpenProposals}>Revisar propuestas<ArrowRight data-icon="inline-end"/></Button></div></div>
    {error&&<Alert variant="destructive"><AlertTitle>No se pudo completar la operación</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {configured===false&&<Alert><AlertTitle>Configuración pendiente</AlertTitle><AlertDescription>Las comprobaciones estarán disponibles cuando se configure el servicio de tareas y el almacén de adjuntos.</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>Buscar actualizaciones</CardTitle><CardDescription>Incluye procedimientos, vademécum, códigos y contenido principal. El proceso continúa aunque cierres esta página.</CardDescription></CardHeader><CardContent>
      <FieldGroup><Field><FieldLabel htmlFor="check-domain">Fuentes</FieldLabel><select id="check-domain" value={domain} onChange={e=>setDomain(e.target.value)}><option value="">Todo el manual</option><option value="procedures">Procedimientos</option><option value="vademecum">Vademécum</option><option value="codigos">Códigos y claves</option><option value="main">Contenido principal</option></select></Field>{(!domain || domain==="procedures")&&<Field><FieldLabel htmlFor="check-ids">Procedimientos concretos (opcional)</FieldLabel><Input id="check-ids" value={ids} onChange={e=>setIds(e.target.value)} placeholder="301, 121"/><FieldDescription>Si indicas identificadores, solo se revisarán esas fichas.</FieldDescription></Field>}</FieldGroup>
    </CardContent><CardFooter className="flex flex-wrap justify-between gap-3"><span className="text-muted-foreground">{next?`Próxima revisión mensual: ${date(next)} (hora local)`:"Cargando programación…"}</span><Button disabled={busy||running||configured!==true} onClick={()=>action("/checks",(!domain||domain==="procedures")&&ids.split(",").some(s=>s.trim())?{domains:["procedures"],ids:ids.split(",").map(s=>s.trim()).filter(Boolean)}:domain?{domains:[domain]}:{})}><ScanSearch data-icon="inline-start"/>{busy?"Solicitando…":"Comprobar ahora"}</Button></CardFooter></Card>
    {configured===null&&<p role="status">Cargando comprobaciones…</p>}
    {configured!==null&&!jobs.length&&<p className="text-muted-foreground">Todavía no hay comprobaciones. Inicia la primera para consultar las fuentes.</p>}
    {jobs.map(job=><Card key={job.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{date(job.created_at)}</CardTitle><Badge variant={job.failed||job.status==="failed"?"destructive":"secondary"}>{labels[job.status]||job.status}</Badge></div><CardDescription>{job.actor} · {job.completed}/{job.total} fuentes verificadas{job.failed?` · ${job.failed} requieren atención`:""}</CardDescription></CardHeader><CardContent><p>{job.error|| (job.status==="completed_with_warnings"?"La comprobación tiene fuentes pendientes de revisar. Consulta los detalles antes de considerar actualizado el manual.":job.status==="completed"?"Fuentes comprobadas. Las propuestas esperan tu revisión editorial.":"Los contenidos publicados se conservan mientras se comprueban las fuentes.")}</p>
      {selected===job.id&&extractions.length>0&&<div className="mt-3 flex flex-col gap-3"><p>Texto extraído de los PDF para revisión:</p>{extractions.map(item=><Button key={item.name} variant="outline" onClick={()=>editorRequest<{text:string;truncated:boolean}>(`/checks/${job.id}/extractions?name=${encodeURIComponent(item.name)}`).then(r=>setExtractedText(r.text+(r.truncated?"\n[Vista truncada]":""))).catch(e=>setError(e.message))}>{item.name.slice(4)}</Button>)}{extractedText&&<Textarea aria-label="Texto extraído del PDF" readOnly rows={12} value={extractedText}/>}</div>}
      {selected===job.id&&<ul className="mt-3 flex flex-col gap-3">{details.map(task=><li key={task.id} className="flex flex-col gap-1"><div className="flex flex-wrap items-center gap-2"><strong>{task.title}</strong><Badge variant="outline">{task.status==="completed"?"Verificada":task.status==="failed"?"Revisar":"Pendiente"}</Badge>{task.id.startsWith("procedure:")&&<Button variant="link" size="sm" onClick={()=>onReview(task.id)}>Revisar ficha<ArrowRight data-icon="inline-end"/></Button>}</div>{task.error&&<p className="text-muted-foreground">{task.error}</p>}</li>)}</ul>}
    </CardContent><CardFooter className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setDetails([]);setExtractedText("");setExtractions([]);setSelected(selected===job.id?null:job.id);}}>{selected===job.id?"Cerrar detalles":"Ver resultados"}</Button>{["failed","completed_with_warnings"].includes(job.status)&&<Button variant="outline" disabled={busy||running} onClick={()=>action(`/checks/${job.id}/retry`)}><RotateCcw data-icon="inline-start"/>Reintentar pendientes</Button>}{["queued","running"].includes(job.status)&&<Button variant="outline" disabled={busy} onClick={()=>action(`/checks/${job.id}/cancel`)}><X data-icon="inline-start"/>Cancelar</Button>}</CardFooter></Card>)}
  </section>;
}
