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

  return [eventCommand.toJSON()];
}
