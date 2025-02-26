// utils/updateNowPlaying.js
// Updates the "Now Playing" embed message with the current track status

import { generateNowPlayingEmbed, generateStoppedEmbed } from "./nowPlayingEmbed.js";
import logger from "./logger.js";

/**
 * Updates the existing "Now Playing" message.
 *
 * @param {Object} player - The Lavalink player instance.
 */
export function updateNowPlaying(player) {
  if (!player.nowPlayingMessage) return;
  // Generate an updated embed based on whether a track is playing or not
  const embed = player.queue.current
    ? generateNowPlayingEmbed(player)
    : generateStoppedEmbed();
  player.nowPlayingMessage.edit({ embeds: [embed] }).catch(err => {
    logger.error(`[updateNowPlaying] Failed to update message for Guild="${player.guildId}":`, err);
  });
}
