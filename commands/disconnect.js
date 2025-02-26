// commands/disconnect.js
// Command to disconnect the bot from the voice channel

import logger from "../utils/logger.js";

export default {
  name: "disconnect",
  aliases: ["discon"],
  description: "Disconnects from the voice channel.",
  async execute(client, message) {
    // Get the player instance for this guild
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      // If no player exists, reply to the user
      return message.reply("No active player in this server.");
    }
    try {
      // Log the disconnect action
      logger.debug(`[disconnect] Guild="${message.guild.id}" - Disconnecting player.`);
      
      // Stop any active UI collectors or intervals
      if (player.nowPlayingCollector) {
        player.nowPlayingCollector.stop();
        player.nowPlayingCollector = null;
      }
      if (player.nowPlayingInterval) {
        clearInterval(player.nowPlayingInterval);
        player.nowPlayingInterval = null;
      }
      
      // Disconnect the player; pass false if you wish to keep the queue
      await player.disconnect(false);
      
      // Inform the user that the bot is disconnected
      message.channel.send("Disconnected from the voice channel.");
    } catch (error) {
      // Log the error and notify the user
      logger.error("[disconnect]", error);
      message.channel.send("Failed to disconnect from the voice channel.");
    }
  }
};
