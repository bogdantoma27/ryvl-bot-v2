import { Injectable, Logger } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  ButtonInteraction,
  UserSelectMenuInteraction,
  AutocompleteInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  AttachmentBuilder,
} from 'discord.js';
import { randomUUID } from 'crypto';
import {
  FORMATIONS,
  formationKeys,
  FormationLayout,
} from '../../lineup/lineup-formations';
import {
  LineupRendererService,
  formatDualKickoff,
} from '../../lineup/lineup-renderer.service';
import { PrismaService } from '../../prisma/prisma.service';

export const LINEUP_MODAL_SETUP_PREFIX = 'lineup:modal:setup:';
export const LINEUP_MODAL_CUSTOM_PREFIX = 'lineup:modal:custom:';

function parseKickoffDateTime(
  dateStr: string,
  timeStr: string,
  timeZone = 'Europe/Bucharest',
): Date | null {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  if (!year || !month || !day || isNaN(hour) || isNaN(minute)) return null;

  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(naive);
    const getPart = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = Number(getPart('year'));
    const m = Number(getPart('month'));
    const d = Number(getPart('day'));
    let h = Number(getPart('hour'));
    if (h === 24) h = 0;
    const min = Number(getPart('minute'));
    const s = Number(getPart('second'));
    const inTzUtc = Date.UTC(y, m - 1, d, h, min, s);
    const offsetMs = inTzUtc - naive.getTime();
    return new Date(naive.getTime() - offsetMs);
  } catch {
    const fallback = new Date(`${dateStr}T${timeStr}:00Z`);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
}

interface LineupWizardSession {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  formationKey: string;
  layout: FormationLayout;
  title: string;
  kickoffAt: Date | null;
  currentIndex: number;
  players: Record<string, string>;
  expiresAt: number;
}

@Injectable()
export class LineupPostCommand {
  private readonly logger = new Logger(LineupPostCommand.name);
  private readonly sessions = new Map<string, LineupWizardSession>();

  constructor(
    private readonly renderer: LineupRendererService,
    private readonly prisma: PrismaService,
  ) {
    // Clean up expired sessions periodically (every 5 minutes)
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions.entries()) {
        if (session.expiresAt < now) {
          this.sessions.delete(id);
        }
      }
    }, 5 * 60 * 1000);
  }

  async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'formation') {
      const query = (focused.value || '').toLowerCase().trim();
      const allKeys = formationKeys();
      const matches = allKeys
        .filter((key) => key.toLowerCase().includes(query) || (FORMATIONS[key]?.label || '').toLowerCase().includes(query))
        .slice(0, 25);

      await interaction.respond(
        matches.map((key) => ({
          name: `${FORMATIONS[key].label} (${key})`,
          value: key,
        })),
      );
    }
  }

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const channelOption = interaction.options.getChannel('channel');
    let targetChannelId = channelOption?.id;

    const guild = await this.prisma.guild.findUnique({ where: { id: guildId } });
    if (!targetChannelId) {
      targetChannelId = guild?.defaultChannelId || interaction.channelId;
    }

    if (!targetChannelId) {
      await interaction.reply({
        content: 'No target channel specified and no default channel configured.',
        ephemeral: true,
      });
      return;
    }

    const formationInput = interaction.options.getString('formation')?.trim().toLowerCase();
    const titleInput = interaction.options.getString('title')?.trim();
    const dateInput = interaction.options.getString('date')?.trim();
    const timeInput = interaction.options.getString('time')?.trim();

    const sessionId = randomUUID();

    // If formation or title is missing, show setup modal
    if (!formationInput || !titleInput) {
      const modal = new ModalBuilder()
        .setCustomId(`${LINEUP_MODAL_SETUP_PREFIX}${sessionId}:${targetChannelId}`)
        .setTitle('Lineup Setup');

      const formationField = new TextInputBuilder()
        .setCustomId('formation')
        .setLabel('Formation key (e.g. 433, 4231)')
        .setPlaceholder('433')
        .setValue(formationInput || '433')
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const titleField = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Lineup title')
        .setPlaceholder('RYVL Match Lineup')
        .setValue(titleInput || 'RYVL Match Lineup')
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const dateField = new TextInputBuilder()
        .setCustomId('date')
        .setLabel('Kickoff date (optional, YYYY-MM-DD)')
        .setPlaceholder('YYYY-MM-DD')
        .setValue(dateInput || '')
        .setRequired(false)
        .setStyle(TextInputStyle.Short);

      const timeField = new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Kickoff time (optional, HH:mm)')
        .setPlaceholder('21:45')
        .setValue(timeInput || '')
        .setRequired(false)
        .setStyle(TextInputStyle.Short);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(formationField),
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleField),
        new ActionRowBuilder<TextInputBuilder>().addComponents(dateField),
        new ActionRowBuilder<TextInputBuilder>().addComponents(timeField),
      );

      await interaction.showModal(modal);
      return;
    }

    // Direct start
    await interaction.deferReply({ ephemeral: true });

    let kickoffAt: Date | null = null;
    if (dateInput && timeInput) {
      kickoffAt = parseKickoffDateTime(
        dateInput,
        timeInput,
        guild?.timezone || 'Europe/Bucharest',
      );
    }

    const layout = FORMATIONS[formationInput] || FORMATIONS['433'];

    const session: LineupWizardSession = {
      id: sessionId,
      userId: interaction.user.id,
      guildId,
      channelId: targetChannelId,
      formationKey: formationInput in FORMATIONS ? formationInput : '433',
      layout,
      title: titleInput,
      kickoffAt,
      currentIndex: 0,
      players: {},
      expiresAt: Date.now() + 15 * 60 * 1000,
    };

    this.sessions.set(sessionId, session);
    await this.renderWizardStep(interaction, session);
  }

  async handleSetupModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const raw = interaction.customId.replace(LINEUP_MODAL_SETUP_PREFIX, '');
    const [sessionId, targetChannelId] = raw.split(':');

    const formationInput = interaction.fields.getTextInputValue('formation')?.trim().toLowerCase() || '433';
    const titleInput = interaction.fields.getTextInputValue('title')?.trim() || 'RYVL Match Lineup';
    const dateInput = interaction.fields.getTextInputValue('date')?.trim();
    const timeInput = interaction.fields.getTextInputValue('time')?.trim();

    await interaction.deferReply({ ephemeral: true });

    const guild = await this.prisma.guild.findUnique({
      where: { id: interaction.guildId! },
    });

    let kickoffAt: Date | null = null;
    if (dateInput && timeInput) {
      kickoffAt = parseKickoffDateTime(
        dateInput,
        timeInput,
        guild?.timezone || 'Europe/Bucharest',
      );
    }

    const formationKey = formationInput in FORMATIONS ? formationInput : '433';
    const layout = FORMATIONS[formationKey];

    const session: LineupWizardSession = {
      id: sessionId,
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      channelId: targetChannelId,
      formationKey,
      layout,
      title: titleInput,
      kickoffAt,
      currentIndex: 0,
      players: {},
      expiresAt: Date.now() + 15 * 60 * 1000,
    };

    this.sessions.set(sessionId, session);
    await this.renderWizardStep(interaction, session);
  }

  async handleUserSelect(interaction: UserSelectMenuInteraction): Promise<void> {
    const sessionId = interaction.customId.replace('lineup:user:', '');
    const session = this.sessions.get(sessionId);

    if (!session) {
      await interaction.reply({
        content: 'This lineup wizard session has expired. Please run `/lineup_post` again.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== session.userId) {
      await interaction.reply({
        content: 'Only the author who started this wizard can use it.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    const selectedUserId = interaction.values[0];
    const member = interaction.guild?.members.cache.get(selectedUserId);
    const displayName = member?.displayName || interaction.users.get(selectedUserId)?.username || 'Player';

    const currentSlot = session.layout.positions[session.currentIndex];
    session.players[currentSlot.key] = displayName.slice(0, 24);

    await this.advanceWizard(interaction, session);
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;
    const parts = customId.split(':');
    const action = parts[1];
    const sessionId = parts[2];

    const session = this.sessions.get(sessionId);
    if (!session) {
      await interaction.reply({
        content: 'This lineup wizard session has expired. Please run `/lineup_post` again.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== session.userId) {
      await interaction.reply({
        content: 'Only the author who started this wizard can use it.',
        ephemeral: true,
      });
      return;
    }

    if (action === 'custom_name') {
      const currentSlot = session.layout.positions[session.currentIndex];
      const modal = new ModalBuilder()
        .setCustomId(`${LINEUP_MODAL_CUSTOM_PREFIX}${sessionId}`)
        .setTitle(`Player for ${currentSlot.label}`);

      const input = new TextInputBuilder()
        .setCustomId('player_name')
        .setLabel(`Player name for ${currentSlot.label}`)
        .setPlaceholder('Type custom display name')
        .setMaxLength(24)
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (action === 'skip') {
      await interaction.deferUpdate();
      await this.advanceWizard(interaction, session);
      return;
    }

    if (action === 'back') {
      await interaction.deferUpdate();
      if (session.currentIndex > 0) {
        session.currentIndex--;
      }
      await this.renderWizardStep(interaction, session);
      return;
    }

    if (action === 'reset') {
      await interaction.deferUpdate();
      const currentSlot = session.layout.positions[session.currentIndex];
      delete session.players[currentSlot.key];
      await this.renderWizardStep(interaction, session);
      return;
    }

    if (action === 'finish') {
      await interaction.deferUpdate();
      await this.finishWizard(interaction, session);
      return;
    }

    if (action === 'cancel') {
      await interaction.deferUpdate();
      this.sessions.delete(sessionId);
      await interaction.editReply({
        content: '❌ Lineup wizard cancelled.',
        components: [],
      });
      return;
    }
  }

  async handleCustomNameModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const sessionId = interaction.customId.replace(LINEUP_MODAL_CUSTOM_PREFIX, '');
    const session = this.sessions.get(sessionId);

    if (!session) {
      await interaction.reply({
        content: 'This lineup wizard session has expired.',
        ephemeral: true,
      });
      return;
    }

    const name = interaction.fields.getTextInputValue('player_name')?.trim();
    if (name) {
      const currentSlot = session.layout.positions[session.currentIndex];
      session.players[currentSlot.key] = name.slice(0, 24);
    }

    await interaction.deferUpdate();
    await this.advanceWizard(interaction, session);
  }

  private async advanceWizard(
    interaction: UserSelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction,
    session: LineupWizardSession,
  ): Promise<void> {
    if (session.currentIndex < session.layout.positions.length - 1) {
      session.currentIndex++;
      await this.renderWizardStep(interaction, session);
    } else {
      await this.finishWizard(interaction, session);
    }
  }

  private buildProgressContent(session: LineupWizardSession): string {
    const current = session.currentIndex + 1;
    const total = session.layout.positions.length;
    const currentSlot = session.layout.positions[session.currentIndex];

    const lines = [
      `⚽ **Lineup Wizard** - \`${session.layout.label}\``,
      `Title: **${session.title}**`,
      `Target Channel: <#${session.channelId}>`,
      `Step **${current}/${total}**: choose player for **${currentSlot.label}** (\`${currentSlot.key}\`)`,
      `Use member select below, or click **Type Custom Name**, or **Skip Slot**.`,
    ];

    if (Object.keys(session.players).length > 0) {
      const preview = Object.entries(session.players)
        .map(([k, v]) => `\`${k.toUpperCase()}\`: ${v}`)
        .join(', ');
      lines.push(`\n**Selected:** ${preview}`);
    }

    return lines.join('\n');
  }

  private async renderWizardStep(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction | UserSelectMenuInteraction | ButtonInteraction,
    session: LineupWizardSession,
  ): Promise<void> {
    const content = this.buildProgressContent(session);

    // Row 1: User select
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(`lineup:user:${session.id}`)
      .setPlaceholder('Choose a server member for this position')
      .setMinValues(1)
      .setMaxValues(1);

    const row1 = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect);

    // Row 2: Helper buttons
    const customNameBtn = new ButtonBuilder()
      .setCustomId(`lineup:custom_name:${session.id}`)
      .setLabel('Type Custom Name')
      .setStyle(ButtonStyle.Secondary);

    const skipBtn = new ButtonBuilder()
      .setCustomId(`lineup:skip:${session.id}`)
      .setLabel('Skip Slot')
      .setStyle(ButtonStyle.Primary);

    const backBtn = new ButtonBuilder()
      .setCustomId(`lineup:back:${session.id}`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.currentIndex === 0);

    const resetBtn = new ButtonBuilder()
      .setCustomId(`lineup:reset:${session.id}`)
      .setLabel('Reset Slot')
      .setStyle(ButtonStyle.Secondary);

    const finishBtn = new ButtonBuilder()
      .setCustomId(`lineup:finish:${session.id}`)
      .setLabel('Finish & Post Now')
      .setStyle(ButtonStyle.Success);

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      customNameBtn,
      skipBtn,
      backBtn,
      resetBtn,
      finishBtn,
    );

    // Row 3: Cancel
    const cancelBtn = new ButtonBuilder()
      .setCustomId(`lineup:cancel:${session.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelBtn);

    await interaction.editReply({
      content,
      components: [row1, row2, row3],
    });
  }

  private async finishWizard(
    interaction: UserSelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction,
    session: LineupWizardSession,
  ): Promise<void> {
    await interaction.editReply({
      content: '⏳ Rendering lineup image and posting to channel...',
      components: [],
    });

    try {
      const pngBuffer = await this.renderer.renderPng({
        formation: session.formationKey,
        title: session.title,
        players: session.players,
        kickoffAt: session.kickoffAt,
      });

      const channel = (await interaction.client.channels.fetch(session.channelId)) as TextChannel;
      if (!channel || !('send' in channel)) {
        await interaction.editReply({
          content: `❌ Could not find text channel <#${session.channelId}> or bot lacks send permissions.`,
          components: [],
        });
        this.sessions.delete(session.id);
        return;
      }

      const attachment = new AttachmentBuilder(pngBuffer, {
        name: `lineup-${session.formationKey}.png`,
      });

      const postedMessage = await channel.send({
        files: [attachment],
      });

      await interaction.editReply({
        content: `✅ Lineup successfully posted in <#${session.channelId}>!\n[Jump to message](${postedMessage.url})`,
        components: [],
      });
    } catch (error) {
      this.logger.error(`Failed to finish lineup: ${error}`);
      await interaction.editReply({
        content: `❌ Failed to render or post lineup: ${error}`,
        components: [],
      });
    } finally {
      this.sessions.delete(session.id);
    }
  }
}
