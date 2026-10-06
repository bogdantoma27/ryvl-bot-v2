import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Guild, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import { DiscordService } from '../discord/discord.service';
import { RyvlEmbedBuilder } from '../discord/embeds/ryvl-embed.builder';
import { ContactSubmission, RecruitmentSubmission, SubmissionKind } from './website-forms';

export interface SubmissionResult {
  id: string;
  delivered: boolean;
}

@Injectable()
export class WebsiteSubmissionsService {
  private readonly logger = new Logger(WebsiteSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly discord: DiscordService,
  ) {}

  private channelFor(kind: SubmissionKind, guild: Guild): string | null {
    return kind === 'contact'
      ? guild.defaultContactChannelId
      : guild.defaultRecruitmentChannelId || guild.defaultContactChannelId;
  }

  /**
   * RYVL_GUILD_ID pins the receiving server. Without it: the oldest registered server
   * (by joinedAt) that has the form's channel configured, else the oldest server.
   * Visitors cannot pick the server.
   */
  async resolveTargetGuild(kind: SubmissionKind): Promise<Guild | null> {
    const pinned = this.config.ryvlGuildId;
    if (pinned) return this.prisma.guild.findUnique({ where: { id: pinned } });
    const guilds = await this.prisma.guild.findMany({ orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }] });
    return guilds.find((g) => this.channelFor(kind, g)) || guilds[0] || null;
  }

  async submit(kind: 'contact', payload: ContactSubmission): Promise<SubmissionResult>;
  async submit(kind: 'recruitment', payload: RecruitmentSubmission): Promise<SubmissionResult>;
  async submit(kind: SubmissionKind, payload: ContactSubmission | RecruitmentSubmission): Promise<SubmissionResult> {
    const guild = await this.resolveTargetGuild(kind);
    if (!guild) {
      throw new ServiceUnavailableException('The website forms are not connected to a Discord server yet.');
    }

    // Stored first: the submission survives a missing channel or a Discord outage and
    // stays visible to admins under Settings > Website forms.
    const row = await this.prisma.websiteSubmission.create({
      data: { guildId: guild.id, kind, payload: payload as unknown as Prisma.InputJsonValue },
    });

    const channelId = this.channelFor(kind, guild);
    if (!channelId) {
      this.logger.warn(`Website ${kind} form ${row.id} stored; no ${kind} channel configured for guild ${guild.id}`);
      return { id: row.id, delivered: false };
    }

    try {
      const channel = await this.discord.assertChannelInGuild(guild.id, channelId);
      const embed =
        kind === 'contact'
          ? RyvlEmbedBuilder.buildContactSubmissionEmbed(payload as ContactSubmission)
          : RyvlEmbedBuilder.buildRecruitmentSubmissionEmbed(payload as RecruitmentSubmission);
      const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      await this.prisma.websiteSubmission.update({
        where: { id: row.id },
        data: { deliveredMessageId: message.id },
      });
      return { id: row.id, delivered: true };
    } catch (err: any) {
      this.logger.error(`Website ${kind} form ${row.id} stored but not posted to Discord: ${err?.message || err}`);
      return { id: row.id, delivered: false };
    }
  }

  async listForGuild(guildId: string, limit = 50) {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
    const rows = await this.prisma.websiteSubmission.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
      delivered: !!row.deliveredMessageId,
      deliveredMessageId: row.deliveredMessageId,
    }));
  }
}
