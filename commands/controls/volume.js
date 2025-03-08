// commands/volume.js
// Command to set the playback volume (0-100, default: 50).
// If no argument is provided, it shows the current volume and instructions.

import logger from "../../utils/logger.js";

export default {
  name: "volume",
  aliases: ["vol"],
  description: "Sets the playback volume (0-100, default: 50). If no value is given, shows the current volume.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No music is currently playing.");
    }
    logger.debug(`[volume] Guild="${message.guild.id}" - Current volume: ${player.volume}`);
    
    const prefix = client.config.prefix; // Dynamisch ermitteln
    
    // If no argument is provided, show current volume and instructions
    if (!args[0]) {
      return message.channel.send(
        `Current volume is **${player.volume}%**.\nUsage: \`${prefix}volume <number>\` (0-100)`
      );
    }

    // Parse the volume from the command argument
    const volume = parseInt(args[0], 10);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      return message.reply("Please specify a valid volume between 0 and 100.");
    }
    
    await player.setVolume(volume, false);
    logger.debug(`[volume] Guild="${message.guild.id}" - New volume: ${volume}`);
    message.channel.send(`Volume set to **${volume}%**.`);
  }
};
