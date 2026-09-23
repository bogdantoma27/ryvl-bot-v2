import { createHash } from 'node:crypto';
export interface Receipt {
  key: string;
  fingerprint: string;
  messageId: string | null;
  suppressed: boolean;
}
export interface ReceiptStore {
  get(key: string): Promise<Receipt | null>;
  save(receipt: Receipt): Promise<void>;
  baseline(receipts: Receipt[]): Promise<void>;
}
export interface ResultItem {
  id: number; datetime: string; status: string; homeName: string; awayName: string;
  homeScore?: number | null; awayScore?: number | null; matchDay: number;
}
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function resultFingerprint(match: ResultItem): string {
  return fingerprint([match.id, match.datetime, match.homeName, match.awayName, match.homeScore, match.awayScore, match.matchDay]);
}
export function completedResult(match: ResultItem): boolean {
  return match.status === 'complete' && Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore)
    && Number(match.homeScore) >= 0 && Number(match.awayScore) >= 0;
}
export function notificationNonce(identity: string): string {
  // Discord nonces have a 25-character limit. A stable nonce also protects short retry windows.
  return BigInt('0x' + fingerprint(identity).slice(0, 16)).toString();
}
export async function collectPages<T extends { id: number }>(fetchPage: (limit: number, offset: number) => Promise<T[]>, pageSize = 20, maxPages = 100): Promise<T[]> {
  const rows = new Map<number, T>();
  for (let page = 0; page < maxPages; page++) {
    const items = await fetchPage(pageSize, page * pageSize);
    if (!Array.isArray(items)) throw new Error('Invalid VPG page');
    if (!items.length) return [...rows.values()];
    let newCount = 0;
    for (const item of items) {
      if (!Number.isSafeInteger(item.id)) throw new Error('VPG returned an invalid match identifier');
      if (!rows.has(item.id)) newCount++;
      rows.set(item.id, item);
    }
    if (page > 0 && newCount === 0) throw new Error('VPG pagination repeated a page; refusing a partial snapshot');
    if (items.length < pageSize) return [...rows.values()];
  }
  throw new Error('VPG pagination limit reached; no notification checkpoint advanced');
}
export interface DeliveryResult { postedCount: number; updatedCount: number; errors: string[]; baselined: boolean; }
export async function deliverResults<T extends ResultItem>(options: {
  store: ReceiptStore; matches: T[]; season: number; scope: string;
  send: (match: T, previousMessageId: string | null, nonce: string) => Promise<string>;
}): Promise<DeliveryResult> {
  const result: DeliveryResult = { postedCount: 0, updatedCount: 0, errors: [], baselined: false };
  const matches = options.matches.filter(completedResult).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime) || a.id - b.id);
  const marker = `baseline:${options.scope}:${options.season}`;
  if (!(await options.store.get(marker))) {
    // Commit a baseline even for an empty season; its first future result must be posted.
    await options.store.baseline([
      ...matches.map(m => ({ key: `${options.season}:${m.id}`, fingerprint: resultFingerprint(m), messageId: null, suppressed: true })),
      { key: marker, fingerprint: 'initialized', messageId: null, suppressed: true },
    ]);
    result.baselined = true;
    return result;
  }
  for (const match of matches) {
    const key = `${options.season}:${match.id}`;
    const previous = await options.store.get(key);
    const version = resultFingerprint(match);
    if (previous?.suppressed || previous?.fingerprint === version) continue;
    try {
      const messageId = await options.send(match, previous?.messageId || null, notificationNonce(`${options.scope}:${key}:${version}`));
      await options.store.save({ key, fingerprint: version, messageId, suppressed: false });
      previous?.messageId ? result.updatedCount++ : result.postedCount++;
    } catch (error) {
      // A failed send/edit MUST NOT become a completed receipt. Other channels can still succeed.
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}
export async function deliverSnapshot(options: {
  store: ReceiptStore; key: string; version: unknown; empty?: boolean; once?: boolean;
  send: (previousMessageId: string | null, nonce: string) => Promise<string>;
}): Promise<boolean> {
  const previous = await options.store.get(options.key);
  const version = fingerprint(options.version);
  if ((!previous && options.empty) || (previous?.messageId && options.once) || previous?.fingerprint === version) return false;
  const messageId = await options.send(previous?.messageId || null, notificationNonce(`${options.key}:${version}`));
  await options.store.save({ key: options.key, fingerprint: version, messageId, suppressed: false });
  return true;
}
