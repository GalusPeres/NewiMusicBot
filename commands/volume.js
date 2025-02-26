// commands/volume.js
// Command to set the playback volume (0-100, default is 50)

import logger from "../utils/logger.js";

export default {
  name: "volume",
  aliases: ["vol"],
  description: "Sets the playback volume (0-100, default: 50).",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No music is currently playing.");
    }
    logger.debug(`[volume] Guild="${message.guild.id}" - Current volume: ${player.volume}`);
    // Parse the volume from the command argument or use default of 50
    const volume = args[0] ? parseInt(args[0]) : 50;
    if (isNaN(volume) || volume < 0 || volume > 100) {
      return message.reply("Please specify a valid volume between 0 and 100.");
    }
    await player.setVolume(volume, false);
    logger.debug(`[volume] Guild="${message.guild.id}" - New volume: ${volume}`);
    message.channel.send(`Volume set to ${volume}%.`);
  }
};
