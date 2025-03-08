// commands/clear.js
// Clears the queue and history while keeping the current track playing (requires confirmation).

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../../utils/logger.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";

export default {
  name: "clear",
  description: "Clears the queue and history, leaving the current track playing (requires confirmation).",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("No track is currently playing.");
    }

    // Check if there's anything to clear (queue and history)
    if (player.queue.tracks.length === 0 && player.queue.previous.length === 0) {
      return message.reply("There is no queue or history to clear.");
    }
    
    // Create confirmation buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("clearConfirm")
        .setLabel("Confirm Clear")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("clearCancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Send the confirmation message
    const confirmationMessage = await message.reply({
      content: "Are you sure you want to clear the queue and history? (This will leave the current track playing.)",
      components: [row]
    });
    
    // Create a collector for button interactions from the command author, with a total timeout of 10 seconds
    const filter = (i) => i.user.id === message.author.id;
    const collector = confirmationMessage.createMessageComponentCollector({ filter, time: 10000 });
    
    collector.on("collect", async (interaction) => {
      if (interaction.customId === "clearConfirm") {
        // Clear upcoming tracks and history while keeping the current track
        player.queue.tracks = [];
        player.queue.previous = [];
        await sendOrUpdateNowPlayingUI(player, message.channel);
        await interaction.update({ content: "Queue cleared.", components: [] });
        logger.debug(`[clear] Cleared queue and history in Guild="${message.guild.id}"`);
      } else if (interaction.customId === "clearCancel") {
        await interaction.update({ content: "Clear cancelled.", components: [] });
      }
      collector.stop();
    });
    
    collector.on("end", async () => {
      // Immediately delete the confirmation message once the collector ends
      await confirmationMessage.delete().catch(() => {});
    });
  }
};
