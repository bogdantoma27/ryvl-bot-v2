import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VpgService } from '../vpg/vpg.service';
import { isRyvlTeam } from '../vpg/notification-policy';
import { EventsService } from './events.service';

export interface UpcomingFixture {
  vpgMatchId: number;
  kickoff: string;
  competition: string;
  matchDay: number | null;
  homeName: string;
  awayName: string;
  opponent: string;
  title: string;
  /** Id of the event already created for this fixture, if any. */
  eventId: string | null;
}

export interface CreateFixtureEventsResult {
  created: { vpgMatchId: number; eventId: string; title: string }[];
  skipped: number;
}

/** Minimal shape of a VPG fixture as returned by VpgService.getRyvlPerformance(). */
interface FixtureLike {
  id: number;
  datetime: string;
  matchDay?: number;
  homeName: string;
  awayName: string;
  homeSlug?: string | null;
  awaySlug?: string | null;
}

export function fixtureOpponent(fixture: FixtureLike): string {
  const homeIsRyvl = isRyvlTeam(fixture.homeName) || isRyvlTeam(fixture.homeSlug);
  return homeIsRyvl ? fixture.awayName : fixture.homeName;
}

/** Creates one-off match events from RYVL's upcoming VPG fixtures. */
@Injectable()
export class EventFixturesService {
  private readonly logger = new Logger(EventFixturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // VpgService lives in a module that (indirectly) imports this one, so resolve it lazily.
  private vpg(): VpgService {
    return this.moduleRef.get(VpgService, { strict: false });
  }

  async listUpcomingFixtures(guildId: string, now: Date = new Date()): Promise<UpcomingFixture[]> {
    const vpg = this.vpg();
    const competitions = (await vpg.getCompetitions(guildId)).filter((c) => c.active && c.slug);
    const seen = new Map<number, UpcomingFixture>();
    for (const competition of competitions) {
      let fixtures: FixtureLike[] = [];
      try {
        const performance = await vpg.getRyvlPerformance(guildId, competition.slug);
        fixtures = (performance.upcomingFixtures || []) as FixtureLike[];
      } catch (error) {
        this.logger.warn(`Could not load fixtures for ${competition.slug}: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      for (const fixture of fixtures) {
        const kickoff = new Date(fixture.datetime);
        if (!Number.isFinite(kickoff.getTime()) || kickoff <= now || seen.has(fixture.id)) continue;
        const opponent = fixtureOpponent(fixture);
        seen.set(fixture.id, {
          vpgMatchId: fixture.id,
          kickoff: kickoff.toISOString(),
          competition: competition.name,
          matchDay: fixture.matchDay ?? null,
          homeName: fixture.homeName,
          awayName: fixture.awayName,
          opponent,
          title: `RYVL vs ${opponent}`.slice(0, 100),
          eventId: null,
        });
      }
    }
    const list = [...seen.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    if (list.length) {
      const existing = await this.prisma.event.findMany({
        where: { guildId, vpgMatchId: { in: list.map((f) => f.vpgMatchId) } },
        select: { id: true, vpgMatchId: true },
      });
      const byMatch = new Map(existing.map((e) => [e.vpgMatchId, e.id]));
      for (const fixture of list) fixture.eventId = byMatch.get(fixture.vpgMatchId) ?? null;
    }
    return list;
  }

  async createEventsFromFixtures(
    guildId: string,
    createdById: string,
    options: { channelId: string; matchIds?: number[]; durationMinutes?: number; mentionRoleIds?: string[] },
  ): Promise<CreateFixtureEventsResult> {
    if (!options.channelId) throw new BadRequestException('channelId is required');
    const guild = await this.prisma.guild.findUnique({ where: { id: guildId }, select: { timezone: true } });
    const wanted = options.matchIds?.length ? new Set(options.matchIds.map(Number)) : null;
    const fixtures = (await this.listUpcomingFixtures(guildId)).filter((f) => !f.eventId && (!wanted || wanted.has(f.vpgMatchId)));
    const result: CreateFixtureEventsResult = { created: [], skipped: 0 };
    for (const fixture of fixtures) {
      try {
        const event = await this.events.createEvent(
          guildId,
          createdById,
          {
            title: fixture.title,
            description: `${fixture.competition}${fixture.matchDay ? ` · Matchday ${fixture.matchDay}` : ''}\n${fixture.homeName} vs ${fixture.awayName}`,
            channelId: options.channelId,
            startsAt: fixture.kickoff,
            timezone: guild?.timezone || 'Europe/Bucharest',
            duration: options.durationMinutes || 60,
            mentionRoleIds: options.mentionRoleIds || [],
            rrule: null,
          },
          { vpgMatchId: fixture.vpgMatchId },
        );
        result.created.push({ vpgMatchId: fixture.vpgMatchId, eventId: event.id, title: event.title });
      } catch (error) {
        // Another admin created it concurrently: the (guild, vpg match) key is unique.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          result.skipped++;
          continue;
        }
        throw error;
      }
    }
    return result;
  }
}
