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

  async handleCreateTournament(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'This command can only be run inside a Discord server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();
    const name = interaction.options.getString('name', true);
    const type = (interaction.options.getString('type') || 'standard').toUpperCase();
    const formation = interaction.options.getString('formation') || '3-5-2';
    const maxTeams = interaction.options.getInteger('max_teams') || 6;

    try {
      const tournament = await this.tournamentService.createTournament(guildId, {
        name,
        type,
        formation,
        numTeams: maxTeams,
      });
      const setup = await this.tournamentService.setupTournamentChannels(guildId, tournament.id);

      let channelsDesc =
        `• **Category**: <#${setup.categoryId}>\n` +
        `• **Rules & Info**: <#${setup.channels.info}>\n` +
        `• **Announcements**: <#${setup.channels.announcements}>\n` +
        `• **Registration Portal**: <#${setup.channels.registration}>\n` +
        `• **Fixtures & Results**: <#${setup.channels.fixtures}>\n` +
        `• **Standings Table**: <#${setup.channels.standings}>\n` +
        `• **Chat Channel**: <#${setup.channels.chat}>`;

      if (setup.channels.draft) {
        channelsDesc += `\n• **Draft Wheel**: <#${setup.channels.draft}>`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Tournament Created: ${name}`)
        .setColor(0x00d26a)
        .setDescription(
          `**Type**: \`${type}\` • **Formation**: \`${formation}\` • **Teams**: \`${maxTeams}\`\n\n` +
          `**Provisioned Channel Suite**:\n${channelsDesc}\n\n` +
          `Participants and managers can now interact directly via buttons in the channels above.`,
        )
        .setFooter({ text: 'RYVL Esports Bot • Tournament Engine' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      this.logger.error(`Error creating tournament: ${err?.message || err}`);
      await interaction.editReply(`❌ Failed to create tournament: ${err?.message || err}`);
    }
  }

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
      const formation = interaction.options.getString('formation') || '3-5-2';

      try {
        const tournament = await this.tournamentService.createTournament(guildId, {
          name,
          type: 'DRAFT',
          formation,
        });
        const setup = await this.tournamentService.setupTournamentChannels(guildId, tournament.id);
        await interaction.editReply(
          `🏆 **Draft Tournament "${name}" Created Successfully!**\n\n` +
          `• Category: <#${setup.categoryId}>\n` +
          `• Info & Rules: <#${setup.channels.info}>\n` +
          `• Registration: <#${setup.channels.registration}>\n` +
          `• Draft Wheel: <#${setup.channels.draft || setup.channels.registration}>\n` +
          `• Fixtures & Results: <#${setup.channels.fixtures}>\n` +
          `• Standings: <#${setup.channels.standings}>\n` +
          `• Tournament Chat: <#${setup.channels.chat}>`,
        );
      } catch (err: any) {
        this.logger.error(`Error creating tournament: ${err?.message || err}`);
        await interaction.editReply(`❌ Failed to create tournament: ${err?.message || err}`);
      }
    } else if (subcommand === 'spin') {
      await interaction.deferReply();
      try {
        const tournaments = await this.tournamentService.listTournaments(guildId);
        const activeDraft = tournaments.find((t) => t.type === 'DRAFT' && t.status !== 'COMPLETED');
        if (!activeDraft) {
          await interaction.editReply('No active draft tournament found in this server.');
          return;
        }

        const draft: any = (activeDraft.draftState as any) || {};
        if (draft.complete) {
          await interaction.editReply('Draft is already complete!');
          return;
        }

        const teams: any[] = (activeDraft.teamsData as any) || [];
        const currentTeamIdx = draft.snakeOrder[draft.currentTurn] ?? 0;
        const currentTeam = teams[currentTeamIdx] || { name: `Team ${currentTeamIdx + 1}` };

        await interaction.editReply(
          `🎰 **Active Draft Turn**: **${currentTeam.name}**\n` +
          `Navigate to the <#${(activeDraft.discordChannels as any)?.draft || interaction.channelId}> channel and click **Spin Wheel** to select a position!`,
        );
      } catch (err: any) {
        await interaction.editReply(`❌ Error: ${err?.message || err}`);
      }
    } else if (subcommand === 'draft-status') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const tournaments = await this.tournamentService.listTournaments(guildId);
        const activeDraft = tournaments.find((t) => t.type === 'DRAFT');
        if (!activeDraft) {
          await interaction.editReply('No draft tournament found in this server.');
          return;
        }

        const draft: any = (activeDraft.draftState as any) || {};
        const teams: any[] = (activeDraft.teamsData as any) || [];
        const currentTeamIdx = draft.snakeOrder?.[draft.currentTurn] ?? 0;
        const currentTeam = teams[currentTeamIdx] || { name: `Team ${currentTeamIdx + 1}` };
        const roundNum = Math.min(10, Math.floor((draft.currentTurn || 0) / (teams.length || 6)) + 1);

        const embed = new EmbedBuilder()
          .setTitle(`🎡 Draft Status — ${activeDraft.name}`)
          .setColor(draft.complete ? 0x5865f2 : 0xf1c40f)
          .setDescription(
            `Status: **${draft.complete ? 'COMPLETE' : 'IN PROGRESS'}**\n` +
            `Round: **${roundNum} / 10** • Current Turn: **${currentTeam.name}**\n\n` +
            `**Total Picks Made**: ${draft.picks?.length || 0} / ${(teams.length || 6) * 10}\n\n` +
            teams
              .map(
                (t, idx) =>
                  `• **${t.name}**: ${t.picks?.length || 0}/10 picks (${draft.teamJokers?.[idx] ?? 4} Jokers left)`,
              )
              .join('\n'),
          )
          .setFooter({ text: 'RYVL Esports Bot • Draft Engine' });

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply(`❌ Error: ${err?.message || err}`);
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
        await this.tournamentService.postStandingsAndRosters(
          config.standingsChannelId,
          config.rostersChannelId || config.standingsChannelId,
          active,
        );
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
        .setLabel('Formation (3-5-2 or 3-1-4-2)')
        .setStyle(TextInputStyle.Short)
        .setValue('3-5-2')
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
    } else if (customId.startsWith('tourney:signup:') || customId.startsWith('tourney:register:')) {
      const tournamentId = customId.replace('tourney:signup:', '').replace('tourney:register:', '');
      const tournament = await this.tournamentService.getTournament(tournamentId);

      const modal = new ModalBuilder()
        .setCustomId(`tourney:modal:signup:${tournamentId}`)
        .setTitle(tournament.type === 'DRAFT' ? 'Înscriere Jucător Draft' : 'Înscriere Echipă Turneu');

      if (tournament.type === 'DRAFT') {
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
      } else {
        const teamNameInput = new TextInputBuilder()
          .setCustomId('team_name')
          .setLabel('Nume Echipă')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('ex: RYVL Esports')
          .setRequired(true);

        const gamertagInput = new TextInputBuilder()
          .setCustomId('gamertag')
          .setLabel('Gamertag Căpitan')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('ID PSN/Xbox/PC al căpitanului')
          .setRequired(true);

        const notesInput = new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Detalii / Discord Căpitan')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(teamNameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(gamertagInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput),
        );
      }

      await interaction.showModal(modal);
    } else if (customId.startsWith('tourney:pullout:') || customId.startsWith('tourney:unregister:')) {
      const tournamentId = customId.replace('tourney:pullout:', '').replace('tourney:unregister:', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const updated = await this.tournamentService.removeSignup(tournamentId, interaction.user.id);
      const channels = (updated.discordChannels as any) || {};
      if (channels.registration) {
        await this.tournamentService.postRegistrationEmbed(channels.registration, updated);
      }
      await interaction.editReply('✅ Te-ai retras cu succes din turneu.');
    } else if (customId.startsWith('tourney:view_roster:')) {
      const tournamentId = customId.replace('tourney:view_roster:', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const tournament = await this.tournamentService.getTournament(tournamentId);
        const signups: any[] = (tournament.signupsData as any) || [];
        const embed = new EmbedBuilder()
          .setTitle(`📋 Roster & Registrations — ${tournament.name}`)
          .setColor(0x5865f2)
          .setDescription(
            `Total Signups: **${signups.length}**\n\n` +
            (signups.length > 0
              ? signups.map((s, idx) => `${idx + 1}. **${s.displayName}** (\`${s.gamertag}\` - ${s.pos1})`).join('\n')
              : 'No players registered yet.'),
          );
        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply(`❌ Error: ${err?.message || err}`);
      }
    } else if (customId.startsWith('tourney:draft:spin_modal:')) {
      const tournamentId = customId.replace('tourney:draft:spin_modal:', '');
      const modal = new ModalBuilder()
        .setCustomId(`tourney:modal:draft_spin:${tournamentId}`)
        .setTitle('Spin Draft Wheel');

      const positionInput = new TextInputBuilder()
        .setCustomId('draft_position')
        .setLabel('Select Position to Spin')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. ST, CAM, LM, RM, CM, CDM, CB, GK')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(positionInput));
      await interaction.showModal(modal);
    } else if (customId.startsWith('tourney:draft:confirm:')) {
      const tournamentId = customId.replace('tourney:draft:confirm:', '');
      await interaction.deferReply();
      try {
        const result = await this.tournamentService.confirmDraftPick(tournamentId);
        if (interaction.channelId) {
          await this.tournamentService.postDraftWheelEmbed(interaction.channelId, result.tournament);
        }
        await interaction.editReply(
          `✅ **Pick Confirmed!** **${result.pick.displayName}** (\`${result.pick.gamertag}\`) joins **${result.pick.teamName}** as ${result.pick.position}!${result.complete ? '\n\n🎉 **The draft is complete!**' : ''}`,
        );
      } catch (err: any) {
        await interaction.editReply(`❌ Error confirming pick: ${err?.message || err}`);
      }
    } else if (customId.startsWith('tourney:draft:joker:')) {
      const tournamentId = customId.replace('tourney:draft:joker:', '');
      await interaction.deferReply();
      try {
        const result = await this.tournamentService.useDraftJoker(tournamentId);
        if (interaction.channelId) {
          await this.tournamentService.postDraftWheelEmbed(interaction.channelId, result.tournament);
        }
        await interaction.editReply(
          `🃏 **Joker Used!** New candidate: **${result.candidate?.displayName}** (\`${result.candidate?.gamertag}\`). Jokers left: **${result.jokersLeft}**.`,
        );
      } catch (err: any) {
        await interaction.editReply(`❌ Error using joker: ${err?.message || err}`);
      }
    } else if (customId.startsWith('tourney:draft:autodraft:')) {
      const tournamentId = customId.replace('tourney:draft:autodraft:', '');
      await interaction.deferReply();
      try {
        const updated = await this.tournamentService.autoDraftRemaining(tournamentId);
        if (interaction.channelId) {
          await this.tournamentService.postDraftWheelEmbed(interaction.channelId, updated);
        }
        await interaction.editReply(`⚡ **Auto-Draft Complete!** All remaining squad positions have been allocated.`);
      } catch (err: any) {
        await interaction.editReply(`❌ Error running auto-draft: ${err?.message || err}`);
      }
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
      const formation = interaction.fields.getTextInputValue('formation')?.trim() || '3-5-2';

      const tournament = await this.tournamentService.createTournament(interaction.guildId!, {
        name,
        type: 'DRAFT',
        formation,
      });
      const setup = await this.tournamentService.setupTournamentChannels(interaction.guildId!, tournament.id);

      await interaction.editReply(`✅ Turneul **${name}** a fost inițializat în categoria <#${setup.categoryId}>!`);
    } else if (customId.startsWith('tourney:modal:draft_spin:')) {
      const tournamentId = customId.replace('tourney:modal:draft_spin:', '');
      await interaction.deferReply();
      try {
        const position = interaction.fields.getTextInputValue('draft_position').trim().toUpperCase();
        const res = await this.tournamentService.spinDraftWheel(tournamentId, position);
        if (interaction.channelId) {
          await this.tournamentService.postDraftWheelEmbed(interaction.channelId, res.tournament);
        }
        await interaction.editReply(
          `🎰 **Roata a selectat**: **${res.candidate.displayName}** (\`${res.candidate.gamertag}\`) pentru poziția **${res.position}**!\n` +
          `Apasă **Confirm Pick** pentru a accepta sau **Use Joker** pentru a roti din nou.`,
        );
      } catch (err: any) {
        await interaction.editReply(`❌ Eroare la rotirea roții: ${err?.message || err}`);
      }
    } else if (customId.startsWith('tourney:modal:signup:')) {
      const tournamentId = customId.replace('tourney:modal:signup:', '');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const tournament = await this.tournamentService.getTournament(tournamentId);
        const isDraft = tournament.type === 'DRAFT';

        let teamName: string | undefined;
        let pos1 = 'ALL';
        let pos2: string | undefined;
        const gamertag = interaction.fields.getTextInputValue('gamertag').trim();

        if (isDraft) {
          pos1 = interaction.fields.getTextInputValue('pos1').trim().toUpperCase();
          pos2 = interaction.fields.getTextInputValue('pos2')?.trim()?.toUpperCase() || undefined;
        } else {
          try {
            teamName = interaction.fields.getTextInputValue('team_name').trim();
          } catch {
            // fallback
          }
        }

        const updated = await this.tournamentService.addSignup(tournamentId, {
          userId: interaction.user.id,
          displayName: interaction.user.username,
          gamertag,
          teamName,
          pos1,
          pos2,
        });

        const channels = (updated.discordChannels as any) || {};
        if (channels.registration) {
          await this.tournamentService.postRegistrationEmbed(channels.registration, updated);
        }

        const msg = isDraft
          ? `✅ Te-ai înscris cu succes cu gamertag-ul **${gamertag}** (${pos1})!`
          : `✅ Echipa **${teamName || 'Ta'}** (Căpitan: \`${gamertag}\`) a fost înscrisă cu succes în turneu!`;

        await interaction.editReply(msg);
      } catch (err: any) {
        await interaction.editReply(`❌ Eroare la înscriere: ${err?.message || err}`);
      }
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
