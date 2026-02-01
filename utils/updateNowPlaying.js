// utils/updateNowPlaying.js
// Updates both embeds and components to prevent Discord from removing buttons
// Skips updates during stop confirmation to avoid overriding confirmation buttons
// OPTIMIZED: Centralized lock system for ALL UI updates

import {
  generateNowPlayingEmbed,
  generateStoppedEmbed
} from "./nowPlayingEmbed.js";
import { safeEdit } from "./safeDiscord.js";
import logger from "./logger.js";
import { createButtonRowWithEmojis } from "./emojiUtils.js";

// CENTRALIZED: Single lock for ALL UI updates (interval AND button)
const activeUpdates = new Map();

// Export lock functions for use by nowPlayingManager
export function isUpdateLocked(guildId) {
  return activeUpdates.get(guildId) === true;
}

export function setUpdateLock(guildId, locked) {
  if (locked) {
    activeUpdates.set(guildId, true);
  } else {
    activeUpdates.delete(guildId);
  }
}

// Regular interval update (lower priority - skips if locked)
export async function updateNowPlaying(player) {
  if (!player.nowPlayingMessage) return;

  const guildId = player.guildId;

  // Skip if ANY update is in progress (button or interval)
  if (isUpdateLocked(guildId)) {
    return; // Silently skip - button update has priority
  }

  // Set lock
  setUpdateLock(guildId, true);

  try {
    // Check if stop confirmation is active
    if (player.stopConfirmationTimeout) {
      const embed = player.queue.current
        ? generateNowPlayingEmbed(player)
        : generateStoppedEmbed();
      await safeEdit(player.nowPlayingMessage, { embeds: [embed] });
      return;
    }

    // Normal operation: Update both embed and components
    const embed = player.queue.current
      ? generateNowPlayingEmbed(player)
      : generateStoppedEmbed();

    const components = player.queue.current ? [createButtonRowWithEmojis(player)] : [];

    await safeEdit(player.nowPlayingMessage, {
      embeds: [embed],
      components: components
    });
  } catch (err) {
    logger.error(`[updateNowPlaying] failed in guild ${guildId}:`, err);
  } finally {
    setUpdateLock(guildId, false);
  }
}

// PRIORITY update for button interactions (waits for lock, then executes)
export async function priorityUpdate(player) {
  if (!player.nowPlayingMessage) return;

  // DON'T update if stop confirmation is showing - protect those buttons!
  if (player.stopConfirmationTimeout) {
    logger.debug(`[priorityUpdate] Skipping - stop confirmation active`);
    return;
  }

  const guildId = player.guildId;

  // Wait briefly if locked (max 500ms), then proceed anyway
  let waitTime = 0;
  while (isUpdateLocked(guildId) && waitTime < 500) {
    await new Promise(r => setTimeout(r, 50));
    waitTime += 50;
  }

  // Force lock for priority update
  setUpdateLock(guildId, true);

  try {
    const embed = player.queue.current
      ? generateNowPlayingEmbed(player)
      : generateStoppedEmbed();

    const components = player.queue.current ? [createButtonRowWithEmojis(player)] : [];

    await safeEdit(player.nowPlayingMessage, {
      embeds: [embed],
      components: components
    });
  } catch (err) {
    logger.error(`[priorityUpdate] failed in guild ${guildId}:`, err);
  } finally {
    setUpdateLock(guildId, false);
  }
}