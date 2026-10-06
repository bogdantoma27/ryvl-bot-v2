import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

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
            .setDescription('Select the event title to delete')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    );

  const lineupPostCommand = new SlashCommandBuilder()
    .setName('lineup_post')
    .setDescription('Open step-by-step lineup wizard and post to a channel')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Target Discord text channel (optional if default lineup channel is configured)')
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
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where match stats should be published')
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
    .setDescription('View club stats, records, and ratings')
    .addStringOption((option) =>
      option
        .setName('club_name')
        .setDescription('Club name on EA (defaults to configured club)')
        .setRequired(false),
    );

  const eaLatestCommand = new SlashCommandBuilder()
    .setName('ea_latest')
    .setDescription('Post the most recent EA Pro Clubs match results immediately');

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
        .setDescription('Pro Clubs player gamertag alias')
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
    .setDescription('Track an EA Pro Clubs team for auto match results and ELO ratings (Admin only)')
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Exact EA Pro Clubs team name to search and track')
        .setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel where match results will be posted (optional)')
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
    .setDescription('View stats, ELO rating, record and top performers for a tracked EA club')
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Tracked club name')
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
    .addSubcommand((sub) =>
      sub
        .setName('post')
        .setDescription('Generate and post Team of the Week image to Discord')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Target text channel (optional; uses configured channel by default)')
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('league')
            .setDescription('League slug (e.g. Superliga-Romania, Balkan-Premier)')
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
        .setDescription('Preview the generated TOTW visual graphic')
        .addStringOption((opt) =>
          opt
            .setName('league')
            .setDescription('League slug (e.g. Superliga-Romania, Balkan-Premier)')
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
        .setDescription('Configure default channel for TOTW posts')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Announcement text channel')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('league')
            .setDescription('League slug (defaults to Superliga-Romania)')
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
            .setDescription('Formation (3-5-2 or 3-1-4-2)')
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
        .setDescription('Spin the draft wheel for your turn (Managers only)'),
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
    .setDescription('Create a tournament and auto-provision Discord category and channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Tournament name').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Tournament type: draft or standard')
        .setRequired(false)
        .addChoices(
          { name: 'FC Draft Tournament (with wheel & draft)', value: 'draft' },
          { name: 'Standard Club Tournament', value: 'standard' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('formation')
        .setDescription('Formation for draft (3-5-2 or 3-1-4-2)')
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
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription('Enable auto-posting transfers')
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
            .setDescription('Number of transfers to display (1-5)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check for new VPG transfers right now'),
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
            .setDescription('Season number (e.g. 2)')
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
            .setDescription('Number of fixtures to show (default 10)')
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('season')
            .setDescription('Season number (e.g. 2)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('results')
        .setDescription('Display recent completed match results')
        .addIntegerOption((opt) =>
          opt
            .setName('count')
            .setDescription('Number of results to show (default 10)')
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('season')
            .setDescription('Season number (e.g. 2)')
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
            .setDescription('Season number (e.g. 2)')
            .setRequired(false),
        ),
    );

  const liveResultsCommand = new SlashCommandBuilder()
    .setName('live_results')
    .setDescription('VPG Superliga România live results monitor & alerts')
    .addSubcommand((sub) =>
      sub
        .setName('today')
        .setDescription('Show all completed matches played today in Bucharest time'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Manually trigger a check for new completed matches'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configure default channel for live results')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Text channel for auto-posting completed match results')
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
        .setDescription('Show current performance metrics and leaderboard standing for RYVL Esports')
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
        .setDescription('Configure dedicated RYVL channels (ryvl-results, ryvl-fixtures, ryvl-leaderboard)')
        .addChannelOption((opt) =>
          opt.setName('results_channel').setDescription('Channel for ryvl-results').setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('fixtures_channel').setDescription('Channel for ryvl-fixtures').setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('leaderboard_channel').setDescription('Channel for ryvl-leaderboard').setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('contact_channel').setDescription('Channel where website contact messages are received').setRequired(false),
        )
        .addChannelOption((opt) =>
          opt.setName('recruitment_channel').setDescription('Channel where trial applications are received').setRequired(false),
        ),
    );

  const superligaMvpCommand = new SlashCommandBuilder()
    .setName('superliga_mvp')
    .setDescription('Superliga MVP stats leaderboard (admins only)')
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

