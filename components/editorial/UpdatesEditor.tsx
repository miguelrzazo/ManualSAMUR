"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { MobileUpdateEvent } from "@/packages/manual-content/src/index";
import { RichTextEditor } from "./RichTextEditor";
export function UpdatesEditor({value,onChange}:{value:MobileUpdateEvent[];onChange:(events:MobileUpdateEvent[])=>void}) {
  function update(index:number,patch:Partial<MobileUpdateEvent>) {onChange(value.map((e,i)=>i===index?{...e,...patch}:e));}
  return <div className="flex flex-col gap-4"><p>Los anuncios se guardan como borradores. Se harán públicos al revisar y publicar esta ficha.</p>
    <Button variant="outline" onClick={()=>onChange([{eventId:crypto.randomUUID(),procedureIds:[],changeKind:"actualizado",summary:"Nueva actualización",effectiveDate:new Date().toISOString(),category:"procedure",scope:"procedimiento"},...value])}>Añadir anuncio</Button>
    {value.map((event,index)=><Card key={event.eventId}><CardHeader><CardTitle>Anuncio {index+1}</CardTitle><CardDescription>{event.eventId}</CardDescription></CardHeader><CardContent><FieldGroup>
      <Field><FieldLabel htmlFor={`summary-${index}`}>Resumen público</FieldLabel><Textarea id={`summary-${index}`} value={event.summary} onChange={e=>update(index,{summary:e.target.value})}/></Field>
      <Field><FieldLabel htmlFor={`procedures-${index}`}>Procedimientos relacionados</FieldLabel><Input id={`procedures-${index}`} value={event.procedureIds.join(", ")} onChange={e=>update(index,{procedureIds:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})}/></Field>
      <Field><FieldLabel htmlFor={`date-${index}`}>Fecha efectiva</FieldLabel><Input id={`date-${index}`} type="date" value={event.effectiveDate.slice(0,10)} onChange={e=>{if(e.target.value)update(index,{effectiveDate:`${e.target.value}T00:00:00.000Z`});}}/></Field>
      <Field><FieldLabel>Detalle del cambio</FieldLabel><RichTextEditor key={event.eventId} content={event.diff||""} onChange={diff=>update(index,{diff})}/></Field>
    </FieldGroup></CardContent><CardFooter><Button variant="destructive" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Retirar anuncio del borrador</Button></CardFooter></Card>)}
  </div>;
}
