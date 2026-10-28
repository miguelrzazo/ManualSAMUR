export interface AccessConfig {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  EDITOR_EMAIL?: string;
}

type Jwk = JsonWebKey & { kid?: string };
const keyCache = new Map<string, { expires: number; keys: Jwk[] }>();

function decodePart(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid JWT encoding');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Verify at the origin too: knowing the hidden editor URL grants no access. */
export async function authenticate(request: Request, env: AccessConfig): Promise<string | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.EDITOR_EMAIL) return null;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return null;
  try {
    const [encodedHeader, encodedClaims, signature, extra] = token.split('.');
    if (extra || !encodedHeader || !encodedClaims || !signature) return null;
    const header = JSON.parse(new TextDecoder().decode(decodePart(encodedHeader))) as { alg?: string; kid?: string };
    const claims = JSON.parse(new TextDecoder().decode(decodePart(encodedClaims))) as {
      iss?: string; aud?: unknown; exp?: number; nbf?: number; email?: string;
    };
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || !header.kid || claims.iss !== issuer || !Array.isArray(claims.aud)
      || !claims.aud.includes(env.ACCESS_AUD) || typeof claims.exp !== 'number' || claims.exp <= now
      || (typeof claims.nbf === 'number' && claims.nbf > now + 30)
      || claims.email?.toLowerCase() !== env.EDITOR_EMAIL.toLowerCase()) return null;
    let cached = keyCache.get(issuer);
    if (!cached || cached.expires < Date.now()) {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const body = await response.json() as { keys?: Jwk[] };
      if (!Array.isArray(body.keys)) return null;
      cached = { expires: Date.now() + 300000, keys: body.keys };
      keyCache.set(issuer, cached);
    }
    const jwk = cached.keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) { keyCache.delete(issuer); return null; }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodePart(signature), new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`))
      ? claims.email! : null;
  } catch { return null; }
}
