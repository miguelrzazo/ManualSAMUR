import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildMobileContentSnapshot } from '../lib/mobile-snapshot.ts';
import { importDocuments } from '../scripts/backend/core.ts';
import { isMobileContentSnapshot } from '../packages/manual-content/src/index.ts';
import { githubAuth, githubIdentity } from '../backend/src/github-auth.ts';
import { checkScope, enqueueJob, textChunks, readPart, type JobEnv, type Job } from '../backend/src/jobs.ts';
import { officialUrl, assetResponse, retainAsset } from '../backend/src/storage.ts';
import { propose } from '../backend/src/scraper.ts';
import { frozenRelease, frozenRows, compileDocument, compileRelations, assembleContent, publishDataset, finalizeRelease, auxiliaryArtifacts, activateRelease } from '../backend/src/publisher.ts';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
function database() {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of fs.readdirSync('backend/migrations').filter(n=>n.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(`backend/migrations/${name}`,'utf8'));
  const prepare=(sql:string)=>{
    let args:unknown[]=[];
    const statement={bind(...values:unknown[]){args=values;return statement;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args),success:true};},async run(){return {success:true,meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};
    return statement;
  };
  const DB={prepare,async batch(statements:Array<{run:()=>Promise<unknown>}>){sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const values=new Map<string,ArrayBuffer>();
  const CONTENT_ASSETS={async put(k:string,v:Uint8Array){values.set(k,v.slice().buffer);},async get(k:string,type:string){const v=values.get(k);return v?(type==='stream'?new Response(v).body:v):null;}};
  return {sqlite,values,env:{DB,CONTENT_ASSETS,CONTENT_WORKFLOW:{async create(){}}} as unknown as JobEnv};
}
test('check scope, source URL allowlist and UTF-16 chunk boundaries reject unsafe input',()=>{
  assert.throws(()=>checkScope({domains:['unknown']}));assert.throws(()=>checkScope({ids:['../private']}));
  for(const u of ['https://evil.test/manualsamur/','https://servpub.madrid.es.evil.test/manualsamur/','http://servpub.madrid.es/manualsamur/','https://user:pass@servpub.madrid.es/manualsamur/'])assert.throws(()=>officialUrl(u));
  const input='a'.repeat(11999)+'😀'.repeat(20000);assert.equal(textChunks(input).join(''),input);
  assert.ok(textChunks(input).every(s=>!/[\uD800-\uDBFF]$/.test(s)));
});
test('proposals preserve human edits and stop mutating after cancellation',async()=>{
  const {env,sqlite}=database();const id=await enqueueJob(env,'check',{domains:['procedures']},'owner');
  sqlite.prepare("UPDATE content_jobs SET status='running' WHERE id=?").run(id);
  const job=sqlite.prepare('SELECT * FROM content_jobs WHERE id=?').get(id) as Job;
  const p={id:'301',content:'Source one'};
  await propose(env,job,'procedure:301','Original',p);
  sqlite.prepare("UPDATE documents SET data_json=?,private_notes='private',revision=revision+1 WHERE id='procedure:301'").run(JSON.stringify({...p,content:'Human edit'}));
  await propose(env,job,'procedure:301','Source two',{...p,content:'Source two'});
  let row=sqlite.prepare("SELECT * FROM documents WHERE id='procedure:301'").get();
  assert.equal(JSON.parse(row.data_json).content,'Human edit');assert.equal(row.private_notes,'private');assert.equal(JSON.parse(row.incoming_source_json).content,'Source two');
  const revision=row.revision;await propose(env,job,'procedure:301','Source two',{...p,content:'Source two'});
  assert.equal(sqlite.prepare("SELECT revision FROM documents WHERE id='procedure:301'").get().revision,revision);
  sqlite.prepare("UPDATE content_jobs SET status='cancelled',generation=generation+1 WHERE id=?").run(id);
  await propose(env,job,'procedure:301','Late',{...p,content:'Late'});
  row=sqlite.prepare("SELECT * FROM documents WHERE id='procedure:301'").get();assert.equal(JSON.parse(row.incoming_source_json).content,'Source two');
});
test('PDF retention, private/public authorization and range bytes use immutable verified content',async()=>{
  const {env,sqlite}=database();const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('%PDF-1.7\nfixture',{headers:{'Content-Type':'application/pdf'}});
  try {
    const asset=await retainAsset(env,'https://servpub.madrid.es/manualsamur/bin/download/test.pdf','test.pdf','procedure:301');
    const req=new Request(`https://manual.test${asset.localPath}`,{headers:{Range:'bytes=0-4'}});
    assert.equal((await assetResponse(req,env,asset.sha256,false)).status,404);
    const privateResponse=await assetResponse(req,env,asset.sha256,true);assert.equal(privateResponse.status,206);assert.equal(await privateResponse.text(),'%PDF-');
    sqlite.prepare("INSERT INTO releases(id,status,summary,created_at) VALUES('approved','published','ok','2026-11-01')").run();
    sqlite.prepare("INSERT INTO content_asset_refs VALUES(?,'procedure:301','approved')").run(asset.sha256);
    assert.equal((await assetResponse(req,env,asset.sha256,false)).status,206);
  }finally{globalThis.fetch=original;}
});
test('GitHub login binds single-use PKCE state to the browser and authorizes verified email only',async()=>{
  const {env,sqlite}=database();
  const config={...env,GITHUB_CLIENT_ID:'client',GITHUB_CLIENT_SECRET:'secret-fixture',EDITOR_EMAIL:'owner@example.test',AUTH_ORIGIN:'https://manual.test'};
  const original=globalThis.fetch;let verified=true;let email='owner@example.test';
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/access_token')){assert.ok(String(init?.body).includes('code_verifier='));return Response.json({access_token:'ephemeral-github-token',scope:'user:email'});}
    if(url.endsWith('/user/emails'))return Response.json([{email,verified,primary:true}]);
    return Response.json({id:1234});
  };
  const start=()=>githubAuth(new Request('https://manual.test/auth/github'),config,'/auth/github');
  const finish=async(response:Response)=>{
    const location=new URL(response.headers.get('Location')!);assert.equal(location.searchParams.get('scope'),'user:email');assert.equal(location.searchParams.get('code_challenge_method'),'S256');
    const state=location.searchParams.get('state')!;
    assert.ok(!sqlite.prepare('SELECT hash FROM oauth_states').all().some((r:{hash:string})=>r.hash===state));
    const request=new Request(`https://manual.test/auth/github/callback?code=fixture-code&state=${state}`,{headers:{Cookie:`__Host-manual_oauth=${state}`}});
    const result=await githubAuth(request,config,'/auth/github/callback');
    assert.equal((await githubAuth(request,config,'/auth/github/callback')).status,401,'code/state replay rejected');
    return result;
  };
  try{
    const initial=await start();
    const state=new URL(initial.headers.get('Location')!).searchParams.get('state');
    assert.equal((await githubAuth(new Request(`https://manual.test/auth/github/callback?code=fixture-code&state=${state}`),config,'/auth/github/callback')).status,401,'missing browser cookie rejected');
    const loggedIn=await finish(initial);assert.equal(loggedIn.status,302);
    const cookies=loggedIn.headers.getSetCookie();const sessionCookie=cookies.find(c=>c.startsWith('__Host-manual_session='))!.split(';')[0];
    assert.match(cookies.join(';'),/HttpOnly/);assert.match(cookies.join(';'),/Secure/);
    const request=new Request('https://manual.test/api/editor/session',{headers:{Cookie:sessionCookie}});
    assert.equal(await githubIdentity(request,config),email);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM editorial_sessions WHERE hash LIKE ?').get('%ephemeral-github-token%').n,0);
    assert.equal((await githubAuth(request,config,'/auth/logout')).status,405,'navigation cannot log out a session');
    const logoutRequest = (origin: string) => new Request('https://manual.test/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:sessionCookie}});
    assert.equal((await githubAuth(logoutRequest('https://other.test'),config,'/auth/logout')).status,401);
    assert.equal(await githubIdentity(request,config),email);
    const logout=await githubAuth(logoutRequest('https://manual.test'),config,'/auth/logout');assert.equal(logout.status,303);assert.equal(await githubIdentity(request,config),null);
    verified=false;assert.equal((await finish(await start())).status,401,'unverified owner email rejected');
    verified=true;email='stranger@example.test';assert.equal((await finish(await start())).status,401,'unlisted verified email rejected');
  }finally{globalThis.fetch=original;}
});
test('real corpus compiles a native-verifiable release entirely from frozen D1 revisions',async()=>{
  const {env,sqlite}=database();
  const snapshot=buildMobileContentSnapshot();
  const docs=importDocuments(snapshot);
  const insert=sqlite.prepare("INSERT INTO documents(id,category,title,data_json,status,updated_at,private_notes) VALUES(?,?,?,?,'ready','2026-11-01','NEVER PUBLIC')");
  for(const d of docs)insert.run(d.id,d.category,d.title,JSON.stringify(d.data));
  sqlite.prepare("INSERT INTO releases(id,status,summary,created_at) VALUES('release-test','preparing','Prueba de publicación','2026-11-01T12:00:00.000Z')").run();
  sqlite.prepare("INSERT INTO release_documents SELECT 'release-test',id,revision FROM documents WHERE status='ready'").run();
  const id=await enqueueJob(env,'publish',{releaseId:'release-test'},'owner');sqlite.prepare("UPDATE content_jobs SET status='running' WHERE id=?").run(id);
  const job=sqlite.prepare('SELECT * FROM content_jobs WHERE id=?').get(id) as Job;
  const release=await frozenRelease(env,'release-test');const rows=await frozenRows(env,release.id);const ids=rows.filter(r=>r.category==='procedure').map(r=>r.document_id.slice(10));
  const phases:Array<[string,()=>Promise<unknown>]> = [];
  for(let i=0;i<rows.length;i++)phases.push([`document ${rows[i].document_id}`,()=>compileDocument(env,job,release,rows[i],i,ids)]);
  for(const p of ids)phases.push([`relations ${p}`,()=>compileRelations(env,job,release,`procedure:${p}`)]);
  phases.push(['assemble',()=>assembleContent(env,job,release)]);
  for(const key of ['procedures','codes','drugs','perfusions','fluids','commercialNames','abbreviations','hospitals','bases','status4','manual','links','updates'])phases.push([`dataset ${key}`,()=>publishDataset(env,job,release,key)]);
  phases.push(['finalize',()=>finalizeRelease(env,job,release)],['auxiliary',()=>auxiliaryArtifacts(env,job,release)]);
  const timings=[];
  for(const [name,run] of phases){const at=performance.now();await run();const ms=performance.now()-at;if(ms>10)timings.push({name,ms:Math.round(ms)});}
  const body=sqlite.prepare("SELECT body FROM release_artifacts WHERE release_id='release-test' AND name='snapshot.json' ORDER BY part").all().map((r:{body:string})=>r.body).join('');
  assert.ok(!body.includes('NEVER PUBLIC'));assert.ok(isMobileContentSnapshot(JSON.parse(body)),'native hash/shape contract');
  const manifest=JSON.parse(sqlite.prepare("SELECT body FROM release_artifacts WHERE release_id='release-test' AND name='manifest.json' ORDER BY part").all().map((r:{body:string})=>r.body).join(''));
  assert.equal(Object.keys(manifest.datasets).length,22);
  console.log('Local wall-time phase samples (not Cloudflare CPU measurements):',JSON.stringify(timings));
  // A cancelled job may never change visibility.
  sqlite.prepare("UPDATE content_jobs SET status='cancelled',generation=generation+1 WHERE id=?").run(id);
  await assert.rejects(()=>activateRelease(env,job,release));assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM publication_pointer').get().n,0);
  assert.ok((await readPart(env,job.id,'release-metadata')).includes('packageHash'));
  sqlite.prepare("UPDATE content_jobs SET status='running',generation=? WHERE id=?").run(job.generation,job.id);
  await activateRelease(env,job,release);
  assert.equal(sqlite.prepare('SELECT release_id FROM publication_pointer').get().release_id,release.id);
  await activateRelease(env,job,release); // Retry after an acknowledged commit is idempotent.
});
