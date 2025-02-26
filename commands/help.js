// commands/help.js
// Command to display a help message with a list of available commands

import { EmbedBuilder } from "discord.js";
import logger from "../utils/logger.js";

export default {
  name: "help",
  description: "Displays a list of available commands.",
  async execute(client, message, args) {
    const prefix = client.config.prefix;
    
    // Create a new embed for the help message
    const embed = new EmbedBuilder()
      .setTitle("Help")
      .setColor("Blue");

    let helpText = "Available commands:\n\n";
    
    // Loop through each command in the collection and format its display
    client.commands.forEach(cmd => {
      const commandLine = (cmd.aliases && cmd.aliases.length)
        ? `\`${prefix}${cmd.name}\` / ${cmd.aliases.map(a => `\`${prefix}${a}\``).join(" / ")}`
        : `\`${prefix}${cmd.name}\``;
      helpText += `${commandLine}\n${cmd.description}\n\n`;
    });

    embed.setDescription(helpText);
    
    // Send the embed to the channel
    message.channel.send({ embeds: [embed] });
    logger.debug(`[help] Help command executed by ${message.author.tag}`);
  }
};
