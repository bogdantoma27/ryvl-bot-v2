// Validation and abuse limits for the public website forms. Pure functions, no Nest or
// Discord imports, so they are unit-tested directly against the compiled output.

export type SubmissionKind = 'contact' | 'recruitment';

export interface ContactSubmission {
  name: string;
  contact: string;
  topic: string;
  message: string;
}

export interface RecruitmentSubmission {
  gamertag: string;
  discordTag: string;
  primaryPosition: string;
  secondaryPosition: string | null;
  platform: string;
  age: number | null;
  experience: string | null;
}

export type FormResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Discord embed field values are capped at 1024 characters; stay below it.
export const CONTACT_LIMITS = { name: 100, contact: 200, topic: 100, message: 1000 } as const;
export const RECRUITMENT_LIMITS = {
  gamertag: 50,
  discordTag: 50,
  primaryPosition: 20,
  secondaryPosition: 20,
  platform: 30,
  experience: 1000,
} as const;
export const MIN_AGE = 10;
export const MAX_AGE = 99;

function text(
  body: Record<string, unknown>,
  key: string,
  label: string,
  max: number,
  required: boolean,
): FormResult<string | null> {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') {
    return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { ok: false, error: `${label} must be text.` };
  }
  // Control characters are never legitimate here (newlines are allowed in long fields).
  const value = String(raw).replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  if (!value) {
    return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
  }
  if (value.length > max) {
    return { ok: false, error: `${label} must be at most ${max} characters.` };
  }
  return { ok: true, value };
}

export function validateContactForm(input: unknown): FormResult<ContactSubmission> {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const name = text(body, 'name', 'Name', CONTACT_LIMITS.name, true);
  if (!name.ok) return name;
  const contact = text(body, 'contact', 'Contact information', CONTACT_LIMITS.contact, true);
  if (!contact.ok) return contact;
  const topic = text(body, 'topic', 'Topic', CONTACT_LIMITS.topic, false);
  if (!topic.ok) return topic;
  const message = text(body, 'message', 'Message', CONTACT_LIMITS.message, true);
  if (!message.ok) return message;
  return {
    ok: true,
    value: { name: name.value!, contact: contact.value!, topic: topic.value || 'General', message: message.value! },
  };
}

export function validateRecruitmentForm(input: unknown): FormResult<RecruitmentSubmission> {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const gamertag = text(body, 'gamertag', 'Gamertag', RECRUITMENT_LIMITS.gamertag, true);
  if (!gamertag.ok) return gamertag;
  const discordTag = text(body, 'discordTag', 'Discord tag', RECRUITMENT_LIMITS.discordTag, true);
  if (!discordTag.ok) return discordTag;
  const primary = text(body, 'primaryPosition', 'Primary position', RECRUITMENT_LIMITS.primaryPosition, true);
  if (!primary.ok) return primary;
  const secondary = text(body, 'secondaryPosition', 'Secondary position', RECRUITMENT_LIMITS.secondaryPosition, false);
  if (!secondary.ok) return secondary;
  const platform = text(body, 'platform', 'Platform', RECRUITMENT_LIMITS.platform, true);
  if (!platform.ok) return platform;
  const experience = text(body, 'experience', 'Experience', RECRUITMENT_LIMITS.experience, false);
  if (!experience.ok) return experience;

  let age: number | null = null;
  if (body['age'] !== undefined && body['age'] !== null && body['age'] !== '') {
    const parsed = Number(body['age']);
    if (!Number.isInteger(parsed) || parsed < MIN_AGE || parsed > MAX_AGE) {
      return { ok: false, error: `Age must be a whole number between ${MIN_AGE} and ${MAX_AGE}.` };
    }
    age = parsed;
  }

  return {
    ok: true,
    value: {
      gamertag: gamertag.value!,
      discordTag: discordTag.value!,
      primaryPosition: primary.value!,
      secondaryPosition: secondary.value && secondary.value !== 'None' ? secondary.value : null,
      platform: platform.value!,
      age,
      experience: experience.value,
    },
  };
}

/**
 * Fixed-window counter per key, held in memory. One process serves the API, so this
 * is enough to stop a single client from flooding the staff channels; it resets on
 * restart, which is acceptable for an anti-spam limit.
 */
export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Records one hit; returns false (and records nothing) when the key is over its limit. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.prune(now);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }

  retryAfterSeconds(key: string, now = Date.now()): number {
    const entry = this.hits.get(key);
    return entry ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
    // Still full of live keys: drop the oldest insertion rather than grow without bound.
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

const PRIVATE_ADDRESS = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * The visitor's address. Behind the Caddy/nginx reverse proxy every request arrives from
 * a private address, so only then is the proxy-appended (rightmost) X-Forwarded-For
 * entry used; a client cannot spoof it by sending its own header to the public port.
 */
export function clientIp(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const remote = (req.socket?.remoteAddress || req.ip || 'unknown').replace(/^::ffff:/, '');
  const header = req.headers?.['x-forwarded-for'];
  const forwarded = Array.isArray(header) ? header.join(',') : header;
  if (forwarded && PRIVATE_ADDRESS.test(remote)) {
    const hops = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last.replace(/^::ffff:/, '');
  }
  return remote;
}
