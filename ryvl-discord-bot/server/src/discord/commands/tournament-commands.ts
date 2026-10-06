import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import type { TournamentInstance } from '@prisma/client';
import { TournamentService } from '../../tournaments/tournament.service';
import { teamForUser } from '../../tournaments/tournament-logic';

type AnyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

@Injectable()
export class TournamentCommands {
  private readonly logger = new Logger(TournamentCommands.name);

  constructor(
    @Inject(forwardRef(() => TournamentService))
    private readonly tournamentService: TournamentService,
  ) {}

  // ----------------------------------------------------
  // Helpers
  // ----------------------------------------------------

  /** Server admins (Administrator / Manage Server) or members of the tournament admin roles. */
  private async isTournamentAdmin(interaction: AnyInteraction): Promise<boolean> {
    const perms = interaction.memberPermissions;
    if (perms?.has(PermissionFlagsBits.Administrator) || perms?.has(PermissionFlagsBits.ManageGuild)) {
      return true;
    }
    if (!interaction.guildId) return false;
    const config = await this.tournamentService.getOrCreateConfig(interaction.guildId);
    if (!config.adminRoleIds?.length) return false;
    const roles: any = interaction.member?.roles;
    const memberRoleIds: string[] = Array.isArray(roles) ? roles : roles?.cache ? [...roles.cache.keys()] : [];
    return config.adminRoleIds.some((id) => memberRoleIds.includes(id));
  }

  private async respond(interaction: AnyInteraction, content: string, ephemeral = true) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
    }
  }

  private async requireAdmin(interaction: AnyInteraction): Promise<boolean> {
    if (await this.isTournamentAdmin(interaction)) return true;
    await this.respond(interaction, '⛔ Doar adminii turneului pot folosi această acțiune.');
    return false;
  }

  private async fail(interaction: AnyInteraction, err: any, prefix = 'Eroare') {
    const message = err?.response?.message || err?.message || String(err);
    this.logger.warn(`${prefix}: ${message}`);
    try {
      await this.respond(interaction, `❌ ${prefix}: ${Array.isArray(message) ? message.join(', ') : message}`);
    } catch {
      // interaction already expired
    }
  }

  private async activeTournament(interaction: AnyInteraction, type?: 'DRAFT' | 'STANDARD') {
    const t = await this.tournamentService.findActiveTournament(interaction.guildId!, type);
    if (!t) {
      await this.respond(
        interaction,
        type === 'DRAFT' ? 'Nu există niciun turneu draft în acest server.' : 'Nu există niciun turneu în acest server.',
      );
    }
    return t;
  }

  /** The manager on the clock (or an admin) may act on the draft wheel. */
  private async canActOnDraft(interaction: AnyInteraction, t: TournamentInstance): Promise<boolean> {
    const { team } = this.tournamentService.currentDraftTeam(t);
    if (team?.managerId === interaction.user.id) return true;
    if (await this.isTournamentAdmin(interaction)) return true;
    await this.respond(
      interaction,
      `⛔ Este rândul echipei **${team?.name ?? '?'}**. Doar managerul ei${team?.managerId ? ` (<@${team.managerId}>)` : ''} sau un admin poate folosi roata.`,
    );
    return false;
  }

  private channelList(setup: { categoryId: string; channels: any }) {
    const c = setup.channels || {};
    return (
      `• **Categorie**: <#${setup.categoryId}>\n` +
      `• **Info & Regulament**: <#${c.info}>\n` +
      `• **Anunțuri**: <#${c.announcements}>\n` +
      `• **Înscrieri**: <#${c.registration}>\n` +
      (c.draft ? `• **Draft Wheel**: <#${c.draft}>\n` : '') +
      `• **Meciuri & Rezultate**: <#${c.fixtures}>\n` +
      `• **Clasament**: <#${c.standings}>\n` +
      `• **Chat**: <#${c.chat}>`
    );
  }

  private async createAndProvision(
    interaction: AnyInteraction,
    data: { name: string; type: string; formation: string },
  ) {
    const tournament = await this.tournamentService.createTournament(interaction.guildId!, data);
    const setup = await this.tournamentService.setupTournamentChannels(interaction.guildId!, tournament.id);
    return new EmbedBuilder()
      .setTitle(`🏆 Turneu creat: ${tournament.name}`)
      .setColor(0x00d26a)
      .setDescription(
        `**Tip**: \`${tournament.type === 'DRAFT' ? 'FC Draft' : 'Standard'}\`` +
          (tournament.type === 'DRAFT' ? ` • **Formație**: \`${tournament.formation}\`` : '') +
          `\n\n**Canale**:\n${this.channelList(setup)}\n\n` +
          (tournament.type === 'DRAFT'
            ? 'Jucătorii se înscriu din canalul de înscrieri; cine completează numele echipei devine manager. Când sunt gata, apasă **Start Tournament / Draft**.'
            : 'Căpitanii își înscriu echipele din canalul de înscrieri. Când sunt gata, apasă **Start Tournament / Draft** pentru tablou și meciuri.'),
      )
      .setFooter({ text: 'RYVL Esports Bot • Tournament Engine' });
  }

  // ----------------------------------------------------
  // Slash commands
  // ----------------------------------------------------

  async handleCreateTournament(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await this.respond(interaction, 'This command can only be run inside a Discord server.');
      return;
    }
    if (!(await this.requireAdmin(interaction))) return;
    await interaction.deferReply();
    try {
      const embed = await this.createAndProvision(interaction, {
        name: interaction.options.getString('name', true),
        type: (interaction.options.getString('type') || 'standard').toUpperCase(),
        formation: interaction.options.getString('formation') || '3-5-2',
      });
      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await this.fail(interaction, err, 'Turneul nu a putut fi creat');
    }
  }

  async handleTournament(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await this.respond(interaction, 'This command can only be run inside a Discord server.');
      return;
    }

    const adminOnly = [
      'setup-admin',
      'create',
      'set-status',
      'toggle-signups',
      'start-draft',
      'start',
      'notify',
      'generate-standings',
    ];
    if (adminOnly.includes(subcommand) && !(await this.requireAdmin(interaction))) return;

    try {
      if (subcommand === 'setup-admin') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.tournamentService.postAdminPanel(guildId, interaction.channelId);
        await this.tournamentService.updateConfig(guildId, { adminChannelId: interaction.channelId });
        await interaction.editReply('✅ Panoul de administrare a turneelor a fost publicat în acest canal.');
      } else if (subcommand === 'create') {
        await interaction.deferReply();
        const embed = await this.createAndProvision(interaction, {
          name: interaction.options.getString('name', true),
          type: (interaction.options.getString('type') || 'draft').toUpperCase(),
          formation: interaction.options.getString('formation') || '3-5-2',
        });
        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'spin') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction, 'DRAFT');
        if (!t) return;
        const draft = this.tournamentService.draft(t);
        if (t.status !== 'DRAFTING' || draft.complete) {
          await interaction.editReply(draft.complete ? 'Draftul s-a încheiat.' : 'Draftul nu a început încă.');
          return;
        }
        const { team } = this.tournamentService.currentDraftTeam(t);
        const draftChannel = this.tournamentService.channels(t).draft;
        await interaction.editReply(
          `🎰 **La rând**: **${team?.name}**${team?.managerId ? ` (<@${team.managerId}>)` : ''}\n` +
            `Mergi în ${draftChannel ? `<#${draftChannel}>` : 'canalul de draft'} și apasă **Spin Wheel**.`,
        );
      } else if (subcommand === 'draft-status') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction, 'DRAFT');
        if (!t) return;
        await interaction.editReply({ embeds: [this.draftStatusEmbed(t)] });
      } else if (subcommand === 'status') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction);
        if (!t) return;
        await interaction.editReply({ embeds: [this.signupStatusEmbed(t)] });
      } else if (subcommand === 'set-status') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction);
        if (!t) return;
        const status = interaction.options.getString('status', true);
        const updated = await this.tournamentService.updateTournamentStatus(t.id, status, guildId);
        await interaction.editReply(`✅ Statusul turneului **${updated.name}** este acum \`${updated.status}\`.`);
      } else if (subcommand === 'toggle-signups') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction);
        if (!t) return;
        const updated = await this.tournamentService.toggleSignups(t.id, guildId);
        await interaction.editReply(`⚡ Înscrierile pentru **${updated.name}** sunt acum \`${updated.status}\`.`);
      } else if (subcommand === 'start-draft' || subcommand === 'start') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction, subcommand === 'start-draft' ? 'DRAFT' : undefined);
        if (!t) return;
        await interaction.editReply(await this.startMessage(t));
      } else if (subcommand === 'notify') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction);
        if (!t) return;
        await this.tournamentService.broadcastNotification(
          t.id,
          interaction.options.getString('title', true),
          interaction.options.getString('message', true),
          interaction.user.username,
        );
        await interaction.editReply('📢 Anunțul a fost publicat.');
      } else if (subcommand === 'generate-standings') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction);
        if (!t) return;
        if (!this.tournamentService.channels(t).standings) {
          await interaction.editReply('Turneul nu are canal de clasament. Folosește „Provision Discord Channels” din dashboard.');
          return;
        }
        await this.tournamentService.postStandings(t);
        await interaction.editReply('✅ Clasamentul a fost actualizat în canalul de clasament.');
      }
    } catch (err: any) {
      await this.fail(interaction, err);
    }
  }

  private async startMessage(t: TournamentInstance): Promise<string> {
    const res = await this.tournamentService.startTournament(t.id, t.guildId);
    const channels = this.tournamentService.channels(res.tournament);
    const where = t.type === 'DRAFT' ? channels.draft : channels.fixtures;
    return `🚀 **${res.tournament.name}**: ${res.message}${where ? ` Vezi <#${where}>.` : ''}`;
  }

  private signupStatusEmbed(t: TournamentInstance) {
    const signups = this.tournamentService.signups(t);
    const isDraft = t.type === 'DRAFT';
    const managers = signups.filter((s) => s.isManager);
    const lines = signups.map(
      (s, i) =>
        `${i + 1}. <@${s.userId}> • \`${s.gamertag}\`` +
        (isDraft ? ` (${s.pos1}${s.pos2 ? `/${s.pos2}` : ''})${s.isManager ? ` • 👔 ${s.teamName}` : ''}` : ` • **${s.teamName}**`),
    );
    let list = lines.join('\n') || 'Nimeni înscris încă.';
    if (list.length > 3500) list = `${list.slice(0, 3500)}\n…`;
    return new EmbedBuilder()
      .setTitle(`📋 Înscrieri — ${t.name}`)
      .setColor(0x00d26a)
      .setDescription(
        (isDraft
          ? `Manageri: **${managers.length}** • Jucători: **${signups.length - managers.length}**\n`
          : `Echipe înscrise: **${signups.length}** / 32\n`) +
          `Status: **${t.status}**\n\n${list}`,
      );
  }

  private draftStatusEmbed(t: TournamentInstance) {
    const draft = this.tournamentService.draft(t);
    const teams = this.tournamentService.teams(t);
    if (teams.length === 0) {
      return new EmbedBuilder()
        .setTitle(`🎡 Draft — ${t.name}`)
        .setColor(0x95a5a6)
        .setDescription('Draftul nu a început încă.');
    }
    const { team } = this.tournamentService.currentDraftTeam(t);
    return new EmbedBuilder()
      .setTitle(`🎡 Draft — ${t.name}`)
      .setColor(draft.complete ? 0x5865f2 : 0xf1c40f)
      .setDescription(
        `Status: **${draft.complete ? 'ÎNCHEIAT' : 'ÎN DESFĂȘURARE'}**` +
          (draft.complete ? '' : ` • La rând: **${team?.name}**`) +
          `\nAlegeri: **${draft.picks.length} / ${draft.snakeOrder.length}**\n\n` +
          teams
            .map((tm, idx) => `• **${tm.name}**: ${tm.picks.map((p) => `${p.position} ${p.displayName}`).join(', ')} (🃏 ${draft.teamJokers[idx] ?? 0})`)
            .join('\n')
            .slice(0, 3800),
      );
  }

  // ----------------------------------------------------
  // Buttons
  // ----------------------------------------------------

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;
    const idAfter = (prefix: string) => customId.slice(prefix.length);

    try {
      if (customId.startsWith('tourney:admin:')) {
        await this.handleAdminButton(interaction);
      } else if (customId.startsWith('tourney:signup:') || customId.startsWith('tourney:register:')) {
        const tournamentId = customId.replace('tourney:signup:', '').replace('tourney:register:', '');
        const tournament = await this.tournamentService.getTournament(tournamentId, interaction.guildId!);
        if (tournament.status !== 'SIGNUPS_OPEN') {
          await this.respond(interaction, '🔒 Înscrierile sunt închise pentru acest turneu.');
          return;
        }
        await interaction.showModal(this.signupModal(tournament));
      } else if (customId.startsWith('tourney:pullout:') || customId.startsWith('tourney:unregister:')) {
        const tournamentId = customId.replace('tourney:pullout:', '').replace('tourney:unregister:', '');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await this.tournamentService.removeSignup(tournamentId, interaction.user.id, interaction.guildId!);
        await interaction.editReply('✅ Te-ai retras cu succes din turneu.');
      } else if (customId.startsWith('tourney:view_roster:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.tournamentService.getTournament(idAfter('tourney:view_roster:'), interaction.guildId!);
        await interaction.editReply({ embeds: [this.signupStatusEmbed(t)] });
      } else if (customId.startsWith('tourney:draft:spin_modal:')) {
        const t = await this.tournamentService.getTournament(idAfter('tourney:draft:spin_modal:'), interaction.guildId!);
        if (!(await this.canActOnDraft(interaction, t))) return;
        const slots = Array.from(new Set(this.tournamentService.currentOpenSlots(t)));
        if (slots.length === 0) {
          await this.respond(interaction, 'Echipa nu mai are poziții libere.');
          return;
        }
        const { team } = this.tournamentService.currentDraftTeam(t);
        const select = new StringSelectMenuBuilder()
          .setCustomId(`tourney:draft:spin_select:${t.id}`)
          .setPlaceholder('Alege poziția pentru care se învârte roata')
          .addOptions(slots.map((s) => ({ label: s, value: s })));
        await interaction.reply({
          content: `🎰 **${team?.name}** — alege poziția:`,
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
          flags: MessageFlags.Ephemeral,
        });
      } else if (customId.startsWith('tourney:draft:confirm:')) {
        const t = await this.tournamentService.getTournament(idAfter('tourney:draft:confirm:'), interaction.guildId!);
        if (!(await this.canActOnDraft(interaction, t))) return;
        await interaction.deferReply();
        const result = await this.tournamentService.confirmDraftPick(t.id, interaction.guildId!);
        await interaction.editReply(
          `✅ **${result.pick.teamName}** l-a ales pe <@${result.pick.userId}> (\`${result.pick.gamertag}\`) pe **${result.pick.position}**.` +
            (result.complete ? '\n\n🎉 **Draftul s-a încheiat!** Loturile și meciurile au fost publicate.' : ''),
        );
      } else if (customId.startsWith('tourney:draft:joker:')) {
        const t = await this.tournamentService.getTournament(idAfter('tourney:draft:joker:'), interaction.guildId!);
        if (!(await this.canActOnDraft(interaction, t))) return;
        await interaction.deferReply();
        const result = await this.tournamentService.useDraftJoker(t.id, interaction.guildId!);
        await interaction.editReply(
          `🃏 **Joker folosit!** Noul jucător: **${result.candidate.displayName}** (\`${result.candidate.gamertag}\`). Jokeri rămași: **${result.jokersLeft}**.`,
        );
      } else if (customId.startsWith('tourney:draft:autodraft:')) {
        if (!(await this.requireAdmin(interaction))) return;
        await interaction.deferReply();
        await this.tournamentService.autoDraftRemaining(idAfter('tourney:draft:autodraft:'), interaction.guildId!);
        await interaction.editReply('⚡ **Auto-draft complet!** Toate pozițiile rămase au fost completate, iar meciurile au fost generate.');
      } else if (customId.startsWith('tourney:result:enter:')) {
        await this.showFixturePicker(interaction, idAfter('tourney:result:enter:'));
      } else if (customId.startsWith('tourney:result:call_admin:')) {
        const config = await this.tournamentService.getOrCreateConfig(interaction.guildId!);
        const ping = config.adminRoleIds?.length ? config.adminRoleIds.map((r) => `<@&${r}>`).join(' ') + ' ' : '';
        await interaction.reply({
          content: `🚨 ${ping}<@${interaction.user.id}> a solicitat un administrator în <#${interaction.channelId}>.`,
          allowedMentions: { roles: config.adminRoleIds || [], users: [interaction.user.id] },
        });
      } else if (customId.startsWith('tourney:refresh_signup:') || customId.startsWith('tourney:result:refresh:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const id = customId.replace('tourney:refresh_signup:', '').replace('tourney:result:refresh:', '');
        await this.tournamentService.refreshTournamentEmbeds(id, interaction.guildId!);
        await interaction.editReply('🔄 Date reîmprospătate!');
      }
    } catch (err: any) {
      await this.fail(interaction, err);
    }
  }

  private async handleAdminButton(interaction: ButtonInteraction) {
    if (!(await this.requireAdmin(interaction))) return;
    const customId = interaction.customId;

    if (customId === 'tourney:admin:create') {
      const modal = new ModalBuilder().setCustomId('tourney:modal:create').setTitle('Create Tournament');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('tournament_name')
            .setLabel('Tournament Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Cupa Primăverii 2026')
            .setMaxLength(80)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('tournament_type')
            .setLabel('Type: standard or draft')
            .setStyle(TextInputStyle.Short)
            .setValue('standard')
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('formation')
            .setLabel('Draft formation (3-5-2 or 3-1-4-2)')
            .setStyle(TextInputStyle.Short)
            .setValue('3-5-2')
            .setRequired(false),
        ),
      );
      await interaction.showModal(modal);
      return;
    }

    if (customId === 'tourney:admin:notify') {
      const modal = new ModalBuilder().setCustomId('tourney:modal:notify').setTitle('Broadcast Tournament Notification');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('notify_title')
            .setLabel('Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Schedule Update / Round 1 Fixtures')
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('notify_message')
            .setLabel('Message')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Write your announcement here...')
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = await this.activeTournament(interaction);
    if (!t) return;

    if (customId === 'tourney:admin:status') {
      await interaction.editReply({ embeds: [this.signupStatusEmbed(t)] });
    } else if (customId === 'tourney:admin:toggle_signups') {
      const updated = await this.tournamentService.toggleSignups(t.id, t.guildId);
      await interaction.editReply(`⚡ Înscrierile pentru **${updated.name}** sunt acum \`${updated.status}\`.`);
    } else if (customId === 'tourney:admin:start_draft') {
      await interaction.editReply(await this.startMessage(t));
    } else if (customId === 'tourney:admin:refresh') {
      await this.tournamentService.refreshTournamentEmbeds(t.id, t.guildId);
      await interaction.editReply(`🔄 Panourile pentru **${t.name}** au fost reîmprospătate.`);
    }
  }

  private signupModal(tournament: TournamentInstance) {
    const isDraft = tournament.type === 'DRAFT';
    const modal = new ModalBuilder()
      .setCustomId(`tourney:modal:signup:${tournament.id}`)
      .setTitle(isDraft ? 'Înscriere Draft' : 'Înscriere Echipă Turneu');

    const gamertag = new TextInputBuilder()
      .setCustomId('gamertag')
      .setLabel(isDraft ? 'Gamertag (PSN/Xbox/PC ID)' : 'Gamertag Căpitan')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Numele exact din joc')
      .setMaxLength(40)
      .setRequired(true);

    if (isDraft) {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(gamertag),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('pos1')
            .setLabel('Poziție principală (GK, CB, CDM, CM, LM, ST...)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(5)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('pos2')
            .setLabel('Poziție secundară (opțional)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(5)
            .setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('team_name')
            .setLabel('Nume echipă (DOAR dacă vrei să fii manager)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(false),
        ),
      );
    } else {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('team_name')
            .setLabel('Nume Echipă')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('ex: RYVL Esports')
            .setMaxLength(40)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(gamertag),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('notes')
            .setLabel('Detalii / Discord Căpitan')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
      );
    }
    return modal;
  }

  /** Report Score: offers the pending fixtures the user may report (all of them for admins). */
  private async showFixturePicker(interaction: ButtonInteraction, tournamentId: string) {
    const t = await this.tournamentService.getTournament(tournamentId, interaction.guildId!);
    if (t.status !== 'ACTIVE') {
      await this.respond(interaction, 'Scorurile se pot raporta doar cât timp turneul este în desfășurare.');
      return;
    }
    const isAdmin = await this.isTournamentAdmin(interaction);
    const myTeam = teamForUser(this.tournamentService.teams(t), interaction.user.id);
    if (!isAdmin && !myTeam) {
      await this.respond(interaction, '⛔ Doar managerii/căpitanii echipelor și adminii pot raporta scoruri.');
      return;
    }
    const pending = this.tournamentService
      .pendingFixtures(t)
      .filter((m) => isAdmin || m.homeTeamId === myTeam?.id || m.awayTeamId === myTeam?.id);
    if (pending.length === 0) {
      await this.respond(interaction, 'Nu ai niciun meci de raportat.');
      return;
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId(`tourney:result:pick:${t.id}`)
      .setPlaceholder('Alege meciul')
      .addOptions(
        pending.slice(0, 25).map((m) => ({
          label: `${m.homeTeam} vs ${m.awayTeam}`.slice(0, 100),
          description: m.stage === 'GROUP' ? `Grupa ${m.group}` : m.stage === 'KNOCKOUT' ? 'Eliminatorii' : m.round ? `Etapa ${m.round}` : undefined,
          value: m.id,
        })),
      );
    await interaction.reply({
      content: `⚽ Alege meciul pentru care raportezi scorul${pending.length > 25 ? ' (primele 25 de meciuri nejucate)' : ''}:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ----------------------------------------------------
  // Select menus
  // ----------------------------------------------------

  async handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const customId = interaction.customId;
    try {
      if (customId.startsWith('tourney:draft:spin_select:')) {
        const t = await this.tournamentService.getTournament(
          customId.slice('tourney:draft:spin_select:'.length),
          interaction.guildId!,
        );
        if (!(await this.canActOnDraft(interaction, t))) return;
        await interaction.deferUpdate();
        const res = await this.tournamentService.spinDraftWheel(t.id, interaction.values[0], interaction.guildId!);
        await interaction.editReply({ content: `🎰 Roata s-a învârtit pentru **${res.position}**.`, components: [] });
        await interaction.followUp({
          content:
            `🎰 **${res.team.name}** a învârtit roata pentru **${res.position}**: **${res.candidate.displayName}** (\`${res.candidate.gamertag}\`)` +
            (res.wildcard ? ` — nimeni nu mai juca pe ${res.position}, așa că a fost ales din tot lotul.` : '') +
            `\nApasă **Confirm Pick** sau **Use Joker** pe panoul draftului.`,
        });
      } else if (customId.startsWith('tourney:result:pick:')) {
        const t = await this.tournamentService.getTournament(
          customId.slice('tourney:result:pick:'.length),
          interaction.guildId!,
        );
        const match = this.tournamentService.matches(t).find((m) => m.id === interaction.values[0]);
        if (!match || match.completed) {
          await this.respond(interaction, 'Meciul a fost deja raportat.');
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`tourney:modal:result:${t.id}:${match.id}`)
          .setTitle('Scor final'.slice(0, 45));
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('home_score')
              .setLabel(`Goluri ${match.homeTeam}`.slice(0, 45))
              .setStyle(TextInputStyle.Short)
              .setMaxLength(2)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('away_score')
              .setLabel(`Goluri ${match.awayTeam}`.slice(0, 45))
              .setStyle(TextInputStyle.Short)
              .setMaxLength(2)
              .setRequired(true),
          ),
        );
        if (match.stage === 'KNOCKOUT') {
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('penalties')
                .setLabel('Penalty-uri, doar la egalitate (ex: 4-3)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(5)
                .setRequired(false),
            ),
          );
        }
        await interaction.showModal(modal);
      }
    } catch (err: any) {
      await this.fail(interaction, err);
    }
  }

  // ----------------------------------------------------
  // Modals
  // ----------------------------------------------------

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const customId = interaction.customId;
    try {
      if (customId === 'tourney:modal:create') {
        if (!(await this.requireAdmin(interaction))) return;
        await interaction.deferReply();
        const typeRaw = interaction.fields.getTextInputValue('tournament_type').trim().toLowerCase();
        const embed = await this.createAndProvision(interaction, {
          name: interaction.fields.getTextInputValue('tournament_name').trim(),
          type: typeRaw.startsWith('d') ? 'DRAFT' : 'STANDARD',
          formation: interaction.fields.getTextInputValue('formation')?.trim() || '3-5-2',
        });
        await interaction.editReply({ embeds: [embed] });
      } else if (customId === 'tourney:modal:notify') {
        if (!(await this.requireAdmin(interaction))) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const t = await this.activeTournament(interaction);
        if (!t) return;
        await this.tournamentService.broadcastNotification(
          t.id,
          interaction.fields.getTextInputValue('notify_title').trim(),
          interaction.fields.getTextInputValue('notify_message').trim(),
          interaction.user.username,
        );
        await interaction.editReply('📢 Anunțul a fost publicat.');
      } else if (customId.startsWith('tourney:modal:draft_spin:')) {
        // Panels posted before the position menu existed still open this modal.
        const t = await this.tournamentService.getTournament(
          customId.slice('tourney:modal:draft_spin:'.length),
          interaction.guildId!,
        );
        if (!(await this.canActOnDraft(interaction, t))) return;
        await interaction.deferReply();
        const position = interaction.fields.getTextInputValue('draft_position').trim().toUpperCase();
        const res = await this.tournamentService.spinDraftWheel(t.id, position, interaction.guildId!);
        await interaction.editReply(
          `🎰 **${res.team.name}** a învârtit roata pentru **${res.position}**: **${res.candidate.displayName}** (\`${res.candidate.gamertag}\`).`,
        );
      } else if (customId.startsWith('tourney:modal:signup:')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tournamentId = customId.slice('tourney:modal:signup:'.length);
        const tournament = await this.tournamentService.getTournament(tournamentId, interaction.guildId!);
        const isDraft = tournament.type === 'DRAFT';
        const field = (id: string) => {
          try {
            return interaction.fields.getTextInputValue(id)?.trim() || undefined;
          } catch {
            return undefined;
          }
        };
        const gamertag = field('gamertag') || '';
        const teamName = field('team_name');
        const pos1 = isDraft ? field('pos1')?.toUpperCase() : undefined;
        await this.tournamentService.addSignup(
          tournamentId,
          {
            userId: interaction.user.id,
            displayName: (interaction.member as any)?.displayName || interaction.user.globalName || interaction.user.username,
            gamertag,
            teamName,
            pos1,
            pos2: isDraft ? field('pos2')?.toUpperCase() : undefined,
            notes: field('notes'),
          },
          { guildId: interaction.guildId! },
        );
        await interaction.editReply(
          isDraft
            ? teamName
              ? `✅ Te-ai înscris ca **manager** al echipei **${teamName}** (\`${gamertag}\`, ${pos1}).`
              : `✅ Te-ai înscris în draft cu gamertag-ul **${gamertag}** (${pos1}).`
            : `✅ Echipa **${teamName}** (Căpitan: \`${gamertag}\`) a fost înscrisă cu succes!`,
        );
      } else if (customId.startsWith('tourney:modal:result:')) {
        const [tournamentId, matchId] = customId.slice('tourney:modal:result:'.length).split(':');
        const t = await this.tournamentService.getTournament(tournamentId, interaction.guildId!);
        const isAdmin = await this.isTournamentAdmin(interaction);
        const myTeam = teamForUser(this.tournamentService.teams(t), interaction.user.id);
        const match = matchId ? this.tournamentService.matches(t).find((m) => m.id === matchId) : undefined;
        const involved = match && myTeam && (match.homeTeamId === myTeam.id || match.awayTeamId === myTeam.id);
        if (!isAdmin && !involved) {
          await this.respond(interaction, '⛔ Doar managerii celor două echipe sau un admin pot raporta acest scor.');
          return;
        }
        if (match?.completed && !isAdmin) {
          await this.respond(interaction, 'Meciul a fost deja raportat. Cere unui admin să corecteze scorul.');
          return;
        }
        await interaction.deferReply();
        const parseScore = (id: string) => Number(interaction.fields.getTextInputValue(id).trim());
        let pens: { homePens?: number; awayPens?: number } = {};
        try {
          const raw = interaction.fields.getTextInputValue('penalties')?.trim();
          const parts = raw?.match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
          if (parts) pens = { homePens: Number(parts[1]), awayPens: Number(parts[2]) };
        } catch {
          // no penalties field on group matches
        }
        const res = await this.tournamentService.recordMatchResult(
          t.id,
          matchId
            ? {
                matchId,
                homeScore: parseScore('home_score'),
                awayScore: parseScore('away_score'),
                ...pens,
                reportedBy: interaction.user.id,
              }
            : {
                homeTeam: interaction.fields.getTextInputValue('home_team').trim(),
                awayTeam: interaction.fields.getTextInputValue('away_team').trim(),
                homeScore: parseScore('home_score'),
                awayScore: parseScore('away_score'),
                reportedBy: interaction.user.id,
              },
          interaction.guildId!,
        );
        const pensText =
          res.match.homePens !== undefined ? ` (${res.match.homePens}-${res.match.awayPens} la penalty-uri)` : '';
        await interaction.editReply(
          `⚽ **Rezultat**: **${res.match.homeTeam}** ${res.match.homeScore} - ${res.match.awayScore} **${res.match.awayTeam}**${pensText} (raportat de <@${interaction.user.id}>)` +
            (res.newStage.length ? `\n\n⚔️ Următoarea fază a fost stabilită: ${res.newStage.length} meciuri noi.` : '') +
            (res.completed ? '\n\n🏁 Turneul s-a încheiat!' : ''),
        );
      }
    } catch (err: any) {
      await this.fail(interaction, err);
    }
  }
}
