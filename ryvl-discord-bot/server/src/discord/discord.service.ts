import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ChannelType,
  TextChannel,
  Message,
  AttachmentBuilder,
} from 'discord.js';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { getSlashCommands } from './commands/register-commands';
import { EventCreateCommand, EVENT_CREATE_MODAL_ID } from './commands/event-create.command';
import { EventListCommand } from './commands/event-list.command';
import { EventDeleteCommand } from './commands/event-delete.command';
import { EventEditCommand, EVENT_EDIT_MODAL_PREFIX } from './commands/event-edit.command';
import {
  LineupPostCommand,
  LINEUP_MODAL_SETUP_PREFIX,
  LINEUP_MODAL_CUSTOM_PREFIX,
} from './commands/lineup-post.command';
import { EaCommands } from './commands/ea-commands';
import { RsvpButtonHandler } from './interactions/rsvp-button.handler';


export interface DiscordChannelInfo {
  id: string;
  name: string;
  type: ChannelType;
  position: number;
}

export interface DiscordRoleInfo {
  id: string;
  name: string;
  color: string;
  position: number;
  managed: boolean;
}

export interface DiscordMemberInfo {
  id: string;
  username: string;
  displayName: string;
  display_name: string;
  avatarUrl: string;
  avatar_url: string;
}

@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  readonly client: Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly eventCreateCommand: EventCreateCommand,
    private readonly eventListCommand: EventListCommand,
    private readonly eventDeleteCommand: EventDeleteCommand,
    private readonly eventEditCommand: EventEditCommand,
    private readonly rsvpButtonHandler: RsvpButtonHandler,
    private readonly lineupPostCommand: LineupPostCommand,
    @Inject(forwardRef(() => EaCommands))
    private readonly eaCommands: EaCommands,
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    this.setupEventHandlers();
    await this.registerSlashCommands();
    await this.connectClient();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      this.logger.log('Destroying Discord client connection...');
      await this.client.destroy();
    } catch (error) {
      this.logger.error('Error destroying Discord client', error);
    }
  }

  private setupEventHandlers(): void {
    this.client.on(Events.ClientReady, async () => {
      this.logger.log(`Discord bot logged in as ${this.client.user?.tag}`);

      // Sync existing bot guilds with DB
      try {
        const guilds = await this.client.guilds.fetch();
        for (const [id, oAuthGuild] of guilds) {
          const fetchedGuild = await oAuthGuild.fetch();
          await this.prisma.guild.upsert({
            where: { id },
            update: {
              name: fetchedGuild.name,
              iconUrl: fetchedGuild.iconURL(),
            },
            create: {
              id,
              name: fetchedGuild.name,
              iconUrl: fetchedGuild.iconURL(),
            },
          });
        }
        this.logger.log(`Synchronized ${guilds.size} guilds with database.`);
        await this.registerGuildSlashCommands();
      } catch (err) {
        this.logger.warn(`Could not sync guilds on startup: ${err}`);
      }
    });

    this.client.on(Events.GuildCreate, async (guild) => {
      this.logger.log(`Bot joined new guild: ${guild.name} (${guild.id})`);
      try {
        await this.prisma.guild.upsert({
          where: { id: guild.id },
          update: {
            name: guild.name,
            iconUrl: guild.iconURL(),
          },
          create: {
            id: guild.id,
            name: guild.name,
            iconUrl: guild.iconURL(),
          },
        });
        const rest = new REST({ version: '10' }).setToken(this.configService.discordToken);
        await rest.put(
          Routes.applicationGuildCommands(this.configService.discordClientId, guild.id),
          { body: getSlashCommands() },
        );
      } catch (err) {
        this.logger.error(`Failed to upsert guild on GuildCreate: ${err}`);
      }
    });

    this.client.on(Events.GuildDelete, (guild) => {
      this.logger.log(`Bot removed from guild: ${guild.name} (${guild.id})`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          if (interaction.commandName === 'event') {
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'create') {
              await this.eventCreateCommand.showModal(interaction);
            } else if (subcommand === 'list') {
              await this.eventListCommand.execute(interaction);
            } else if (subcommand === 'delete') {
              await this.eventDeleteCommand.execute(interaction);
            }
          } else if (interaction.commandName === 'lineup_post') {
            await this.lineupPostCommand.execute(interaction);
          } else if (interaction.commandName === 'ea_setup') {
            await this.eaCommands.handleSetup(interaction);
          } else if (interaction.commandName === 'ea_stats') {
            await this.eaCommands.handleStats(interaction);
          } else if (interaction.commandName === 'ea_latest') {
            await this.eaCommands.handleLatest(interaction);
          }
        } else if (interaction.isAutocomplete()) {

          if (interaction.commandName === 'event') {
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'delete') {
              await this.eventDeleteCommand.handleAutocomplete(interaction);
            }
          } else if (interaction.commandName === 'lineup_post') {
            await this.lineupPostCommand.handleAutocomplete(interaction);
          }
        } else if (interaction.isModalSubmit()) {
          if (interaction.customId === EVENT_CREATE_MODAL_ID) {
            await this.eventCreateCommand.handleModalSubmit(interaction);
          } else if (interaction.customId.startsWith(EVENT_EDIT_MODAL_PREFIX)) {
            const eventId = interaction.customId.replace(EVENT_EDIT_MODAL_PREFIX, '');
            await this.eventEditCommand.handleModalSubmit(interaction, eventId);
          } else if (interaction.customId.startsWith(LINEUP_MODAL_SETUP_PREFIX)) {
            await this.lineupPostCommand.handleSetupModalSubmit(interaction);
          } else if (interaction.customId.startsWith(LINEUP_MODAL_CUSTOM_PREFIX)) {
            await this.lineupPostCommand.handleCustomNameModalSubmit(interaction);
          }
        } else if (interaction.isUserSelectMenu()) {
          if (interaction.customId.startsWith('lineup:user:')) {
            await this.lineupPostCommand.handleUserSelect(interaction);
          }
        } else if (interaction.isButton()) {
          if (interaction.customId.startsWith('rsvp:')) {
            await this.rsvpButtonHandler.handle(interaction);
          } else if (interaction.customId.startsWith('lineup:')) {
            await this.lineupPostCommand.handleButton(interaction);
          } else if (interaction.customId.startsWith('event:edit:')) {
            const eventId = interaction.customId.replace('event:edit:', '');
            await this.eventEditCommand.showModal(interaction, eventId);
          } else if (interaction.customId.startsWith('event:delete:')) {
            const eventId = interaction.customId.replace('event:delete:', '');
            await this.eventDeleteCommand.promptDelete(interaction, eventId);
          } else if (
            interaction.customId.startsWith('confirm:delete:') ||
            interaction.customId.startsWith('cancel:delete:')
          ) {
            await this.eventDeleteCommand.handleButton(interaction);
          }
        }
      } catch (error) {
        this.logger.error(`Error handling interaction: ${error}`);
      }
    });
  }

  private async registerSlashCommands(): Promise<void> {
    try {
      this.logger.log('Registering global slash commands with Discord REST API...');
      const rest = new REST({ version: '10' }).setToken(this.configService.discordToken);
      const commands = getSlashCommands();
      await rest.put(
        Routes.applicationCommands(this.configService.discordClientId),
        { body: commands },
      );
      this.logger.log('Successfully registered global slash commands.');
    } catch (error) {
      this.logger.warn(`Failed to register global slash commands: ${error}`);
    }
  }

  async registerGuildSlashCommands(): Promise<void> {
    try {
      const rest = new REST({ version: '10' }).setToken(this.configService.discordToken);
      const commands = getSlashCommands();
      const guilds = await this.client.guilds.fetch().catch(() => null);
      if (guilds) {
        for (const [id] of guilds) {
          try {
            await rest.put(
              Routes.applicationGuildCommands(this.configService.discordClientId, id),
              { body: commands },
            );
            this.logger.log(`Instantly registered guild slash commands for guild: ${id}`);
          } catch (gErr) {
            this.logger.warn(`Could not register commands for guild ${id}: ${gErr}`);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to register guild slash commands: ${error}`);
    }
  }

  private async connectClient(): Promise<void> {
    try {
      this.logger.log('Connecting Discord client...');
      await this.client.login(this.configService.discordToken);
    } catch (error) {
      this.logger.warn(`Failed to connect Discord client: ${error}`);
    }
  }

  async getGuildChannels(guildId: string): Promise<DiscordChannelInfo[]> {
    const guild =
      this.client.guilds.cache.get(guildId) ||
      (await this.client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      throw new NotFoundException(`Discord guild with ID "${guildId}" not found or bot is not in it`);
    }

    const channels =
      guild.channels.cache.size > 0
        ? guild.channels.cache
        : await guild.channels.fetch().catch(() => guild.channels.cache);

    const result: DiscordChannelInfo[] = [];

    for (const [, channel] of channels) {
      if (
        channel &&
        (channel.type === ChannelType.GuildText ||
          channel.type === ChannelType.GuildAnnouncement)
      ) {
        result.push({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          position: channel.position,
        });
      }
    }

    return result.sort((a, b) => a.position - b.position);
  }

  async getGuildRoles(guildId: string): Promise<DiscordRoleInfo[]> {
    const guild =
      this.client.guilds.cache.get(guildId) ||
      (await this.client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      throw new NotFoundException(`Discord guild with ID "${guildId}" not found or bot is not in it`);
    }

    const roles =
      guild.roles.cache.size > 0
        ? guild.roles.cache
        : await guild.roles.fetch().catch(() => guild.roles.cache);

    const result: DiscordRoleInfo[] = [];

    for (const [, role] of roles) {
      if (role && role.name !== '@everyone') {
        result.push({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position,
          managed: role.managed,
        });
      }
    }

    return result.sort((a, b) => b.position - a.position);
  }

  async getGuildMembers(guildId: string): Promise<DiscordMemberInfo[]> {
    const result: DiscordMemberInfo[] = [];

    // 1. Try Discord Gateway Cache / Fetch
    const guild =
      this.client.guilds.cache.get(guildId) ||
      (await this.client.guilds.fetch(guildId).catch(() => null));

    if (guild) {
      try {
        const fetched = await guild.members.fetch({ limit: 1000 }).catch(() => null);
        const memberCollection = (fetched && fetched.size > 0) ? fetched : guild.members.cache;
        for (const [, member] of memberCollection) {
          if (!member.user.bot) {
            const dName = member.displayName || member.user.globalName || member.user.username || 'Member';
            const aUrl = member.displayAvatarURL();
            result.push({
              id: member.id,
              username: member.user.username,
              displayName: dName,
              display_name: dName,
              avatarUrl: aUrl,
              avatar_url: aUrl,
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Gateway member fetch failed for ${guildId}: ${err}`);
      }
    }

    // 2. If Gateway returned no members, fallback to Discord REST API directly
    if (result.length === 0) {
      try {
        const rest = new REST({ version: '10' }).setToken(this.configService.discordToken);
        const restMembers = (await rest.get(Routes.guildMembers(guildId), {
          query: new URLSearchParams({ limit: '1000' }),
        })) as any[];

        if (Array.isArray(restMembers)) {
          for (const m of restMembers) {
            if (m.user && !m.user.bot) {
              const dName = m.nick || m.user.global_name || m.user.username || 'Member';
              const avatarHash = m.avatar || m.user.avatar;
              const aUrl = avatarHash
                ? `https://cdn.discordapp.com/avatars/${m.user.id}/${avatarHash}.png`
                : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`;

              result.push({
                id: m.user.id,
                username: m.user.username,
                displayName: dName,
                display_name: dName,
                avatarUrl: aUrl,
                avatar_url: aUrl,
              });
            }
          }
        }
      } catch (restErr) {
        this.logger.warn(`REST member fetch fallback failed for ${guildId}: ${restErr}`);
      }
    }

    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async sendMessageToChannel(
    channelId: string,
    embed: EmbedBuilder,
    components?: ActionRowBuilder<ButtonBuilder>[],
    content?: string,
  ): Promise<Message> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !('send' in channel)) {
      throw new NotFoundException(`Text channel with ID "${channelId}" not found or cannot receive messages`);
    }

    const textChannel = channel as TextChannel;
    return textChannel.send({
      content: content && content.trim() ? content : undefined,
      embeds: [embed],
      components: components || [],
    });
  }

  async sendImageMessageToChannel(
    channelId: string,
    imageBuffer: Buffer,
    fileName: string,
    content?: string,
  ): Promise<Message> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !('send' in channel)) {
      throw new NotFoundException(`Text channel with ID "${channelId}" not found or cannot receive messages`);
    }

    const textChannel = channel as TextChannel;
    const attachment = new AttachmentBuilder(imageBuffer, { name: fileName });
    return textChannel.send({
      content: content && content.trim() ? content : undefined,
      files: [attachment],
    });
  }

  async editMessage(
    channelId: string,
    messageId: string,
    embed: EmbedBuilder,
    components?: ActionRowBuilder<ButtonBuilder>[],
  ): Promise<Message> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !('messages' in channel)) {
      throw new NotFoundException(`Channel with ID "${channelId}" not found`);
    }

    const textChannel = channel as TextChannel;
    const message = await textChannel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      throw new NotFoundException(`Message with ID "${messageId}" not found in channel "${channelId}"`);
    }

    return message.edit({
      embeds: [embed],
      components: components || [],
    });
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !('messages' in channel)) {
      throw new NotFoundException(`Channel with ID "${channelId}" not found`);
    }

    const textChannel = channel as TextChannel;
    const message = await textChannel.messages.fetch(messageId).catch(() => null);
    if (message) {
      await message.delete();
    }
  }
}
