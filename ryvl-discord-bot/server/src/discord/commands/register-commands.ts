import {
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

  return [
    eventCommand.toJSON(),
    lineupPostCommand.toJSON(),
    eaSetupCommand.toJSON(),
    eaStatsCommand.toJSON(),
    eaLatestCommand.toJSON(),
    vpgTransfersCommand.toJSON(),
    superligaCommand.toJSON(),
    liveResultsCommand.toJSON(),
    ryvlCommand.toJSON(),
  ];
}

