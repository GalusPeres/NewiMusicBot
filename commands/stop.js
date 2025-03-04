// commands/stop.js
// Stops playback and clears the queue (requires confirmation).

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { performStop } from "../utils/playerControls.js";
import logger from "../utils/logger.js";

export default {
  name: "stop",
  description: "Stops playback and clears the queue (requires confirmation).",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No music is currently playing.");
    }
    
    // Create confirmation buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("stopConfirm")
        .setLabel("Confirm Stop")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("stopCancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Send confirmation message
    const confirmationMessage = await message.reply({
      content: "Are you sure you want to stop playback and clear the queue?",
      components: [row]
    });
    
    // Create a collector for button interactions, filtering for the command author, with a total timeout of 10 seconds
    const filter = (i) => i.user.id === message.author.id;
    const collector = confirmationMessage.createMessageComponentCollector({ filter, time: 10000 });
    
    collector.on("collect", async (interaction) => {
      if (interaction.customId === "stopConfirm") {
        await performStop(player);
        await interaction.update({ content: "Playback stopped.", components: [] });
        logger.debug(`[stop] Playback stopped in Guild="${message.guild.id}"`);
      } else if (interaction.customId === "stopCancel") {
        await interaction.update({ content: "Stop cancelled.", components: [] });
      }
      collector.stop();
    });
    
    collector.on("end", () => {
      // Delete the confirmation message immediately after the collector ends
      confirmationMessage.delete().catch(() => {});
    });
  }
};
