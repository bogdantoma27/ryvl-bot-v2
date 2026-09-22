import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  VpgMovementRaw,
  VpgMovementResponse,
  VpgCommunityInfo,
  VpgPlayerContract,
  VpgTransferItem,
  UpdateVpgConfigDto,
} from './vpg.types';

@Injectable()
export class VpgService {
  private readonly logger = new Logger(VpgService.name);

  private readonly API_BASE = 'https://api.virtualprogaming.com/public';
  private readonly COMMUNITY_SLUG = 'VPGRoPS5';
  private readonly VPG_CDN = 'https://virtualprogaming.com/cdn-cgi/imagedelivery/cl8ocWLdmZDs72LEaQYaYw';

  private cachedCommunityId: number | null = null;
  private readonly historyCache = new Map<string, string[]>();

  constructor(private readonly prisma: PrismaService) {}

  buildLogoUrl(logoId?: string | null): string | null {
    if (!logoId) return null;
    return `${this.VPG_CDN}/${logoId}/xlThumb`;
  }

  formatFee(amount?: number | null): string {
    if (!amount || amount <= 0) return 'Free Transfer';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  formatDateRo(dateStr: string): string {
    try {
      const formatted = new Date(dateStr).toLocaleString('ro-RO', {
        timeZone: 'Europe/Bucharest',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return `${formatted} (ora României)`;
    } catch {
      return dateStr;
    }
  }

  async ensureCommunityId(): Promise<number> {
    if (this.cachedCommunityId) return this.cachedCommunityId;
    try {
      const res = await fetch(`${this.API_BASE}/communities/${this.COMMUNITY_SLUG}/`, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as VpgCommunityInfo;
      this.cachedCommunityId = data.id;
      this.logger.log(`Resolved VPG community ${this.COMMUNITY_SLUG} id: ${data.id}`);
      return data.id;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch community ID for ${this.COMMUNITY_SLUG}: ${err.message}`);
      return 0;
    }
  }

  async fetchRawMovements(limit = 15, offset = 0): Promise<VpgMovementRaw[]> {
    const url = `${this.API_BASE}/communities/${this.COMMUNITY_SLUG}/movement/?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'RYVLBot/2.0' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching VPG movements`);
    }
    const json = (await res.json()) as VpgMovementResponse;
    return Array.isArray(json.data) ? json.data : [];
  }

  async fetchPlayerSuperligaHistory(username: string): Promise<string[]> {
    const trimmed = (username || '').trim();
    if (!trimmed) return [];

    if (this.historyCache.has(trimmed)) {
      return this.historyCache.get(trimmed)!;
    }

    const communityId = await this.ensureCommunityId();
    try {
      const url = `${this.API_BASE}/users/${encodeURIComponent(trimmed)}/contracts/`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'RYVLBot/2.0' },
      });
      if (!res.ok) {
        this.historyCache.set(trimmed, []);
        return [];
      }
      const data = await res.json();
      const list: VpgPlayerContract[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];

      const seen = new Set<string>();
      const names: string[] = [];

      for (const contract of list) {
        const teamName = contract.team_name?.trim();
        if (
          contract.community_id === communityId &&
          teamName &&
          !seen.has(teamName)
        ) {
          seen.add(teamName);
          names.push(teamName);
        }
      }

      this.historyCache.set(trimmed, names);
      return names;
    } catch (err: any) {
      this.logger.warn(`Could not fetch contract history for ${trimmed}: ${err.message}`);
      this.historyCache.set(trimmed, []);
      return [];
    }
  }

  async enrichTransfer(raw: VpgMovementRaw): Promise<VpgTransferItem> {
    const username = (raw.username || '').trim();
    const superligaClubs = await this.fetchPlayerSuperligaHistory(username);

    return {
      id: raw.id,
      username: username || 'Unknown Player',
      fromName: raw.from_name?.trim() || 'Free Agent',
      fromSlug: raw.from_slug,
      fromLogoUrl: this.buildLogoUrl(raw.from_logo),
      toName: raw.to_name?.trim() || 'Free Agent',
      toSlug: raw.to_slug,
      toLogoUrl: this.buildLogoUrl(raw.to_logo),
      amount: raw.amount || 0,
      amountFormatted: this.formatFee(raw.amount),
      datetime: raw.datetime,
      dateFormattedRo: this.formatDateRo(raw.datetime),
      superligaClubs,
    };
  }

  async fetchTransfers(limit = 15, offset = 0): Promise<VpgTransferItem[]> {
    const rawList = await this.fetchRawMovements(limit, offset);
    rawList.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

    const enriched = await Promise.all(rawList.map((item) => this.enrichTransfer(item)));
    return enriched;
  }

  // ---------------------------------------------------------------------------
  // Database Configuration & Processed Records
  // ---------------------------------------------------------------------------

  async getOrCreateConfig(guildId: string) {
    let config = await this.prisma.vpgTransferConfig.findUnique({
      where: { guildId },
    });

    if (!config) {
      config = await this.prisma.vpgTransferConfig.create({
        data: {
          guildId,
          communitySlug: this.COMMUNITY_SLUG,
          leagueSlug: 'Superliga-Romania',
          leagueName: 'Superliga România',
          enabled: true,
          pollIntervalSec: 120,
        },
      });
    }

    return config;
  }

  async getDefaultConfig() {
    const firstConfig = await this.prisma.vpgTransferConfig.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (firstConfig) return firstConfig;

    const firstGuild = await this.prisma.guild.findFirst();
    if (firstGuild) {
      return this.getOrCreateConfig(firstGuild.id);
    }

    return {
      id: 'default',
      guildId: 'default',
      communitySlug: this.COMMUNITY_SLUG,
      leagueSlug: 'Superliga-Romania',
      leagueName: 'Superliga România',
      channelId: null,
      enabled: true,
      pollIntervalSec: 120,
      lastPolledAt: null,
      lastTransferId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateConfig(guildId: string, dto: UpdateVpgConfigDto) {
    await this.getOrCreateConfig(guildId);

    return this.prisma.vpgTransferConfig.update({
      where: { guildId },
      data: {
        ...(dto.channelId !== undefined ? { channelId: dto.channelId } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.pollIntervalSec !== undefined ? { pollIntervalSec: dto.pollIntervalSec } : {}),
        ...(dto.leagueSlug !== undefined ? { leagueSlug: dto.leagueSlug } : {}),
        ...(dto.leagueName !== undefined ? { leagueName: dto.leagueName } : {}),
      },
    });
  }

  async getRecentProcessedTransfers(guildId: string, limit = 25) {
    return this.prisma.processedVpgTransfer.findMany({
      where: { guildId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  async isTransferProcessed(guildId: string, transferId: number): Promise<boolean> {
    const existing = await this.prisma.processedVpgTransfer.findUnique({
      where: {
        guildId_transferId: {
          guildId,
          transferId,
        },
      },
    });
    return !!existing;
  }

  async recordProcessedTransfer(params: {
    guildId: string;
    transferId: number;
    username: string;
    fromName?: string | null;
    fromSlug?: string | null;
    fromLogo?: string | null;
    toName?: string | null;
    toSlug?: string | null;
    toLogo?: string | null;
    amount?: number;
    occurredAt: Date;
    discordMessageId?: string | null;
    channelId?: string | null;
  }) {
    return this.prisma.processedVpgTransfer.upsert({
      where: {
        guildId_transferId: {
          guildId: params.guildId,
          transferId: params.transferId,
        },
      },
      create: {
        guildId: params.guildId,
        transferId: params.transferId,
        username: params.username,
        fromName: params.fromName,
        fromSlug: params.fromSlug,
        fromLogo: params.fromLogo,
        toName: params.toName,
        toSlug: params.toSlug,
        toLogo: params.toLogo,
        amount: params.amount || 0,
        occurredAt: params.occurredAt,
        discordMessageId: params.discordMessageId,
        channelId: params.channelId,
      },
      update: {
        discordMessageId: params.discordMessageId,
        channelId: params.channelId,
      },
    });
  }
}
