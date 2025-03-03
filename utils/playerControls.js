// utils/playerControls.js
// Contains helper functions for controlling playback (toggle play/pause, skip, stop)

import { generateStoppedEmbed } from "./nowPlayingEmbed.js";
import logger from "./logger.js";

/**
 * Toggles the playback state between play and pause.
 *
 * @param {Object} player - The Lavalink player instance.
 */
export async function togglePlayPause(player) {
  logger.debug(`[playerControls] Toggling play/pause for Guild="${player.guildId}" - Currently paused: ${player.paused}`);
  if (player.paused) {
    // If paused, clear any existing timeout and resume playback
    if (player.pauseTimeout) {
      clearTimeout(player.pauseTimeout);
      player.pauseTimeout = null;
    }
    await player.resume();
    // Reset paused position when resuming
    player._pausedPosition = undefined;
  } else {
    // Store current position before pausing
    player._pausedPosition = player.position;
    await player.pause();
    player.pauseTimeout = setTimeout(async () => {
      if (player.paused) {
        logger.debug(`[playerControls] Auto-stopping playback after 20 minutes pause in Guild="${player.guildId}"`);
        await performStop(player);
      }
    }, 20 * 60 * 1000);
  }
}

/**
 * Skips the current track.
 *
 * @param {Object} player - The Lavalink player instance.
 */
export async function performSkip(player) {
  logger.debug(`[playerControls] Skipping track for Guild="${player.guildId}"`);
  if (!player.queue.tracks || player.queue.tracks.length === 0) return;
  await player.skip();
}

/**
 * Stops playback, clears the queue, and resets player state.
 *
 * @param {Object} player - The Lavalink player instance.
 */
export async function performStop(player) {
  logger.debug(`[playerControls] Stopping playback for Guild="${player.guildId}"`);
  // Stop playback (optionally clearing the current track)
  await player.stopPlaying(true, false);
  
  // Reset the queue and playback state
  player.queue.current = null;
  player.queue.tracks = [];
  player.queue.previous = [];
  player.playing = false;
  player.paused = false;
  
  // Stop any UI collectors or intervals
  if (player.nowPlayingCollector) {
    logger.debug(`[playerControls] Stopping nowPlayingCollector for Guild="${player.guildId}"`);
    player.nowPlayingCollector.stop();
    player.nowPlayingCollector = null;
  }
  if (player.nowPlayingInterval) {
    logger.debug(`[playerControls] Clearing nowPlayingInterval for Guild="${player.guildId}"`);
    clearInterval(player.nowPlayingInterval);
    player.nowPlayingInterval = null;
  }
  // Update the UI to show the "stopped" state
  if (player.nowPlayingMessage) {
    const stoppedEmbed = generateStoppedEmbed();
    try {
      await player.nowPlayingMessage.edit({ embeds: [stoppedEmbed], components: [] });
    } catch (_) {}
    player.nowPlayingMessage = null;
  }
}
