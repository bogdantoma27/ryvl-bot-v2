import { withEaMatchType, resolveEaMatchType, formatEaMatchType } from './ea-match-type';
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
    // The numeric per-club type is not the textual category used by the embed.
    return matches.filter((raw): raw is EaRawMatch => raw !== null && typeof raw === 'object')
      .map(raw => withEaMatchType(raw, matchType));
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

    const trackedAggregate = raw.aggregate?.[trackedClubId];
    const opponentAggregate = raw.aggregate?.[opponentClubId];

    return {
      matchId: String(raw.matchId),
      timestamp: new Date((raw.timestamp || Date.now() / 1000) * 1000),
      matchType: resolveEaMatchType(raw),
      matchTypeLabel: formatEaMatchType(resolveEaMatchType(raw)),
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
}

