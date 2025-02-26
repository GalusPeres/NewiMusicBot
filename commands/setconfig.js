// commands/setconfig.js
// Command to change the default search platform using buttons (YouTube or YouTube Music)

import fs from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

export default {
  name: "setconfig",
  description: "Change default search platform via buttons (YouTube or YouTube Music).",
  async execute(client, message, args) {
    // Check if the user has administrator permissions
    if (!message.member.permissions.has("ADMINISTRATOR")) {
      return message.reply("Administrator permissions are required to change configuration.");
    }
    // Determine the path to the configuration file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const configPath = join(__dirname, "..", "config", "config.json");

    // Map internal search modes to display names and emojis
    const searchDisplayMap = {
      "ytsearch": {
        name: "YouTube",
        emoji: "<:yt:1343597758791024660>"
      },
      "ytmsearch": {
        name: "Music",
        emoji: "<:ytm:1343595756740673586>"
      }
    };

    // Get the current default search platform from the client config
    const currentValue = client.config.defaultSearchPlatform || "ytsearch";
    const currentDisplay = searchDisplayMap[currentValue] || { name: currentValue, emoji: "" };

    // Create buttons for selecting the search platform
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setconfigYT")
        .setEmoji({ name: "yt", id: "1343597758791024660" })
        .setLabel("YouTube")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("setconfigYTM")
        .setEmoji({ name: "ytm", id: "1343595756740673586" })
        .setLabel("Music")
        .setStyle(ButtonStyle.Secondary)
    );

    // Build the initial embed showing the current configuration
    const initialEmbed = new EmbedBuilder()
      .setTitle("Configuration")
      .setDescription(`**Current default search platform:** ${currentDisplay.emoji} ${currentDisplay.name}\n\nSelect a new search platform:`)
      .setColor("Blue");

    // Send the message with the embed and buttons
    const msg = await message.channel.send({
      embeds: [initialEmbed],
      components: [row]
    });

    // Create a collector for button interactions (timeout after 30 seconds)
    const collector = msg.createMessageComponentCollector({ time: 30000 });
    collector.on("collect", async (interaction) => {
      if (!interaction.isButton()) return;
      await interaction.deferUpdate();

      // Read the current configuration from file
      const data = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(data);

      // Update the default search platform based on the button pressed
      if (interaction.customId === "setconfigYT") {
        config.defaultSearchPlatform = "ytsearch";
      } else if (interaction.customId === "setconfigYTM") {
        config.defaultSearchPlatform = "ytmsearch";
      } else {
        return;
      }

      try {
        // Write the updated configuration back to the file
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        // Update the client configuration
        client.config = config;

        const newVal = config.defaultSearchPlatform;
        const newDisplay = searchDisplayMap[newVal] || { name: newVal, emoji: "" };

        // Build an embed to show the successful update
        const updatedEmbed = new EmbedBuilder()
          .setTitle("Configuration Updated")
          .setDescription(`Default search platform updated to ${newDisplay.emoji} **${newDisplay.name}**.`)
          .setColor("Green");

        await msg.edit({
          embeds: [updatedEmbed],
          components: []
        });
        collector.stop();
        logger.debug(`[setconfig] Updated default search platform to ${newVal} in Guild="${message.guild.id}"`);
      } catch (err) {
        logger.error("[setconfig] Error updating configuration:", err);
        const errorEmbed = new EmbedBuilder()
          .setTitle("Error")
          .setDescription("Failed to update configuration.")
          .setColor("Red");
        await msg.edit({ embeds: [errorEmbed], components: [] });
        collector.stop();
      }
    });

    // When the collector ends (e.g., due to timeout), update the embed to show timeout
    collector.on("end", (collected, reason) => {
      if (reason === "time") {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("Configuration")
          .setDescription("No selection made (timed out).")
          .setColor("Grey");
        msg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
        logger.debug(`[setconfig] Collector timed out in Guild="${message.guild.id}"`);
      }
    });
  }
};
