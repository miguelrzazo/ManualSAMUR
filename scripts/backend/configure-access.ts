/** CLI provisioning for Access, which Wrangler does not provision itself.
 * https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/
 * Credentials come only from the environment; never from argv or logs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, EDITOR_EMAIL: email,
  ACCESS_TEAM_DOMAIN: team, PUBLICATION_ORIGIN: origin } = process.env;
const environment = process.argv[2] || 'production';
if (!account || !token || !email || !team || !origin) throw new Error('Load account/token, EDITOR_EMAIL, ACCESS_TEAM_DOMAIN and PUBLICATION_ORIGIN securely from the environment.');
if (!['production', 'staging'].includes(environment) || !/^[^\s@]+@[^\s@]+$/.test(email)
  || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) throw new Error('Invalid environment or Access identity configuration.');
const url = new URL(origin);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('PUBLICATION_ORIGIN must be an HTTPS origin.');
async function api<T>(route: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/access/${route}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  const result = await response.json() as { success: boolean; result: T };
  if (!response.ok || !result.success) throw new Error(`Access provisioning failed (${response.status}); check Access: Apps and Policies permissions.`);
  return result.result;
}
interface Application { id: string; name: string; domain: string; aud: string }
const name = `ManualSAMUR editor ${environment}`;
const domain = `${url.hostname}/gestion-editorial`;
const existing = (await api<Application[]>('apps?per_page=1000')).find((app) => app.domain === domain);
if (existing && existing.name !== name) throw new Error('Another Access application already owns this path; refusing to modify it.');
const config = { name, domain, type: 'self_hosted', app_launcher_visible: false, session_duration: '8h',
  self_hosted_domains: [domain, `${domain}/*`, `${url.hostname}/api/editor/*`] };
const app = existing ? await api<Application>(`apps/${existing.id}`, 'PUT', config) : await api<Application>('apps', 'POST', config);
const policy = { name: 'Única identidad editorial', decision: 'allow', precedence: 1, include: [{ email: { email } }] };
const policies = await api<Array<{ id: string; name: string }>>(`apps/${app.id}/policies`);
if (policies.length > 1 || (policies.length === 1 && policies[0].name !== policy.name))
  throw new Error('Unexpected Access policies exist; refusing to change another access policy.');
if (policies.length) await api(`apps/${app.id}/policies/${policies[0].id}`, 'PUT', policy);
else await api(`apps/${app.id}/policies`, 'POST', policy);
if (!app.aud) throw new Error('Access did not return an audience. Worker remains closed until configured.');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-access-'));
try {
  const secrets = path.join(directory, 'secrets.json');
  fs.writeFileSync(secrets, JSON.stringify({ EDITOR_EMAIL: email, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: app.aud }), { mode: 0o600 });
  const result = spawnSync(process.execPath, [path.resolve('node_modules/wrangler/bin/wrangler.js'), 'secret', 'bulk', secrets, '--env', environment], {
    stdio: 'inherit', env: { ...process.env, WRANGLER_LOG_PATH: path.join(directory, 'wrangler.log') },
  });
  if (result.status !== 0) throw new Error('Access application prepared, but Worker secrets still need configuring.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
console.log('Private editor access configured. Verify owner login and anonymous rejection before use.');
