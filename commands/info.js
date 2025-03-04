// commands/info.js
// Command to force refresh the "Now Playing" UI in the channel.

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
    // Prevent multiple UI refreshes at the same time.
    if (player.uiRefreshing) {
      const replyMessage = await message.reply("UI refresh already in progress.");
      // Delete the reply message after 10 seconds.
      setTimeout(() => {
        replyMessage.delete().catch(error => {
          logger.error("Failed to delete 'UI refresh already in progress.' message:", error);
        });
      }, 5000);
      return;
    }
    player.uiRefreshing = true;
    try {
      // Delete the existing Now Playing message if it exists.
      if (player.nowPlayingMessage) {
        try {
          await player.nowPlayingMessage.delete();
        } catch (error) {
          logger.warn("Failed to delete existing Now Playing message:", error);
        }
        player.nowPlayingMessage = null;
      }
      // Send a new Now Playing message.
      await sendOrUpdateNowPlayingUI(player, message.channel);
      logger.debug(`[info] Now Playing UI refreshed in Guild="${message.guild.id}"`);
    } catch (error) {
      logger.error("[info] Error refreshing UI:", error);
      message.channel.send("There was an error refreshing the UI.");
    } finally {
      player.uiRefreshing = false;
    }
  }
};
