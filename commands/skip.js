// commands/skip.js
// Command to skip the current track

import { sendOrUpdateNowPlayingUI } from "../utils/nowPlayingManager.js";
import { performSkip } from "../utils/playerControls.js";
import logger from "../utils/logger.js";

export default {
  name: "skip",
  aliases: ["next"],
  description: "Skips the current track.",
  async execute(client, message) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No music is playing in this server.");
    }
    logger.debug(`[skip] Guild="${message.guild.id}" - Current queue length: ${player.queue.tracks.length}`);
    if (!player.queue.tracks || player.queue.tracks.length === 0) {
      return message.reply("No more tracks in the queue to skip to.");
    }
    try {
      // Call the skip function from playerControls
      await performSkip(player);
      // Wait a short time before updating the UI
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendOrUpdateNowPlayingUI(player, message.channel);
      logger.debug(`[skip] Track skipped in Guild="${message.guild.id}"`);
    } catch (error) {
      logger.error("[skip] Error while skipping track:", error);
      message.channel.send("Failed to skip the track.");
    }
  }
};
