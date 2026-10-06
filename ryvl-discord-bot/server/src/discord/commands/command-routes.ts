import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { EventCreateCommand } from './event-create.command';
import type { EventListCommand } from './event-list.command';
import type { EventDeleteCommand } from './event-delete.command';
import type { LineupPostCommand } from './lineup-post.command';
import type { EaCommands } from './ea-commands';
import type { VpgCommands } from './vpg-commands';
import type { SuperligaCommands } from './superliga-commands';
import type { SuperligaMvpCommands } from './superliga-mvp-commands';
import type { RyvlCommands } from './ryvl-commands';
import type { TotwCommands } from './totw-commands';
import type { TournamentCommands } from './tournament-commands';

/** The command handler instances the slash-command dispatcher routes to. */
export interface SlashCommandHandlers {
  eventCreate: EventCreateCommand;
  eventList: EventListCommand;
  eventDelete: EventDeleteCommand;
  lineupPost: LineupPostCommand;
  ea: EaCommands;
  vpg: VpgCommands;
  superliga: SuperligaCommands;
  superligaMvp: SuperligaMvpCommands;
  ryvl: RyvlCommands;
  totw: TotwCommands;
  tournament: TournamentCommands;
}

type Run = (h: SlashCommandHandlers, interaction: ChatInputCommandInteraction) => Promise<void>;
type Complete = (h: SlashCommandHandlers, interaction: AutocompleteInteraction) => Promise<void>;

/**
 * A command is either run directly (no subcommands) or per subcommand. Several handler
 * classes branch on the subcommand themselves; they are still listed per subcommand here
 * so that a registered subcommand without a route (or a route without a registered
 * subcommand) is caught by test/slash-commands.test.cjs.
 */
export interface SlashCommandRoute {
  run?: Run;
  subcommands?: Record<string, Run>;
}

const superliga: Run = (h, i) => h.superliga.handleSuperliga(i);
const liveResults: Run = (h, i) => h.superliga.handleLiveResults(i);
const ryvl: Run = (h, i) => h.ryvl.handleRyvl(i);
const totw: Run = (h, i) => h.totw.handleTotw(i);
const mvp: Run = (h, i) => h.superligaMvp.handle(i);
const tournament: Run = (h, i) => h.tournament.handleTournament(i);

export const SLASH_COMMAND_ROUTES: Readonly<Record<string, SlashCommandRoute>> = {
  event: {
    subcommands: {
      create: (h, i) => h.eventCreate.showModal(i),
      list: (h, i) => h.eventList.execute(i),
      delete: (h, i) => h.eventDelete.execute(i),
    },
  },
  lineup_post: { run: (h, i) => h.lineupPost.execute(i) },
  ea_setup: { run: (h, i) => h.ea.handleSetup(i) },
  ea_stats: { run: (h, i) => h.ea.handleStats(i) },
  ea_latest: { run: (h, i) => h.ea.handleLatest(i) },
  stats: { run: (h, i) => h.ea.handlePlayerStats(i) },
  'register-player': { run: (h, i) => h.ea.handleRegisterPlayer(i) },
  'unregister-player': { run: (h, i) => h.ea.handleUnregisterPlayer(i) },
  track_team: { run: (h, i) => h.ea.handleTrackTeam(i) },
  team_stats: { run: (h, i) => h.ea.handleTeamStats(i) },
  vpg_transfers: {
    subcommands: {
      setup: (h, i) => h.vpg.handleSetup(i),
      latest: (h, i) => h.vpg.handleLatest(i),
      check: (h, i) => h.vpg.handleCheck(i),
    },
  },
  superliga: { subcommands: { standings: superliga, fixtures: superliga, results: superliga, leaderboard: superliga } },
  live_results: { subcommands: { today: liveResults, check: liveResults, setup: liveResults } },
  ryvl: { subcommands: { performance: ryvl, results: ryvl, fixtures: ryvl, leaderboard: ryvl, setup: ryvl } },
  totw: { subcommands: { post: totw, preview: totw, setup: totw } },
  superliga_mvp: { subcommands: { leaderboard: mvp, post: mvp, sync: mvp } },
  tournament: {
    subcommands: Object.fromEntries(
      [
        'setup-admin', 'create', 'set-status', 'toggle-signups', 'start-draft', 'start',
        'notify', 'spin', 'draft-status', 'status', 'generate-standings',
      ].map((sub) => [sub, tournament]),
    ),
  },
  create_tournament: { run: (h, i) => h.tournament.handleCreateTournament(i) },
};

/** Autocomplete handlers by command, then subcommand ('' when none), then option name. */
export const AUTOCOMPLETE_ROUTES: Readonly<Record<string, Record<string, Record<string, Complete>>>> = {
  event: { delete: { title: (h, i) => h.eventDelete.handleAutocomplete(i) } },
  lineup_post: { '': { formation: (h, i) => h.lineupPost.handleAutocomplete(i) } },
};

export function resolveSlashRoute(command: string, subcommand: string | null | undefined): Run | null {
  const route = SLASH_COMMAND_ROUTES[command];
  if (!route) return null;
  if (subcommand) return route.subcommands?.[subcommand] ?? null;
  return route.run ?? null;
}

export function resolveAutocompleteRoute(
  command: string,
  subcommand: string | null | undefined,
  option: string,
): Complete | null {
  return AUTOCOMPLETE_ROUTES[command]?.[subcommand || '']?.[option] ?? null;
}
