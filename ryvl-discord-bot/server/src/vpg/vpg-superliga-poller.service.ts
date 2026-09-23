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

type League = { slug: string; name: string; season: number; ryvl: boolean; general: boolean };
@Injectable()
export class VpgSuperligaPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VpgSuperligaPollerService.name);
  private initialTimer?: NodeJS.Timeout;
  private readonly active = new Set<string>();
  private readonly weeklyAttempts = new Map<string, Date>();
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
    const weeklyDue = standingsDue(now) && (force || intervalDue(this.weeklyAttempts.get(guild.id), config.pollIntervalSec, now));
    if (!resultDue && !fixtureDue && !weeklyDue) return { postedCount: 0, updatedCount: 0 };
    const lease = randomUUID();
    const acquired = await this.prisma.vpgNotificationConfig.updateMany({
      where: { guildId: guild.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseToken: lease, leaseUntil: new Date(Date.now() + 120000) },
    });
    if (!acquired.count) return { postedCount: 0, updatedCount: 0, busy: true };
    this.active.add(guild.id);
    if (weeklyDue) this.weeklyAttempts.set(guild.id, now);
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
        leagues.set(`Superliga-Romania:${season}`, { slug: 'Superliga-Romania', name: 'VPG Superliga România', season, ryvl: false, general: true });
      }
      for (const competition of competitions) {
        const season = competition.season || await this.cached(`season:${competition.slug}`, () => this.vpgService.fetchLatestSeason(competition.slug));
        const key = `${competition.slug}:${season}`;
        leagues.set(key, { slug: competition.slug, name: competition.name, season, ryvl: true, general: leagues.get(key)?.general || false });
      }
      for (const league of leagues.values()) {
        checkLease();
        const general = league.general;
        try {
          // Result delivery must not depend on the standings endpoint being available.
          // When slugs are unavailable, the exact RYVL aliases remain the safe fallback.
          let table: VpgStandingsRow[] = [];
          try {
            table = await this.cached(`table:${league.slug}:${league.season}`, () => this.vpgService.fetchStandings(league.season, league.slug));
          } catch (error) {
            if (weeklyDue) errors.push(`Standings unavailable for ${league.name}`);
            this.logger.warn(`Standings unavailable for ${league.slug}; using exact team-name matching for results.`);
          }
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const attempts = (this.failures.get(guild.id) || 0) + 1;
      this.failures.set(guild.id, attempts);
      await this.prisma.vpgNotificationConfig.updateMany({ where: { guildId: guild.id, leaseToken: lease }, data: {
        lastError: reason.slice(0, 1500),
        retryAfter: new Date(Date.now() + Math.min(1800, config.pollIntervalSec * 2 ** Math.min(attempts - 1, 4)) * 1000),
      } });
      throw error;
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
