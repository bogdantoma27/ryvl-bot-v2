import { MessageFlags, PermissionFlagsBits } from 'discord.js';

/**
 * Subcommands that change server configuration or post on the server's behalf, inside
 * commands that also have public subcommands. Whole-admin commands instead carry
 * setDefaultMemberPermissions(ManageGuild) in register-commands.ts, which server
 * admins may deliberately widen in Server Settings > Integrations.
 */
export const ADMIN_SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  event: ['create', 'delete'],
  ryvl: ['setup'],
  live_results: ['setup', 'check'],
  vpg_transfers: ['setup', 'check'],
};

/**
 * Tournament subcommands check their own admin rule (Manage Server or a tournament admin
 * role) inside tournament-commands.ts. Listed here so the docs label them and the tests
 * can compare this list with that handler.
 */
export const TOURNAMENT_ADMIN_SUBCOMMANDS: readonly string[] = [
  'setup-admin',
  'create',
  'set-status',
  'toggle-signups',
  'start-draft',
  'start',
  'notify',
  'generate-standings',
];

export function isAdminSubcommand(commandName: string, subcommand: string | null | undefined): boolean {
  return !!subcommand && (ADMIN_SUBCOMMANDS[commandName] || []).includes(subcommand);
}

interface PermissionCarrier {
  memberPermissions?: { has(permission: bigint): boolean } | null;
  inGuild?: () => boolean;
}

/** Manage Server (Administrator implies it: PermissionsBitField.has checks admin). */
export function canManageGuild(interaction: PermissionCarrier): boolean {
  if (interaction.inGuild && !interaction.inGuild()) return false;
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

interface Replyable extends PermissionCarrier {
  deferred?: boolean;
  replied?: boolean;
  reply(options: { content: string; flags: MessageFlags.Ephemeral }): Promise<unknown>;
  editReply(options: { content: string }): Promise<unknown>;
}

export const MANAGE_GUILD_REQUIRED = '⛔ You need the Manage Server permission to use this command.';

/** Replies with a refusal and returns false when the member cannot manage the server. */
export async function ensureManageGuild(interaction: Replyable): Promise<boolean> {
  if (canManageGuild(interaction)) return true;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: MANAGE_GUILD_REQUIRED });
  } else {
    await interaction.reply({ content: MANAGE_GUILD_REQUIRED, flags: MessageFlags.Ephemeral });
  }
  return false;
}
