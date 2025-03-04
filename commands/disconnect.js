// commands/disconnect.js
// Command to disconnect the bot from the voice channel (requires confirmation).
// This command will also stop playback and clear the queue.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { performStop } from "../utils/playerControls.js";
import logger from "../utils/logger.js";

export default {
  name: "disconnect",
  aliases: ["discon"],
  description: "Disconnects from the voice channel (requires confirmation). This will stop playback and clear the queue.",
  async execute(client, message, args) {
    // Get the player instance for this guild
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No active player in this server.");
    }
    
    // Create confirmation buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("disconnectConfirm")
        .setLabel("Confirm Disconnect")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("disconnectCancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Send confirmation message with a warning that playback will be stopped and the queue cleared
    const confirmationMessage = await message.reply({
      content: "Are you sure you want to disconnect from the voice channel? This will stop playback and clear the queue.",
      components: [row]
    });
    
    // Create a collector for button interactions from the command author, with a 10-second timeout
    const filter = (i) => i.user.id === message.author.id;
    const collector = confirmationMessage.createMessageComponentCollector({ filter, time: 10000 });
    
    collector.on("collect", async (interaction) => {
      if (interaction.customId === "disconnectConfirm") {
        try {
          // Stop playback, clear queue, and disconnect the player
          await performStop(player);
          await player.disconnect(false);
          await interaction.update({
            content: "Disconnected from the voice channel. Playback stopped and queue cleared.",
            components: []
          });
          logger.debug(`[disconnect] Disconnected from Guild="${message.guild.id}"`);
        } catch (error) {
          logger.error("[disconnect] Error disconnecting:", error);
          await interaction.update({ content: "Failed to disconnect from the voice channel.", components: [] });
        }
      } else if (interaction.customId === "disconnectCancel") {
        await interaction.update({ content: "Disconnect cancelled.", components: [] });
      }
      collector.stop();
    });
    
    collector.on("end", async () => {
      // Delete the confirmation message immediately after the collector ends
      await confirmationMessage.delete().catch(() => {});
    });
  }
};
