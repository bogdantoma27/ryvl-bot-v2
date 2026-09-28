import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import { TournamentService } from '../../tournaments/tournament.service';

@Injectable()
export class TournamentCommands {
  private readonly logger = new Logger(TournamentCommands.name);

  constructor(
    @Inject(forwardRef(() => TournamentService))
    private readonly tournamentService: TournamentService,
  ) {}

  async handleTournament(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be run inside a Discord server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'setup-admin') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        await this.tournamentService.postAdminPanel(guildId, interaction.channelId);
        await this.tournamentService.updateConfig(guildId, { adminChannelId: interaction.channelId });
        await interaction.editReply('✅ Tournament Admin Control Panel has been initialized in this channel!');
      } catch (err: any) {
        this.logger.error(`Error posting admin panel: ${err?.message || err}`);
        await interaction.editReply(`❌ Error posting admin panel: ${err?.message || err}`);
      }
    } else if (subcommand === 'create') {
      await interaction.deferReply();
      const name = interaction.options.getString('name', true);
      const formation = interaction.options.getString('formation') || '3-4-1-2';

      try {
        const tournament = await this.tournamentService.createTournament(guildId, { name, formation });
        const setup = await this.tournamentService.setupTournamentChannels(guildId, tournament.id);
        await interaction.editReply(
          `🏆 **Tournament "${name}" Created Successfully!**\n\n` +
          `• Category: <#${setup.categoryId}>\n` +
          `• Signups Channel: <#${setup.channels.signup}>\n` +
          `• Chat: <#${setup.channels.chat}>\n` +
          `• Results: <#${setup.channels.results}>\n` +
          `• Standings: <#${setup.channels.standings}>\n` +
          `• Rosters: <#${setup.channels.rosters}>`,
        );
      } catch (err: any) {
        this.logger.error(`Error creating tournament: ${err?.message || err}`);
        await interaction.editReply(`❌ Failed to create tournament: ${err?.message || err}`);
      }
    } else if (subcommand === 'status') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const tournaments = await this.tournamentService.listTournaments(guildId);
        const active = tournaments[0];
        if (!active) {
          await interaction.editReply('No active tournaments found in this server.');
          return;
        }

        const signups: any[] = (active.signupsData as any) || [];
        const embed = new EmbedBuilder()
          .setTitle(`📋 Signup Status — ${active.name}`)
          .setColor(0x00d26a)
          .setDescription(
            `Total Registrations: **${signups.length}** / 66 spots\n` +
            `Status: **${active.status}**\n\n` +
            (signups.length > 0
              ? signups.map((s, i) => `${i + 1}. <@${s.userId}> • \`${s.gamertag}\` (${s.pos1})`).join('\n')
              : 'No signups yet.'),
          );

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply(`❌ Error fetching status: ${err?.message || err}`);
      }
    } else if (subcommand === 'generate-standings') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const tournaments = await this.tournamentService.listTournaments(guildId);
        const active = tournaments[0];
        const config = await this.tournamentService.getOrCreateConfig(guildId);
        if (!active || !config.standingsChannelId) {
          await interaction.editReply('No active tournament or standings channel configured.');
          return;
        }
        await this.tournamentService.postStandingsAndRosters(config.standingsChannelId, config.rostersChannelId || config.standingsChannelId, active);
        await interaction.editReply('✅ Standings graphic generated and posted to standings channel!');
      } catch (err: any) {
        await interaction.editReply(`❌ Error: ${err?.message || err}`);
      }
    }
  }

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    if (customId === 'tourney:admin:create') {
      const modal = new ModalBuilder()
        .setCustomId('tourney:modal:create')
        .setTitle('Create Tournament');

      const nameInput = new TextInputBuilder()
        .setCustomId('tournament_name')
        .setLabel('Tournament Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Cupa Primăverii 2026')
        .setRequired(true);

      const formationInput = new TextInputBuilder()
        .setCustomId('formation')
        .setLabel('Formation')
        .setStyle(TextInputStyle.Short)
        .setValue('3-4-1-2')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(formationInput),
      );

      await interaction.showModal(modal);
    } else if (customId === 'tourney:admin:status') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const tournaments = await this.tournamentService.listTournaments(interaction.guildId!);
      const active = tournaments[0];
      if (!active) {
        await interaction.editReply('No tournaments found.');
        return;
      }
      const signups: any[] = (active.signupsData as any) || [];
      await interaction.editReply(`📋 **${active.name}**: ${signups.length} signed up.`);
    } else if (customId.startsWith('tourney:signup:')) {
      const tournamentId = customId.replace('tourney:signup:', '');
      const modal = new ModalBuilder()
        .setCustomId(`tourney:modal:signup:${tournamentId}`)
        .setTitle('Înscriere Turneu');

      const gamertagInput = new TextInputBuilder()
        .setCustomId('gamertag')
        .setLabel('Gamertag (PSN/Xbox/PC ID)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Numele exact din joc')
        .setRequired(true);

      const pos1Input = new TextInputBuilder()
        .setCustomId('pos1')
        .setLabel('Poziție Principală (ex: ST, CAM, CB, GK)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const pos2Input = new TextInputBuilder()
        .setCustomId('pos2')
        .setLabel('Poziție Secundară (opțional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(gamertagInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(pos1Input),
        new ActionRowBuilder<TextInputBuilder>().addComponents(pos2Input),
      );

      await interaction.showModal(modal);
    } else if (customId.startsWith('tourney:pullout:')) {
      const tournamentId = customId.replace('tourney:pullout:', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.tournamentService.removeSignup(tournamentId, interaction.user.id);
      await interaction.editReply('✅ Te-ai retras cu succes din turneu.');
    } else if (customId.startsWith('tourney:result:enter:')) {
      const tournamentId = customId.replace('tourney:result:enter:', '');
      const modal = new ModalBuilder()
        .setCustomId(`tourney:modal:result:${tournamentId}`)
        .setTitle('Introduce Scor Meci');

      const homeInput = new TextInputBuilder()
        .setCustomId('home_team')
        .setLabel('Echipa Gazdă (ex: FC 27 Draft RO 1)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const homeScoreInput = new TextInputBuilder()
        .setCustomId('home_score')
        .setLabel('Scor Gazdă')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const awayInput = new TextInputBuilder()
        .setCustomId('away_team')
        .setLabel('Echipa Oaspete (ex: FC 27 Draft RO 2)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const awayScoreInput = new TextInputBuilder()
        .setCustomId('away_score')
        .setLabel('Scor Oaspete')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(homeInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(homeScoreInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(awayInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(awayScoreInput),
      );

      await interaction.showModal(modal);
    } else if (customId.startsWith('tourney:result:call_admin:')) {
      await interaction.reply({
        content: `🚨 <@${interaction.user.id}> a solicitat prezența unui administrator în <#${interaction.channelId}> pentru verificarea rezultatelor.`,
      });
    } else if (customId.startsWith('tourney:refresh_signup:') || customId.startsWith('tourney:result:refresh:')) {
      await interaction.reply({ content: '🔄 Date reîmprospătate!', flags: MessageFlags.Ephemeral });
    }
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const customId = interaction.customId;

    if (customId === 'tourney:modal:create') {
      await interaction.deferReply();
      const name = interaction.fields.getTextInputValue('tournament_name').trim();
      const formation = interaction.fields.getTextInputValue('formation')?.trim() || '3-4-1-2';

      const tournament = await this.tournamentService.createTournament(interaction.guildId!, { name, formation });
      const setup = await this.tournamentService.setupTournamentChannels(interaction.guildId!, tournament.id);

      await interaction.editReply(`✅ Turneul **${name}** a fost inițializat în categoria <#${setup.categoryId}>!`);
    } else if (customId.startsWith('tourney:modal:signup:')) {
      const tournamentId = customId.replace('tourney:modal:signup:', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const gamertag = interaction.fields.getTextInputValue('gamertag').trim();
      const pos1 = interaction.fields.getTextInputValue('pos1').trim().toUpperCase();
      const pos2 = interaction.fields.getTextInputValue('pos2')?.trim()?.toUpperCase() || undefined;

      await this.tournamentService.addSignup(tournamentId, {
        userId: interaction.user.id,
        displayName: interaction.user.username,
        gamertag,
        pos1,
        pos2,
      });

      await interaction.editReply(`✅ Te-ai înscris cu succes cu gamertag-ul **${gamertag}** (${pos1})!`);
    } else if (customId.startsWith('tourney:modal:result:')) {
      const tournamentId = customId.replace('tourney:modal:result:', '');
      await interaction.deferReply();

      const homeTeam = interaction.fields.getTextInputValue('home_team').trim();
      const awayTeam = interaction.fields.getTextInputValue('away_team').trim();
      const homeScore = parseInt(interaction.fields.getTextInputValue('home_score').trim(), 10) || 0;
      const awayScore = parseInt(interaction.fields.getTextInputValue('away_score').trim(), 10) || 0;

      await this.tournamentService.recordMatchResult(tournamentId, {
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
      });

      await interaction.editReply(
        `⚽ **Rezultat Înregistrat**: **${homeTeam}** ${homeScore} - ${awayScore} **${awayTeam}** (înregistrat de <@${interaction.user.id}>)`,
      );
    }
  }
}
