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

  return [
    eventCommand.toJSON(),
    lineupPostCommand.toJSON(),
    eaSetupCommand.toJSON(),
    eaStatsCommand.toJSON(),
    eaLatestCommand.toJSON(),
  ];
}

