import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { SUPERLIGA_LEAGUE_SLUG } from '../../vpg/league.constants';

export function getSlashCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  const eventCommand = new SlashCommandBuilder()
    .setName('event')
    .setDescription('Manage events and RSVPs')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a new event in this channel'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List upcoming events in this server'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete an event')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Event to delete (pick it from the list)')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    );

  const lineupPostCommand = new SlashCommandBuilder()
    .setName('lineup_post')
    .setDescription('Open step-by-step lineup wizard and post to a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Target text channel (optional if a default lineup channel is configured)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('formation')
        .setDescription('Formation key (for example 4231). Optional - can be set in wizard')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Lineup title shown in Discord and on image. Optional')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription('Kickoff date YYYY-MM-DD (optional)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription('Kickoff time HH:mm (optional)')
        .setRequired(false),
    );

  const eaSetupCommand = new SlashCommandBuilder()
    .setName('ea_setup')
    .setDescription('Configure automatic EA Pro Clubs match notifications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where match stats should be published')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('club_name')
        .setDescription('Club name on EA (defaults to RYVL Esports)')
        .setRequired(false),
    );

  const eaStatsCommand = new SlashCommandBuilder()
    .setName('ea_stats')
    .setDescription('Live EA stats for the configured club, or any club by name')
    .addStringOption((option) =>
      option
        .setName('club_name')
        .setDescription('Club name on EA (defaults to the club set with /ea_setup)')
        .setRequired(false),
    );

  const eaLatestCommand = new SlashCommandBuilder()
    .setName('ea_latest')
    .setDescription("Post the configured club's latest EA Pro Clubs match in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  const statsCommand = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View Pro Clubs individual player stats or your own record')
    .addStringOption((opt) =>
      opt
        .setName('player')
        .setDescription('Pro Clubs player gamertag (or "me")')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Same as player (kept for older usage)')
        .setRequired(false),
    )
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Discord member to look up')
        .setRequired(false),
    );

  const trackTeamCommand = new SlashCommandBuilder()
    .setName('track_team')
    .setDescription('Track an EA Pro Clubs team for automatic match results and ELO ratings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Exact EA Pro Clubs team name to search and track')
        .setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel for its match results (default: the live results channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('platform')
        .setDescription('EA platform of the club (default: common-gen5)')
        .setRequired(false)
        .addChoices(
          { name: 'Current gen (PS5 / Xbox Series / PC)', value: 'common-gen5' },
          { name: 'Last gen (PS4 / Xbox One)', value: 'common-gen4' },
          { name: 'Nintendo Switch', value: 'nx' },
        ),
    );

  const teamStatsCommand = new SlashCommandBuilder()
    .setName('team_stats')
    .setDescription('Record, ELO and top performers of a club tracked with /track_team')
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Tracked club name or ID (default: the club set with /ea_setup)')
        .setRequired(false),
    );

  const registerPlayerCommand = new SlashCommandBuilder()
    .setName('register-player')
    .setDescription('Link your Discord user account to your EA Pro Clubs gamertag')
    .addStringOption((opt) =>
      opt
        .setName('gamertag')
        .setDescription('Your in-game Pro Clubs player name')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('position')
        .setDescription('Preferred position (e.g. ST, CAM, CDM, CB, GK)')
        .setRequired(false),
    );

  const unregisterPlayerCommand = new SlashCommandBuilder()
    .setName('unregister-player')
    .setDescription('Unlink your Discord account from EA Pro Clubs');

  const totwCommand = new SlashCommandBuilder()
    .setName('totw')
    .setDescription('Team of the Week & Team of the Season generator')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('post')
        .setDescription('Generate and post Team of the Week image to Discord')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target text channel (optional; uses configured channel by default)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('league')
            .setDescription(`League slug (e.g. ${SUPERLIGA_LEAGUE_SLUG}, Balkan-Premier)`)
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('is_tots')
            .setDescription('True for Team of the Season, false for Team of the Week')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('preview')
        .setDescription('Preview the Team of the Week image privately (nothing is posted)')
        .addStringOption((opt) =>
          opt
            .setName('league')
            .setDescription(`League slug (e.g. ${SUPERLIGA_LEAGUE_SLUG}, Balkan-Premier)`)
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('is_tots')
            .setDescription('True for Team of the Season')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set the TOTW channel and enable the scheduled weekly post')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Announcement text channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('league')
            .setDescription(`League slug (defaults to ${SUPERLIGA_LEAGUE_SLUG})`)
            .setRequired(false),
        ),
    );

  const tournamentCommand = new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Tournament management and Discord-native administration')
    .addSubcommand((sub) =>
      sub
        .setName('setup-admin')
        .setDescription('Post the tournament administration control panel with action buttons'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a new tournament and provision Discord category and channels')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Tournament name (e.g. Cupa României Draft)')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Tournament type (default: draft)')
            .setRequired(false)
            .addChoices(
              { name: 'FC Draft Tournament (with wheel & draft)', value: 'draft' },
              { name: 'Standard Club Tournament', value: 'standard' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('formation')
            .setDescription('Draft formation (3-5-2 or 3-1-4-2; draft tournaments only)')
            .setRequired(false)
            .addChoices(
              { name: '3-5-2', value: '3-5-2' },
              { name: '3-1-4-2', value: '3-1-4-2' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-status')
        .setDescription('Set tournament lifecycle status / phase')
        .addStringOption((opt) =>
          opt
            .setName('status')
            .setDescription('Status to apply')
            .setRequired(true)
            .addChoices(
              { name: 'Signups Open', value: 'SIGNUPS_OPEN' },
              { name: 'Signups Closed', value: 'SIGNUPS_CLOSED' },
              { name: 'Drafting Phase', value: 'DRAFTING' },
              { name: 'Active Matches', value: 'ACTIVE' },
              { name: 'Completed', value: 'COMPLETED' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle-signups')
        .setDescription('Toggle tournament registrations open or closed'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('start-draft')
        .setDescription('Start the draft phase and post the draft wheel in the draft channel'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Close signups and start: bracket + fixtures (standard) or the draft (draft)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('notify')
        .setDescription('Broadcast an announcement to the tournament announcements channel')
        .addStringOption((opt) =>
          opt.setName('title').setDescription('Announcement Title').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('message').setDescription('Announcement Message').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('spin')
        .setDescription('Show whose turn it is to spin the draft wheel'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('draft-status')
        .setDescription('View current draft board and remaining picks'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Check current signup numbers and player registrations'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('generate-standings')
        .setDescription('Render and post updated standings table graphic'),
    );

  const createTournamentCommand = new SlashCommandBuilder()
    .setName('create_tournament')
    .setDescription('Same as /tournament create, but the type defaults to Standard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Tournament name').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Tournament type (default: standard)')
        .setRequired(false)
        .addChoices(
          { name: 'FC Draft Tournament (with wheel & draft)', value: 'draft' },
          { name: 'Standard Club Tournament', value: 'standard' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('formation')
        .setDescription('Draft formation (3-5-2 or 3-1-4-2; draft tournaments only)')
        .setRequired(false)
        .addChoices(
          { name: '3-5-2', value: '3-5-2' },
          { name: '3-1-4-2', value: '3-1-4-2' },
        ),
    );

  const vpgTransfersCommand = new SlashCommandBuilder()
    .setName('vpg_transfers')
    .setDescription('VPG Superliga România transfers tracker')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configure automatic VPG transfer announcements')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where transfers should be published')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable auto-posting transfers (default: true)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('latest')
        .setDescription('Show recent VPG Superliga transfers')
        .addIntegerOption((option) =>
          option
            .setName('count')
            .setDescription('Number of transfers to display (1-5, default 3)')
            .setMinValue(1)
            .setMaxValue(5)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check for new VPG transfers now and post them to the configured channel'),
    );

  const superligaCommand = new SlashCommandBuilder()
    .setName('superliga')
    .setDescription('VPG Superliga România — Standings, Fixtures, Results & Leaderboards')
    .addSubcommand((sub) =>
      sub
        .setName('standings')
        .setDescription('Display the official Superliga standings table')
        .addIntegerOption((opt) =>
          opt
            .setName('season')
            .setDescription('Season number (default: current)')
            .setMinValue(1)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fixtures')
        .setDescription('Display upcoming scheduled matches')
        .addIntegerOption((opt) =>
          opt
            .setName('count')
            .setDescription('Number of fixtures to show (1-25, default 10)')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('season')
            .setDescription('Season number (default: current)')
            .setMinValue(1)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('results')
        .setDescription('Display the latest completed match results')
        .addIntegerOption((opt) =>
          opt
            .setName('count')
            .setDescription('Number of results to show (1-25, default 10)')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('season')
            .setDescription('Season number (default: current)')
            .setMinValue(1)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Display top player leaderboards for Superliga')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('Category of the leaderboard')
            .setRequired(true)
            .addChoices(
              { name: 'Top Strikers', value: 'strikers' },
              { name: 'Top Playmakers (CAM)', value: 'cam' },
              { name: 'Top Wingers', value: 'wingers' },
              { name: 'Top Defensive Midfielders (CDM)', value: 'cdm' },
              { name: 'Top Center Backs (CB)', value: 'cb' },
              { name: 'Top Goalkeepers (GK)', value: 'gk' },
            ),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('season')
            .setDescription('Season number (default: current)')
            .setMinValue(1)
            .setRequired(false),
        ),
    );

  const liveResultsCommand = new SlashCommandBuilder()
    .setName('live_results')
    .setDescription('VPG Superliga România live results monitor & alerts')
    .addSubcommand((sub) =>
      sub
        .setName('today')
        .setDescription("Show today's Superliga results (Bucharest time), else the latest five"),
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check for new Superliga results now and post them to the configured channel'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set the channel for automatic Superliga result posts')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Text channel for auto-posting completed match results')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    );

  const ryvlCommand = new SlashCommandBuilder()
    .setName('ryvl')
    .setDescription('RYVL Esports team performance, records, results & schedule')
    .addSubcommand((sub) =>
      sub
        .setName('performance')
        .setDescription('Display comprehensive performance record & form guide for RYVL Esports')
        .addStringOption((opt) =>
          opt
            .setName('competition')
            .setDescription('Competition slug (defaults to active championship)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('results')
        .setDescription('Show recent match results for RYVL Esports')
        .addStringOption((opt) =>
          opt
            .setName('competition')
            .setDescription('Competition slug (optional)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fixtures')
        .setDescription('Show upcoming scheduled games for RYVL Esports')
        .addStringOption((opt) =>
          opt
            .setName('competition')
            .setDescription('Competition slug (optional)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Same as /ryvl performance (record, form and league standing)')
        .addStringOption((opt) =>
          opt
            .setName('competition')
            .setDescription('Competition slug (optional)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set the RYVL feed channels and the website contact/trial channels')
        .addChannelOption((opt) =>
          opt.setName('results_channel').setDescription('Channel for ryvl-results').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('fixtures_channel').setDescription('Channel for ryvl-fixtures').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('leaderboard_channel').setDescription('Channel for ryvl-leaderboard').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('contact_channel').setDescription('Channel where website contact messages are received').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('recruitment_channel').setDescription('Channel where trial applications are received').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false),
        ),
    );

  const superligaMvpCommand = new SlashCommandBuilder()
    .setName('superliga_mvp')
    .setDescription('Superliga MVP stats leaderboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('leaderboard')
        .setDescription('Show the current Superliga MVP leaderboard (only you can see it)')
        .addIntegerOption((opt) => opt.setName('count').setDescription('Players to show (default 15)').setMinValue(1).setMaxValue(25))
        .addIntegerOption((opt) => opt.setName('min_matches').setDescription('Minimum tracked matches to qualify (default: half of the most played)').setMinValue(1))
        .addIntegerOption((opt) => opt.setName('season').setDescription('VPG season (default: current)').setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('post')
        .setDescription('Post the Superliga MVP leaderboard publicly in a channel')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel to post in (default: this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addIntegerOption((opt) => opt.setName('count').setDescription('Players to show (default 15)').setMinValue(1).setMaxValue(25))
        .addIntegerOption((opt) => opt.setName('min_matches').setDescription('Minimum tracked matches to qualify (default: half of the most played)').setMinValue(1))
        .addIntegerOption((opt) => opt.setName('season').setDescription('VPG season (default: current)').setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub.setName('sync').setDescription('Fetch new Superliga results and their EA match stats now'),
    );

  return [
    eventCommand.toJSON(),
    lineupPostCommand.toJSON(),
    eaSetupCommand.toJSON(),
    eaStatsCommand.toJSON(),
    eaLatestCommand.toJSON(),
    statsCommand.toJSON(),
    registerPlayerCommand.toJSON(),
    unregisterPlayerCommand.toJSON(),
    totwCommand.toJSON(),
    tournamentCommand.toJSON(),
    createTournamentCommand.toJSON(),
    trackTeamCommand.toJSON(),
    teamStatsCommand.toJSON(),
    vpgTransfersCommand.toJSON(),
    superligaCommand.toJSON(),
    liveResultsCommand.toJSON(),
    ryvlCommand.toJSON(),
    superligaMvpCommand.toJSON(),
  ];
}

