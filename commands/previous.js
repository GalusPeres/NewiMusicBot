// commands/previous.js
// Command to play the previous track from history without clearing the queue

import { sendOrUpdateNowPlayingUI } from "../utils/nowPlayingManager.js";
import logger from "../utils/logger.js";

export default {
  name: "previous",
  aliases: ["prev"],
  description: "Plays the previous track from history without clearing the rest of the queue.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("No track is currently playing.");
    }
    try {
      // Retrieve the previous track from history
      const previousTrack = await player.queue.shiftPrevious();
      if (!previousTrack) {
        return message.reply("There is no previous track in the history.");
      }
      // Optionally, add the current track back to the queue
      if (player.queue.current) {
        player.queue.tracks.unshift(player.queue.current);
      }
      // Set the previous track as current and play it
      player.queue.current = previousTrack;
      await player.play({ clientTrack: previousTrack });
      await sendOrUpdateNowPlayingUI(player, message.channel);
      logger.debug(`[previous] Played previous track in Guild="${message.guild.id}"`);
    } catch (error) {
      logger.error("[previous] Error while playing previous track:", error);
      message.reply("Failed to play the previous track.");
    }
  }
};
