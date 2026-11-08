import type { D1Database } from '@cloudflare/workers-types';
import { digest } from './storage.ts';
export interface GithubAuthConfig {
  DB:D1Database;
  GITHUB_CLIENT_ID?:string;
  GITHUB_CLIENT_SECRET?:string;
  EDITOR_EMAIL?:string;
  AUTH_ORIGIN?:string;
}
const SESSION='__Host-manual_session';
const STATE='__Host-manual_oauth';
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
function randomToken() {return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function cookie(request:Request,name:string) {
  const value=request.headers.get('Cookie')||'';if(value.length>32768)return null;
  return value.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${name}=`))?.slice(name.length+1)||null;
}
function setCookie(name:string,value:string,age:number,path='/') {return `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;}
function redirect(location:string,cookies:string[]=[],status=302) {
  const headers=new Headers({'Location':location,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});
  for(const item of cookies)headers.append('Set-Cookie',item);
  return new Response(null,{status,headers});
}
function denied(message:string,cookies:string[]=[]) {
  const headers=new Headers({'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  for(const item of cookies)headers.append('Set-Cookie',item);
  return new Response(message,{status:401,headers});
}
export function githubConfigured(env:GithubAuthConfig) {return !!env.GITHUB_CLIENT_ID&&!!env.GITHUB_CLIENT_SECRET&&!!env.EDITOR_EMAIL;}
export async function githubIdentity(request:Request,env:GithubAuthConfig):Promise<string|null> {
  const token=cookie(request,SESSION);if(!token||!tokenPattern.test(token)||!githubConfigured(env))return null;
  const row=await env.DB.prepare('SELECT email FROM editorial_sessions WHERE hash=? AND expires_at>?').bind(await digest(token),Math.floor(Date.now()/1000)).first<{email:string}>();
  return row?.email||null;
}
export async function githubAuth(request:Request,env:GithubAuthConfig,path:string):Promise<Response> {
  const origin=env.AUTH_ORIGIN||new URL(request.url).origin;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== origin) return redirect(new URL(path, origin).href);
  const callback=`${origin}/auth/github/callback`;
  if(path==='/auth/logout') {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (request.headers.get('Origin') !== origin) return denied('Origen no autorizado.');
    const token=cookie(request,SESSION);
    if(token&&tokenPattern.test(token))await env.DB.prepare('DELETE FROM editorial_sessions WHERE hash=?').bind(await digest(token)).run();
    return redirect('/',[setCookie(SESSION,'',0),setCookie(STATE,'',0)],303);
  }
  if(request.method!=='GET')return new Response(null,{status:405});
  if(!githubConfigured(env))return new Response('El acceso con GitHub está pendiente de configurar.',{status:503,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
  const now=Math.floor(Date.now()/1000);
  if(path==='/auth/github') {
    const state=randomToken(),verifier=randomToken();
    const hex=await digest(verifier);
    const challenge=btoa(String.fromCharCode(...Uint8Array.from(hex.match(/../g)!,h=>parseInt(h,16)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<=?').bind(now),
      env.DB.prepare('DELETE FROM editorial_sessions WHERE expires_at<=?').bind(now),
      env.DB.prepare('INSERT INTO oauth_states VALUES(?,?,?)').bind(await digest(state),verifier,now+600),
    ]);
    const url=new URL('https://github.com/login/oauth/authorize');
    url.search=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID!,redirect_uri:callback,scope:'user:email',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
    return redirect(url.href,[setCookie(STATE,state,600)]);
  }
  if(path!=='/auth/github/callback')return new Response(null,{status:404});
  const query=new URL(request.url).searchParams;
  const state=query.get('state')||'',stateCookie=cookie(request,STATE),code=query.get('code')||'';
  const clear=[setCookie(STATE,'',0)];
  if(!tokenPattern.test(state)||state!==stateCookie||!code||code.length>500)return denied('No se pudo verificar el inicio de sesión. Vuelve a entrar desde Administración.',clear);
  const nonce=await env.DB.prepare('DELETE FROM oauth_states WHERE hash=? AND expires_at>? RETURNING verifier').bind(await digest(state),now).first<{verifier:string}>();
  if(!nonce)return denied('El enlace de acceso ha caducado o ya fue utilizado. Vuelve a entrar desde Administración.',clear);
  try {
    const tokenResponse=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID!,client_secret:env.GITHUB_CLIENT_SECRET!,code,redirect_uri:callback,code_verifier:nonce.verifier}),signal:AbortSignal.timeout(10000)});
    if(!tokenResponse.ok)throw new Error('OAuth exchange failed');
    const access=await tokenResponse.json() as {access_token?:string;scope?:string};
    if(!access.access_token)throw new Error('OAuth token missing');
    const headers={Authorization:`Bearer ${access.access_token}`,Accept:'application/vnd.github+json','User-Agent':'ManualSAMUR-Editorial','X-GitHub-Api-Version':'2022-11-28'};
    const [profileResponse,emailsResponse]=await Promise.all([
      fetch('https://api.github.com/user',{headers,signal:AbortSignal.timeout(10000)}),
      fetch('https://api.github.com/user/emails',{headers,signal:AbortSignal.timeout(10000)}),
    ]);
    if(!profileResponse.ok||!emailsResponse.ok)throw new Error('GitHub identity unavailable');
    const profile=await profileResponse.json() as {id?:number};
    const emails=await emailsResponse.json() as Array<{email:string;verified:boolean;primary:boolean}>;
    if(!Number.isSafeInteger(profile.id)||!Array.isArray(emails))throw new Error('Invalid identity');
    const verified=emails.filter(e=>e.verified&&typeof e.email==='string'&&/^[^\s@]+@[^\s@]+$/.test(e.email)).map(e=>e.email.toLowerCase());
    let email=verified.find(e=>e===env.EDITOR_EMAIL!.toLowerCase());
    if(!email)for(const candidate of verified){const allowed=await env.DB.prepare('SELECT email FROM editors WHERE email=? AND active=1').bind(candidate).first<{email:string}>();if(allowed){email=allowed.email;break;}}
    if(!email)return denied('Tu cuenta de GitHub no tiene un correo verificado autorizado para editar este manual.',clear);
    const token=randomToken();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO editorial_sessions VALUES(?,?,?,?)').bind(await digest(token),email,profile.id!,now+8*60*60),
      env.DB.prepare('INSERT INTO audit_log(at,actor,action,target,detail) VALUES(?,?,?,?,?)').bind(new Date().toISOString(),email,'session.login','github',''),
    ]);
    // The GitHub token is discarded. Each later request rechecks editorial roles.
    return redirect('/gestion-editorial',[...clear,setCookie(SESSION,token,8*60*60)]);
  }catch{
    return denied('GitHub no pudo completar el acceso. Reintenta desde Administración.',clear);
  }
}
