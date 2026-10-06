import { Interaction, MessageFlags } from 'discord.js';

export const INTERACTION_FAILURE_MESSAGE =
  'Something went wrong while handling this. Please try again in a moment.';

/**
 * Last-resort answer for an interaction whose handler threw. Without it Discord shows
 * "The application did not respond", or a deferred reply stays on "is thinking..."
 * forever. Never throws: the interaction may already have expired.
 */
export async function answerFailedInteraction(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      if (!interaction.responded) await interaction.respond([]);
      return;
    }
    if (!interaction.isRepliable()) return;
    if (interaction.deferred || interaction.replied) {
      // After deferReply the first follow-up replaces the "is thinking..." message;
      // after deferUpdate (buttons) it is a new ephemeral message, so the card the
      // button belongs to is never overwritten.
      await interaction.followUp({ content: INTERACTION_FAILURE_MESSAGE, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: INTERACTION_FAILURE_MESSAGE, flags: MessageFlags.Ephemeral });
    }
  } catch {
    // Expired or already-answered interaction: nothing more can be shown.
  }
}
