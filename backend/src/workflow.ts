import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { Env } from './worker.ts';
import { liveJob, tasks } from './jobs.ts';
import { discover, checkTask } from './scraper.ts';
import { frozenRelease, compileDocument, compileRelations, assembleContent, publishDataset, finalizeRelease, auxiliaryArtifacts, activateRelease, type Frozen } from './publisher.ts';
export interface ContentParams { jobId:string;generation:number;stage?:string;cursor?:number }
export class ContentWorkflow extends WorkflowEntrypoint<Env,ContentParams> {
  async run(event:WorkflowEvent<ContentParams>,step:WorkflowStep) {
    const {jobId,generation}=event.payload;
    const stage=event.payload.stage||'start',cursor=event.payload.cursor||0;
    const next=async(nextStage:string,nextCursor=0)=>{
      await step.do('continue',async()=>{
        await liveJob(this.env,jobId,generation);
        try { await this.env.CONTENT_WORKFLOW!.create({id:`${jobId}-${generation}-${nextStage}-${nextCursor}`,params:{jobId,generation,stage:nextStage,cursor:nextCursor}}); }
        catch(error) { if(!/already exists|already_exists/i.test(String(error))) throw error; }
      });
    };
    try {
      const job=await step.do('start',async()=>{
        const job=await liveJob(this.env,jobId,generation);
        await this.env.DB.prepare("UPDATE content_jobs SET status='running',updated_at=? WHERE id=? AND generation=? AND status='queued'").bind(new Date().toISOString(),jobId,generation).run();
        return {...job,status:'running'};
      });
      if(job.kind==='check') {
        if(stage==='start') {await step.do('discover',()=>discover(this.env,job));await next('check');return;}
        const list=await step.do('tasks',()=>tasks(this.env,jobId));
        const batch=list.slice(cursor,cursor+4);
        for(let index=0;index<batch.length;index++) {
          const task=batch[index]; if(task.status==='completed') continue;
          await step.do(`check-${index}`,async()=>{
            await liveJob(this.env,jobId,generation);
            try {
              await checkTask(this.env,job,task);
              await this.env.DB.prepare("UPDATE content_job_tasks SET status='completed',error=NULL WHERE job_id=? AND id=?").bind(jobId,task.id).run();
            } catch(error) {
              const message=error instanceof Error?error.message.slice(0,400):'No se pudo comprobar esta fuente.';
              await this.env.DB.prepare("UPDATE content_job_tasks SET status='failed',error=? WHERE job_id=? AND id=?").bind(message,jobId,task.id).run();
            }
            await this.env.DB.prepare('UPDATE content_jobs SET updated_at=? WHERE id=? AND generation=?').bind(new Date().toISOString(),jobId,generation).run();
          });
          await step.sleep(`source-pause-${index}`,'1 second');
        }
        if(cursor+batch.length<list.length) {await next('check',cursor+batch.length);return;}
      } else {
        const scope=JSON.parse(job.scope_json) as {releaseId:string};
        const release=await step.do('release',()=>frozenRelease(this.env,scope.releaseId));
        const rows=await step.do('frozen-index',async()=> (await this.env.DB.prepare('SELECT rd.document_id,rd.revision,r.title,d.category FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision JOIN documents d ON d.id=rd.document_id WHERE rd.release_id=? ORDER BY rd.document_id').bind(release.id).all<Omit<Frozen,'data_json'>>()).results);
        const validIds=rows.filter(r=>r.category==='procedure').map(r=>r.document_id.slice(10));
        if(!validIds.length) throw new Error('No hay procedimientos para publicar.');
        if(stage==='start'||stage==='compile') {
          const ordered=[...rows.filter(r=>r.category==='dataset'),...rows.filter(r=>r.category==='procedure')];
          const batch=ordered.slice(cursor,cursor+12);
          for(let index=0;index<batch.length;index++) {
            const entry=batch[index];
            await step.do(`compile-${cursor+index}`,async()=>{
              const row=await this.env.DB.prepare('SELECT r.data_json FROM release_documents rd JOIN revisions r ON r.document_id=rd.document_id AND r.revision=rd.revision WHERE rd.release_id=? AND rd.document_id=?').bind(release.id,entry.document_id).first<{data_json:string}>();
              if(!row) throw new Error('Revisión congelada ausente.');
              await compileDocument(this.env,job,release,{...entry,data_json:row.data_json},cursor+index,validIds);
            });
          }
          if(cursor+batch.length<ordered.length) await next('compile',cursor+batch.length);else await next('relations');
          return;
        }
        if(stage==='relations') {
          for(let index=cursor;index<Math.min(cursor+20,validIds.length);index++) await step.do(`relations-${index}`,()=>compileRelations(this.env,job,release,`procedure:${validIds[index]}`));
          if(cursor+20<validIds.length) await next('relations',cursor+20);else await next('assemble');return;
        }
        if(stage==='assemble') {await step.do('assemble',()=>assembleContent(this.env,job,release));await next('datasets');return;}
        if(stage==='datasets') {
          const keys=['procedures','codes','drugs','perfusions','fluids','commercialNames','abbreviations','hospitals','bases','status4','manual','links','updates',...(rows.some(r=>r.document_id==='dataset:collaborators')?['collaborators']:[])];
          await step.do(`dataset-${cursor}`,()=>publishDataset(this.env,job,release,keys[cursor]));
          if(cursor+1<keys.length) await next('datasets',cursor+1);else await next('snapshot');return;
        }
        if(stage==='snapshot') {await step.do('snapshot-manifest',()=>finalizeRelease(this.env,job,release));await next('auxiliary');return;}
        if(stage==='auxiliary') {await step.do('history-pdf',()=>auxiliaryArtifacts(this.env,job,release));await next('activate');return;}
        if(stage!=='activate') throw new Error('Fase de publicación no válida.');
        await step.sleep('attachment-propagation','60 seconds');
        await step.do('activate',()=>activateRelease(this.env,job,release));
      }
      await step.do('complete',async()=>{
        const failed=await this.env.DB.prepare("SELECT COUNT(*) AS n FROM content_job_tasks WHERE job_id=? AND status='failed'").bind(jobId).first<{n:number}>();
        await this.env.DB.prepare("UPDATE content_jobs SET status=?,updated_at=? WHERE id=? AND generation=? AND status='running'").bind(failed?.n?'completed_with_warnings':'completed',new Date().toISOString(),jobId,generation).run();
      });
    } catch(error) {
      console.error('Content workflow stopped',error instanceof Error?error.name:'UnknownError');
      await step.do('record-failure',async()=>{
        const job=await this.env.DB.prepare('SELECT kind,scope_json FROM content_jobs WHERE id=? AND generation=?').bind(jobId,generation).first<{kind:string;scope_json:string}>();
        if(!job)return;
        await this.env.DB.prepare("UPDATE content_jobs SET status='failed',error='La tarea se interrumpió. Consulta los resultados y reintenta; la publicación anterior se conserva.',updated_at=? WHERE id=? AND generation=? AND status IN ('queued','running')").bind(new Date().toISOString(),jobId,generation).run();
        if(job.kind==='publish')await this.env.DB.prepare("UPDATE releases SET status='failed',error='No se pudo verificar la publicación en Cloudflare. La publicación anterior se conserva.' WHERE id=? AND status='preparing'").bind(JSON.parse(job.scope_json).releaseId).run();
      });
      throw new Error('La tarea de contenido no pudo completarse.');
    }
  }
}
