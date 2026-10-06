import { ApplicationCommandOptionType, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { getSlashCommands } from '../discord/commands/register-commands';
import { isAdminSubcommand, TOURNAMENT_ADMIN_SUBCOMMANDS } from '../discord/commands/command-permissions';

export interface BotCommandOptionDoc {
  name: string;
  description: string;
  type: string;
  required: boolean;
  choices?: string[];
}

export interface BotCommandDoc {
  /** Full invocation, e.g. "/totw post". */
  name: string;
  command: string;
  subcommand: string | null;
  description: string;
  adminOnly: boolean;
  options: BotCommandOptionDoc[];
}

function adminSubcommand(command: string, sub: string): boolean {
  return isAdminSubcommand(command, sub) || (command === 'tournament' && TOURNAMENT_ADMIN_SUBCOMMANDS.includes(sub));
}

const TYPE_LABELS: Partial<Record<ApplicationCommandOptionType, string>> = {
  [ApplicationCommandOptionType.String]: 'text',
  [ApplicationCommandOptionType.Integer]: 'integer',
  [ApplicationCommandOptionType.Number]: 'number',
  [ApplicationCommandOptionType.Boolean]: 'true/false',
  [ApplicationCommandOptionType.User]: 'user',
  [ApplicationCommandOptionType.Channel]: 'channel',
  [ApplicationCommandOptionType.Role]: 'role',
  [ApplicationCommandOptionType.Mentionable]: 'mention',
  [ApplicationCommandOptionType.Attachment]: 'file',
};

function describeOptions(options: any[] | undefined): BotCommandOptionDoc[] {
  return (options || []).map((option) => ({
    name: option.name,
    description: option.description,
    type: TYPE_LABELS[option.type as ApplicationCommandOptionType] || 'value',
    required: !!option.required,
    ...(Array.isArray(option.choices) && option.choices.length
      ? { choices: option.choices.map((choice: { name: string }) => choice.name) }
      : {}),
  }));
}

/**
 * Flattens the registered slash command definitions (the exact JSON sent to Discord)
 * into one entry per invocable command or subcommand, for the public docs page.
 */
export function describeSlashCommands(
  commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = getSlashCommands(),
): BotCommandDoc[] {
  const docs: BotCommandDoc[] = [];
  for (const command of commands) {
    // default_member_permissions is a permission bitfield string; '0' would mean admins only too.
    const commandAdmin = command.default_member_permissions != null;
    const options = (command.options || []) as any[];
    const subcommands = options.filter((o) => o.type === ApplicationCommandOptionType.Subcommand);
    const groups = options.filter((o) => o.type === ApplicationCommandOptionType.SubcommandGroup);
    if (!subcommands.length && !groups.length) {
      docs.push({
        name: `/${command.name}`,
        command: command.name,
        subcommand: null,
        description: command.description,
        adminOnly: commandAdmin,
        options: describeOptions(options),
      });
      continue;
    }
    for (const sub of subcommands) {
      docs.push({
        name: `/${command.name} ${sub.name}`,
        command: command.name,
        subcommand: sub.name,
        description: sub.description,
        adminOnly: commandAdmin || adminSubcommand(command.name, sub.name),
        options: describeOptions(sub.options),
      });
    }
    for (const group of groups) {
      for (const sub of group.options || []) {
        docs.push({
          name: `/${command.name} ${group.name} ${sub.name}`,
          command: command.name,
          subcommand: `${group.name} ${sub.name}`,
          description: sub.description,
          adminOnly: commandAdmin,
          options: describeOptions(sub.options),
        });
      }
    }
  }
  return docs;
}
