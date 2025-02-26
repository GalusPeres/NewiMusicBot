// commands/stop.js
// Command to stop playback and clear the queue

import { performStop } from "../utils/playerControls.js";
import logger from "../utils/logger.js";

export default {
  name: "stop",
  description: "Stops playback and clears the queue.",
  async execute(client, message) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No music is currently playing.");
    }
    logger.debug(`[stop] Guild="${message.guild.id}" - Queue length: ${player.queue.tracks.length}`);
    try {
      // Stop playback and clear queue using the helper function
      await performStop(player);
      logger.debug(`[stop] Playback stopped in Guild="${message.guild.id}"`);
    } catch (error) {
      logger.error("[stop] Error stopping playback:", error);
      message.channel.send("Failed to stop the playback.");
    }
  }
};
