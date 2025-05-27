// utils/updateNowPlaying.js
// -----------------------------------------------------------------------------
// Re-renders the current “Now Playing” embed every 3 s.
// Uses safeEdit() **without** logging flag to stay silent.
// -----------------------------------------------------------------------------

import {
  generateNowPlayingEmbed,
  generateStoppedEmbed
} from "./nowPlayingEmbed.js";
import { safeEdit } from "./safeDiscord.js";
import logger from "./logger.js";

export function updateNowPlaying(player) {
  if (!player.nowPlayingMessage) return;

  const embed = player.queue.current
    ? generateNowPlayingEmbed(player)
    : generateStoppedEmbed();

  safeEdit(player.nowPlayingMessage, { embeds: [embed] })
    .catch(err => logger.error(`[updateNowPlaying] failed in guild ${player.guildId}:`, err));
}
