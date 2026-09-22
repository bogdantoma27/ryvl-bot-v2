import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import {
  FORMATIONS,
  formationKeys,
  slotsByFormation,
  FormationLayout,
} from './lineup-formations';
import {
  LineupRendererService,
  RenderLineupOptions,
} from './lineup-renderer.service';

export interface LineupFormationsResponse {
  formations: string[];
  labels_by_formation: Record<string, string>;
  slots_by_formation: Record<string, string[]>;
  coords_by_formation: Record<string, Record<string, [number, number]>>;
  canvas_width: number;
  canvas_height: number;
}

export interface LineupRenderDto {
  formation: string;
  title: string;
  players: Record<string, string>;
  kickoff_at?: string | null;
  primary_color?: string;
  secondary_color?: string;
  show_slot_tags?: boolean;
}

export interface LineupPostDto extends LineupRenderDto {
  channel_id: string;
  mention_role_ids?: string[];
}

export interface LineupDraftPayload {
  title?: string;
  channel_id?: string;
  formation?: string;
  kickoff_at?: string | null;
  timezone?: string;
  mention_role_ids?: string[];
  assignments?: Record<string, string>;
}

@Injectable()
export class LineupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discordService: DiscordService,
    private readonly renderer: LineupRendererService,
  ) {}

  listFormations(): LineupFormationsResponse {
    const keys = formationKeys();
    const labels: Record<string, string> = {};
    const coords: Record<string, Record<string, [number, number]>> = {};

    for (const key of keys) {
      const layout: FormationLayout = FORMATIONS[key];
      labels[key] = layout.label;
      coords[key] = layout.coords;
    }

    return {
      formations: keys,
      labels_by_formation: labels,
      slots_by_formation: slotsByFormation(),
      coords_by_formation: coords,
      canvas_width: 1350,
      canvas_height: 940,
    };
  }

  renderSvg(dto: LineupRenderDto): string {
    if (!FORMATIONS[dto.formation]) {
      throw new BadRequestException(`Unknown formation: ${dto.formation}`);
    }

    return this.renderer.renderSvg({
      formation: dto.formation,
      title: dto.title,
      players: dto.players,
      kickoffAt: dto.kickoff_at,
      primaryColor: dto.primary_color,
      secondaryColor: dto.secondary_color,
      showSlotTags: dto.show_slot_tags,
    });
  }

  async renderPng(dto: LineupRenderDto): Promise<Buffer> {
    if (!FORMATIONS[dto.formation]) {
      throw new BadRequestException(`Unknown formation: ${dto.formation}`);
    }

    return this.renderer.renderPng({
      formation: dto.formation,
      title: dto.title,
      players: dto.players,
      kickoffAt: dto.kickoff_at,
      primaryColor: dto.primary_color,
      secondaryColor: dto.secondary_color,
      showSlotTags: dto.show_slot_tags,
    });
  }

  async postLineup(
    guildId: string,
    dto: LineupPostDto,
  ): Promise<{ ok: boolean; channel_id: string; message_id: string }> {
    if (!dto.channel_id) {
      throw new BadRequestException('channel_id is required');
    }

    const pngBuffer = await this.renderPng(dto);

    // Format role mentions
    const mentions = (dto.mention_role_ids || [])
      .filter((roleId) => /^\d+$/.test(roleId))
      .map((roleId) => `<@&${roleId}>`)
      .join(' ');

    const fileName = `lineup-${dto.formation}.png`;
    const message = await this.discordService.sendImageMessageToChannel(
      dto.channel_id,
      pngBuffer,
      fileName,
      mentions,
    );

    return {
      ok: true,
      channel_id: dto.channel_id,
      message_id: message.id,
    };
  }

  async listDrafts(guildId: string) {
    return this.prisma.lineupDraft.findMany({
      where: { guildId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getDraft(guildId: string, draftId: string) {
    const draft = await this.prisma.lineupDraft.findFirst({
      where: { id: draftId, guildId },
    });
    if (!draft) {
      throw new NotFoundException(`Lineup draft not found`);
    }
    return draft;
  }

  async createDraft(guildId: string, userId: string, payload: LineupDraftPayload) {
    return this.prisma.lineupDraft.create({
      data: {
        guildId,
        title: payload.title || 'RYVL Match Lineup',
        channelId: payload.channel_id || null,
        formation: payload.formation || '433',
        kickoffAt: payload.kickoff_at ? new Date(payload.kickoff_at) : null,
        timezone: payload.timezone || 'Europe/Bucharest',
        mentionRoleIds: payload.mention_role_ids || [],
        assignments: payload.assignments || {},
        createdByDiscordId: userId,
      },
    });
  }

  async updateDraft(
    guildId: string,
    draftId: string,
    payload: LineupDraftPayload,
  ) {
    await this.getDraft(guildId, draftId);

    return this.prisma.lineupDraft.update({
      where: { id: draftId },
      data: {
        title: payload.title !== undefined ? payload.title : undefined,
        channelId: payload.channel_id !== undefined ? payload.channel_id : undefined,
        formation: payload.formation !== undefined ? payload.formation : undefined,
        kickoffAt:
          payload.kickoff_at !== undefined
            ? payload.kickoff_at
              ? new Date(payload.kickoff_at)
              : null
            : undefined,
        timezone: payload.timezone !== undefined ? payload.timezone : undefined,
        mentionRoleIds:
          payload.mention_role_ids !== undefined ? payload.mention_role_ids : undefined,
        assignments: payload.assignments !== undefined ? payload.assignments : undefined,
      },
    });
  }

  async deleteDraft(guildId: string, draftId: string) {
    await this.getDraft(guildId, draftId);

    await this.prisma.lineupDraft.delete({
      where: { id: draftId },
    });

    return { ok: true, id: draftId };
  }
}
