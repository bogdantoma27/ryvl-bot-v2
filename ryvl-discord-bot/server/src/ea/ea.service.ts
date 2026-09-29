import { resolveEaMatchType, formatEaMatchType } from './ea-match-type';
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import {
  EaClubSearchResult,
  EaRawMatch,
  ParsedEaMatch,
  ParsedEaPlayer,
  EaMatchPlayerStat,
  PublicRosterMember,
} from './ea.types';

import { existsSync, mkdirSync, copyFileSync } from 'fs';

const execFileAsync = promisify(execFile);

export const EA_CREST_TEMPLATE =
  'https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l{identifier}.png';
export const EA_DEFAULT_CREST =
  'https://media.contentapi.ea.com/content/dam/ea/fc/common/global/tertiary-logo.svg';

@Injectable()
export class EaService {
  private readonly logger = new Logger(EaService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getScriptPath(): string {
    const candidate1 = join(__dirname, 'scripts', 'ea_bridge.py');
    if (existsSync(candidate1)) return candidate1;

    const candidate2 = join(process.cwd(), 'src', 'ea', 'scripts', 'ea_bridge.py');
    if (existsSync(candidate2)) {
      try {
        const destDir = join(__dirname, 'scripts');
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        copyFileSync(candidate2, candidate1);
        return candidate1;
      } catch {
        return candidate2;
      }
    }

    const candidate3 = join(__dirname, '..', '..', 'src', 'ea', 'scripts', 'ea_bridge.py');
    if (existsSync(candidate3)) return candidate3;

    return candidate1;
  }

  getCrestUrl(teamId?: number | string, crestAssetId?: number | string): string {
    const identifier = teamId || crestAssetId;
    return identifier ? EA_CREST_TEMPLATE.replace('{identifier}', String(identifier)) : EA_DEFAULT_CREST;
  }

  private getPythonExecutable(): string {
    // Production uses a project-local virtual environment so Python dependencies
    // are isolated from Ubuntu's system Python (PEP 668).
    const venvPython = join(process.cwd(), '.venv', 'bin', 'python');
    if (existsSync(venvPython)) return venvPython;

    // Ubuntu 24.04 provides "python3" by default; "python" may not exist.
    return 'python3';
  }

  private async runBridge(command: string, args: string[]): Promise<any> {
    try {
      const scriptPath = this.getScriptPath();
      const { stdout } = await execFileAsync(
        this.getPythonExecutable(),
        [scriptPath, command, ...args],
        { maxBuffer: 15 * 1024 * 1024, timeout: 20000 },
      );
      return JSON.parse(stdout.trim());
    } catch (error: any) {
      this.logger.error(`Error running ea_bridge command ${command}: ${error.message}`);
      throw error;
    }
  }


  async searchClubs(query: string, platform = 'common-gen5'): Promise<EaClubSearchResult[]> {
    if (!query || !query.trim()) return [];
    return this.runBridge('search', [platform, query.trim()]);
  }

  async fetchMatchesRaw(
    clubId: string,
    matchType = 'leagueMatch',
    count = 10,
    platform = 'common-gen5',
  ): Promise<EaRawMatch[]> {
    const matches = await this.runBridge('matches', [platform, String(clubId), matchType, String(count)]);
    if (!Array.isArray(matches)) throw new Error('Invalid upstream match response');
    // Keep the endpoint category through merging, persistence and embed creation.
    // Copy each object so EA's original fields remain intact for diagnostics.
    return matches.filter((match): match is EaRawMatch => Boolean(match && typeof match === 'object' && match.matchId))
      .map(match => ({ ...match, sourceMatchTypes: [matchType] }));
  }

  async fetchClubInfo(clubId: string, platform = 'common-gen5'): Promise<any> {
    return this.runBridge('club_info', [platform, String(clubId)]);
  }

  async fetchOverallStats(clubId: string, platform = 'common-gen5'): Promise<any> {
    return this.runBridge('overall_stats', [platform, String(clubId)]);
  }

  async fetchMemberStats(clubId: string, platform = 'common-gen5'): Promise<any> {
    return this.runBridge('member_stats', [platform, String(clubId)]);
  }

  private mapPosition(proPos: any, favoritePosition?: string): { position: string; positionGroup: 'forward' | 'midfielder' | 'defender' | 'goalkeeper' } {
    const code = parseInt(String(proPos), 10);
    switch (code) {
      case 0:
        return { position: 'GK', positionGroup: 'goalkeeper' };
      case 1:
        return { position: 'SW', positionGroup: 'defender' };
      case 2:
        return { position: 'RWB', positionGroup: 'defender' };
      case 3:
        return { position: 'RB', positionGroup: 'defender' };
      case 4:
      case 5:
      case 6:
        return { position: 'CB', positionGroup: 'defender' };
      case 7:
        return { position: 'LB', positionGroup: 'defender' };
      case 8:
        return { position: 'LWB', positionGroup: 'defender' };
      case 9:
      case 10:
      case 11:
        return { position: 'CDM', positionGroup: 'midfielder' };
      case 12:
        return { position: 'RM', positionGroup: 'midfielder' };
      case 13:
      case 14:
      case 15:
        return { position: 'CM', positionGroup: 'midfielder' };
      case 16:
        return { position: 'LM', positionGroup: 'midfielder' };
      case 17:
      case 18:
      case 19:
        return { position: 'CAM', positionGroup: 'midfielder' };
      case 20:
      case 21:
      case 22:
        return { position: 'CF', positionGroup: 'forward' };
      case 23:
        return { position: 'RW', positionGroup: 'forward' };
      case 24:
      case 25:
      case 26:
        return { position: 'ST', positionGroup: 'forward' };
      case 27:
        return { position: 'LW', positionGroup: 'forward' };
      default: {
        const fav = (favoritePosition || '').toLowerCase();
        if (fav.includes('forward')) return { position: 'FW', positionGroup: 'forward' };
        if (fav.includes('midfield')) return { position: 'MID', positionGroup: 'midfielder' };
        if (fav.includes('defen')) return { position: 'DEF', positionGroup: 'defender' };
        if (fav.includes('goal') || fav.includes('keeper')) return { position: 'GK', positionGroup: 'goalkeeper' };
        return { position: 'PRO', positionGroup: 'midfielder' };
      }
    }
  }

  async getPublicRoster(platform = 'common-gen5', clubId?: string): Promise<PublicRosterMember[]> {
    let targetClubId = clubId;
    if (!targetClubId) {
      const config = await this.prisma.clubTrackerConfig.findFirst();
      if (config?.clubId) {
        targetClubId = config.clubId;
      } else {
        targetClubId = '128199'; // Default RYVL Esports club ID
      }
    }

    try {
      const data = await this.fetchMemberStats(targetClubId, platform);
      const members = Array.isArray(data?.members) ? data.members : [];

      return members.map((m: any) => {
        const posInfo = this.mapPosition(m.proPos, m.favoritePosition);
        return {
          name: m.name || 'Unknown',
          proName: m.proName || m.name || 'Virtual Pro',
          proOverall: parseInt(String(m.proOverall || 80), 10) || 80,
          position: posInfo.position,
          positionGroup: posInfo.positionGroup,
          gamesPlayed: parseInt(String(m.gamesPlayed || 0), 10) || 0,
          goals: parseInt(String(m.goals || 0), 10) || 0,
          assists: parseInt(String(m.assists || 0), 10) || 0,
          ratingAve: parseFloat(String(m.ratingAve || 0.0)) || 0.0,
          cleanSheets: parseInt(String(m.cleanSheetsGK || m.cleanSheetsDef || 0), 10) || 0,
          manOfTheMatch: parseInt(String(m.manOfTheMatch || 0), 10) || 0,
          passSuccessRate: parseInt(String(m.passSuccessRate || 0), 10) || 0,
          tackleSuccessRate: parseInt(String(m.tackleSuccessRate || 0), 10) || 0,
          shotSuccessRate: parseInt(String(m.shotSuccessRate || 0), 10) || 0,
          nationality: String(m.proNationality || '39'),
          height: parseInt(String(m.proHeight || 180), 10) || 180,
        };
      });
    } catch (err: any) {
      this.logger.error(`Failed to get public roster for club ${targetClubId}: ${err.message}`);
      return [];
    }
  }

  parsePlayer(stat: EaMatchPlayerStat): ParsedEaPlayer {
    const passesMade = parseInt(String(stat.passesmade || 0), 10) || 0;
    const passAttempts = parseInt(String(stat.passattempts || 0), 10) || 0;
    const tacklesMade = parseInt(String(stat.tacklesmade || 0), 10) || 0;
    const tackleAttempts = parseInt(String(stat.tackleattempts || 0), 10) || 0;
    const goals = parseInt(String(stat.goals || 0), 10) || 0;
    const assists = parseInt(String(stat.assists || 0), 10) || 0;
    const shots = parseInt(String(stat.shots || 0), 10) || 0;
    const saves = parseInt(String(stat.saves || 0), 10) || 0;
    const cleanSheetsGk = parseInt(String(stat.cleansheetsgk || 0), 10) || 0;
    const redCards = parseInt(String(stat.redcards || 0), 10) || 0;
    const rating = parseFloat(String(stat.rating || 0)) || 0;
    const isMom = String(stat.mom) === '1' || String(stat.mom).toLowerCase() === 'true';

    return {
      gamertag: stat.playername || 'Unknown',
      rating,
      goals,
      assists,
      shots,
      passesMade,
      passAttempts,
      tacklesMade,
      tackleAttempts,
      saves,
      cleanSheetsGk,
      isMom,
      position: stat.pos || 'player',
      redCards,
    };
  }

  parseMatch(raw: EaRawMatch, trackedClubId: string): ParsedEaMatch {
    const clubIds = Object.keys(raw.clubs || {});
    const homeClubId = clubIds[0] || '';
    const awayClubId = clubIds[1] || '';

    const isHome = String(homeClubId) === String(trackedClubId);
    const opponentClubId = isHome ? awayClubId : homeClubId;

    const trackedClubData = raw.clubs?.[trackedClubId];
    const opponentClubData = raw.clubs?.[opponentClubId];

    const trackedScore = parseInt(String(trackedClubData?.score ?? trackedClubData?.goals ?? 0), 10);
    const opponentScore = parseInt(String(opponentClubData?.score ?? opponentClubData?.goals ?? 0), 10);

    let outcome: 'WIN' | 'LOSS' | 'DRAW' = 'DRAW';
    if (trackedScore > opponentScore) outcome = 'WIN';
    else if (trackedScore < opponentScore) outcome = 'LOSS';

    const trackedDetails = trackedClubData?.details;
    const opponentDetails = opponentClubData?.details;

    const trackedCrestUrl = this.getCrestUrl(
      trackedDetails?.teamId,
      trackedDetails?.customKit?.crestAssetId,
    );
    const opponentCrestUrl = this.getCrestUrl(
      opponentDetails?.teamId,
      opponentDetails?.customKit?.crestAssetId,
    );

    const trackedPlayersRaw = raw.players?.[trackedClubId] || {};
    const opponentPlayersRaw = raw.players?.[opponentClubId] || {};

    const trackedPlayers: ParsedEaPlayer[] = Object.values(trackedPlayersRaw)
      .map((p) => this.parsePlayer(p))
      .sort((a, b) => b.rating - a.rating);

    const opponentPlayers: ParsedEaPlayer[] = Object.values(opponentPlayersRaw)
      .map((p) => this.parsePlayer(p))
      .sort((a, b) => b.rating - a.rating);

    const matchType = resolveEaMatchType(raw, trackedClubId);
    const trackedAggregate = raw.aggregate?.[trackedClubId];
    const opponentAggregate = raw.aggregate?.[opponentClubId];

    return {
      matchId: String(raw.matchId),
      timestamp: new Date((raw.timestamp || Date.now() / 1000) * 1000),
      matchType,
      matchTypeLabel: formatEaMatchType(matchType),
      trackedClubId,
      isHome,
      outcome,
      trackedClub: {
        id: trackedClubId,
        name: trackedDetails?.name || 'RYVL Esports',
        score: trackedScore,
        crestUrl: trackedCrestUrl,
        aggregate: trackedAggregate,
      },
      opponentClub: {
        id: opponentClubId,
        name: opponentDetails?.name || 'Opponent',
        score: opponentScore,
        crestUrl: opponentCrestUrl,
        aggregate: opponentAggregate,
      },
      trackedPlayers,
      opponentPlayers,
      rawMatch: raw,
    };
  }

  async getOrCreateTrackerConfig(guildId: string) {
    const existing = await this.prisma.clubTrackerConfig.findUnique({
      where: { guildId },
    });
    if (existing) return existing;

    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    return this.prisma.clubTrackerConfig.create({
      data: {
        guildId,
        clubId: '128199',
        clubName: 'RYVL Esports',
        platform: 'common-gen5',
        channelId: guild?.defaultChannelId || null,
        enabled: true,
        matchTypes: ['leagueMatch', 'friendlyMatch', 'playoffMatch'],
        pollIntervalSec: 90,
      },
    });
  }

  async updateTrackerConfig(guildId: string, data: any) {
    return this.prisma.clubTrackerConfig.upsert({
      where: { guildId },
      update: {
        ...(data.clubId ? { clubId: String(data.clubId) } : {}),
        ...(data.clubName ? { clubName: String(data.clubName) } : {}),
        ...(data.platform ? { platform: String(data.platform) } : {}),
        ...(data.channelId !== undefined ? { channelId: data.channelId } : {}),
        ...(data.enabled !== undefined ? { enabled: Boolean(data.enabled) } : {}),
        ...(data.matchTypes ? { matchTypes: data.matchTypes } : {}),
        ...(data.pollIntervalSec ? { pollIntervalSec: Number(data.pollIntervalSec) } : {}),
        ...(data.lastMatchId !== undefined ? { lastMatchId: data.lastMatchId } : {}),
        ...(data.lastPolledAt !== undefined ? { lastPolledAt: data.lastPolledAt } : {}),
      },
      create: {
        guildId,
        clubId: data.clubId ? String(data.clubId) : '128199',
        clubName: data.clubName ? String(data.clubName) : 'RYVL Esports',
        platform: data.platform ? String(data.platform) : 'common-gen5',
        channelId: data.channelId || null,
        enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
        matchTypes: data.matchTypes || ['leagueMatch', 'friendlyMatch', 'playoffMatch'],
        pollIntervalSec: data.pollIntervalSec ? Number(data.pollIntervalSec) : 90,
        lastMatchId: data.lastMatchId || null,
      },
    });
  }

  async getDefaultTrackerConfig() {
    const existing = await this.prisma.clubTrackerConfig.findFirst({
      where: { enabled: true },
    });
    if (existing) return existing;

    const firstGuild = await this.prisma.guild.findFirst();
    if (firstGuild) return this.getOrCreateTrackerConfig(firstGuild.id);

    return {
      id: 'default',
      guildId: 'default',
      clubId: '128199',
      clubName: 'RYVL Esports',
      platform: 'common-gen5',
      channelId: null,
      enabled: true,
      matchTypes: ['leagueMatch', 'friendlyMatch', 'playoffMatch'],
      pollIntervalSec: 90,
      lastPolledAt: null,
      lastMatchId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async recordMatchPlayerStats(matchId: string, clubId: string, raw: EaRawMatch): Promise<void> {
    try {
      const clubPlayers = raw.players?.[clubId];
      if (!clubPlayers || typeof clubPlayers !== 'object') return;

      const timestamp = new Date((raw.timestamp || Date.now() / 1000) * 1000);

      for (const [playerProId, stat] of Object.entries(clubPlayers)) {
        if (!stat || !stat.playername) continue;

        const rating = parseFloat(String(stat.rating || '0')) || 0;
        const goals = parseInt(String(stat.goals || '0'), 10) || 0;
        const assists = parseInt(String(stat.assists || '0'), 10) || 0;
        const shots = parseInt(String(stat.shots || '0'), 10) || 0;
        const passesMade = parseInt(String(stat.passesmade || '0'), 10) || 0;
        const passAttempts = parseInt(String(stat.passattempts || '0'), 10) || 0;
        const tacklesMade = parseInt(String(stat.tacklesmade || '0'), 10) || 0;
        const tackleAttempts = parseInt(String(stat.tackleattempts || '0'), 10) || 0;
        const saves = parseInt(String(stat.saves || '0'), 10) || 0;
        const mom = stat.mom === true || stat.mom === 1 || String(stat.mom) === '1' ? 1 : 0;
        const cleanSheetDef = parseInt(String(stat.cleansheetsdef || '0'), 10) || 0;
        const cleanSheetGk = parseInt(String(stat.cleansheetsgk || '0'), 10) || 0;
        const cleanSheetsAny = parseInt(String(stat.cleansheetsany || '0'), 10) || 0;
        const redCards = parseInt(String(stat.redcards || '0'), 10) || 0;
        const yellowCards = parseInt(String(stat.yellowcards || '0'), 10) || 0;
        const fouls = parseInt(String(stat.fouls || '0'), 10) || 0;
        const dribbles = parseInt(String(stat.dribbles || '0'), 10) || 0;
        const secondsPlayed = parseInt(String(stat.secondsplayed || '0'), 10) || 0;
        const goalsConceded = parseInt(String(stat.goalsconceded || '0'), 10) || 0;
        const matchEventAggregate0 = stat.match_event_aggregate_0 ? String(stat.match_event_aggregate_0) : null;
        const matchEventAggregate1 = stat.match_event_aggregate_1 ? String(stat.match_event_aggregate_1) : null;
        const matchEventAggregate2 = stat.match_event_aggregate_2 ? String(stat.match_event_aggregate_2) : null;
        const matchEventAggregate3 = stat.match_event_aggregate_3 ? String(stat.match_event_aggregate_3) : null;

        await this.prisma.eaPlayerMatchStat.upsert({
          where: {
            eaMatchId_playerProName_clubId: {
              eaMatchId: matchId,
              playerProName: stat.playername,
              clubId,
            },
          },
          update: {
            rating,
            goals,
            assists,
            shots,
            passesMade,
            passAttempts,
            tacklesMade,
            tackleAttempts,
            saves,
            mom,
            cleanSheetDef,
            cleanSheetGk,
            cleanSheetsAny,
            redCards,
            yellowCards,
            fouls,
            dribbles,
            secondsPlayed,
            goalsConceded,
            matchEventAggregate0,
            matchEventAggregate1,
            matchEventAggregate2,
            matchEventAggregate3,
            pos: stat.pos || null,
            timestamp,
          },
          create: {
            eaMatchId: matchId,
            clubId,
            playerProId: String(playerProId),
            playerProName: stat.playername,
            pos: stat.pos || null,
            rating,
            goals,
            assists,
            shots,
            passesMade,
            passAttempts,
            tacklesMade,
            tackleAttempts,
            saves,
            mom,
            cleanSheetDef,
            cleanSheetGk,
            cleanSheetsAny,
            redCards,
            yellowCards,
            fouls,
            dribbles,
            secondsPlayed,
            goalsConceded,
            matchEventAggregate0,
            matchEventAggregate1,
            matchEventAggregate2,
            matchEventAggregate3,
            timestamp,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to persist player match stats for match ${matchId}: ${err?.message || err}`);
    }
  }

  async getPlayerStats(guildId: string, playerIdentifier: string) {
    const trimmed = playerIdentifier.trim();

    // Check if playerIdentifier is a Discord user ID or mention (<@123456>)
    const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
    const discordId = mentionMatch ? mentionMatch[1] : trimmed;

    let registered = await this.prisma.registeredDiscordPlayer.findFirst({
      where: {
        guildId,
        OR: [
          { discordUserId: discordId },
          { eaPlayerName: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
    });

    const eaName = registered ? registered.eaPlayerName : trimmed;

    // Fetch individual match records for this player
    const stats = await this.prisma.eaPlayerMatchStat.findMany({
      where: {
        playerProName: { equals: eaName, mode: 'insensitive' },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const totalMatches = stats.length;
    let totalGoals = 0;
    let totalAssists = 0;
    let totalShots = 0;
    let totalPassesMade = 0;
    let totalPassAttempts = 0;
    let totalTacklesMade = 0;
    let totalSaves = 0;
    let totalMom = 0;
    let totalCleanSheets = 0;
    let totalRedCards = 0;
    let ratingSum = 0;

    for (const s of stats) {
      totalGoals += s.goals;
      totalAssists += s.assists;
      totalShots += s.shots;
      totalPassesMade += s.passesMade;
      totalPassAttempts += s.passAttempts;
      totalTacklesMade += s.tacklesMade;
      totalSaves += s.saves;
      totalMom += s.mom;
      totalCleanSheets += Math.max(s.cleanSheetDef, s.cleanSheetGk);
      totalRedCards += s.redCards;
      ratingSum += s.rating;
    }

    // Decode event aggregates from matchEventAggregate0..3 across all matches
    const allBuckets: string[] = [];
    for (const s of stats) {
      if (s.matchEventAggregate0) allBuckets.push(s.matchEventAggregate0);
      if (s.matchEventAggregate1) allBuckets.push(s.matchEventAggregate1);
      if (s.matchEventAggregate2) allBuckets.push(s.matchEventAggregate2);
      if (s.matchEventAggregate3) allBuckets.push(s.matchEventAggregate3);
    }
    const decodedEvents = decodeMatchEvents(...allBuckets);

    const avgRating = totalMatches > 0 ? (ratingSum / totalMatches).toFixed(2) : '0.0';
    const passAccuracy = totalPassAttempts > 0 ? Math.round((totalPassesMade / totalPassAttempts) * 100) : 0;

    return {
      eaPlayerName: eaName,
      discordUserId: registered?.discordUserId || null,
      preferredPos: registered?.preferredPos || stats[0]?.pos || null,
      totalMatches,
      goals: totalGoals,
      assists: totalAssists,
      shots: totalShots,
      avgRating,
      passesMade: totalPassesMade,
      passAttempts: totalPassAttempts,
      passAccuracy,
      tacklesMade: totalTacklesMade,
      saves: totalSaves,
      cleanSheets: totalCleanSheets,
      redCards: totalRedCards,
      momAwards: totalMom,
      events: decodedEvents,
      recentMatches: stats.slice(0, 5),
    };
  }

  // ----------------------------------------------------
  // Multi-Club Tracking Methods
  // ----------------------------------------------------

  async getTrackedClubs(guildId: string) {
    let clubs = await this.prisma.trackedClub.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' },
    });

    if (clubs.length === 0) {
      try {
        const config = await this.getOrCreateTrackerConfig(guildId);
        const primaryClub = await this.prisma.trackedClub.upsert({
          where: {
            guildId_clubId: { guildId, clubId: config.clubId || '128199' },
          },
          update: {},
          create: {
            guildId,
            clubId: config.clubId || '128199',
            clubName: config.clubName || 'RYVL Esports',
            channelId: config.channelId || null,
            platform: config.platform || 'common-gen5',
            enabled: config.enabled ?? true,
            elo: 1200,
          },
        });
        clubs = [primaryClub];
      } catch (err: any) {
        this.logger.warn(`Could not seed default tracked club for guild ${guildId}: ${err.message}`);
      }
    }

    return clubs;
  }

  async addTrackedClub(
    guildId: string,
    clubId: string,
    clubName: string,
    channelId?: string | null,
    platform = 'common-gen5',
    crestUrl?: string | null,
  ) {
    let targetChannel = channelId || null;
    if (!targetChannel) {
      const guild = await this.prisma.guild.findUnique({
        where: { id: guildId },
        select: { defaultLiveResultsChannelId: true, defaultChannelId: true },
      });
      targetChannel = guild?.defaultLiveResultsChannelId || guild?.defaultChannelId || null;
    }

    return this.prisma.trackedClub.upsert({
      where: {
        guildId_clubId: { guildId, clubId },
      },
      update: {
        clubName,
        channelId: targetChannel,
        platform,
        enabled: true,
        crestUrl: crestUrl || null,
      },
      create: {
        guildId,
        clubId,
        clubName,
        channelId: targetChannel,
        platform,
        enabled: true,
        crestUrl: crestUrl || null,
        elo: 1200,
      },
    });
  }

  async removeTrackedClub(guildId: string, clubId: string) {
    return this.prisma.trackedClub.deleteMany({
      where: { guildId, clubId },
    });
  }

  async updateTrackedClub(guildId: string, clubId: string, data: { enabled?: boolean; channelId?: string | null; platform?: string; clubName?: string }) {
    return this.prisma.trackedClub.updateMany({
      where: { guildId, clubId },
      data,
    });
  }

  async getClubStats(guildId: string, clubNameOrId?: string) {
    let clubId = clubNameOrId?.trim();
    let trackedClub = null;

    if (clubId) {
      trackedClub = await this.prisma.trackedClub.findFirst({
        where: {
          guildId,
          OR: [
            { clubId },
            { clubName: { contains: clubId, mode: 'insensitive' } },
          ],
        },
      });
    }

    if (!trackedClub) {
      trackedClub = await this.prisma.trackedClub.findFirst({
        where: { guildId, enabled: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    const defaultCfg = await this.getOrCreateTrackerConfig(guildId);
    const targetClubId = trackedClub ? trackedClub.clubId : defaultCfg.clubId;
    const targetClubName = trackedClub ? trackedClub.clubName : defaultCfg.clubName;
    const elo = trackedClub ? trackedClub.elo : 1200;

    // Fetch processed matches for this club
    const matches = await this.prisma.processedEaMatch.findMany({
      where: {
        guildId,
        clubId: targetClubId,
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;

    for (const m of matches) {
      const isHome = m.homeClubName.toLowerCase().includes(targetClubName.toLowerCase());
      const teamScore = isHome ? m.homeScore : m.awayScore;
      const oppScore = isHome ? m.awayScore : m.homeScore;

      goalsFor += teamScore;
      goalsAgainst += oppScore;

      if (oppScore === 0) cleanSheets += 1;
      if (teamScore > oppScore) wins += 1;
      else if (teamScore < oppScore) losses += 1;
      else draws += 1;
    }

    // Top scorers from eaPlayerMatchStat for this club
    const playerStats = await this.prisma.eaPlayerMatchStat.findMany({
      where: { clubId: targetClubId },
    });

    const goalsByPlayer = new Map<string, { name: string; goals: number; assists: number; matches: number }>();
    for (const ps of playerStats) {
      const cur = goalsByPlayer.get(ps.playerProName) || { name: ps.playerProName, goals: 0, assists: 0, matches: 0 };
      cur.goals += ps.goals;
      cur.assists += ps.assists;
      cur.matches += 1;
      goalsByPlayer.set(ps.playerProName, cur);
    }

    const topScorers = Array.from(goalsByPlayer.values())
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, 5);

    return {
      clubId: targetClubId,
      clubName: targetClubName,
      elo,
      totalMatches: matches.length,
      wins,
      draws,
      losses,
      winRate: matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      cleanSheets,
      topScorers,
      recentMatches: matches.slice(0, 5),
    };
  }

  async getRegisteredPlayers(guildId: string) {
    return this.prisma.registeredDiscordPlayer.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async registerPlayer(
    guildId: string,
    discordUserId: string,
    eaPlayerName: string,
    preferredPos?: string,
    actorId = 'system',
  ) {
    const record = await this.prisma.registeredDiscordPlayer.upsert({
      where: {
        guildId_discordUserId: { guildId, discordUserId },
      },
      update: {
        eaPlayerName: eaPlayerName.trim(),
        preferredPos: preferredPos?.trim() || null,
      },
      create: {
        guildId,
        discordUserId,
        eaPlayerName: eaPlayerName.trim(),
        preferredPos: preferredPos?.trim() || null,
      },
    });

    await this.prisma.playerRegistrationAudit.create({
      data: {
        guildId,
        action: 'LINK',
        discordUserId,
        eaPlayerName: eaPlayerName.trim(),
        performedById: actorId,
      },
    });

    return record;
  }

  async unregisterPlayer(guildId: string, discordUserId: string, actorId = 'system') {
    const existing = await this.prisma.registeredDiscordPlayer.findUnique({
      where: { guildId_discordUserId: { guildId, discordUserId } },
    });

    if (existing) {
      await this.prisma.registeredDiscordPlayer.delete({
        where: { id: existing.id },
      });

      await this.prisma.playerRegistrationAudit.create({
        data: {
          guildId,
          action: 'UNLINK',
          discordUserId,
          eaPlayerName: existing.eaPlayerName,
          performedById: actorId,
        },
      });
    }

    return { success: true };
  }

  async getRegistrationAuditLog(guildId: string) {
    return this.prisma.playerRegistrationAudit.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

export function decodeMatchEvents(...buckets: (string | null | undefined)[]) {
  const counts = new Map<number, number>();
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== 'string') continue;
    for (const item of bucket.split(',')) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const eventId = parseInt(parts[0], 10);
        const count = parseInt(parts[1], 10);
        if (!isNaN(eventId) && !isNaN(count)) {
          counts.set(eventId, (counts.get(eventId) || 0) + count);
        }
      }
    }
  }

  const e = (id: number) => counts.get(id) || 0;

  return {
    yellowCards: e(95) + e(213),
    fouls: e(2) + e(3),
    penaltiesConceded: e(94),
    cornersConceded: e(10),
    passesFailed: e(216),
    passesForwardSuccess: e(30),
    passesForwardFailed: e(31),
    passesBackwardSuccess: e(32),
    passesBackwardFailed: e(33),
    passesSidewaysSuccess: e(34),
    passesSidewaysFailed: e(35),
    passesShortSuccess: e(24),
    passesShortFailed: e(25),
    passesMediumSuccess: e(26),
    passesMediumFailed: e(27),
    passesLongSuccess: e(28),
    passesLongFailed: e(29),
    crossesSuccess: e(36),
    crossesFailed: e(37),
    offsidePasses: e(153),
    cornersAttempted: e(145),
    crossesAttempted: e(157),
    crossesBlocked: e(156),
    throughBalls: e(152),
    firstTouchPasses: e(143),
    flairPasses: e(147),
    eventGoals: e(214),
    eventAssists: e(11),
    eventSecondAssists: e(115),
    shotsOnTarget: e(217),
    shotsOffTarget: e(218),
    shotsOnTargetInBox: e(13),
    shotsOnTargetOutBox: e(18),
    shotsOffTargetInBox: e(14),
    shotsOffTargetOutBox: e(19),
    shotsSaved: e(202),
    standingTacklesWon: e(229),
    slidingTacklesWon: e(230),
    tacklesLost: e(1),
    dangerousTackles: e(163),
    cleanTackles: e(164),
    dispossessedOpponent: e(158),
    dribblesCompleted: e(174),
    dribbleBeat: Math.max(0, e(112) - e(38)),
    dribbleSkillBeat: e(38),
  };
}

