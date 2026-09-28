import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { TournamentRendererService, TournamentStandingsRow, TournamentTeamRoster, TournamentPlayerPick } from './tournament-renderer.service';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from 'discord.js';

export const DRAFT_FORMATIONS: Record<string, string[]> = {
  '3-1-4-2': ['GK', 'LCB', 'CCB', 'RCB', 'CDM', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'],
  '3-5-2': ['GK', 'LCB', 'CCB', 'RCB', 'CM', 'CM', 'LM', 'RM', 'CAM', 'ST', 'ST'],
};

export function normalizeDraftFormation(formation?: string): string {
  if (!formation) return '3-1-4-2';
  const clean = formation.replace(/[^0-9]/g, '');
  if (clean === '352') return '3-5-2';
  return '3-1-4-2';
}

export function getFormationSlots(formation?: string): string[] {
  const norm = normalizeDraftFormation(formation);
  return DRAFT_FORMATIONS[norm] || DRAFT_FORMATIONS['3-1-4-2'];
}

export function getBasePositions(formation?: string): string[] {
  return Array.from(new Set(getFormationSlots(formation)));
}

export interface TournamentSignupItem {
  id: string;
  userId: string;
  displayName: string;
  gamertag: string;
  pos1: string;
  pos2?: string;
  isBackup?: boolean;
  isManager?: boolean;
  notes?: string;
  createdAt: string;
}

export interface TournamentMatchItem {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
  date?: string;
}

export interface DraftState {
  snakeOrder: number[];
  currentTurn: number;
  teamJokers: Record<number, number>;
  currentLockedPosition?: string | null;
  currentCandidate?: TournamentSignupItem | null;
  picks: Array<{
    teamIndex: number;
    teamName: string;
    userId: string;
    gamertag: string;
    displayName: string;
    position: string;
  }>;
  complete: boolean;
}

@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TournamentRendererService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
  ) {}

  async getOrCreateConfig(guildId: string) {
    const existing = await this.prisma.tournamentConfig.findUnique({
      where: { guildId },
    });
    if (existing) return existing;

    return this.prisma.tournamentConfig.create({
      data: { guildId },
    });
  }

  async updateConfig(guildId: string, data: any) {
    return this.prisma.tournamentConfig.upsert({
      where: { guildId },
      update: {
        ...(data.adminChannelId !== undefined ? { adminChannelId: data.adminChannelId } : {}),
        ...(data.signupChannelId !== undefined ? { signupChannelId: data.signupChannelId } : {}),
        ...(data.tournamentCategoryId !== undefined ? { tournamentCategoryId: data.tournamentCategoryId } : {}),
        ...(data.resultsChannelId !== undefined ? { resultsChannelId: data.resultsChannelId } : {}),
        ...(data.chatChannelId !== undefined ? { chatChannelId: data.chatChannelId } : {}),
        ...(data.standingsChannelId !== undefined ? { standingsChannelId: data.standingsChannelId } : {}),
        ...(data.rostersChannelId !== undefined ? { rostersChannelId: data.rostersChannelId } : {}),
      },
      create: {
        guildId,
        ...data,
      },
    });
  }

  async listTournaments(guildId: string) {
    return this.prisma.tournamentInstance.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTournament(id: string) {
    const t = await this.prisma.tournamentInstance.findUnique({
      where: { id },
    });
    if (!t) throw new NotFoundException(`Tournament ${id} not found.`);
    return t;
  }

  async createTournament(
    guildId: string,
    data: { name: string; type?: string; formation?: string; numTeams?: number },
  ) {
    const type = data.type === 'DRAFT' ? 'DRAFT' : 'STANDARD';
    const formation = normalizeDraftFormation(data.formation);
    const numTeams = data.numTeams || 6;

    const defaultTeams: TournamentTeamRoster[] = Array.from({ length: numTeams }, (_, i) => ({
      id: `team_${i + 1}`,
      name: `FC 27 Draft RO ${i + 1}`,
      managerName: undefined,
      picks: [],
    }));

    // Snake draft order: 10 rounds of picking to complete an 11-player squad
    const snakeOrder: number[] = [];
    for (let round = 0; round < 10; round++) {
      const roundOrder = Array.from({ length: numTeams }, (_, i) => i);
      if (round % 2 === 1) roundOrder.reverse();
      snakeOrder.push(...roundOrder);
    }

    const teamJokers: Record<number, number> = {};
    for (let i = 0; i < numTeams; i++) {
      teamJokers[i] = 4; // 4 jokers per team as defined in rules
    }

    const draftState: DraftState = {
      snakeOrder,
      currentTurn: 0,
      teamJokers,
      currentLockedPosition: null,
      currentCandidate: null,
      picks: [],
      complete: false,
    };

    const tournament = await this.prisma.tournamentInstance.create({
      data: {
        guildId,
        name: data.name,
        type,
        formation,
        status: 'SIGNUPS_OPEN',
        teamsData: defaultTeams as any,
        signupsData: [] as any,
        matchesData: [] as any,
        draftState: draftState as any,
      },
    });

    return tournament;
  }

  async addSignup(
    tournamentId: string,
    data: { userId: string; displayName: string; gamertag: string; pos1: string; pos2?: string; notes?: string; isManager?: boolean },
  ) {
    const t = await this.getTournament(tournamentId);
    const signups: TournamentSignupItem[] = (t.signupsData as any) || [];

    const existingIdx = signups.findIndex((s) => s.userId === data.userId);
    const newEntry: TournamentSignupItem = {
      id: `signup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: data.userId,
      displayName: data.displayName,
      gamertag: data.gamertag,
      pos1: data.pos1,
      pos2: data.pos2,
      isManager: Boolean(data.isManager),
      notes: data.notes,
      isBackup: signups.length >= 66,
      createdAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      signups[existingIdx] = { ...signups[existingIdx], ...newEntry };
    } else {
      signups.push(newEntry);
    }

    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: { signupsData: signups as any },
    });

    return updated;
  }

  async removeSignup(tournamentId: string, userId: string) {
    const t = await this.getTournament(tournamentId);
    const signups: TournamentSignupItem[] = (t.signupsData as any) || [];
    const filtered = signups.filter((s) => s.userId !== userId);

    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: { signupsData: filtered as any },
    });

    return updated;
  }

  // ----------------------------------------------------
  // Discord-Native Draft Wheel System
  // ----------------------------------------------------

  async spinDraftWheel(tournamentId: string, position: string, teamIndex?: number) {
    const t = await this.getTournament(tournamentId);
    const draft: DraftState = (t.draftState as any) || {
      snakeOrder: [],
      currentTurn: 0,
      teamJokers: {},
      picks: [],
      complete: false,
    };

    if (draft.complete) {
      throw new BadRequestException('Draft is already complete!');
    }

    const currentTeamIndex = draft.snakeOrder[draft.currentTurn];
    if (teamIndex !== undefined && teamIndex !== currentTeamIndex) {
      throw new BadRequestException(`It is not Team ${teamIndex + 1}'s turn! Turn belongs to Team ${currentTeamIndex + 1}.`);
    }

    const signups: TournamentSignupItem[] = (t.signupsData as any) || [];
    const pickedUserIds = new Set(draft.picks.map((p) => p.userId));

    // Filter available candidates
    const available = signups.filter((s) => !s.isBackup && !pickedUserIds.has(s.userId));
    let candidates = available.filter((s) => s.pos1.toUpperCase() === position.toUpperCase());

    if (candidates.length === 0) {
      // Fallback to secondary position
      candidates = available.filter((s) => s.pos2 && s.pos2.toUpperCase() === position.toUpperCase());
    }

    if (candidates.length === 0) {
      throw new BadRequestException(`No available players remain for position ${position}!`);
    }

    // Spin randomly
    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
    draft.currentLockedPosition = position.toUpperCase();
    draft.currentCandidate = candidate;

    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: { draftState: draft as any },
    });

    return { tournament: updated, candidate, position: draft.currentLockedPosition };
  }

  async useDraftJoker(tournamentId: string, teamIndex?: number) {
    const t = await this.getTournament(tournamentId);
    const draft: DraftState = (t.draftState as any);

    if (!draft.currentCandidate || !draft.currentLockedPosition) {
      throw new BadRequestException('Spin the wheel before using a joker!');
    }

    const currentTeamIndex = draft.snakeOrder[draft.currentTurn];
    if (teamIndex !== undefined && teamIndex !== currentTeamIndex) {
      throw new BadRequestException('It is not this team\'s turn!');
    }

    const currentJokers = draft.teamJokers[currentTeamIndex] || 0;
    if (currentJokers <= 0) {
      throw new BadRequestException('No jokers remaining for this team!');
    }

    const signups: TournamentSignupItem[] = (t.signupsData as any) || [];
    const pickedUserIds = new Set(draft.picks.map((p) => p.userId));
    const available = signups.filter(
      (s) => !s.isBackup && !pickedUserIds.has(s.userId) && s.userId !== draft.currentCandidate?.userId,
    );

    let candidates = available.filter((s) => s.pos1.toUpperCase() === draft.currentLockedPosition);
    if (candidates.length === 0) {
      candidates = available.filter((s) => s.pos2 && s.pos2.toUpperCase() === draft.currentLockedPosition);
    }

    const newCandidate = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : draft.currentCandidate;

    draft.teamJokers[currentTeamIndex] = currentJokers - 1;
    draft.currentCandidate = newCandidate;

    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: { draftState: draft as any },
    });

    return { tournament: updated, candidate: newCandidate, jokersLeft: draft.teamJokers[currentTeamIndex] };
  }

  async confirmDraftPick(tournamentId: string, teamIndex?: number) {
    const t = await this.getTournament(tournamentId);
    const draft: DraftState = (t.draftState as any);

    if (!draft.currentCandidate || !draft.currentLockedPosition) {
      throw new BadRequestException('Spin the wheel to get a candidate before confirming!');
    }

    const currentTeamIndex = draft.snakeOrder[draft.currentTurn];
    if (teamIndex !== undefined && teamIndex !== currentTeamIndex) {
      throw new BadRequestException('It is not this team\'s turn!');
    }

    const teams: TournamentTeamRoster[] = (t.teamsData as any) || [];
    const targetTeam = teams[currentTeamIndex];

    const pickItem = {
      teamIndex: currentTeamIndex,
      teamName: targetTeam.name,
      userId: draft.currentCandidate.userId,
      gamertag: draft.currentCandidate.gamertag,
      displayName: draft.currentCandidate.displayName,
      position: draft.currentLockedPosition,
    };

    draft.picks.push(pickItem);

    if (targetTeam) {
      targetTeam.picks.push({
        userId: draft.currentCandidate.userId,
        displayName: draft.currentCandidate.displayName,
        gamertag: draft.currentCandidate.gamertag,
        position: draft.currentLockedPosition,
      });
    }

    draft.currentCandidate = null;
    draft.currentLockedPosition = null;
    draft.currentTurn += 1;

    if (draft.currentTurn >= draft.snakeOrder.length) {
      draft.complete = true;
    }

    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: {
        draftState: draft as any,
        teamsData: teams as any,
        status: draft.complete ? 'ACTIVE' : 'DRAFTING',
      },
    });

    return { tournament: updated, pick: pickItem, complete: draft.complete };
  }

  async autoDraftRemaining(tournamentId: string) {
    const t = await this.getTournament(tournamentId);
    const draft: DraftState = (t.draftState as any);
    const teams: TournamentTeamRoster[] = (t.teamsData as any) || [];
    const signups: TournamentSignupItem[] = (t.signupsData as any) || [];
    const slots = getFormationSlots(t.formation);

    const pickedUserIds = new Set(draft.picks.map((p) => p.userId));
    let available = signups.filter((s) => !s.isBackup && !pickedUserIds.has(s.userId));

    while (draft.currentTurn < draft.snakeOrder.length && available.length > 0) {
      const teamIdx = draft.snakeOrder[draft.currentTurn];
      const targetTeam = teams[teamIdx];
      const neededPos = slots[targetTeam.picks.length] || 'CM';

      // Pick matching or first available
      const matchIdx = available.findIndex((s) => s.pos1 === neededPos || s.pos2 === neededPos);
      const chosen = matchIdx >= 0 ? available.splice(matchIdx, 1)[0] : available.shift()!;

      draft.picks.push({
        teamIndex: teamIdx,
        teamName: targetTeam.name,
        userId: chosen.userId,
        gamertag: chosen.gamertag,
        displayName: chosen.displayName,
        position: neededPos,
      });

      targetTeam.picks.push({
        userId: chosen.userId,
        displayName: chosen.displayName,
        gamertag: chosen.gamertag,
        position: neededPos,
      });

      draft.currentTurn += 1;
    }

    draft.complete = true;
    draft.currentCandidate = null;
    draft.currentLockedPosition = null;

    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: {
        draftState: draft as any,
        teamsData: teams as any,
        status: 'ACTIVE',
      },
    });

    return updated;
  }

  // ----------------------------------------------------
  // Match Results & Standings
  // ----------------------------------------------------

  async recordMatchResult(
    tournamentId: string,
    matchData: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number },
  ) {
    const t = await this.getTournament(tournamentId);
    const matches: TournamentMatchItem[] = (t.matchesData as any) || [];

    const newMatch: TournamentMatchItem = {
      id: `match_${Date.now()}`,
      homeTeam: matchData.homeTeam,
      awayTeam: matchData.awayTeam,
      homeScore: matchData.homeScore,
      awayScore: matchData.awayScore,
      completed: true,
      date: new Date().toISOString(),
    };

    matches.push(newMatch);

    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: { matchesData: matches as any },
    });

    return updated;
  }

  calculateStandings(t: any): TournamentStandingsRow[] {
    const teams: TournamentTeamRoster[] = (t.teamsData as any) || [];
    const matches: TournamentMatchItem[] = (t.matchesData as any) || [];

    const statsMap = new Map<string, { played: number; wins: number; draws: number; losses: number; gf: number; ga: number; pts: number }>();

    for (const team of teams) {
      statsMap.set(team.name, { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 });
    }

    for (const m of matches) {
      if (!m.completed) continue;
      const home = statsMap.get(m.homeTeam) || { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 };
      const away = statsMap.get(m.awayTeam) || { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 };

      home.played++;
      away.played++;
      home.gf += m.homeScore;
      home.ga += m.awayScore;
      away.gf += m.awayScore;
      away.ga += m.homeScore;

      if (m.homeScore > m.awayScore) {
        home.wins++;
        home.pts += 3;
        away.losses++;
      } else if (m.homeScore < m.awayScore) {
        away.wins++;
        away.pts += 3;
        home.losses++;
      } else {
        home.draws++;
        home.pts += 1;
        away.draws++;
        away.pts += 1;
      }

      statsMap.set(m.homeTeam, home);
      statsMap.set(m.awayTeam, away);
    }

    const rows: TournamentStandingsRow[] = Array.from(statsMap.entries()).map(([team, s]) => ({
      rank: 1,
      team,
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
      goalDifference: s.gf - s.ga,
      points: s.pts,
    }));

    rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
    rows.forEach((r, idx) => (r.rank = idx + 1));
    return rows;
  }

  // ----------------------------------------------------
  // Discord Automation (MultiBots Inspired Channel Suite)
  // ----------------------------------------------------

  async setupTournamentChannels(guildId: string, tournamentId: string) {
    const tournament = await this.getTournament(tournamentId);
    const client = this.discordService.client;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));

    if (!guild) throw new NotFoundException(`Guild ${guildId} not found in Discord gateway.`);

    // 1. Create Category
    const category = await guild.channels.create({
      name: `🏆 ${tournament.name}`,
      type: ChannelType.GuildCategory,
    });

    // 2. MultiBots inspired channel suite
    const [infoChan, announcementsChan, registrationChan, fixturesChan, standingsChan, chatChan] = await Promise.all([
      guild.channels.create({
        name: 'info-rules',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'announcements',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'registration',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'fixtures-results',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'table-standings',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'tournament-chat',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
    ]);

    // Save channel IDs to tournament instance
    await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: {
        discordCategoryId: category.id,
        discordChannels: {
          info: infoChan.id,
          announcements: announcementsChan.id,
          registration: registrationChan.id,
          fixtures: fixturesChan.id,
          standings: standingsChan.id,
          chat: chatChan.id,
        },
      },
    });

    // Post initial embeds
    await this.postInfoEmbed(infoChan.id, tournament);
    await this.postRegistrationEmbed(registrationChan.id, tournament);
    await this.postResultsEmbed(fixturesChan.id, tournament);
    await this.postStandingsAndRosters(standingsChan.id, standingsChan.id, tournament);

    // If draft tournament, also create and post draft wheel channel
    let draftChanId: string | undefined;
    if (tournament.type === 'DRAFT') {
      const draftChan = await guild.channels.create({
        name: 'draft-wheel',
        type: ChannelType.GuildText,
        parent: category.id,
      });
      draftChanId = draftChan.id;
      await this.postDraftWheelEmbed(draftChan.id, tournament);
    }

    return {
      categoryId: category.id,
      channels: {
        info: infoChan.id,
        announcements: announcementsChan.id,
        registration: registrationChan.id,
        fixtures: fixturesChan.id,
        standings: standingsChan.id,
        chat: chatChan.id,
        draft: draftChanId,
      },
    };
  }

  async postInfoEmbed(channelId: string, tournament: any) {
    const formation = normalizeDraftFormation(tournament.formation);
    const slots = getFormationSlots(formation);

    const embed = new EmbedBuilder()
      .setTitle(`📜 Tournament Information & Rules — ${tournament.name}`)
      .setColor(0x00e5ff)
      .setDescription(
        `Welcome to **${tournament.name}**!\n\n` +
        `**Format**: 11v11 Pro Clubs\n` +
        `**Tactical Formation**: \`${formation}\`\n` +
        `**Slots**: ${slots.join(', ')}\n\n` +
        `**Scoring System**:\n` +
        `• Win: **3 Points**\n` +
        `• Draw: **1 Point**\n` +
        `• Loss: **0 Points**\n\n` +
        `**Rules & Conduct**:\n` +
        `1. All participants must use registered gamertags.\n` +
        `2. Report scores in <#${channelId}> promptly after match conclusion.\n` +
        `3. In case of disconnection or dispute, ping admins via **Apelează Admin**.`,
      )
      .setFooter({ text: 'RYVL Esports Bot • Tournament Engine' });

    return this.discordService.sendMessageToChannel(channelId, embed);
  }

  async postRegistrationEmbed(channelId: string, tournament: any) {
    const signups: TournamentSignupItem[] = (tournament.signupsData as any) || [];
    const formation = normalizeDraftFormation(tournament.formation);

    const participantsList = signups.length > 0
      ? signups
          .slice(0, 20)
          .map((s, idx) => `${idx + 1}. **${s.displayName}** (\`${s.gamertag}\` - ${s.pos1})`)
          .join('\n')
      : 'No participants registered yet.';

    const embed = new EmbedBuilder()
      .setTitle(`📋 Registration Portal — ${tournament.name}`)
      .setColor(0x00d26a)
      .setDescription(
        `⭐ **Registration Status**: \`${tournament.status}\`\n\n` +
        `**Registered Participants** (${signups.length} Players):\n${participantsList}\n\n` +
        `• Formation: **${formation}**\n` +
        `• Click **Sign Up** below to register your gamertag and position.`,
      )
      .setFooter({ text: 'RYVL Esports Bot • Tournament Registration' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:signup:${tournament.id}`)
        .setLabel('Sign Up')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⬆'),
      new ButtonBuilder()
        .setCustomId(`tourney:pullout:${tournament.id}`)
        .setLabel('Pull Out')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⬇'),
      new ButtonBuilder()
        .setCustomId(`tourney:refresh_signup:${tournament.id}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    );

    return this.discordService.sendMessageToChannel(channelId, embed, [row]);
  }

  async postDraftWheelEmbed(channelId: string, tournament: any) {
    const draft: DraftState = (tournament.draftState as any) || {
      snakeOrder: [],
      currentTurn: 0,
      teamJokers: {},
      picks: [],
      complete: false,
    };

    const teams: TournamentTeamRoster[] = (tournament.teamsData as any) || [];
    const numTeams = teams.length || 6;
    const currentTeamIdx = draft.snakeOrder[draft.currentTurn] ?? 0;
    const currentTeam = teams[currentTeamIdx] || { name: `Team ${currentTeamIdx + 1}` };
    const roundNumber = Math.min(10, Math.floor(draft.currentTurn / numTeams) + 1);

    const jokersList = teams
      .map((t, idx) => `• **${t.name}**: ${draft.teamJokers[idx] ?? 4} Jokers left`)
      .join('\n');

    const recentPicks = draft.picks.slice(-5).reverse();
    const recentPicksText = recentPicks.length > 0
      ? recentPicks.map((p) => `• **${p.teamName}** picked **${p.displayName}** (${p.position})`).join('\n')
      : 'No picks made yet.';

    const candidateText = draft.currentCandidate
      ? `🎯 **Wheel Selected**: **${draft.currentCandidate.displayName}** (\`${draft.currentCandidate.gamertag}\`)\n` +
        `Position: **${draft.currentLockedPosition}** (Primary: ${draft.currentCandidate.pos1}${draft.currentCandidate.pos2 ? `, Secondary: ${draft.currentCandidate.pos2}` : ''})`
      : '🎰 *Wheel is ready. Captain: Click **Spin Wheel** to select a position.*';

    const embed = new EmbedBuilder()
      .setTitle(`🎡 FC Draft RO — Interactive Draft Wheel`)
      .setColor(draft.complete ? 0x5865f2 : 0xf1c40f)
      .setDescription(
        draft.complete
          ? `🎉 **THE DRAFT IS OFFICIALLY COMPLETE!**\nAll 11 roster positions for every team are finalized.`
          : `**Round**: **${roundNumber}** of 10 • **Active Turn**: **${currentTeam.name}**\n\n` +
            `${candidateText}\n\n` +
            `**Jokers Remaining**:\n${jokersList}\n\n` +
            `**Recent Picks**:\n${recentPicksText}`,
      )
      .setFooter({ text: 'RYVL Esports Bot • Discord-Native Draft Engine' });

    const buttons: ButtonBuilder[] = [];

    if (!draft.complete) {
      if (!draft.currentCandidate) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`tourney:draft:spin_modal:${tournament.id}`)
            .setLabel(`Spin Wheel (${currentTeam.name})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎰'),
        );
      } else {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`tourney:draft:confirm:${tournament.id}`)
            .setLabel('Confirm Pick')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`tourney:draft:joker:${tournament.id}`)
            .setLabel(`Use Joker (${draft.teamJokers[currentTeamIdx] ?? 0} Left)`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🃏'),
        );
      }

      buttons.push(
        new ButtonBuilder()
          .setCustomId(`tourney:draft:autodraft:${tournament.id}`)
          .setLabel('Auto-Draft Remaining')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚡'),
      );
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    return this.discordService.sendMessageToChannel(channelId, embed, [row]);
  }

  async postResultsEmbed(channelId: string, tournament: any) {
    const matches: TournamentMatchItem[] = (tournament.matchesData as any) || [];
    const completedCount = matches.filter((m) => m.completed).length;

    const embed = new EmbedBuilder()
      .setTitle(`📝 Fixtures & Results — ${tournament.name}`)
      .setColor(0x5865f2)
      .setDescription(
        `Recorded Matches: **${completedCount}**\n\n` +
        `Team captains and administrators can report match results by clicking **Report Score** below.\n` +
        `If you encounter an issue, click **Call Admin**.`,
      )
      .setFooter({ text: 'RYVL Esports Bot • Tournament Engine' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:result:enter:${tournament.id}`)
        .setLabel('Report Score')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⚽'),
      new ButtonBuilder()
        .setCustomId(`tourney:result:call_admin:${tournament.id}`)
        .setLabel('Call Admin')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚨'),
      new ButtonBuilder()
        .setCustomId(`tourney:result:refresh:${tournament.id}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    );

    return this.discordService.sendMessageToChannel(channelId, embed, [row]);
  }

  async postStandingsAndRosters(standingsChannelId: string, rostersChannelId: string, tournament: any) {
    const rows = this.calculateStandings(tournament);
    const standingsBuffer = await this.renderer.renderStandingsPng(tournament.name, rows);

    await this.discordService.sendMessageToChannel(standingsChannelId, {
      content: `📊 **Clasament Actualizat — ${tournament.name}**`,
      files: [{ attachment: standingsBuffer, name: 'clasament.png' }],
    });

    const teams: TournamentTeamRoster[] = (tournament.teamsData as any) || [];
    for (const team of teams) {
      if (team.picks.length > 0) {
        const rosterBuffer = await this.renderer.renderRosterPng(team, tournament.name);
        await this.discordService.sendMessageToChannel(rostersChannelId, {
          content: `📋 **Roster Oficial: ${team.name}**`,
          files: [{ attachment: rosterBuffer, name: `${team.id}-roster.png` }],
        });
      }
    }
  }

  async postAdminPanel(guildId: string, channelId: string) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Tournament Administration Panel')
      .setColor(0x5865f2)
      .setDescription(
        'Manage tournament creation, signup rosters, match telemetry, and notifications for this server.\n\n' +
        '• **Create Tournament**: Launches a new tournament cycle and provisions channels\n' +
        '• **Status of Signups**: Check active registrations, backups, and position balance\n' +
        '• **Send Notification**: Broadcast tournament announcements or rule updates\n' +
        '• **Open / Close**: Toggle player registrations',
      )
      .setFooter({ text: 'RYVL Esports • Tournament Engine' });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tourney:admin:create')
        .setLabel('Create Tournament')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🆕'),
      new ButtonBuilder()
        .setCustomId('tourney:admin:status')
        .setLabel('Status of Signups')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋'),
      new ButtonBuilder()
        .setCustomId('tourney:admin:notify')
        .setLabel('Send Notification')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📢'),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tourney:admin:toggle_signups')
        .setLabel('Toggle Signups')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚡'),
      new ButtonBuilder()
        .setCustomId('tourney:admin:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    );

    return this.discordService.sendMessageToChannel(channelId, embed, [row1, row2]);
  }
}
