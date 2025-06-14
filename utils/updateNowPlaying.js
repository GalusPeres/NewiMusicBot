// utils/updateNowPlaying.js
// Updates both embeds and components to prevent Discord from removing buttons
// Skips updates during stop confirmation to avoid overriding confirmation buttons

import {
  generateNowPlayingEmbed,
  generateStoppedEmbed
} from "./nowPlayingEmbed.js";
import { safeEdit } from "./safeDiscord.js";
import logger from "./logger.js";
import { createButtonRowWithEmojis } from "./emojiUtils.js";

export function updateNowPlaying(player) {
  if (!player.nowPlayingMessage) return;

  // Check if stop confirmation is active
  if (player.stopConfirmationTimeout) {
    // During stop confirmation: Only update embed, keep confirmation buttons
    const embed = player.queue.current
      ? generateNowPlayingEmbed(player)
      : generateStoppedEmbed();
      
    safeEdit(player.nowPlayingMessage, { embeds: [embed] })
      .catch(err => logger.error(`[updateNowPlaying] embed-only failed in guild ${player.guildId}:`, err));
    return;
  }

  // Normal operation: Update both embed and components
  const embed = player.queue.current
    ? generateNowPlayingEmbed(player)
    : generateStoppedEmbed();

  const components = player.queue.current ? [createButtonRowWithEmojis(player)] : [];

  safeEdit(player.nowPlayingMessage, { 
    embeds: [embed],
    components: components
  })
    .catch(err => logger.error(`[updateNowPlaying] failed in guild ${player.guildId}:`, err));
}