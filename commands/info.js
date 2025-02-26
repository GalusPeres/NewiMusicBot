// commands/info.js
// Command to force refresh the "Now Playing" UI message in the channel

import { sendOrUpdateNowPlayingUI } from "../utils/nowPlayingManager.js";
import logger from "../utils/logger.js";

export default {
  name: "info",
  aliases: ["ui"],
  description: "Forcibly refreshes the Now Playing UI in the channel.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("No track is currently playing.");
    }
    // Delete the old UI message if it exists
    if (player.nowPlayingMessage) {
      try {
        await player.nowPlayingMessage.delete();
      } catch (_) { }
      player.nowPlayingMessage = null;
    }
    // Send a new UI message
    await sendOrUpdateNowPlayingUI(player, message.channel);
    logger.debug(`[info] Now Playing UI refreshed in Guild="${message.guild.id}"`);
  }
};
