from pathlib import Path
import re

ROOT = Path('ryvl-discord-bot/server')
def put(name, content):
    p = ROOT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.lstrip('\n'), encoding='utf-8')
def change(name, old, new, count=1):
    p = ROOT / name
    text = p.read_text(encoding='utf-8')
    if text.count(old) != count:
        raise RuntimeError(f'{name}: expected {count} occurrences, got {text.count(old)}: {old[:90]}')
    p.write_text(text.replace(old, new), encoding='utf-8')

put('src/vpg/notification-policy.ts', r'''
/** Shared rules for RYVL identity and Romanian calendar-based notifications. */
export const ROMANIA_TIME_ZONE = 'Europe/Bucharest';
export const RYVL_ALIASES = new Set(['ryvl', 'ryvl esports']);
export function normalizeTeamName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
    : '';
}
export function isRyvlTeam(value: unknown): boolean {
  // Deliberately not a substring/"rival" match: unrelated clubs must never enter this feed.
  return RYVL_ALIASES.has(normalizeTeamName(value));
}
export interface TeamIdentity { slug?: string | null; name?: string; }
export interface MatchIdentity { homeName: string; awayName: string; homeSlug?: string | null; awaySlug?: string | null; }
export function isRyvlSide(name: string, slug?: string | null, identity?: TeamIdentity): boolean {
  if (identity?.slug && slug) return slug.toLowerCase() === identity.slug.toLowerCase();
  return isRyvlTeam(name);
}
export function isRyvlMatch(match: MatchIdentity, identity?: TeamIdentity): boolean {
  return isRyvlSide(match.homeName, match.homeSlug, identity) || isRyvlSide(match.awayName, match.awaySlug, identity);
}
export function resolveRyvlIdentity(rows: { teamName: string; teamSlug?: string | null }[]): TeamIdentity {
  const row = rows.find(r => normalizeTeamName(r.teamName) === 'ryvl esports') || rows.find(r => isRyvlTeam(r.teamName));
  return { name: row?.teamName || 'RYVL Esports', slug: row?.teamSlug || null };
}
export function romaniaClock(value: Date | string): { date: string; minutes: number; sunday: boolean } {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid match date');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ROMANIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (key: string) => parts.find(p => p.type === key)?.value || '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')), sunday: part('weekday') === 'Sun' };
}
export function fixturesOnDay<T extends { id: number; datetime: string }>(matches: T[], day: string): T[] {
  const unique = new Map<number, T>();
  for (const match of matches) {
    try { if (romaniaClock(match.datetime).date === day) unique.set(match.id, match); } catch { /* Ignore invalid API timestamps; never invent a date. */ }
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime) || a.id - b.id);
}
export function dailyTimeReached(now: Date, time: string): boolean {
  const [hour, minute] = time.split(':').map(Number);
  return romaniaClock(now).minutes >= hour * 60 + minute;
}
export function standingsDue(now: Date): boolean {
  const clock = romaniaClock(now);
  // Same-day catch-up after a restart is allowed, but not a duplicate Sunday post.
  return clock.sunday && clock.minutes >= 10 * 60;
}
export function intervalDue(last: Date | null | undefined, seconds: number, now: Date): boolean {
  return !last || now.getTime() - last.getTime() >= seconds * 1000;
}
export function validateNotificationSettings(value: unknown): Record<string, boolean | number | string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a settings object');
  const allowedBooleans = ['resultsEnabled', 'ryvlResultsEnabled', 'fixturesEnabled', 'ryvlFixturesEnabled', 'standingsEnabled', 'ryvlStandingsEnabled'];
  const output: Record<string, boolean | number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (allowedBooleans.includes(key)) {
      if (typeof entry !== 'boolean') throw new Error(`${key} must be a boolean`);
    } else if (key === 'pollIntervalSec') {
      if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < 60 || entry > 3600) throw new Error('Polling interval must be between 60 and 3600 seconds');
    } else if (key === 'fixturesTime') {
      if (typeof entry !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry)) throw new Error('Fixture time must use HH:mm');
    } else {
      throw new Error(`Unknown notification setting: ${key}`);
    }
    output[key] = entry as boolean | number | string;
  }
  return output;
}
''')

put('src/config/public-url.ts', r'''
/** All bot website links use the same validated public origin as Discord OAuth. */
export function buildClubWebUrl(frontendUrl: string, guildId: string): string {
  const url = new URL('/club', frontendUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL must be HTTP or HTTPS');
  url.searchParams.set('guildId', guildId);
  return url.toString();
}
''')

put('src/vpg/notification-delivery.ts', r'''
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
''')

# Add only new tables/relations: existing guild settings, events and receipt history are preserved.
p = ROOT / 'prisma/schema.prisma'
schema = p.read_text()
schema = schema.replace('  ryvlCompetitions       RyvlCompetition[]', '  ryvlCompetitions       RyvlCompetition[]\n  vpgNotificationConfig VpgNotificationConfig?\n  vpgNotificationDeliveries VpgNotificationDelivery[]')
schema += r'''

// Independent from the transfer poller; these switches govern the competition feeds.
model VpgNotificationConfig {
  guildId              String   @id @map("guild_id")
  guild                Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
  pollIntervalSec      Int      @default(120) @map("poll_interval_sec")
  fixturesTime         String   @default("10:00") @map("fixtures_time")
  resultsEnabled       Boolean  @default(true) @map("results_enabled")
  ryvlResultsEnabled   Boolean  @default(true) @map("ryvl_results_enabled")
  fixturesEnabled      Boolean  @default(true) @map("fixtures_enabled")
  ryvlFixturesEnabled  Boolean  @default(true) @map("ryvl_fixtures_enabled")
  standingsEnabled     Boolean  @default(true) @map("standings_enabled")
  ryvlStandingsEnabled Boolean  @default(true) @map("ryvl_standings_enabled")
  lastPolledAt         DateTime? @map("last_polled_at")
  lastFixturesPolledAt DateTime? @map("last_fixtures_polled_at")
  lastSuccessAt        DateTime? @map("last_success_at")
  lastError            String?  @map("last_error")
  retryAfter           DateTime? @map("retry_after")
  leaseToken           String?  @map("lease_token")
  leaseUntil           DateTime? @map("lease_until")
  updatedAt            DateTime @updatedAt @map("updated_at")
  @@map("vpg_notification_configs")
}

model VpgNotificationDelivery {
  id                   String   @id @default(uuid())
  guildId              String   @map("guild_id")
  guild                Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
  channelId            String   @map("channel_id")
  topic                String
  itemKey              String   @map("item_key")
  fingerprint          String
  discordMessageId     String?  @map("discord_message_id")
  suppressed           Boolean  @default(false)
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")
  @@unique([guildId, channelId, topic, itemKey], map: "vpg_delivery_destination_key")
  @@index([guildId, topic])
  @@map("vpg_notification_deliveries")
}
'''
p.write_text(schema)
put('prisma/deploy/vpg-notifications.sql', r'''
-- Reviewed additive upgrade for an existing Prisma db-push installation.
-- Deliberately no DROP, TRUNCATE, DELETE, or changes to existing tables.
BEGIN;
SELECT pg_advisory_xact_lock(739201629);
CREATE TABLE IF NOT EXISTS "vpg_notification_configs" (
  "guild_id" TEXT PRIMARY KEY REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "poll_interval_sec" INTEGER NOT NULL DEFAULT 120,
  "fixtures_time" TEXT NOT NULL DEFAULT '10:00',
  "results_enabled" BOOLEAN NOT NULL DEFAULT true,
  "ryvl_results_enabled" BOOLEAN NOT NULL DEFAULT true,
  "fixtures_enabled" BOOLEAN NOT NULL DEFAULT true,
  "ryvl_fixtures_enabled" BOOLEAN NOT NULL DEFAULT true,
  "standings_enabled" BOOLEAN NOT NULL DEFAULT true,
  "ryvl_standings_enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_polled_at" TIMESTAMP(3), "last_fixtures_polled_at" TIMESTAMP(3),
  "last_success_at" TIMESTAMP(3), "last_error" TEXT, "retry_after" TIMESTAMP(3),
  "lease_token" TEXT, "lease_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "vpg_notification_deliveries" (
  "id" TEXT PRIMARY KEY,
  "guild_id" TEXT NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "channel_id" TEXT NOT NULL, "topic" TEXT NOT NULL, "item_key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL, "discord_message_id" TEXT, "suppressed" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "vpg_delivery_destination_key"
  ON "vpg_notification_deliveries"("guild_id", "channel_id", "topic", "item_key");
CREATE INDEX IF NOT EXISTS "vpg_notification_deliveries_guild_id_topic_idx"
  ON "vpg_notification_deliveries"("guild_id", "topic");
COMMIT;
''')

# Extend API output without removing fields consumed by existing pages/commands.
for name in ['src/vpg/vpg.types.ts']:
    p = ROOT / name
    text = p.read_text()
    text = text.replace('export interface VpgMatchItem {', 'export interface VpgMatchItem {\n  homeSlug?: string | null;\n  awaySlug?: string | null;')
    text = text.replace('export interface RyvlPerformanceResponse {', 'export interface RyvlPerformanceResponse {\n  standings?: VpgStandingsRow[];\n  season?: number;\n  warnings?: string[];')
    p.write_text(text)

p = ROOT / 'src/vpg/vpg.service.ts'
s = p.read_text()
s = "import { isRyvlTeam, isRyvlMatch, isRyvlSide, resolveRyvlIdentity } from './notification-policy';\nimport { collectPages } from './notification-delivery';\n" + s
s = s.replace('async fetchSeasons(): Promise<number[]>', "async fetchSeasons(leagueSlug = 'Superliga-Romania'): Promise<number[]>")
s = s.replace('${this.API_BASE}/leagues/Superliga-Romania/seasons/', '${this.API_BASE}/leagues/${encodeURIComponent(leagueSlug)}/seasons/')
s = s.replace('async fetchLatestSeason(): Promise<number[]>', 'async fetchLatestSeason(): Promise<number[]>')
s = s.replace('async fetchLatestSeason(): Promise<number> {\n    const seasons = await this.fetchSeasons();', "async fetchLatestSeason(leagueSlug = 'Superliga-Romania'): Promise<number> {\n    const seasons = await this.fetchSeasons(leagueSlug);")
# Remove the silent season-2 fallback: failures must not cause posts for the wrong season.
a = s.index('  async fetchSeasons(')
b = s.index('\n  async fetchStandings(', a)
s = s[:a] + r'''  async fetchSeasons(leagueSlug = 'Superliga-Romania'): Promise<number[]> {
    const response = await fetch(`${this.API_BASE}/leagues/${encodeURIComponent(leagueSlug)}/seasons/`, {
      signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RYVLBot/2.0' },
    });
    if (!response.ok) throw new Error(`VPG seasons HTTP ${response.status} for ${leagueSlug}`);
    const raw = await response.json();
    const values = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    const seasons = values.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).sort((x: number, y: number) => y - x);
    if (!seasons.length) throw new Error(`No valid VPG season available for ${leagueSlug}`);
    return seasons;
  }

  async fetchLatestSeason(leagueSlug = 'Superliga-Romania'): Promise<number> {
    return (await this.fetchSeasons(leagueSlug))[0];
  }

  async fetchAllMatches(status: 'complete' | 'scheduled', season: number, leagueSlug = 'Superliga-Romania'): Promise<VpgMatchItem[]> {
    // Fetch every page. A late result must not be dropped just because its match date is old.
    return collectPages((limit, offset) => this.fetchMatches(status, season, limit, offset, leagueSlug));
  }
''' + s[b:]
s = s.replace('const targetSeason = season || (await this.fetchLatestSeason());', 'const targetSeason = season || (await this.fetchLatestSeason(leagueSlug));')
s = s.replace('homeName: m.home_name ||', 'homeSlug: m.home_slug || null,\n      awaySlug: m.away_slug || null,\n      homeName: m.home_name ||')
# Public pages use the configured competition slots, not the old hard-coded placeholders.
s = s.replace('  async getCompetitions(guildId?: string): Promise<RyvlCompetitionDto[]> {\n    if (guildId) {', '''  async getCompetitions(guildId?: string): Promise<RyvlCompetitionDto[]> {
    if (!guildId) {
      const publicGuild = await this.prisma.guild.findFirst({ orderBy: { joinedAt: 'asc' } });
      guildId = publicGuild?.id;
    }
    if (guildId) {''')
s = s.replace("    const activeName = targetComp.name;", "    const activeName = targetComp.name;\n    if (!targetComp.active) throw new Error('This competition is not active yet');\n    const targetSeason = targetComp.season || (await this.fetchLatestSeason(activeSlug));\n    const warnings: string[] = [];")
s = s.replace("if (g?.ryvlTeamName) teamName = g.ryvlTeamName;", "if (g?.ryvlTeamName && isRyvlTeam(g.ryvlTeamName)) teamName = g.ryvlTeamName;")
s = s.replace("this.fetchMatches('complete', undefined, 100, 0, activeSlug)", "this.fetchAllMatches('complete', targetSeason, activeSlug)")
s = s.replace("this.fetchMatches('scheduled', undefined, 30, 0, activeSlug)", "this.fetchAllMatches('scheduled', targetSeason, activeSlug)")
s = s.replace('this.fetchStandings(undefined, activeSlug)', 'this.fetchStandings(targetSeason, activeSlug)')
s = s.replace('      allMatches = [];', "      warnings.push('Completed matches are temporarily unavailable.');\n      allMatches = [];")
s = s.replace('      scheduledMatches = [];', "      warnings.push('Fixtures are temporarily unavailable.');\n      scheduledMatches = [];")
s = s.replace('      standings = [];', "      warnings.push('League standings are temporarily unavailable.');\n      standings = [];")
s = s.replace('    const teamMatcher = /ryvl|rival/i;', '''    if (warnings.length === 3) throw new Error('VPG is temporarily unavailable. Please try again.');
    const identity = resolveRyvlIdentity(standings);
    const teamMatcher = { test: (name: string) => isRyvlTeam(name) };
    allMatches.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime) || b.id - a.id);
    scheduledMatches.sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime) || a.id - b.id);''')
s = s.replace('(m) => teamMatcher.test(m.homeName) || teamMatcher.test(m.awayName)', '(m) => isRyvlMatch(m, identity)')
s = s.replace('const isHome = teamMatcher.test(m.homeName);', 'const isHome = isRyvlSide(m.homeName, m.homeSlug, identity);')
s = s.replace('const standingsRow = standings.find((r) => teamMatcher.test(r.teamName));', 'const standingsRow = standings.find((r) => isRyvlSide(r.teamName, r.teamSlug, identity));')
s = s.replace('.slice(0, 10);\n\n    const stats:', ';\n\n    const stats:')
s = s.replace('recentResults: ryvlMatches.slice(0, 10),', 'recentResults: ryvlMatches,\n      standings,\n      season: targetSeason,\n      warnings,')
p.write_text(s)

# Every remaining server-side RYVL highlight/filter follows the same exact alias rule.
for p in (ROOT / 'src').rglob('*.ts'):
    if p.name in ['vpg-superliga-poller.service.ts', 'notification-policy.ts']: continue
    text = p.read_text()
    if '/ryvl|rival/i' in text:
        text = text.replace('/ryvl|rival/i', '/^\\s*ryvl(?:\\s+esports)?\\s*$/i')
        p.write_text(text)

# Use FRONTEND_URL for both automatically posted and manually posted EA match buttons.
p = ROOT / 'src/ea/ea-poller.service.ts'
s = p.read_text()
s = "import { buildClubWebUrl } from '../config/public-url';\n" + s
s = re.sub(r"const webBase = process\.env\.WEB_BASE_URL \|\| 'http://localhost:4201';\s*const webUrl = `\$\{webBase\}/club\?guildId=\$\{([^}]+)\}`;", r"const webUrl = buildClubWebUrl(this.configService.frontendUrl, \1);", s)
if 'localhost:4201' in s: raise RuntimeError('Unresolved localhost website link in EA poller')
p.write_text(s)

put('src/vpg/vpg-superliga-poller.service.ts', r'''
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Guild, VpgNotificationConfig } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EmbedBuilder, TextChannel, ChannelType } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { VpgService } from './vpg.service';
import { DiscordService } from '../discord/discord.service';
import { VpgMatchItem, VpgStandingsRow } from './vpg.types';
import { buildSuperligaStandingsEmbed, buildSuperligaFixturesEmbed, buildSuperligaResultsEmbed, buildSuperligaLiveResultCardEmbed } from '../discord/embeds/superliga-embed.builder';
import { romaniaClock, dailyTimeReached, standingsDue, intervalDue, fixturesOnDay, isRyvlMatch, isRyvlSide, resolveRyvlIdentity, validateNotificationSettings } from './notification-policy';
import { ReceiptStore, Receipt, deliverResults, deliverSnapshot, resultFingerprint } from './notification-delivery';

type League = { slug: string; name: string; season: number; ryvl: boolean };
@Injectable()
export class VpgSuperligaPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpgSuperligaPollerService.name);
  private initialTimer?: NodeJS.Timeout;
  private readonly active = new Set<string>();
  private readonly failures = new Map<string, number>();
  private cycleCache = new Map<string, Promise<unknown>>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly vpgService: VpgService,
    @Inject(forwardRef(() => DiscordService)) private readonly discordService: DiscordService,
  ) {}
  onModuleInit(): void {
    this.initialTimer = setTimeout(() => void this.pollAllGuildsLiveResults().catch(e => this.logger.error(e.message)), 25000);
    this.initialTimer.unref();
  }
  onModuleDestroy(): void { if (this.initialTimer) clearTimeout(this.initialTimer); }

  @Cron('*/30 * * * * *', { name: 'vpg-notifications', timeZone: 'Europe/Bucharest', waitForCompletion: true })
  async pollAllGuildsLiveResults(): Promise<void> {
    if (!this.discordService.client.isReady()) return;
    this.cycleCache = new Map();
    const guilds = await this.prisma.guild.findMany({ where: { OR: [
      { defaultLiveResultsChannelId: { not: null } }, { defaultRyvlResultsChannelId: { not: null } },
      { defaultFixturesChannelId: { not: null } }, { defaultRyvlFixturesChannelId: { not: null } },
      { defaultStandingsChannelId: { not: null } }, { defaultRyvlLeaderboardChannelId: { not: null } },
    ] } });
    for (const guild of guilds) {
      try { await this.runGuild(guild); } catch (error) { this.logger.error(`VPG guild ${guild.id}: ${error instanceof Error ? error.message : error}`); }
    }
  }
  async getConfig(guildId: string): Promise<VpgNotificationConfig> {
    return this.prisma.vpgNotificationConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  }
  async updateConfig(guildId: string, value: unknown): Promise<VpgNotificationConfig> {
    const data = validateNotificationSettings(value);
    await this.getConfig(guildId);
    return this.prisma.vpgNotificationConfig.update({ where: { guildId }, data: { ...data, retryAfter: null } });
  }
  async checkGuildNow(guildId: string): Promise<{ postedCount: number; updatedCount?: number; busy?: boolean }> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) throw new Error('Discord server not found');
    if (!this.discordService.client.isReady()) throw new Error('Discord is not connected yet');
    this.cycleCache = new Map();
    return this.runGuild(guild, true);
  }
  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.cycleCache.has(key)) this.cycleCache.set(key, load());
    return this.cycleCache.get(key) as Promise<T>;
  }
  private store(guildId: string, channelId: string, topic: string): ReceiptStore {
    const keyWhere = (itemKey: string) => ({ guildId_channelId_topic_itemKey: { guildId, channelId, topic, itemKey } });
    return {
      get: async key => {
        const row = await this.prisma.vpgNotificationDelivery.findUnique({ where: keyWhere(key) });
        return row ? { key, fingerprint: row.fingerprint, messageId: row.discordMessageId, suppressed: row.suppressed } : null;
      },
      save: async row => {
        const values = { fingerprint: row.fingerprint, discordMessageId: row.messageId, suppressed: row.suppressed };
        await this.prisma.vpgNotificationDelivery.upsert({ where: keyWhere(row.key), create: { guildId, channelId, topic, itemKey: row.key, ...values }, update: values });
      },
      baseline: async rows => {
        // One SQL operation: either the complete initial snapshot exists, or initialization retries.
        await this.prisma.vpgNotificationDelivery.createMany({ data: rows.map(row => ({
          guildId, channelId, topic, itemKey: row.key, fingerprint: row.fingerprint,
          discordMessageId: row.messageId, suppressed: row.suppressed,
        })), skipDuplicates: true });
      },
    };
  }
  private async send(guildId: string, channelId: string, embed: EmbedBuilder, previousId: string | null, nonce: string, leaseCheck: () => void): Promise<string> {
    leaseCheck();
    const fetched = await this.discordService.client.channels.fetch(channelId);
    if (!fetched || !('guildId' in fetched) || fetched.guildId !== guildId || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(fetched.type)) throw new Error(`Configured channel ${channelId} is unavailable or belongs to another server`);
    const channel = fetched as TextChannel;
    const options = { embeds: [embed], allowedMentions: { parse: [] as [] } };
    if (previousId) {
      try {
        const message = await channel.messages.fetch(previousId);
        if (message.author.id !== this.discordService.client.user?.id) throw new Error('Refusing to edit a message not owned by this bot');
        leaseCheck();
        return (await message.edit(options)).id;
      } catch (error) {
        if (Number((error as { code?: number }).code) !== 10008) throw error;
        // A deleted tracked message can be recreated. Permission/rate-limit errors remain retryable.
      }
    }
    leaseCheck();
    return (await channel.send({ ...options, nonce, enforceNonce: true })).id;
  }
  private async runGuild(guild: Guild, force = false): Promise<{ postedCount: number; updatedCount: number; busy?: boolean }> {
    if (this.active.has(guild.id)) return { postedCount: 0, updatedCount: 0, busy: true };
    const config = await this.getConfig(guild.id);
    const now = new Date();
    if (!force && config.retryAfter && config.retryAfter > now) return { postedCount: 0, updatedCount: 0 };
    const clock = romaniaClock(now);
    const resultDue = force || intervalDue(config.lastPolledAt, config.pollIntervalSec, now);
    const fixtureDue = dailyTimeReached(now, config.fixturesTime) && (
      force || !config.lastFixturesPolledAt || romaniaClock(config.lastFixturesPolledAt).date !== clock.date || intervalDue(config.lastFixturesPolledAt, config.pollIntervalSec, now)
    );
    const weeklyDue = standingsDue(now);
    if (!resultDue && !fixtureDue && !weeklyDue) return { postedCount: 0, updatedCount: 0 };
    const lease = randomUUID();
    const acquired = await this.prisma.vpgNotificationConfig.updateMany({
      where: { guildId: guild.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseToken: lease, leaseUntil: new Date(Date.now() + 120000) },
    });
    if (!acquired.count) return { postedCount: 0, updatedCount: 0, busy: true };
    this.active.add(guild.id);
    let lostLease = false;
    const checkLease = () => { if (lostLease) throw new Error('VPG posting lease was lost; retrying on the next poll'); };
    const heartbeat = setInterval(() => {
      this.prisma.vpgNotificationConfig.updateMany({ where: { guildId: guild.id, leaseToken: lease }, data: { leaseUntil: new Date(Date.now() + 120000) } })
        .then(result => { if (!result.count) lostLease = true; }).catch(() => { lostLease = true; });
    }, 30000);
    heartbeat.unref();
    let postedCount = 0, updatedCount = 0;
    const errors: string[] = [];
    try {
      const competitions = (await this.vpgService.getCompetitions(guild.id)).filter(c => c.active);
      const leagues = new Map<string, League>();
      const generalEnabled = Boolean(guild.defaultLiveResultsChannelId || guild.defaultFixturesChannelId || guild.defaultStandingsChannelId);
      if (generalEnabled) {
        const season = await this.cached('season:Superliga-Romania', () => this.vpgService.fetchLatestSeason('Superliga-Romania'));
        leagues.set(`Superliga-Romania:${season}`, { slug: 'Superliga-Romania', name: 'VPG Superliga România', season, ryvl: false });
      }
      for (const competition of competitions) {
        const season = competition.season || await this.cached(`season:${competition.slug}`, () => this.vpgService.fetchLatestSeason(competition.slug));
        const key = `${competition.slug}:${season}`;
        leagues.set(key, { slug: competition.slug, name: competition.name, season, ryvl: true });
      }
      for (const league of leagues.values()) {
        checkLease();
        const general = league.slug === 'Superliga-Romania';
        try {
          const table = await this.cached(`table:${league.slug}:${league.season}`, () => this.vpgService.fetchStandings(league.season, league.slug));
          const identity = resolveRyvlIdentity(table);
          const complete = (resultDue || fixtureDue) ? await this.cached(`complete:${league.slug}:${league.season}`, () => this.vpgService.fetchAllMatches('complete', league.season, league.slug)) : [];
          const resultTargets = new Map<string, boolean>();
          if (general && config.resultsEnabled && guild.defaultLiveResultsChannelId) resultTargets.set(guild.defaultLiveResultsChannelId, false);
          if (league.ryvl && config.ryvlResultsEnabled && guild.defaultRyvlResultsChannelId && !resultTargets.has(guild.defaultRyvlResultsChannelId)) resultTargets.set(guild.defaultRyvlResultsChannelId, true);
          if (resultDue) for (const [channelId, ryvlOnly] of resultTargets) {
            const receipts = this.store(guild.id, channelId, `result:${league.slug}`);
            const matches = ryvlOnly ? complete.filter(m => isRyvlMatch(m, identity)) : complete;
            // Preserve known old general-feed message IDs, so corrections can edit them rather than repost.
            if (general && !(await receipts.get(`baseline:${ryvlOnly ? 'ryvl' : 'general'}:${league.season}`))) {
              const legacy = await this.prisma.processedVpgMatch.findMany({ where: { guildId: guild.id, channelId, discordMessageId: { not: null } } });
              const ids = new Set(matches.map(m => m.id));
              await receipts.baseline(legacy.filter(row => ids.has(row.vpgMatchId)).map(row => ({
                key: `${league.season}:${row.vpgMatchId}`, messageId: row.discordMessageId, suppressed: false,
                fingerprint: resultFingerprint({ id: row.vpgMatchId, datetime: row.datetime.toISOString(), status: 'complete', homeName: row.homeName, awayName: row.awayName, homeScore: row.homeScore, awayScore: row.awayScore, matchDay: row.matchDay || 0 }),
              })));
            }
            const delivery = await deliverResults({ store: receipts, matches, season: league.season, scope: ryvlOnly ? 'ryvl' : 'general', send: (match, previous, nonce) => {
              const embed = buildSuperligaLiveResultCardEmbed(match).setTitle(`${ryvlOnly ? 'RYVL Esports' : league.name} — Match result`);
              return this.send(guild.id, channelId, embed, previous, nonce, checkLease);
            } });
            postedCount += delivery.postedCount; updatedCount += delivery.updatedCount; errors.push(...delivery.errors);
          }
          if (fixtureDue) {
            const scheduled = await this.cached(`scheduled:${league.slug}:${league.season}`, () => this.vpgService.fetchAllMatches('scheduled', league.season, league.slug));
            // Retain completed games in the day's schedule; a result should not look like a cancellation.
            const today = fixturesOnDay([...complete, ...scheduled], clock.date);
            const targets = new Map<string, boolean>();
            if (general && config.fixturesEnabled && guild.defaultFixturesChannelId) targets.set(guild.defaultFixturesChannelId, false);
            if (league.ryvl && config.ryvlFixturesEnabled && guild.defaultRyvlFixturesChannelId && !targets.has(guild.defaultRyvlFixturesChannelId)) targets.set(guild.defaultRyvlFixturesChannelId, true);
            for (const [channelId, ryvlOnly] of targets) {
              const matches = ryvlOnly ? today.filter(m => isRyvlMatch(m, identity)) : today;
              const receipts = this.store(guild.id, channelId, `fixtures:${league.slug}`);
              const prefix = `${league.season}:${clock.date}`;
              const meta = await receipts.get(`${prefix}:pages`);
              const previousPages = Number(meta?.fingerprint || 0);
              const pageCount = Math.ceil(matches.length / 8);
              for (let page = 0; page < Math.max(previousPages, pageCount); page++) {
                const rows = matches.slice(page * 8, page * 8 + 8);
                const changed = await deliverSnapshot({ store: receipts, key: `${prefix}:${page}`, empty: !rows.length,
                  version: rows.map(m => [m.id, m.datetime, m.homeName, m.awayName]),
                  send: (previous, nonce) => {
                    const embed = buildSuperligaFixturesEmbed(rows, league.season, 8)
                      .setTitle(`${ryvlOnly ? 'RYVL Esports' : league.name} — ${clock.date} fixtures`)
                      .setDescription(rows.length ? `Today's schedule • Europe/Bucharest${pageCount > 1 ? ` • Part ${page + 1}/${pageCount}` : ''}` : 'Schedule updated: no fixtures remain in this part.');
                    return this.send(guild.id, channelId, embed, previous, nonce, checkLease);
                  },
                });
                if (changed) postedCount++;
              }
              await receipts.save({ key: `${prefix}:pages`, fingerprint: String(pageCount), messageId: null, suppressed: true });
            }
          }
          if (weeklyDue) {
            const targets = new Map<string, boolean>();
            if (general && config.standingsEnabled && guild.defaultStandingsChannelId) targets.set(guild.defaultStandingsChannelId, false);
            if (league.ryvl && config.ryvlStandingsEnabled && guild.defaultRyvlLeaderboardChannelId && !targets.has(guild.defaultRyvlLeaderboardChannelId)) targets.set(guild.defaultRyvlLeaderboardChannelId, true);
            for (const [channelId, ryvlOnly] of targets) {
              const row = table.find(r => isRyvlSide(r.teamName, r.teamSlug, identity));
              if (ryvlOnly && !row) continue;
              const embed = ryvlOnly && row ? new EmbedBuilder().setColor(0xeae905)
                .setTitle(`RYVL Esports — ${league.name}`).setDescription(`Weekly league position: **#${row.position}** of ${table.length}`)
                .addFields({ name: 'Record', value: `${row.played} played • ${row.wins} W / ${row.draws} D / ${row.losses} L` }, { name: 'Points / goal difference', value: `${row.points} PTS • ${row.goalDifference > 0 ? '+' : ''}${row.goalDifference} GD` })
                .setFooter({ text: 'Sunday 10:00 • Europe/Bucharest' })
                : buildSuperligaStandingsEmbed(table, league.season);
              if (await deliverSnapshot({ store: this.store(guild.id, channelId, `standings:${league.slug}`), key: `${league.season}:${clock.date}`, once: true, empty: !table.length, version: clock.date,
                send: (previous, nonce) => this.send(guild.id, channelId, embed, previous, nonce, checkLease),
              })) postedCount++;
            }
          }
        } catch (error) { errors.push(`${league.name}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      const attempts = errors.length ? (this.failures.get(guild.id) || 0) + 1 : 0;
      this.failures.set(guild.id, attempts);
      await this.prisma.vpgNotificationConfig.updateMany({ where: { guildId: guild.id, leaseToken: lease }, data: {
        ...(resultDue ? { lastPolledAt: now } : {}), ...(fixtureDue ? { lastFixturesPolledAt: now } : {}),
        lastError: errors.length ? errors.join(' | ').slice(0, 1500) : null,
        ...(errors.length ? { retryAfter: new Date(Date.now() + Math.min(1800, config.pollIntervalSec * 2 ** Math.min(attempts - 1, 4)) * 1000) } : { lastSuccessAt: new Date(), retryAfter: null }),
      } });
      if (errors.length) this.logger.warn(`VPG ${guild.id}: ${errors.join(' | ')}`);
      return { postedCount, updatedCount };
    } finally {
      clearInterval(heartbeat); this.active.delete(guild.id);
      await this.prisma.vpgNotificationConfig.updateMany({ where: { guildId: guild.id, leaseToken: lease }, data: { leaseToken: null, leaseUntil: null } });
    }
  }
  // Existing slash commands/admin broadcast buttons continue to work.
  async postStandingsToChannel(guildId: string, targetChannelId?: string, season?: number): Promise<{ success: boolean; messageId?: string }> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    const channelId = targetChannelId || guild?.defaultStandingsChannelId;
    if (!channelId) throw new Error('No standings channel configured');
    const selected = season || await this.vpgService.fetchLatestSeason();
    const sent = await this.discordService.sendMessageToChannel(channelId, buildSuperligaStandingsEmbed(await this.vpgService.fetchStandings(selected), selected));
    return { success: true, messageId: sent.id };
  }
  async postFixturesToChannel(guildId: string, targetChannelId?: string, season?: number): Promise<{ success: boolean; messageId?: string }> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    const channelId = targetChannelId || guild?.defaultFixturesChannelId;
    if (!channelId) throw new Error('No fixtures channel configured');
    const selected = season || await this.vpgService.fetchLatestSeason();
    const today = fixturesOnDay(await this.vpgService.fetchAllMatches('scheduled', selected), romaniaClock(new Date()).date);
    if (!today.length) return { success: true };
    let messageId: string | undefined;
    for (let i = 0; i < today.length; i += 8) messageId = (await this.discordService.sendMessageToChannel(channelId, buildSuperligaFixturesEmbed(today.slice(i, i + 8), selected, 8))).id;
    return { success: true, messageId };
  }
  async postResultsToChannel(guildId: string, targetChannelId?: string, season?: number): Promise<{ success: boolean; messageId?: string }> {
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    const channelId = targetChannelId || guild?.defaultLiveResultsChannelId;
    if (!channelId) throw new Error('No results channel configured');
    const selected = season || await this.vpgService.fetchLatestSeason();
    const results = await this.vpgService.fetchMatches('complete', selected, 12);
    const sent = await this.discordService.sendMessageToChannel(channelId, buildSuperligaResultsEmbed(results, selected, 12));
    return { success: true, messageId: sent.id };
  }
}
''')

put('src/vpg/vpg-notifications.controller.ts', r'''
import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Req, UseGuards, forwardRef } from '@nestjs/common';
import { PermissionFlagsBits, ButtonStyle, ActionRowBuilder, ButtonBuilder, TextChannel } from 'discord.js';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { ConfigService } from '../config/config.service';
import { buildClubWebUrl } from '../config/public-url';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { VpgSuperligaPollerService } from './vpg-superliga-poller.service';

@Controller('api/guilds/:guildId/vpg/notifications')
@UseGuards(AuthGuard)
export class VpgNotificationsController {
  constructor(
    private readonly poller: VpgSuperligaPollerService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => DiscordService)) private readonly discord: DiscordService,
  ) {}
  private async authorize(guildId: string, request: AuthenticatedRequest): Promise<void> {
    if (!request.user?.userId || !/^\d{10,25}$/.test(guildId)) throw new ForbiddenException('Invalid Discord server');
    try {
      const guild = await this.discord.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(request.user.userId);
      if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.permissions.has(PermissionFlagsBits.ManageGuild)) throw new Error('Not an administrator');
    } catch { throw new ForbiddenException('Administrator or Manage Server permission is required for this server'); }
  }
  @Get()
  async get(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    await this.authorize(guildId, request);
    const { leaseToken, leaseUntil, ...config } = await this.poller.getConfig(guildId);
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    return { config, timezone: 'Europe/Bucharest', channels: {
      results: guild?.defaultLiveResultsChannelId, ryvlResults: guild?.defaultRyvlResultsChannelId,
      fixtures: guild?.defaultFixturesChannelId, ryvlFixtures: guild?.defaultRyvlFixturesChannelId,
      standings: guild?.defaultStandingsChannelId, ryvlStandings: guild?.defaultRyvlLeaderboardChannelId,
    } };
  }
  @Patch()
  async update(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest, @Body() body: unknown) {
    await this.authorize(guildId, request);
    try { await this.poller.updateConfig(guildId, body); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid settings'); }
    return this.get(guildId, request);
  }
  @Post('check')
  async check(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    await this.authorize(guildId, request);
    return this.poller.checkGuildNow(guildId);
  }
  @Post('repair-club-links')
  async repair(@Param('guildId') guildId: string, @Req() request: AuthenticatedRequest) {
    await this.authorize(guildId, request);
    // This explicit admin action only edits known bot-owned messages. It never deletes/reposts history.
    const records = await this.prisma.processedEaMatch.findMany({ where: { guildId, discordMessageId: { not: null }, channelId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 200 });
    let updated = 0, skipped = 0, failed = 0;
    for (const record of records) {
      try {
        const channel = await this.discord.client.channels.fetch(record.channelId!) as TextChannel | null;
        if (!channel || channel.guildId !== guildId || !channel.messages) { skipped++; continue; }
        const message = await channel.messages.fetch(record.discordMessageId!);
        if (message.author.id !== this.discord.client.user?.id) { skipped++; continue; }
        let changed = false;
        const rows = message.components.map(row => {
          const json = row.toJSON();
          if (!('components' in json) || !Array.isArray(json.components)) return json;
          const components = json.components.map(component => {
            if (component.type !== 2 || component.style !== ButtonStyle.Link) return component;
            if (!('url' in component) || !/view club on web/i.test(component.label || '')) return component;
            const target = buildClubWebUrl(this.config.frontendUrl, guildId);
            if (component.url === target) return component;
            changed = true;
            return { ...component, url: target };
          });
          return { ...json, components };
        });
        if (changed) {
          await message.edit({ components: rows as Parameters<typeof message.edit>[0] extends never ? never : any });
          updated++;
          await new Promise(resolve => setTimeout(resolve, 300));
        } else skipped++;
      } catch { failed++; }
    }
    return { updated, skipped, failed, inspected: records.length, limit: 200 };
  }
}
''')
change('src/vpg/vpg.module.ts', "import { VpgController } from './vpg.controller';", "import { VpgController } from './vpg.controller';\nimport { VpgNotificationsController } from './vpg-notifications.controller';")
change('src/vpg/vpg.module.ts', 'controllers: [VpgController]', 'controllers: [VpgController, VpgNotificationsController]')

# Expose all today's matches to Match Center without relying on the first result page.
p = ROOT / 'src/vpg/vpg.controller.ts'
s = p.read_text()
s = "import { fixturesOnDay, romaniaClock } from './notification-policy';\n" + s
anchor = "  @Get('api/vpg/superliga/leaderboard')"
assert anchor in s
s = s.replace(anchor, r'''  @Get('api/vpg/superliga/today')
  async getTodayMatches() {
    const season = await this.vpgService.fetchLatestSeason();
    const [results, fixtures] = await Promise.all([
      this.vpgService.fetchAllMatches('complete', season),
      this.vpgService.fetchAllMatches('scheduled', season),
    ]);
    const date = romaniaClock(new Date()).date;
    return { date, season, results: fixturesOnDay(results, date), fixtures: fixturesOnDay(fixtures, date), updatedAt: new Date().toISOString() };
  }

''' + anchor)
p.write_text(s)

# CORS handling remains out of scope; public-link changes do not rewrite the live .env.
print('Prepared backend notification, identity, additive-schema, and public-link changes.')
