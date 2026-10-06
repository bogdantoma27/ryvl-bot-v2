import { randomBytes, timingSafeEqual } from 'crypto';

// OAuth `state` = "<origin>.<nonce>". The nonce is also stored in a short-lived HttpOnly
// cookie set by /discord/start; the callback only proceeds when both match, so a login
// cannot be completed in a browser that did not start it (login CSRF).

export const OAUTH_STATE_COOKIE = 'ryvl_oauth_state';
export const OAUTH_STATE_MAX_AGE_SECONDS = 600;

export type OAuthOrigin = 'bot' | 'web';

export function createOAuthState(origin: OAuthOrigin): { state: string; nonce: string } {
  const nonce = randomBytes(24).toString('base64url');
  return { state: `${origin}.${nonce}`, nonce };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // Malformed cookie values are ignored rather than failing the request.
    }
  }
  return cookies;
}

/** Returns the origin encoded in a valid state, or null when state and cookie disagree. */
export function verifyOAuthState(state: unknown, cookieNonce: string | undefined): OAuthOrigin | null {
  if (typeof state !== 'string' || !cookieNonce) return null;
  const match = /^(bot|web)\.([A-Za-z0-9_-]{16,64})$/.exec(state);
  if (!match) return null;
  const expected = Buffer.from(cookieNonce);
  const received = Buffer.from(match[2]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return match[1] as OAuthOrigin;
}

/**
 * Cookie attributes for the state cookie. The callback runs on the host of the registered
 * redirect URI; when login starts on a subdomain of it (bot.ryvl.top -> ryvl.top), the
 * cookie is scoped to the parent domain so the callback receives it.
 */
export function stateCookieOptions(redirectUri: string, startHost: string | undefined) {
  const redirect = new URL(redirectUri);
  const host = (startHost || '').split(':')[0].toLowerCase();
  const callbackHost = redirect.hostname.toLowerCase();
  return {
    httpOnly: true,
    secure: redirect.protocol === 'https:',
    sameSite: 'lax' as const,
    path: '/api/auth/discord',
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS * 1000,
    ...(host !== callbackHost && host.endsWith(`.${callbackHost}`) ? { domain: callbackHost } : {}),
  };
}
