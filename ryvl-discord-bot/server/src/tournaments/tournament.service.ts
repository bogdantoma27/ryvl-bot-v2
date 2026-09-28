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
import { TournamentRendererService, TournamentStandingsRow, TournamentTeamRoster } from './tournament-renderer.service';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  CategoryChannel,
  TextChannel,
  PermissionFlagsBits,
} from 'discord.js';

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
    data: { name: string; formation?: string; numTeams?: number },
  ) {
    const numTeams = data.numTeams || 6;
    const defaultTeams: TournamentTeamRoster[] = Array.from({ length: numTeams }, (_, i) => ({
      id: `team_${i + 1}`,
      name: `FC 27 Draft RO ${i + 1}`,
      managerName: undefined,
      picks: [],
    }));

    const tournament = await this.prisma.tournamentInstance.create({
      data: {
        guildId,
        name: data.name,
        formation: data.formation || '3-4-1-2',
        status: 'SIGNUPS_OPEN',
        teamsData: defaultTeams as any,
        signupsData: [] as any,
        matchesData: [] as any,
      },
    });

    return tournament;
  }

  async addSignup(
    tournamentId: string,
    data: { userId: string; displayName: string; gamertag: string; pos1: string; pos2?: string; notes?: string },
  ) {
    const t = await this.getTournament(tournamentId);
    const signups: TournamentSignupItem[] = (t.signupsData as any) || [];

    // Avoid duplicate signups for same user
    const existingIdx = signups.findIndex((s) => s.userId === data.userId);
    const newEntry: TournamentSignupItem = {
      id: `signup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: data.userId,
      displayName: data.displayName,
      gamertag: data.gamertag,
      pos1: data.pos1,
      pos2: data.pos2,
      notes: data.notes,
      isBackup: signups.length >= 66, // 6 teams * 11 = 66 spots
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
  // Discord Automation & Category / Channel Setup
  // ----------------------------------------------------

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

  async setupTournamentChannels(guildId: string, tournamentId: string) {
    const tournament = await this.getTournament(tournamentId);
    const client = this.discordService.client;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));

    if (!guild) throw new NotFoundException(`Guild ${guildId} not found in Discord gateway.`);

    // 1. Create Category
    const category = await guild.channels.create({
      name: `🏆 Turneu: ${tournament.name}`,
      type: ChannelType.GuildCategory,
    });

    // 2. Create sub-channels
    const [signupChan, chatChan, resultsChan, standingsChan, rostersChan] = await Promise.all([
      guild.channels.create({
        name: 'inscriere-turneu',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'chat-turneu',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'rezultate',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'clasament',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
      guild.channels.create({
        name: 'rosters',
        type: ChannelType.GuildText,
        parent: category.id,
      }),
    ]);

    // Save channel IDs to config
    await this.updateConfig(guildId, {
      tournamentCategoryId: category.id,
      signupChannelId: signupChan.id,
      chatChannelId: chatChan.id,
      resultsChannelId: resultsChan.id,
      standingsChannelId: standingsChan.id,
      rostersChannelId: rostersChan.id,
    });

    // Post initial embeds
    await this.postSignupEmbed(signupChan.id, tournament);
    await this.postResultsEmbed(resultsChan.id, tournament);
    await this.postStandingsAndRosters(standingsChan.id, rostersChan.id, tournament);

    return {
      categoryId: category.id,
      channels: {
        signup: signupChan.id,
        chat: chatChan.id,
        results: resultsChan.id,
        standings: standingsChan.id,
        rosters: rostersChan.id,
      },
    };
  }

  /**
   * Posts the signup embed matching media_1790597952943.png
   */
  async postSignupEmbed(channelId: string, tournament: any) {
    const signups: TournamentSignupItem[] = (tournament.signupsData as any) || [];

    const participantsList = signups.length > 0
      ? signups
          .slice(0, 16)
          .map((s, idx) => `${idx + 1}. **${s.displayName}** (\`${s.gamertag}\` - ${s.pos1})`)
          .join('\n')
      : 'No participants registered yet.';

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${tournament.name}`)
      .setColor(0x00d26a)
      .setDescription(
        `⭐ **Signups Open** | 👤 Has Assistant\n\n` +
        `**Participants** (${signups.length} Registered):\n${participantsList}\n\n` +
        `**Info**\n` +
        `🏆 | Format: 11v11 Pro Clubs (${tournament.formation || '3-4-1-2'})\n` +
        `📅 | Status: ${tournament.status}\n` +
        `🕓 | Matches: Scheduled via <#${channelId}>\n\n` +
        `*Click **Sign Up** below to register your gamertag and position.*`,
      )
      .setFooter({ text: 'RYVL Esports • Tournament Engine' });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
        .setCustomId(`tourney:add_assistant:${tournament.id}`)
        .setLabel('Add Assistant')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👤'),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:refresh_signup:${tournament.id}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    );

    return this.discordService.sendMessageToChannel(channelId, embed, [row1, row2]);
  }

  async postResultsEmbed(channelId: string, tournament: any) {
    const matches: TournamentMatchItem[] = (tournament.matchesData as any) || [];
    const completedCount = matches.filter((m) => m.completed).length;

    const embed = new EmbedBuilder()
      .setTitle(`📝 Rezultate Turneu — ${tournament.name}`)
      .setColor(0x5865f2)
      .setDescription(
        `Meciuri înregistrate: **${completedCount}**\n\n` +
        `Căpitanii de echipă sau administratorii pot introduce scorul meciurilor folosind butonul **Introduce Rezultat** de mai jos.\n` +
        `Dacă întâmpinați o problemă sau o dispută, apăsați **Apelează Admin**.`,
      )
      .setFooter({ text: 'RYVL Esports • Sistem Rezultate Turneu' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:result:enter:${tournament.id}`)
        .setLabel('Introduce Rezultat')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📝'),
      new ButtonBuilder()
        .setCustomId(`tourney:result:call_admin:${tournament.id}`)
        .setLabel('Apelează Admin')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚨'),
      new ButtonBuilder()
        .setCustomId(`tourney:result:refresh:${tournament.id}`)
        .setLabel('Reîmprospătează')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    );

    return this.discordService.sendMessageToChannel(channelId, embed, [row]);
  }

  async postStandingsAndRosters(standingsChannelId: string, rostersChannelId: string, tournament: any) {
    // 1. Post Standings Table
    const rows = this.calculateStandings(tournament);
    const standingsBuffer = await this.renderer.renderStandingsPng(tournament.name, rows);
    await this.discordService.sendImageMessageToChannel(
      standingsChannelId,
      standingsBuffer,
      'standings.png',
      `📊 **Clasament Actualizat — ${tournament.name}**`,
    );

    // 2. Post Starting XI Cards for each team
    const teams: TournamentTeamRoster[] = (tournament.teamsData as any) || [];
    for (const team of teams) {
      try {
        const rosterBuffer = await this.renderer.renderRosterPng(team, tournament.name);
        await this.discordService.sendImageMessageToChannel(
          rostersChannelId,
          rosterBuffer,
          `roster-${team.id}.png`,
          `📋 **Lot Oficial — ${team.name}**`,
        );
      } catch (err: any) {
        this.logger.error(`Failed to post roster graphic for team ${team.name}: ${err?.message || err}`);
      }
    }
  }
}
