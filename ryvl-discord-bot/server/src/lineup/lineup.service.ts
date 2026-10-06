import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventStatus, LineupDraft, OccurrenceStatus, Prisma, RsvpStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import {
  FORMATIONS,
  formationKeys,
  slotsByFormation,
  FormationLayout,
} from './lineup-formations';
import { LineupRendererService } from './lineup-renderer.service';
import {
  LineupAssignments,
  assignmentNames,
  autoFillByPreferredPosition,
  normalizeAssignments,
} from './lineup-assignments';

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
  /** Legacy slot → name map. */
  players?: Record<string, string>;
  /** Slot → { discordUserId?, name } (legacy slot → name accepted too). */
  assignments?: unknown;
  /** Slot → EA name printed under the player's name when show_ea_names is set. */
  ea_names?: Record<string, string>;
  show_ea_names?: boolean;
  kickoff_at?: string | null;
  primary_color?: string;
  secondary_color?: string;
  show_slot_tags?: boolean;
}

export interface LineupPostDto extends LineupRenderDto {
  channel_id: string;
  mention_role_ids?: string[];
  /** Records the post on this draft. */
  draft_id?: string;
  /** Edit the draft's last posted message instead of posting a new one. */
  update_existing?: boolean;
}

export interface LineupDraftPayload {
  title?: string;
  channel_id?: string | null;
  formation?: string;
  kickoff_at?: string | null;
  timezone?: string;
  mention_role_ids?: string[];
  assignments?: unknown;
  occurrence_id?: string | null;
  show_ea_names?: boolean;
}

export type LineupDraftView = Omit<LineupDraft, 'assignments'> & { assignments: LineupAssignments };

export type LineupRsvpStatus = 'ACCEPTED' | 'TENTATIVE' | 'DECLINED' | null;

export interface LineupMemberOption {
  discordUserId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  rsvpStatus: LineupRsvpStatus;
  eaPlayerName: string | null;
  preferredPos: string | null;
  /** False for people who answered the RSVP but are no longer listed as guild members. */
  inGuild: boolean;
}

export interface LineupMatchOccurrence {
  occurrenceId: string;
  eventId: string;
  title: string;
  startsAt: string;
  status: OccurrenceStatus;
  isMatch: boolean;
  counts: { accepted: number; tentative: number; declined: number };
}

const RSVP_ORDER: Record<string, number> = { ACCEPTED: 0, TENTATIVE: 1, NONE: 2, DECLINED: 3 };

/** Accepted first, then tentative, then no answer, then declined; alphabetical within each. */
export function sortLineupMembers(members: LineupMemberOption[]): LineupMemberOption[] {
  return [...members].sort(
    (a, b) =>
      RSVP_ORDER[a.rsvpStatus ?? 'NONE'] - RSVP_ORDER[b.rsvpStatus ?? 'NONE'] ||
      a.displayName.localeCompare(b.displayName),
  );
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

  private renderOptions(dto: LineupRenderDto) {
    if (!FORMATIONS[dto.formation]) {
      throw new BadRequestException(`Unknown formation: ${dto.formation}`);
    }
    const assignments = normalizeAssignments(dto.assignments ?? dto.players ?? {});
    return {
      formation: dto.formation,
      title: dto.title,
      players: assignmentNames(assignments),
      subtitles: dto.show_ea_names ? this.cleanNames(dto.ea_names) : undefined,
      kickoffAt: dto.kickoff_at,
      primaryColor: dto.primary_color,
      secondaryColor: dto.secondary_color,
      showSlotTags: dto.show_slot_tags,
    };
  }

  private cleanNames(names: unknown): Record<string, string> {
    if (!names || typeof names !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [slot, value] of Object.entries(names as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) result[slot.toLowerCase()] = value.trim().slice(0, 40);
    }
    return result;
  }

  renderSvg(dto: LineupRenderDto): string {
    return this.renderer.renderSvg(this.renderOptions(dto));
  }

  async renderPng(dto: LineupRenderDto): Promise<Buffer> {
    return this.renderer.renderPng(this.renderOptions(dto));
  }

  /** EA names of the registered players among the given assignments. */
  async eaNamesFor(guildId: string, assignments: LineupAssignments): Promise<Record<string, string>> {
    const ids = [...new Set(Object.values(assignments).map((a) => a.discordUserId).filter((id): id is string => Boolean(id)))];
    if (!ids.length) return {};
    const registered = await this.prisma.registeredDiscordPlayer.findMany({
      where: { guildId, discordUserId: { in: ids } },
      select: { discordUserId: true, eaPlayerName: true },
    });
    const byUser = new Map(registered.map((r) => [r.discordUserId, r.eaPlayerName]));
    const result: Record<string, string> = {};
    for (const [slot, entry] of Object.entries(assignments)) {
      const eaName = entry.discordUserId ? byUser.get(entry.discordUserId) : undefined;
      if (eaName) result[slot] = eaName;
    }
    return result;
  }

  async postLineup(
    guildId: string,
    dto: LineupPostDto,
  ): Promise<{ ok: boolean; channel_id: string; message_id: string; updated: boolean; draft_id: string | null }> {
    const draft = dto.draft_id ? await this.findDraft(guildId, dto.draft_id) : null;
    if (dto.update_existing && (!draft?.lastPostedMessageId || !draft.lastPostedChannelId)) {
      throw new BadRequestException('This lineup has not been posted yet, so there is no message to update.');
    }
    if (!dto.update_existing && !dto.channel_id) {
      throw new BadRequestException('channel_id is required');
    }
    await this.discordService.assertChannelInGuild(guildId, dto.channel_id);

    const assignments = normalizeAssignments(dto.assignments ?? dto.players ?? {});
    // Registered EA names come from the database, not the browser, when IDs are known.
    const eaNames = dto.show_ea_names ? { ...this.cleanNames(dto.ea_names), ...(await this.eaNamesFor(guildId, assignments)) } : undefined;
    const pngBuffer = await this.renderPng({ ...dto, assignments, ea_names: eaNames });

    const mentions = (dto.mention_role_ids || [])
      .filter((roleId) => /^\d+$/.test(roleId))
      .map((roleId) => `<@&${roleId}>`)
      .join(' ');

    const fileName = `lineup-${dto.formation}.png`;
    let channelId = dto.channel_id;
    let messageId: string;
    if (dto.update_existing && draft?.lastPostedMessageId && draft.lastPostedChannelId) {
      channelId = draft.lastPostedChannelId;
      const message = await this.discordService.editImageMessage(channelId, draft.lastPostedMessageId, pngBuffer, fileName, mentions);
      messageId = message.id;
    } else {
      const message = await this.discordService.sendImageMessageToChannel(channelId, pngBuffer, fileName, mentions);
      messageId = message.id;
    }

    if (draft) {
      await this.prisma.lineupDraft.updateMany({
        where: { id: draft.id, guildId },
        data: { lastPostedMessageId: messageId, lastPostedChannelId: channelId, lastPostedAt: new Date() },
      });
    }

    return { ok: true, channel_id: channelId, message_id: messageId, updated: Boolean(dto.update_existing), draft_id: draft?.id ?? null };
  }

  /**
   * Members for the lineup picker with their RSVP status for the chosen occurrence
   * and their registered EA name / preferred position, accepted RSVPs first.
   */
  async getLineupMembers(guildId: string, occurrenceId?: string | null): Promise<LineupMemberOption[]> {
    const [guildMembers, registrations, rsvps] = await Promise.all([
      this.discordService.getGuildMembers(guildId).catch(() => []),
      this.prisma.registeredDiscordPlayer.findMany({
        where: { guildId },
        select: { discordUserId: true, eaPlayerName: true, preferredPos: true },
      }),
      occurrenceId
        ? this.prisma.rsvp.findMany({ where: { occurrenceId, occurrence: { event: { guildId } } }, orderBy: { respondedAt: 'asc' } })
        : Promise.resolve([]),
    ]);
    const registrationByUser = new Map(registrations.map((r) => [r.discordUserId, r]));
    const rsvpByUser = new Map(rsvps.map((r) => [r.userId, r]));
    const members = new Map<string, LineupMemberOption>();
    for (const member of guildMembers) {
      const registration = registrationByUser.get(member.id);
      members.set(member.id, {
        discordUserId: member.id,
        displayName: member.displayName,
        username: member.username ?? null,
        avatarUrl: member.avatarUrl ?? null,
        rsvpStatus: (rsvpByUser.get(member.id)?.status as LineupRsvpStatus) ?? null,
        eaPlayerName: registration?.eaPlayerName ?? null,
        preferredPos: registration?.preferredPos ?? null,
        inGuild: true,
      });
    }
    for (const rsvp of rsvps) {
      if (members.has(rsvp.userId)) continue;
      const registration = registrationByUser.get(rsvp.userId);
      members.set(rsvp.userId, {
        discordUserId: rsvp.userId,
        displayName: rsvp.displayName,
        username: null,
        avatarUrl: rsvp.avatarUrl,
        rsvpStatus: rsvp.status as LineupRsvpStatus,
        eaPlayerName: registration?.eaPlayerName ?? null,
        preferredPos: registration?.preferredPos ?? null,
        inGuild: false,
      });
    }
    return sortLineupMembers([...members.values()]);
  }

  /** Upcoming (or just finished) occurrences the admin can build a lineup for; match events first. */
  async listMatchOccurrences(guildId: string, now: Date = new Date()): Promise<LineupMatchOccurrence[]> {
    const occurrences = await this.prisma.eventOccurrence.findMany({
      where: {
        status: { in: [OccurrenceStatus.SCHEDULED, OccurrenceStatus.PUBLISHED] },
        startsAt: { gte: new Date(now.getTime() - 12 * 3600000) },
        event: { guildId, status: EventStatus.ACTIVE },
      },
      include: { event: { select: { id: true, title: true, vpgMatchId: true } }, rsvps: { select: { status: true } } },
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
    return occurrences.map((occurrence) => ({
      occurrenceId: occurrence.id,
      eventId: occurrence.event.id,
      title: occurrence.event.title,
      startsAt: occurrence.startsAt.toISOString(),
      status: occurrence.status,
      isMatch: occurrence.event.vpgMatchId !== null,
      counts: {
        accepted: occurrence.rsvps.filter((r) => r.status === RsvpStatus.ACCEPTED).length,
        tentative: occurrence.rsvps.filter((r) => r.status === RsvpStatus.TENTATIVE).length,
        declined: occurrence.rsvps.filter((r) => r.status === RsvpStatus.DECLINED).length,
      },
    }));
  }

  /** Fills empty slots with accepted RSVPs by their registered preferred position. */
  async autoFill(guildId: string, body: { formation: string; occurrence_id: string; assignments?: unknown }): Promise<{ assignments: LineupAssignments; unplaced: string[] }> {
    const layout = FORMATIONS[body.formation];
    if (!layout) throw new BadRequestException(`Unknown formation: ${body.formation}`);
    if (!body.occurrence_id) throw new BadRequestException('Choose a match event first');
    const occurrence = await this.prisma.eventOccurrence.findFirst({ where: { id: body.occurrence_id, event: { guildId } }, select: { id: true } });
    if (!occurrence) throw new NotFoundException('Event occurrence not found');
    const members = await this.getLineupMembers(guildId, occurrence.id);
    const accepted = members
      .filter((m) => m.rsvpStatus === 'ACCEPTED')
      .map((m) => ({ discordUserId: m.discordUserId, name: m.displayName, preferredPos: m.preferredPos }));
    const slots = layout.positions.map((p) => p.key);
    const existing = normalizeAssignments(body.assignments ?? {});
    const assignments = autoFillByPreferredPosition(slots, accepted, existing);
    const placed = new Set(Object.values(assignments).map((a) => a.discordUserId));
    return { assignments, unplaced: accepted.filter((c) => !placed.has(c.discordUserId)).map((c) => c.name) };
  }

  private toView(draft: LineupDraft): LineupDraftView {
    return { ...draft, assignments: normalizeAssignments(draft.assignments) };
  }

  private async findDraft(guildId: string, draftId: string): Promise<LineupDraft> {
    const draft = await this.prisma.lineupDraft.findFirst({ where: { id: draftId, guildId } });
    if (!draft) {
      throw new NotFoundException(`Lineup draft not found`);
    }
    return draft;
  }

  private async validOccurrenceId(guildId: string, occurrenceId: string | null | undefined): Promise<string | null | undefined> {
    if (occurrenceId === undefined || occurrenceId === null || occurrenceId === '') return occurrenceId === undefined ? undefined : null;
    const occurrence = await this.prisma.eventOccurrence.findFirst({ where: { id: occurrenceId, event: { guildId } }, select: { id: true } });
    if (!occurrence) throw new BadRequestException('Event occurrence not found in this server');
    return occurrence.id;
  }

  async listDrafts(guildId: string): Promise<LineupDraftView[]> {
    const drafts = await this.prisma.lineupDraft.findMany({
      where: { guildId },
      orderBy: { updatedAt: 'desc' },
    });
    return drafts.map((draft) => this.toView(draft));
  }

  async getDraft(guildId: string, draftId: string): Promise<LineupDraftView> {
    return this.toView(await this.findDraft(guildId, draftId));
  }

  async createDraft(guildId: string, userId: string, payload: LineupDraftPayload): Promise<LineupDraftView> {
    const occurrenceId = await this.validOccurrenceId(guildId, payload.occurrence_id);
    const draft = await this.prisma.lineupDraft.create({
      data: {
        guildId,
        title: payload.title || 'RYVL Match Lineup',
        channelId: payload.channel_id || null,
        formation: payload.formation || '433',
        kickoffAt: payload.kickoff_at ? new Date(payload.kickoff_at) : null,
        timezone: payload.timezone || 'Europe/Bucharest',
        mentionRoleIds: payload.mention_role_ids || [],
        assignments: normalizeAssignments(payload.assignments ?? {}) as Prisma.InputJsonValue,
        occurrenceId: occurrenceId ?? null,
        showEaNames: Boolean(payload.show_ea_names),
        createdByDiscordId: userId,
      },
    });
    return this.toView(draft);
  }

  async updateDraft(guildId: string, draftId: string, payload: LineupDraftPayload): Promise<LineupDraftView> {
    await this.findDraft(guildId, draftId);
    const occurrenceId = await this.validOccurrenceId(guildId, payload.occurrence_id);
    await this.prisma.lineupDraft.updateMany({
      where: { id: draftId, guildId },
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
        mentionRoleIds: payload.mention_role_ids !== undefined ? payload.mention_role_ids : undefined,
        assignments: payload.assignments !== undefined ? (normalizeAssignments(payload.assignments) as Prisma.InputJsonValue) : undefined,
        occurrenceId,
        showEaNames: payload.show_ea_names !== undefined ? Boolean(payload.show_ea_names) : undefined,
      },
    });
    return this.getDraft(guildId, draftId);
  }

  async deleteDraft(guildId: string, draftId: string) {
    await this.findDraft(guildId, draftId);
    await this.prisma.lineupDraft.deleteMany({ where: { id: draftId, guildId } });
    return { ok: true, id: draftId };
  }
}
