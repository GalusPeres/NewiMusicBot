// commands/speed.js
// Command to change the playback speed using the Lavalink timescale filter

import logger from "../../utils/logger.js";

export default {
  name: "speed",
  description: "Sets the playback speed (Timescale filter). Usage: .speed 1.25 for 25% faster playback.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No music is currently playing on this server.");
    }
    if (!player.connected) {
      return message.reply("Lavalink is not connected.");
    }
    // Ensure the player has a session ID; if not, attempt to reconnect and get one
    if (!player.sessionId) {
      if (player.node?.sessionId) {
        player.sessionId = player.node.sessionId;
        logger.debug(`[speed] Using sessionId from node: ${player.sessionId}`);
      } else {
        logger.warn(`[speed] Guild="${message.guild.id}" - Session ID missing. Reconnecting.`);
        await player.connect();
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (player.node?.sessionId) {
          player.sessionId = player.node.sessionId;
          logger.debug(`[speed] After reconnect, sessionId from node: ${player.sessionId}`);
        } else {
          return message.reply("Lavalink session ID is still undefined.");
        }
      }
    }
    logger.debug(`[speed] Guild="${message.guild.id}" | Player Session ID="${player.sessionId}"`);
    const speed = parseFloat(args[0]);
    if (isNaN(speed) || speed <= 0) {
      return message.reply("Please provide a valid speed (e.g., 1.25 for 25% faster).");
    }
    // Build the payload for the timescale filter
    const filterPayload = {
      filters: {
        timescale: {
          speed: speed,
          pitch: 1.0,
          rate: 1.0
        }
      }
    };
    try {
      // Send a PATCH request to the Lavalink API to apply the filter
      const response = await fetch(`http://${client.config.lavalinkHost}:${client.config.lavalinkPort}/v4/sessions/${player.sessionId}/players/${message.guild.id}`, {
        method: "PATCH",
        headers: {
          "Authorization": client.config.lavalinkPassword,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(filterPayload)
      });
      if (!response.ok) {
        throw new Error(`Lavalink API returned ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      logger.debug("[speed] Lavalink API response:", result);
      message.channel.send(`Speed set to ${speed}x.`);
    } catch (error) {
      logger.error("[speed] Error applying speed filter:", error);
      message.channel.send("Error applying speed filter.");
    }
  }
};
