// commands/pause.js
// Command to toggle pause/resume playback.

import { togglePlayPause } from "../../utils/playerControls.js";
import logger from "../../utils/logger.js";

export default {
  name: "pause",
  aliases: ["resume"],
  description: "Toggles pause/resume playback.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) return; // Exit if no active player exists

    const prefix = client.config.prefix;
    const commandUsed = message.content.slice(prefix.length).split(" ")[0].toLowerCase();

    if (commandUsed === "pause" && !player.paused) {
      await togglePlayPause(player);
      logger.debug(`[pause] Playback paused in Guild="${message.guild.id}"`);
    } else if (commandUsed === "resume" && player.paused) {
      await togglePlayPause(player);
      logger.debug(`[resume] Playback resumed in Guild="${message.guild.id}"`);
    }
  }
};
