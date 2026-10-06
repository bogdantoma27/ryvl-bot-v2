import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import type { TournamentInstance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { TournamentRendererService } from './tournament-renderer.service';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  AttachmentBuilder,
} from 'discord.js';
import {
  DraftState,
  TournamentMatchItem,
  TournamentSignupItem,
  TournamentStandingsRow,
  TournamentTeam,
  TournamentType,
  bracketSizeFor,
  buildDraftTeams,
  buildStandardTeams,
  calculateStandings,
  draftPool,
  drawCandidate,
  generateRoundRobin,
  getFormationSlots,
  normalizeDraftFormation,
  openSlots,
  resolveOpenSlot,
  upsertSignup,
} from './tournament-logic';

export {
  DRAFT_FORMATIONS,
  normalizeDraftFormation,
  getFormationSlots,
  getBasePositions,
} from './tournament-logic';
export type { TournamentSignupItem, TournamentMatchItem, DraftState } from './tournament-logic';

/** Channel and panel-message IDs a tournament keeps in its `discordChannels` JSON column. */
export interface TournamentChannels {
  info?: string;
  announcements?: string;
  registration?: string;
  fixtures?: string;
  standings?: string;
  chat?: string;
  draft?: string;
  /** Message IDs of the bot panels, so refreshes edit them instead of posting new ones. */
  messages?: Record<string, string>;
}

type PanelKey = 'info' | 'registration' | 'draft' | 'fixtures' | 'standings';

const PRE_START_STATUSES = ['SIGNUPS_OPEN', 'SIGNUPS_CLOSED', 'PENDING'];

@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TournamentRendererService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
  ) {}

  // ----------------------------------------------------
  // Data access
  // ----------------------------------------------------

  async getOrCreateConfig(guildId: string) {
    const existing = await this.prisma.tournamentConfig.findUnique({ where: { guildId } });
    if (existing) return existing;
    return this.prisma.tournamentConfig.create({ data: { guildId } });
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
      create: { guildId, ...data },
    });
  }

  async listTournaments(guildId: string) {
    return this.prisma.tournamentInstance.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Loads a tournament. Pass guildId whenever the caller acts for a specific server,
   * so one server can never read or change another server's tournament.
   */
  async getTournament(id: string, guildId?: string) {
    const t = await this.prisma.tournamentInstance.findFirst({
      where: { id, ...(guildId ? { guildId } : {}) },
    });
    if (!t) throw new NotFoundException(`Tournament ${id} not found.`);
    return t;
  }

  /** The tournament the bot's panel and slash commands act on: newest one not yet completed. */
  async findActiveTournament(guildId: string, type?: TournamentType) {
    const list = await this.listTournaments(guildId);
    const ofType = type ? list.filter((t) => t.type === type) : list;
    return ofType.find((t) => t.status !== 'COMPLETED') || ofType[0] || null;
  }

  signups(t: TournamentInstance): TournamentSignupItem[] {
    return (t.signupsData as any) || [];
  }

  teams(t: TournamentInstance): TournamentTeam[] {
    return (t.teamsData as any) || [];
  }

  matches(t: TournamentInstance): TournamentMatchItem[] {
    return (t.matchesData as any) || [];
  }

  draft(t: TournamentInstance): DraftState {
    return (
      (t.draftState as any) || {
        snakeOrder: [],
        currentTurn: 0,
        teamJokers: {},
        picks: [],
        complete: false,
      }
    );
  }

  channels(t: TournamentInstance): TournamentChannels {
    return ((t.discordChannels as any) || {}) as TournamentChannels;
  }

  /** Shape the admin dashboard reads. Raw JSON columns stay included for older clients. */
  toDto(t: TournamentInstance) {
    const channels = this.channels(t);
    const teams = this.teams(t);
    const matches = this.matches(t);
    return {
      ...t,
      signups: this.signups(t),
      teams,
      matches,
      draft: t.type === 'DRAFT' ? this.draft(t) : null,
      standings: calculateStandings(teams, matches),
      categoryId: t.discordCategoryId,
      channels: {
        info: channels.info ?? null,
        announcements: channels.announcements ?? null,
        registration: channels.registration ?? null,
        fixtures: channels.fixtures ?? null,
        standings: channels.standings ?? null,
        chat: channels.chat ?? null,
        draft: channels.draft ?? null,
      },
    };
  }

  /**
   * Saves only if nobody else changed the tournament since `t` was read. Two captains
   * clicking at once would otherwise both get the same draft turn.
   */
  private async saveIfUnchanged(t: TournamentInstance, data: Record<string, any>) {
    const res = await this.prisma.tournamentInstance.updateMany({
      where: { id: t.id, updatedAt: t.updatedAt },
      data,
    });
    if (res.count === 0) {
      throw new ConflictException('Turneul tocmai a fost actualizat de altcineva. Încearcă din nou.');
    }
    return this.getTournament(t.id);
  }

  calculateStandings(t: TournamentInstance): TournamentStandingsRow[] {
    return calculateStandings(this.teams(t), this.matches(t));
  }

  // ----------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------

  async createTournament(
    guildId: string,
    data: { name: string; type?: string; formation?: string; numTeams?: number },
  ) {
    const name = String(data.name || '').trim();
    if (!name) throw new BadRequestException('Tournament name is required.');
    const type = String(data.type || '').toUpperCase() === 'DRAFT' ? 'DRAFT' : 'STANDARD';

    return this.prisma.tournamentInstance.create({
      data: {
        guildId,
        name,
        type,
        formation: normalizeDraftFormation(data.formation),
        status: 'SIGNUPS_OPEN',
        teamsData: [] as any,
        signupsData: [] as any,
        matchesData: [] as any,
        // Teams and the snake order are built from the managers when the draft starts.
        draftState: null as any,
      },
    });
  }

  async addSignup(
    tournamentId: string,
    data: {
      userId: string;
      displayName: string;
      gamertag: string;
      teamName?: string;
      pos1?: string;
      pos2?: string;
      notes?: string;
      isManager?: boolean;
    },
    opts: { guildId?: string; byAdmin?: boolean } = {},
  ) {
    const t = await this.getTournament(tournamentId, opts.guildId);
    if (opts.byAdmin ? !PRE_START_STATUSES.includes(t.status) : t.status !== 'SIGNUPS_OPEN') {
      throw new BadRequestException('Înscrierile sunt închise pentru acest turneu.');
    }
    if (!data.userId || !String(data.gamertag || '').trim()) {
      throw new BadRequestException('Gamertag-ul este obligatoriu.');
    }

    const type = t.type === 'DRAFT' ? 'DRAFT' : 'STANDARD';
    const teamName = data.teamName?.trim() || undefined;
    if (type === 'STANDARD' && !teamName) {
      throw new BadRequestException('Numele echipei este obligatoriu.');
    }
    const existing = this.signups(t);
    if (
      teamName &&
      existing.some((s) => s.userId !== data.userId && s.teamName?.toLowerCase() === teamName.toLowerCase())
    ) {
      throw new BadRequestException(`Numele de echipă "${teamName}" este deja folosit.`);
    }

    const entry: TournamentSignupItem = {
      id: `signup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: data.userId,
      displayName: data.displayName,
      gamertag: data.gamertag.trim(),
      teamName,
      pos1: data.pos1?.trim().toUpperCase() || (type === 'DRAFT' ? undefined : 'ALL'),
      pos2: data.pos2?.trim().toUpperCase() || undefined,
      isManager: Boolean(data.isManager || teamName),
      notes: data.notes,
      isBackup: false,
      createdAt: new Date().toISOString(),
    };
    if (type === 'DRAFT' && !entry.pos1) {
      throw new BadRequestException('Poziția principală este obligatorie.');
    }

    let next: TournamentSignupItem[];
    try {
      next = upsertSignup(existing, entry, type);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }

    const updated = await this.saveIfUnchanged(t, { signupsData: next as any });
    await this.refreshPanelsQuietly(updated, ['registration']);
    return updated;
  }

  async removeSignup(tournamentId: string, userId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    if (!PRE_START_STATUSES.includes(t.status)) {
      throw new BadRequestException('Turneul a început deja; retragerea nu mai este posibilă. Contactează un admin.');
    }
    const signups = this.signups(t);
    if (!signups.some((s) => s.userId === userId)) {
      throw new BadRequestException('Nu ești înscris în acest turneu.');
    }
    const updated = await this.saveIfUnchanged(t, {
      signupsData: signups.filter((s) => s.userId !== userId) as any,
    });
    await this.refreshPanelsQuietly(updated, ['registration']);
    return updated;
  }

  async toggleSignups(tournamentId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    if (!PRE_START_STATUSES.includes(t.status)) {
      throw new BadRequestException('Turneul a început deja; înscrierile nu mai pot fi redeschise.');
    }
    return this.updateTournamentStatus(t.id, t.status === 'SIGNUPS_OPEN' ? 'SIGNUPS_CLOSED' : 'SIGNUPS_OPEN', guildId);
  }

  async updateTournamentStatus(tournamentId: string, status: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    if (status === 'DRAFTING' && t.type === 'DRAFT' && PRE_START_STATUSES.includes(t.status)) {
      return (await this.startDraft(t.id, guildId)).tournament;
    }
    if (status === 'ACTIVE' && t.type !== 'DRAFT' && PRE_START_STATUSES.includes(t.status)) {
      return (await this.finalizeTournamentBracket(t.id, guildId)).tournament;
    }
    const updated = await this.prisma.tournamentInstance.update({
      where: { id: t.id },
      data: { status },
    });
    await this.refreshPanelsQuietly(updated, ['registration', 'draft']);
    return updated;
  }

  /** Closes signups and starts play: builds the bracket (standard) or starts the draft. */
  async startTournament(tournamentId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    if (t.type === 'DRAFT') {
      const res = await this.startDraft(t.id, guildId);
      return { tournament: res.tournament, message: res.message };
    }
    const res = await this.finalizeTournamentBracket(t.id, guildId);
    return {
      tournament: res.tournament,
      message:
        `Tabloul a fost stabilit cu ${res.bracketSize} echipe și ${this.matches(res.tournament).length} meciuri.` +
        (res.cutCount > 0 ? ` ${res.cutCount} echipe au rămas în afara tabloului și au fost anunțate.` : ''),
    };
  }

  async finalizeTournamentBracket(tournamentId: string, guildId?: string) {
    const tournament = await this.getTournament(tournamentId, guildId);
    if (tournament.type === 'DRAFT') {
      throw new BadRequestException('Draft tournaments start with the draft, not the bracket.');
    }
    if (!PRE_START_STATUSES.includes(tournament.status)) {
      throw new BadRequestException('Tabloul a fost deja stabilit pentru acest turneu.');
    }
    const signups = this.signups(tournament);
    const bracketSize = bracketSizeFor(signups.length);
    if (!bracketSize) {
      throw new BadRequestException(`Sunt necesare minim 8 echipe înscrise (în prezent sunt ${signups.length}).`);
    }

    const accepted = signups.slice(0, bracketSize);
    const excess = signups.slice(bracketSize);
    const teams = buildStandardTeams(accepted);
    const fixtures = generateRoundRobin(teams);

    const updated = await this.saveIfUnchanged(tournament, {
      status: 'ACTIVE',
      teamsData: teams as any,
      matchesData: fixtures as any,
      signupsData: signups.map((s, i) => ({ ...s, isBackup: i >= bracketSize })) as any,
    });

    await this.notifyCutTeams(updated, excess, bracketSize);
    await this.refreshPanelsQuietly(updated, ['registration', 'fixtures', 'standings']);
    return { tournament: updated, bracketSize, cutCount: excess.length };
  }

  private async notifyCutTeams(tournament: TournamentInstance, excess: TournamentSignupItem[], bracketSize: number) {
    for (let i = 0; i < excess.length; i++) {
      const cut = excess[i];
      const spot = bracketSize + i + 1;
      const teamLabel = cut.teamName || cut.displayName;
      try {
        const user = await this.discordService.client.users.fetch(cut.userId);
        await user.send(
          `⚠️ **Notificare Turneu — ${tournament.name}**\n\n` +
            `Pe baza înscrierilor, turneul a fost configurat pentru un tablou de **${bracketSize} echipe**.\n` +
            `Echipa ta **${teamLabel}** a fost înregistrată pe poziția #${spot} și nu a putut fi inclusă pe tabloul principal în această ediție.\n\n` +
            `Îți mulțumim pentru participare și te așteptăm cu drag la ediția următoare!`,
        );
      } catch {
        const channels = this.channels(tournament);
        const notifyChanId = channels.announcements || channels.chat || channels.registration;
        if (!notifyChanId) continue;
        await this.discordService
          .sendMessageToChannel(
            notifyChanId,
            new EmbedBuilder()
              .setTitle(`⚠️ Notificare Înscriere — ${tournament.name}`)
              .setColor(0xf39c12)
              .setDescription(
                `<@${cut.userId}>: Echipa **${teamLabel}** (poziția #${spot}) nu a putut fi inclusă în tabloul principal de **${bracketSize} echipe**.\nMulțumim pentru înscriere!`,
              ),
          )
          .catch(() => undefined);
      }
    }
  }

  // ----------------------------------------------------
  // Draft
  // ----------------------------------------------------

  async startDraft(tournamentId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    if (t.type !== 'DRAFT') throw new BadRequestException('This is not a draft tournament.');
    if (!PRE_START_STATUSES.includes(t.status)) {
      throw new BadRequestException('Draftul a început deja pentru acest turneu.');
    }
    const signups = this.signups(t);
    const { teams, draft } = buildDraftTeams(signups, t.formation);
    if (teams.length < 2) {
      throw new BadRequestException(
        `Sunt necesari minim 2 manageri pentru draft (în prezent sunt ${teams.length}). Managerii se înscriu completând numele echipei.`,
      );
    }
    const pool = draftPool(signups, draft);
    if (pool.length === 0) {
      throw new BadRequestException('Nu există jucători înscriși (în afara managerilor) pentru draft.');
    }

    const updated = await this.saveIfUnchanged(t, {
      status: 'DRAFTING',
      teamsData: teams as any,
      draftState: draft as any,
    });
    await this.refreshPanelsQuietly(updated, ['registration', 'draft']);

    const needed = draft.snakeOrder.length;
    return {
      tournament: updated,
      message:
        `Draftul a început: ${teams.length} echipe, ${pool.length} jucători disponibili pentru ${needed} alegeri.` +
        (pool.length < needed ? ` Atenție: nu sunt destui jucători pentru loturi complete (lipsesc ${needed - pool.length}).` : ''),
    };
  }

  currentDraftTeam(t: TournamentInstance): { index: number; team: TournamentTeam | undefined } {
    const draft = this.draft(t);
    const index = draft.snakeOrder[draft.currentTurn] ?? 0;
    return { index, team: this.teams(t)[index] };
  }

  /** Free formation slots of the team whose turn it is (what the Spin menu offers). */
  currentOpenSlots(t: TournamentInstance): string[] {
    const { team } = this.currentDraftTeam(t);
    return team ? openSlots(t.formation, team.picks) : [];
  }

  private assertDrafting(t: TournamentInstance, draft: DraftState) {
    if (t.status !== 'DRAFTING' || draft.complete) {
      throw new BadRequestException(draft.complete ? 'Draftul s-a încheiat.' : 'Draftul nu a început încă.');
    }
  }

  async spinDraftWheel(tournamentId: string, position: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    const draft = this.draft(t);
    this.assertDrafting(t, draft);
    if (draft.currentCandidate) {
      throw new BadRequestException('Roata a ales deja un jucător. Confirmă alegerea sau folosește un joker.');
    }

    const { team } = this.currentDraftTeam(t);
    if (!team) throw new BadRequestException('No team is on the clock.');
    const slot = resolveOpenSlot(t.formation, team.picks, position);
    if (!slot) {
      throw new BadRequestException(
        `Poziția ${position} nu mai este liberă pentru ${team.name}. Libere: ${openSlots(t.formation, team.picks).join(', ')}.`,
      );
    }

    const drawn = drawCandidate(draftPool(this.signups(t), draft), slot);
    if (!drawn) throw new BadRequestException('Nu mai sunt jucători disponibili în draft.');

    draft.currentLockedPosition = slot;
    draft.currentCandidate = drawn.candidate;
    draft.currentCandidateWildcard = drawn.wildcard;
    const updated = await this.saveIfUnchanged(t, { draftState: draft as any });
    await this.refreshPanelsQuietly(updated, ['draft']);
    return { tournament: updated, candidate: drawn.candidate, position: slot, wildcard: drawn.wildcard, team };
  }

  async useDraftJoker(tournamentId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    const draft = this.draft(t);
    this.assertDrafting(t, draft);
    if (!draft.currentCandidate || !draft.currentLockedPosition) {
      throw new BadRequestException('Învârte roata înainte de a folosi un joker.');
    }
    const { index } = this.currentDraftTeam(t);
    const jokers = draft.teamJokers[index] ?? 0;
    if (jokers <= 0) throw new BadRequestException('Echipa nu mai are jokeri.');

    const drawn = drawCandidate(draftPool(this.signups(t), draft), draft.currentLockedPosition, [
      draft.currentCandidate.userId,
    ]);
    if (!drawn) {
      throw new BadRequestException('Nu există alt jucător disponibil; jokerul nu a fost consumat.');
    }

    draft.teamJokers[index] = jokers - 1;
    draft.currentCandidate = drawn.candidate;
    draft.currentCandidateWildcard = drawn.wildcard;
    const updated = await this.saveIfUnchanged(t, { draftState: draft as any });
    await this.refreshPanelsQuietly(updated, ['draft']);
    return { tournament: updated, candidate: drawn.candidate, jokersLeft: draft.teamJokers[index] };
  }

  async confirmDraftPick(tournamentId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    const draft = this.draft(t);
    this.assertDrafting(t, draft);
    if (!draft.currentCandidate || !draft.currentLockedPosition) {
      throw new BadRequestException('Învârte roata pentru a obține un jucător înainte de confirmare.');
    }

    const teams = this.teams(t);
    const { index } = this.currentDraftTeam(t);
    const team = teams[index];
    const candidate = draft.currentCandidate;
    const pick = {
      teamIndex: index,
      teamName: team.name,
      userId: candidate.userId,
      gamertag: candidate.gamertag,
      displayName: candidate.displayName,
      position: draft.currentLockedPosition,
    };
    draft.picks.push(pick);
    team.picks.push({
      userId: candidate.userId,
      displayName: candidate.displayName,
      gamertag: candidate.gamertag,
      position: draft.currentLockedPosition,
    });
    draft.currentCandidate = null;
    draft.currentLockedPosition = null;
    draft.currentCandidateWildcard = false;
    draft.currentTurn += 1;
    this.skipFullTeams(draft, teams, t.formation);

    const poolLeft = draftPool(this.signups(t), draft).length;
    if (draft.currentTurn >= draft.snakeOrder.length || poolLeft === 0) draft.complete = true;

    let updated = await this.saveIfUnchanged(t, {
      draftState: draft as any,
      teamsData: teams as any,
    });
    if (draft.complete) updated = await this.completeDraft(updated);
    else await this.refreshPanelsQuietly(updated, ['draft']);
    return { tournament: updated, pick, complete: draft.complete };
  }

  async autoDraftRemaining(tournamentId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    const draft = this.draft(t);
    this.assertDrafting(t, draft);
    const teams = this.teams(t);

    draft.currentCandidate = null;
    draft.currentLockedPosition = null;
    draft.currentCandidateWildcard = false;
    this.skipFullTeams(draft, teams, t.formation);
    while (draft.currentTurn < draft.snakeOrder.length) {
      const pool = draftPool(this.signups(t), draft);
      if (pool.length === 0) break;
      const teamIdx = draft.snakeOrder[draft.currentTurn];
      const team = teams[teamIdx];
      const slot = openSlots(t.formation, team.picks)[0];
      const drawn = slot ? drawCandidate(pool, slot) : null;
      if (!slot || !drawn) break;
      draft.picks.push({
        teamIndex: teamIdx,
        teamName: team.name,
        userId: drawn.candidate.userId,
        gamertag: drawn.candidate.gamertag,
        displayName: drawn.candidate.displayName,
        position: slot,
      });
      team.picks.push({
        userId: drawn.candidate.userId,
        displayName: drawn.candidate.displayName,
        gamertag: drawn.candidate.gamertag,
        position: slot,
      });
      draft.currentTurn += 1;
      this.skipFullTeams(draft, teams, t.formation);
    }
    draft.complete = true;

    const saved = await this.saveIfUnchanged(t, {
      draftState: draft as any,
      teamsData: teams as any,
    });
    return this.completeDraft(saved);
  }

  /** Moves the turn past teams with no free slot left (can happen after manager placement). */
  private skipFullTeams(draft: DraftState, teams: TournamentTeam[], formation: string) {
    while (
      draft.currentTurn < draft.snakeOrder.length &&
      openSlots(formation, teams[draft.snakeOrder[draft.currentTurn]]?.picks || []).length === 0
    ) {
      draft.currentTurn += 1;
    }
  }

  /** Draft over: fixtures are generated, rosters posted and the tournament goes live. */
  private async completeDraft(t: TournamentInstance) {
    const teams = this.teams(t);
    const fixtures = this.matches(t).length > 0 ? this.matches(t) : generateRoundRobin(teams);
    const updated = await this.prisma.tournamentInstance.update({
      where: { id: t.id },
      data: { status: 'ACTIVE', matchesData: fixtures as any },
    });
    await this.refreshPanelsQuietly(updated, ['draft', 'fixtures', 'standings']);

    const channels = this.channels(updated);
    const rosterChannel = channels.draft || channels.standings;
    if (rosterChannel) {
      for (const team of teams) {
        if (team.picks.length === 0) continue;
        try {
          const buffer = await this.renderer.renderRosterPng(team, updated.name);
          await this.discordService.sendMessageToChannel(rosterChannel, {
            content: `📋 **Lot Oficial: ${team.name}**${team.managerId ? ` (Manager: <@${team.managerId}>)` : ''}`,
            files: [{ attachment: buffer, name: `${team.id}-roster.png` }],
          });
        } catch (err: any) {
          this.logger.warn(`Could not post roster for ${team.name}: ${err?.message || err}`);
        }
      }
    }
    return updated;
  }

  // ----------------------------------------------------
  // Fixtures & results
  // ----------------------------------------------------

  pendingFixtures(t: TournamentInstance): TournamentMatchItem[] {
    return this.matches(t).filter((m) => !m.completed);
  }

  /**
   * Records a score. With `matchId` it fills that fixture; otherwise it finds the pending
   * fixture between the two named teams (either way round). Free-form matches are only
   * accepted when the tournament has no fixture list.
   */
  async recordMatchResult(
    tournamentId: string,
    data: { matchId?: string; homeTeam?: string; awayTeam?: string; homeScore: number; awayScore: number; reportedBy?: string },
    guildId?: string,
  ) {
    const t = await this.getTournament(tournamentId, guildId);
    const homeScore = Number(data.homeScore);
    const awayScore = Number(data.awayScore);
    if (![homeScore, awayScore].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) {
      throw new BadRequestException('Scorul trebuie să fie un număr întreg între 0 și 99.');
    }
    if (t.status === 'COMPLETED' && !data.matchId) {
      throw new BadRequestException('Turneul s-a încheiat.');
    }

    const matches = this.matches(t);
    const teams = this.teams(t);
    let match: TournamentMatchItem | undefined;
    let swapped = false;

    if (data.matchId) {
      match = matches.find((m) => m.id === data.matchId);
      if (!match) throw new BadRequestException('Meciul nu a fost găsit.');
    } else {
      const home = String(data.homeTeam || '').trim().toLowerCase();
      const away = String(data.awayTeam || '').trim().toLowerCase();
      if (!home || !away || home === away) throw new BadRequestException('Alege două echipe diferite.');
      match = matches.find(
        (m) => !m.completed && m.homeTeam.toLowerCase() === home && m.awayTeam.toLowerCase() === away,
      );
      if (!match) {
        match = matches.find(
          (m) => !m.completed && m.homeTeam.toLowerCase() === away && m.awayTeam.toLowerCase() === home,
        );
        swapped = Boolean(match);
      }
      if (!match) {
        if (matches.length > 0) {
          throw new BadRequestException(`Nu există un meci de jucat între ${data.homeTeam} și ${data.awayTeam}.`);
        }
        const known = new Map(teams.map((tm) => [tm.name.toLowerCase(), tm]));
        if (teams.length > 0 && (!known.has(home) || !known.has(away))) {
          throw new BadRequestException(`Echipe valide: ${teams.map((tm) => tm.name).join(', ')}.`);
        }
        match = {
          id: `match_${Date.now()}`,
          homeTeam: known.get(home)?.name || String(data.homeTeam).trim(),
          awayTeam: known.get(away)?.name || String(data.awayTeam).trim(),
          homeTeamId: known.get(home)?.id,
          awayTeamId: known.get(away)?.id,
          homeScore: 0,
          awayScore: 0,
          completed: false,
        };
        matches.push(match);
      }
    }

    match.homeScore = swapped ? awayScore : homeScore;
    match.awayScore = swapped ? homeScore : awayScore;
    match.completed = true;
    match.date = new Date().toISOString();
    match.reportedBy = data.reportedBy;

    const allDone = matches.length > 0 && matches.every((m) => m.completed);
    const updated = await this.saveIfUnchanged(t, {
      matchesData: matches as any,
      ...(allDone && t.status === 'ACTIVE' ? { status: 'COMPLETED' } : {}),
    });
    await this.refreshPanelsQuietly(updated, ['fixtures', 'standings']);
    if (allDone && t.status === 'ACTIVE') await this.announceWinner(updated);
    return { tournament: updated, match, completed: allDone };
  }

  private async announceWinner(t: TournamentInstance) {
    const channels = this.channels(t);
    const channelId = channels.announcements || channels.fixtures;
    const top = this.calculateStandings(t)[0];
    if (!channelId || !top) return;
    await this.discordService
      .sendMessageToChannel(
        channelId,
        new EmbedBuilder()
          .setTitle(`🏆 ${t.name} — Campioni: ${top.team}`)
          .setColor(0xf1c40f)
          .setDescription(
            `Toate meciurile au fost jucate. **${top.team}** câștigă turneul cu **${top.points}** puncte ` +
              `(${top.wins}V ${top.draws}E ${top.losses}Î, golaveraj ${top.goalDifference >= 0 ? '+' : ''}${top.goalDifference}).`,
          ),
      )
      .catch(() => undefined);
  }

  // ----------------------------------------------------
  // Discord channels and panels
  // ----------------------------------------------------

  async setupTournamentChannels(guildId: string, tournamentId: string) {
    const tournament = await this.getTournament(tournamentId, guildId);
    const client = this.discordService.client;
    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) throw new NotFoundException(`Guild ${guildId} not found in Discord gateway.`);

    const existing = this.channels(tournament);
    if (tournament.discordCategoryId) {
      const category = await guild.channels.fetch(tournament.discordCategoryId).catch(() => null);
      if (category) {
        await this.refreshTournamentEmbeds(tournament.id, guildId);
        return { categoryId: tournament.discordCategoryId, channels: existing, reused: true };
      }
    }

    const category = await guild.channels.create({
      name: `🏆 ${tournament.name}`.slice(0, 100),
      type: ChannelType.GuildCategory,
    });
    const make = (name: string) =>
      guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id });

    const info = await make('info-rules');
    const announcements = await make('announcements');
    const registration = await make('registration');
    const draft = tournament.type === 'DRAFT' ? await make('draft-wheel') : null;
    const fixtures = await make('fixtures-results');
    const standings = await make('table-standings');
    const chat = await make('tournament-chat');

    const channels: TournamentChannels = {
      info: info.id,
      announcements: announcements.id,
      registration: registration.id,
      fixtures: fixtures.id,
      standings: standings.id,
      chat: chat.id,
      ...(draft ? { draft: draft.id } : {}),
      messages: {},
    };
    const updated = await this.prisma.tournamentInstance.update({
      where: { id: tournament.id },
      data: { discordCategoryId: category.id, discordChannels: channels as any },
    });
    await this.refreshPanelsQuietly(updated, ['info', 'registration', 'draft', 'fixtures', 'standings']);
    return { categoryId: category.id, channels, reused: false };
  }

  async refreshTournamentEmbeds(tournamentId: string, guildId?: string) {
    const t = await this.getTournament(tournamentId, guildId);
    await this.refreshPanels(t, ['info', 'registration', 'draft', 'fixtures', 'standings']);
    return t;
  }

  /** Re-renders panels after a change; a Discord failure must not undo the saved change. */
  async refreshPanelsQuietly(t: TournamentInstance, keys: PanelKey[]) {
    try {
      await this.refreshPanels(t, keys);
    } catch (err: any) {
      this.logger.warn(`Could not refresh tournament panels for ${t.id}: ${err?.message || err}`);
    }
  }

  private async refreshPanels(t: TournamentInstance, keys: PanelKey[]) {
    const channels = this.channels(t);
    for (const key of keys) {
      const channelId = key === 'info' ? channels.info : channels[key];
      if (!channelId) continue;
      if (key === 'draft' && t.type !== 'DRAFT') continue;
      if (key === 'standings' && this.teams(t).length === 0) continue;
      const payload = await this.buildPanel(t, key);
      await this.upsertPanel(t.id, key, channelId, payload);
    }
  }

  private async buildPanel(t: TournamentInstance, key: PanelKey): Promise<any> {
    switch (key) {
      case 'info':
        return { embeds: [this.buildInfoEmbed(t)], components: [] };
      case 'registration':
        return this.buildRegistrationPanel(t);
      case 'draft':
        return this.buildDraftPanel(t);
      case 'fixtures':
        return this.buildFixturesPanel(t);
      case 'standings': {
        const buffer = await this.renderer.renderStandingsPng(t.name, this.calculateStandings(t));
        return {
          content: `📊 **Clasament Actualizat — ${t.name}**`,
          files: [new AttachmentBuilder(buffer, { name: 'clasament.png' })],
          attachments: [],
          embeds: [],
          components: [],
        };
      }
    }
  }

  /** Edits the stored panel message, or posts a new one and remembers its ID. */
  private async upsertPanel(tournamentId: string, key: PanelKey, channelId: string, payload: any) {
    const channel: any = await this.discordService.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !('send' in channel)) return;

    const fresh = await this.getTournament(tournamentId);
    const channels = this.channels(fresh);
    const messageId = channels.messages?.[key];
    if (messageId) {
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (message) {
        await message.edit(payload);
        return;
      }
    }
    const { attachments: _ignored, ...sendPayload } = payload;
    const sent = await channel.send(sendPayload);
    // Re-read so a concurrent panel save is not overwritten.
    const latest = await this.getTournament(tournamentId);
    const latestChannels = this.channels(latest);
    await this.prisma.tournamentInstance.update({
      where: { id: tournamentId },
      data: {
        discordChannels: {
          ...latestChannels,
          messages: { ...(latestChannels.messages || {}), [key]: sent.id },
        } as any,
      },
    });
  }

  private buildInfoEmbed(t: TournamentInstance) {
    const channels = this.channels(t);
    const formation = normalizeDraftFormation(t.formation);
    const isDraft = t.type === 'DRAFT';
    const fixturesRef = channels.fixtures ? `<#${channels.fixtures}>` : '#fixtures-results';
    const howItWorks = isDraft
      ? `**Cum funcționează draftul**:\n` +
        `1. Înscrie-te în <#${channels.registration}> cu gamertag-ul și poziția ta. Completează numele echipei doar dacă vrei să fii **manager**.\n` +
        `2. Când adminii pornesc draftul, fiecare manager învârte roata în ${channels.draft ? `<#${channels.draft}>` : '#draft-wheel'}: alege o poziție liberă, roata alege jucătorul.\n` +
        `3. Fiecare echipă are **4 jokeri** pentru a reînvârti roata. Ordinea este snake (1→N, N→1).\n` +
        `4. După draft se generează automat meciurile (fiecare cu fiecare).\n\n` +
        `**Formație**: \`${formation}\` • **Poziții**: ${getFormationSlots(formation).join(', ')}\n\n`
      : `**Format**: fiecare echipă joacă o dată cu fiecare. Tabloul se stabilește automat la 8, 16 sau 32 de echipe, în ordinea înscrierii.\n\n`;

    return new EmbedBuilder()
      .setTitle(`📜 Informații & Regulament — ${t.name}`)
      .setColor(0x00e5ff)
      .setDescription(
        `Bine ai venit la **${t.name}**!\n\n` +
          howItWorks +
          `**Punctaj**: Victorie **3p** • Egal **1p** • Înfrângere **0p**\n\n` +
          `**Reguli**:\n` +
          `1. Folosește gamertag-ul cu care te-ai înscris.\n` +
          `2. Managerii/căpitanii raportează scorul în ${fixturesRef} imediat după meci (**Report Score**).\n` +
          `3. Pentru dispute sau deconectări, apasă **Call Admin**.`,
      )
      .setFooter({ text: 'RYVL Esports Bot • Tournament Engine' });
  }

  private buildRegistrationPanel(t: TournamentInstance) {
    const signups = this.signups(t);
    const isDraft = t.type === 'DRAFT';
    const count = signups.length;
    const lines: string[] = [];

    if (isDraft) {
      const managers = signups.filter((s) => s.isManager);
      const players = signups.filter((s) => !s.isManager);
      lines.push(`**Manageri (${managers.length})**`);
      managers.forEach((s, i) => lines.push(`${i + 1}. **${s.teamName}** — <@${s.userId}> (\`${s.gamertag}\` • ${s.pos1})`));
      lines.push('', `**Jucători (${players.length})**`);
      players.forEach((s, i) =>
        lines.push(`${i + 1}. <@${s.userId}> \`${s.gamertag}\` • ${s.pos1}${s.pos2 ? `/${s.pos2}` : ''}`),
      );
    } else {
      signups.forEach((s, i) => {
        lines.push(`${i + 1}. **${s.teamName || s.displayName}** (Căpitan: <@${s.userId}> • \`${s.gamertag}\`)`);
        if (i === 7 && count < 16) lines.push('⬆️ **Turneu de 8 echipe**');
        else if (i === 15 && count < 32) lines.push('⬆️ **Turneu de 16 echipe**');
        else if (i === 31) lines.push('⬆️ **Turneu de 32 echipe (Complet)**');
      });
    }

    let list = count > 0 ? lines.join('\n') : 'Nimeni înscris încă.';
    if (list.length > 3200) list = `${list.slice(0, 3200)}\n… și alții (vezi dashboard-ul).`;

    const isOpen = t.status === 'SIGNUPS_OPEN';
    const isFull = !isDraft && count >= 32;
    const statusText: Record<string, string> = {
      SIGNUPS_OPEN: '🟢 Înscrieri deschise',
      SIGNUPS_CLOSED: '🔒 Înscrieri închise',
      DRAFTING: '🎡 Draft în desfășurare',
      ACTIVE: '⚽ Turneu în desfășurare',
      COMPLETED: '🏁 Turneu încheiat',
    };

    const embed = new EmbedBuilder()
      .setTitle(`📋 Înscrieri — ${t.name}`)
      .setColor(isOpen && !isFull ? 0x00d26a : 0xed4245)
      .setDescription(
        `**Status**: ${statusText[t.status] || t.status}${isFull ? ' (complet)' : ''}\n` +
          `**Format**: ${isDraft ? `FC Draft (${normalizeDraftFormation(t.formation)})` : 'Turneu standard pe echipe'}\n\n` +
          `${list}\n\n` +
          (isOpen && !isFull
            ? isDraft
              ? '• Apasă **Sign Up** pentru a te înscrie ca jucător (sau manager, dacă completezi numele echipei).'
              : '• Apasă **Sign Up** pentru a-ți înscrie echipa.'
            : ''),
      )
      .setFooter({ text: 'RYVL Esports Bot • Tournament Registration' });

    const canChange = PRE_START_STATUSES.includes(t.status);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:signup:${t.id}`)
        .setLabel(isOpen ? (isFull ? 'Registration Full' : 'Sign Up') : 'Signups Closed')
        .setStyle(isOpen && !isFull ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('⬆')
        .setDisabled(!isOpen || isFull),
      new ButtonBuilder()
        .setCustomId(`tourney:pullout:${t.id}`)
        .setLabel('Pull Out')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⬇')
        .setDisabled(!canChange),
      new ButtonBuilder()
        .setCustomId(`tourney:refresh_signup:${t.id}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    );
    return { content: null, embeds: [embed], components: [row] };
  }

  private buildDraftPanel(t: TournamentInstance) {
    const draft = this.draft(t);
    const teams = this.teams(t);
    const drafting = t.status === 'DRAFTING' && !draft.complete;

    if (!drafting && !draft.complete) {
      const managers = this.signups(t).filter((s) => s.isManager).length;
      return {
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle(`🎡 ${t.name} — Draft Wheel`)
            .setColor(0x95a5a6)
            .setDescription(
              `Draftul nu a început încă. Manageri înscriși: **${managers}**.\n` +
                'Adminii pornesc draftul din panoul de administrare (**Start Tournament / Draft**) sau cu `/tournament start-draft`.',
            ),
        ],
        components: [],
      };
    }

    const { index, team } = this.currentDraftTeam(t);
    const rounds = Math.max(1, getFormationSlots(t.formation).length - 1);
    const roundNumber = Math.min(rounds, Math.floor(draft.currentTurn / Math.max(1, teams.length)) + 1);
    const recentPicks = draft.picks.slice(-6).reverse();
    const recentPicksText = recentPicks.length
      ? recentPicks.map((p) => `• **${p.teamName}** → **${p.displayName}** (${p.position})`).join('\n')
      : 'Nicio alegere încă.';
    const boardText = teams
      .map((tm, idx) => {
        const free = openSlots(t.formation, tm.picks);
        return `• **${tm.name}**: ${tm.picks.length}/${getFormationSlots(t.formation).length} • 🃏 ${draft.teamJokers[idx] ?? 0}${free.length ? ` • lipsă: ${free.join(', ')}` : ''}`;
      })
      .join('\n');

    let body: string;
    if (draft.complete) {
      body = `🎉 **DRAFTUL S-A ÎNCHEIAT!** Loturile au fost publicate mai jos, iar meciurile sunt în ${
        this.channels(t).fixtures ? `<#${this.channels(t).fixtures}>` : '#fixtures-results'
      }.\n\n**Loturi**:\n${boardText}`;
    } else {
      const candidateText = draft.currentCandidate
        ? `🎯 **Roata a ales**: **${draft.currentCandidate.displayName}** (\`${draft.currentCandidate.gamertag}\`) pentru **${draft.currentLockedPosition}**\n` +
          `Poziții jucător: ${draft.currentCandidate.pos1}${draft.currentCandidate.pos2 ? `/${draft.currentCandidate.pos2}` : ''}` +
          (draft.currentCandidateWildcard ? `\n⚠️ Nu mai era nimeni pe ${draft.currentLockedPosition}, așa că roata a ales din tot lotul rămas.` : '')
        : `🎰 ${team?.managerId ? `<@${team.managerId}>` : 'Manager'}, apasă **Spin Wheel** și alege o poziție liberă.`;
      body =
        `**Runda** ${roundNumber}/${rounds} • **La rând**: **${team?.name ?? `Echipa ${index + 1}`}**\n\n` +
        `${candidateText}\n\n` +
        `**Jucători rămași în draft**: ${draftPool(this.signups(t), draft).length}\n\n` +
        `**Situația echipelor**:\n${boardText}\n\n` +
        `**Ultimele alegeri**:\n${recentPicksText}`;
    }
    if (body.length > 4000) body = `${body.slice(0, 3990)}…`;

    const embed = new EmbedBuilder()
      .setTitle(`🎡 ${t.name} — Draft Wheel`)
      .setColor(draft.complete ? 0x5865f2 : 0xf1c40f)
      .setDescription(body)
      .setFooter({ text: 'RYVL Esports Bot • Doar managerul la rând sau un admin pot folosi butoanele.' });

    const buttons: ButtonBuilder[] = [];
    if (!draft.complete) {
      if (!draft.currentCandidate) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`tourney:draft:spin_modal:${t.id}`)
            .setLabel(`Spin Wheel (${team?.name ?? 'Team'})`.slice(0, 80))
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎰'),
        );
      } else {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`tourney:draft:confirm:${t.id}`)
            .setLabel('Confirm Pick')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`tourney:draft:joker:${t.id}`)
            .setLabel(`Use Joker (${draft.teamJokers[index] ?? 0} Left)`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🃏')
            .setDisabled((draft.teamJokers[index] ?? 0) <= 0),
        );
      }
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`tourney:draft:autodraft:${t.id}`)
          .setLabel('Auto-Draft Remaining (Admin)')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚡'),
      );
    }
    return {
      content: null,
      embeds: [embed],
      components: buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [],
    };
  }

  private buildFixturesPanel(t: TournamentInstance) {
    const matches = this.matches(t);
    const completedCount = matches.filter((m) => m.completed).length;
    const byRound = new Map<number, TournamentMatchItem[]>();
    for (const m of matches) {
      const r = m.round ?? 0;
      byRound.set(r, [...(byRound.get(r) || []), m]);
    }
    const renderRound = (round: number, list: TournamentMatchItem[]) =>
      `**${round ? `Etapa ${round}` : 'Meciuri'}**\n` +
      list
        .map((m) =>
          m.completed
            ? `✅ ${m.homeTeam} **${m.homeScore} - ${m.awayScore}** ${m.awayTeam}`
            : `⏳ ${m.homeTeam} vs ${m.awayTeam}`,
        )
        .join('\n');

    const rounds = [...byRound.entries()].sort((a, b) => a[0] - b[0]);
    let text = rounds.map(([r, list]) => renderRound(r, list)).join('\n\n');
    if (text.length > 3500) {
      // Too long for one embed: show the rounds still being played first.
      const open = rounds.filter(([, list]) => list.some((m) => !m.completed));
      text = '';
      for (const [r, list] of open) {
        const next = renderRound(r, list);
        if (text.length + next.length > 3400) break;
        text += (text ? '\n\n' : '') + next;
      }
      text += '\n\n…lista completă este în dashboard.';
    }

    const embed = new EmbedBuilder()
      .setTitle(`📝 Meciuri & Rezultate — ${t.name}`)
      .setColor(0x5865f2)
      .setDescription(
        (matches.length
          ? `Meciuri jucate: **${completedCount}/${matches.length}**\n\n${text}\n\n`
          : 'Meciurile vor apărea aici după ce începe turneul.\n\n') +
          'Managerii/căpitanii raportează scorul cu **Report Score**. Pentru probleme, apasă **Call Admin**.',
      )
      .setFooter({ text: 'RYVL Esports Bot • Tournament Engine' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tourney:result:enter:${t.id}`)
        .setLabel('Report Score')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⚽')
        .setDisabled(t.status !== 'ACTIVE'),
      new ButtonBuilder()
        .setCustomId(`tourney:result:call_admin:${t.id}`)
        .setLabel('Call Admin')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚨'),
      new ButtonBuilder()
        .setCustomId(`tourney:result:refresh:${t.id}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
    );
    return { content: null, embeds: [embed], components: [row] };
  }

  /** Posts a fresh standings image (used by `/tournament generate-standings`). */
  async postStandings(t: TournamentInstance) {
    await this.refreshPanels(t, ['standings']);
  }

  async postAdminPanel(guildId: string, channelId: string) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Tournament Administration Panel')
      .setColor(0x5865f2)
      .setDescription(
        'Butoanele acționează asupra celui mai nou turneu activ din server. Doar adminii le pot folosi.\n\n' +
          '• **Create Tournament**: turneu standard sau draft, cu categorie și canale proprii\n' +
          '• **Status of Signups**: înscrieri, manageri și jucători\n' +
          '• **Send Notification**: anunț în #announcements\n' +
          '• **Toggle Signups**: deschide / închide înscrierile\n' +
          '• **Start Tournament / Draft**: stabilește tabloul și meciurile (standard) sau pornește draftul\n' +
          '• **Refresh Embeds**: re-generează panourile turneului',
      )
      .setFooter({ text: 'RYVL Esports • Tournament Engine' });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tourney:admin:create').setLabel('Create Tournament').setStyle(ButtonStyle.Success).setEmoji('🆕'),
      new ButtonBuilder().setCustomId('tourney:admin:status').setLabel('Status of Signups').setStyle(ButtonStyle.Primary).setEmoji('📋'),
      new ButtonBuilder().setCustomId('tourney:admin:notify').setLabel('Send Notification').setStyle(ButtonStyle.Secondary).setEmoji('📢'),
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tourney:admin:toggle_signups').setLabel('Toggle Signups').setStyle(ButtonStyle.Secondary).setEmoji('⚡'),
      new ButtonBuilder().setCustomId('tourney:admin:start_draft').setLabel('Start Tournament / Draft').setStyle(ButtonStyle.Primary).setEmoji('🎡'),
      new ButtonBuilder().setCustomId('tourney:admin:refresh').setLabel('Refresh Embeds').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
    );
    return this.discordService.sendMessageToChannel(channelId, embed, [row1, row2]);
  }

  async broadcastNotification(tournamentId: string, title: string, message: string, authorTag?: string) {
    const tournament = await this.getTournament(tournamentId);
    const channels = this.channels(tournament);
    const channelId = channels.announcements || channels.registration;
    if (!channelId) {
      throw new BadRequestException('No announcement or registration channel configured for tournament.');
    }
    const embed = new EmbedBuilder()
      .setTitle(`📢 ${title}`)
      .setColor(0x5865f2)
      .setDescription(message)
      .setFooter({
        text: authorTag ? `Announced by ${authorTag} • ${tournament.name}` : `Tournament Announcement • ${tournament.name}`,
      })
      .setTimestamp();
    return this.discordService.sendMessageToChannel(channelId, embed);
  }
}
