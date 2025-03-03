// commands/setconfig.js
// Command to change configuration settings.
// Usage:
// • .setconfig               → Shows an overview of all configurable settings.
// • .setconfig provider      → Change search platform interactively.
// • .setconfig prefix <newprefix>
// • .setconfig defaultvolume <newdefaultvolume>

import fs from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import logger from "../utils/logger.js";

export default {
  name: "setconfig",
  description:
    "Change configuration: Use subcommands to update provider, prefix or default volume.",
  async execute(client, message, args) {
    // Check if the user has administrator permissions
    if (!message.member.permissions.has("ADMINISTRATOR")) {
      return message.reply("Administrator permissions are required to change configuration.");
    }

    // Determine the path to the configuration file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const configPath = join(__dirname, "..", "config", "config.json");

    // Load current configuration from file
    let config;
    try {
      const data = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(data);
    } catch (err) {
      logger.error("Failed to load configuration:", err);
      return message.reply("Failed to load configuration.");
    }

    // Erstelle die Map für die Provider-Anzeige
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

    // Wenn keine Subcommand-Parameter angegeben wurden, zeige eine übersichtliche Seite
    if (!args[0]) {
      const currentProvider = config.defaultSearchPlatform || "ytsearch";
      const providerDisplay = searchDisplayMap[currentProvider] || { name: currentProvider, emoji: "" };

      const overviewEmbed = new EmbedBuilder()
        .setTitle("Configuration Overview")
        .setColor("Blue")
        .addFields(
          {
            name: "Search Provider",
            value: `**Current:** ${providerDisplay.emoji} ${providerDisplay.name}\n` +
                   `*Change with:* \`.setconfig provider\``
          },
          {
            name: "Command Prefix",
            value: `**Current:** \`${config.prefix}\`\n` +
                   `*Change with:* \`.setconfig prefix <newprefix>\``
          },
          {
            name: "Default Volume",
            value: `**Current:** \`${config.defaultVolume || 50}%\`\n` +
                   `*Change with:* \`.setconfig defaultvolume <newdefaultvolume>\``
          }
        )
        .setFooter({ text: "Use the above commands to change the respective setting." });
      return message.channel.send({ embeds: [overviewEmbed] });
    }

    // Handle subcommands: prefix, defaultvolume, provider
    const subCommand = args[0].toLowerCase();
    if (subCommand === "prefix") {
      if (!args[1]) {
        return message.reply(`Current prefix is \`${config.prefix}\`. Usage: \`.setconfig prefix <newprefix>\``);
      }
      const newPrefix = args[1];
      config.prefix = newPrefix;
      try {
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        client.config = config;
        global.config = config;
        const embed = new EmbedBuilder()
          .setTitle("Configuration Updated")
          .setDescription(`Prefix updated to **${newPrefix}**.`)
          .setColor("Green");
        return message.channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error("[setconfig] Error updating prefix:", err);
        return message.reply("Failed to update prefix.");
      }
    } else if (subCommand === "defaultvolume") {
      if (!args[1]) {
        return message.reply(
          `Current default volume is **${config.defaultVolume || 50}%**. Usage: \`.setconfig defaultvolume <newdefaultvolume>\``
        );
      }
      const newVolume = parseInt(args[1], 10);
      if (isNaN(newVolume) || newVolume < 0 || newVolume > 100) {
        return message.reply("Please specify a valid default volume between 0 and 100.");
      }
      config.defaultVolume = newVolume;
      try {
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        client.config = config;
        global.config = config;
        const embed = new EmbedBuilder()
          .setTitle("Configuration Updated")
          .setDescription(`Default volume updated to **${newVolume}%**.`)
          .setColor("Green");
        return message.channel.send({ embeds: [embed] });
      } catch (err) {
        logger.error("[setconfig] Error updating default volume:", err);
        return message.reply("Failed to update default volume.");
      }
    } else if (subCommand === "provider") {
      // --- Interactive mode for changing the search provider ---
      const currentValue = config.defaultSearchPlatform || "ytsearch";
      const currentDisplay = searchDisplayMap[currentValue] || { name: currentValue, emoji: "" };

      const initialEmbed = new EmbedBuilder()
        .setTitle("Change Search Provider")
        .setDescription(
          `**Current Provider:** ${currentDisplay.emoji} ${currentDisplay.name}\n\n` +
          "Select a new search platform:"
        )
        .setColor("Blue");

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

      const msg = await message.channel.send({
        embeds: [initialEmbed],
        components: [row]
      });

      const collector = msg.createMessageComponentCollector({ time: 30000 });
      collector.on("collect", async (interaction) => {
        if (!interaction.isButton()) return;
        await interaction.deferUpdate();

        const data = await fs.readFile(configPath, "utf-8");
        const newConfig = JSON.parse(data);

        if (interaction.customId === "setconfigYT") {
          newConfig.defaultSearchPlatform = "ytsearch";
        } else if (interaction.customId === "setconfigYTM") {
          newConfig.defaultSearchPlatform = "ytmsearch";
        } else {
          return;
        }

        try {
          await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
          client.config = newConfig;
          global.config = config;
          const newVal = newConfig.defaultSearchPlatform;
          const newDisplay = searchDisplayMap[newVal] || { name: newVal, emoji: "" };

          const updatedEmbed = new EmbedBuilder()
            .setTitle("Configuration Updated")
            .setDescription(`Search provider updated to ${newDisplay.emoji} **${newDisplay.name}**.`)
            .setColor("Green");

          await msg.edit({
            embeds: [updatedEmbed],
            components: []
          });
          collector.stop();
          logger.debug(`[setconfig] Updated search provider to ${newVal} in Guild="${message.guild.id}"`);
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
    } else {
      return message.reply("Unknown subcommand. Available options: provider, prefix, defaultvolume.");
    }
  }
};
