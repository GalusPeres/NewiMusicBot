// utils/nowPlayingManager.js
// Performance optimized version with faster UI updates and better responsiveness

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import {
  generateNowPlayingEmbed,
  generateStoppedEmbed
} from "./nowPlayingEmbed.js";
import { updateNowPlaying, priorityUpdate, isUpdateLocked, setUpdateLock } from "./updateNowPlaying.js";
import {
  togglePlayPause,
  performSkip,
  performStop
} from "./playerControls.js";
import logger from "./logger.js";
import { isDeepStrictEqual as isEqual } from "node:util";
import { safeEdit, safeDelete } from "./safeDiscord.js";
import { createButtonRowWithEmojis } from "./emojiUtils.js";

// UI update intervals
const MIN_UI_UPDATE_INTERVAL = 2_000;     // 2s for regular updates
const SKIP_UPDATE_DELAY = 300;            // 300ms delay for skip (wait for track change)

// Track UI state for optimization
const uiUpdateQueue = new Map();
const buttonCooldowns = new Map();

// OPTIMIZATION: ensureNowPlayingMessage with faster validation and recreation
async function ensureNowPlayingMessage(player, channel) {
  if (player.nowPlayingMessage) {
    // OPTIMIZATION: Quick validation - if message is too old or invalid, recreate
    try {
      const messageAge = Date.now() - player.nowPlayingMessage.createdTimestamp;
      if (messageAge > 3600000) { // 1 hour
        logger.debug(`[nowPlayingManager] Message too old, recreating for guild ${channel.guildId}`);
        await safeDelete(player.nowPlayingMessage);
        player.nowPlayingMessage = null;
      } else {
        return player.nowPlayingMessage;
      }
    } catch (error) {
      // Message might be deleted, recreate
      player.nowPlayingMessage = null;
    }
  }

  const embed = generateNowPlayingEmbed(player);
  if (!embed) return null;

  try {
    player.nowPlayingMessage = await channel.send({
      embeds:     [embed],
      components: [createButtonRowWithEmojis(player)]
    });

    registerCollectorOptimized(player, channel);
    logger.debug(`[nowPlayingManager] Fresh UI message created in guild ${channel.guildId}`);
    return player.nowPlayingMessage;
  } catch (error) {
    logger.error("[ensureNowPlayingMessage] Failed to create message:", error);
    return null;
  }
}

// OPTIMIZATION: Optimized collector with faster response times and NO TIMEOUT
function registerCollectorOptimized(player, channel) {
  if (player.nowPlayingCollector) {
    player.nowPlayingCollector.stop();
    player.nowPlayingCollector = null;
  }
  if (!player.nowPlayingMessage) return;

  const collector = player.nowPlayingMessage.createMessageComponentCollector({
    // FIXED: No timeout - collector runs indefinitely to prevent button death
  });
  player.nowPlayingCollector = collector;

  collector.on("collect", async interaction => {
    if (!interaction.isButton()) return;
    
    // OPTIMIZATION: Button cooldown to prevent spam
    const userId = interaction.user.id;
    const now = Date.now();
    const lastClick = buttonCooldowns.get(userId) || 0;
    
    if (now - lastClick < 1000) { // 1 second cooldown
      await interaction.deferUpdate().catch(() => {});
      return;
    }
    buttonCooldowns.set(userId, now);
    
    // OPTIMIZATION: Immediate defer for faster response
    await interaction.deferUpdate().catch(() => {});

    // Ensure message exists before processing
    const message = await ensureNowPlayingMessage(player, interaction.channel);
    if (!message) return;

    // OPTIMIZATION: Process actions with optimized timing
    try {
      switch (interaction.customId) {
        case "stop":
          await handleStopButton(player, interaction);
          break;

        case "confirmStop":
          clearTimeout(player.stopConfirmationTimeout);
          player.stopConfirmationTimeout = null;  // FIX: Must set to null!
          await performStop(player);
          collector.stop();
          break;

        case "cancelStop":
          clearTimeout(player.stopConfirmationTimeout);
          player.stopConfirmationTimeout = null;  // FIX: Must set to null!
          await restoreOriginalUI(player, interaction.channel);
          break;

        case "previous":
          // FIX: Clear stop confirmation if active (user wants to continue)
          if (player.stopConfirmationTimeout) {
            clearTimeout(player.stopConfirmationTimeout);
            player.stopConfirmationTimeout = null;
          }
          await handlePreviousButton(player, interaction);
          break;

        case "playpause":
          await handlePlayPauseButton(player, interaction);
          break;

        case "skip":
          // FIX: Clear stop confirmation if active (user wants to continue)
          if (player.stopConfirmationTimeout) {
            clearTimeout(player.stopConfirmationTimeout);
            player.stopConfirmationTimeout = null;
          }
          await handleSkipButton(player, interaction);
          break;

        case "shuffle":
          await handleShuffleButton(player, interaction);
          break;
      }
    } catch (error) {
      logger.error(`[collector] Error handling ${interaction.customId}:`, error);
    }
  });

  collector.on("end", () => {
    if (player.nowPlayingMessage) {
      safeEdit(player.nowPlayingMessage, { components: [] }).catch(() => {});
    }
  });
}

// OPTIMIZATION: Individual button handlers with optimized timing
async function handleStopButton(player, interaction) {
  const guildId = player.guildId;

  // Set lock to prevent other updates from interfering
  setUpdateLock(guildId, true);

  try {
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirmStop")
        .setLabel("Confirm Stop")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancelStop")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    await safeEdit(player.nowPlayingMessage, { components: [confirmRow] });
    player.stopConfirmationTimeout = setTimeout(
      () => restoreOriginalUI(player, interaction.channel),
      10_000
    );
  } finally {
    setUpdateLock(guildId, false);
  }
}

async function handlePreviousButton(player, interaction) {
  try {
    const prev = await player.queue.shiftPrevious();
    if (prev) {
      if (player.queue.current) {
        player.queue.tracks.unshift(player.queue.current);
      }
      player.queue.current = prev;
      await player.play({ clientTrack: prev });
      // NO UI update here - trackStart event handles it!
    }
  } catch (error) {
    logger.error("[handlePreviousButton] Error:", error);
  }
}

async function handlePlayPauseButton(player, interaction) {
  try {
    await togglePlayPause(player);
    // PlayPause needs immediate update (no trackStart event fires)
    await priorityUpdate(player);
  } catch (error) {
    logger.error("[handlePlayPauseButton] Error:", error);
  }
}

async function handleSkipButton(player, interaction) {
  try {
    await performSkip(player);
    // NO UI update here - trackStart event handles it!
  } catch (error) {
    logger.error("[handleSkipButton] Error:", error);
  }
}

async function handleShuffleButton(player, interaction) {
  try {
    // Efficient Fisher-Yates shuffle
    const tracks = player.queue.tracks;
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    // Shuffle needs immediate update (no trackStart event fires)
    await priorityUpdate(player);
  } catch (error) {
    logger.error("[handleShuffleButton] Error:", error);
  }
}

// OPTIMIZATION: Restore UI with faster response
async function restoreOriginalUI(player, channel) {
  const guildId = player.guildId;

  // FIX: Clear the timeout reference (might be called from timeout itself)
  player.stopConfirmationTimeout = null;

  // FIX: Use lock to prevent race conditions
  setUpdateLock(guildId, true);

  try {
    const emb = generateNowPlayingEmbed(player) || generateStoppedEmbed();
    const row = createButtonRowWithEmojis(player);
    await ensureNowPlayingMessage(player, channel);
    await safeEdit(player.nowPlayingMessage, { embeds: [emb], components: [row] });
  } catch (error) {
    logger.error("[restoreOriginalUI] Error:", error);
  } finally {
    setUpdateLock(guildId, false);
  }
}

// Main function for initial UI setup and non-button updates
export async function sendOrUpdateNowPlayingUI(player, channel, fastUpdate = false) {
  const now = Date.now();
  const guildId = channel.guildId;

  // Skip if locked (another update in progress)
  if (isUpdateLocked(guildId) && !fastUpdate) {
    return player.nowPlayingMessage;
  }

  // Throttle non-fast updates
  if (
    !fastUpdate &&
    player._lastUIUpdate &&
    now - player._lastUIUpdate < MIN_UI_UPDATE_INTERVAL
  ) {
    // Queue update for later
    if (!uiUpdateQueue.has(guildId)) {
      uiUpdateQueue.set(guildId, setTimeout(() => {
        uiUpdateQueue.delete(guildId);
        sendOrUpdateNowPlayingUI(player, channel, false);
      }, MIN_UI_UPDATE_INTERVAL));
    }
    return player.nowPlayingMessage;
  }

  // Clear any queued updates
  if (uiUpdateQueue.has(guildId)) {
    clearTimeout(uiUpdateQueue.get(guildId));
    uiUpdateQueue.delete(guildId);
  }

  // For fast updates, use priorityUpdate instead
  if (fastUpdate) {
    await priorityUpdate(player);
    return player.nowPlayingMessage;
  }

  // Set lock for this update
  setUpdateLock(guildId, true);
  player._lastUIUpdate = now;

  try {
    // Ensure we have a message
    const msg = await ensureNowPlayingMessage(player, channel);
    if (!msg) return null;

    const embed = generateNowPlayingEmbed(player);
    const newData = embed?.toJSON() || {};

    // Skip if content unchanged
    if (player._lastEmbedData && isEqual(player._lastEmbedData, newData)) {
      return msg;
    }
    player._lastEmbedData = newData;

    await safeEdit(
      msg,
      { embeds: [embed], components: [createButtonRowWithEmojis(player)] }
    );

    return msg;
  } catch (err) {
    if (err.code === 10008) {
      logger.warn(`[nowPlayingManager] UI message lost (10008) in guild ${guildId}`);
      if (player.nowPlayingCollector) {
        player.nowPlayingCollector.stop();
        player.nowPlayingCollector = null;
      }
      await safeDelete(player.nowPlayingMessage);
      player.nowPlayingMessage = null;
    } else {
      logger.error("sendOrUpdateNowPlayingUI Error:", err);
    }
    return null;
  } finally {
    setUpdateLock(guildId, false);
  }
}

// OPTIMIZATION: Batch UI updates for multiple players (for performance)
export async function batchUpdateUI(players) {
  const updatePromises = [];
  
  for (const [guildId, player] of players) {
    if (player.textChannelId) {
      const channel = player.client?.channels?.cache?.get(player.textChannelId);
      if (channel) {
        updatePromises.push(
          sendOrUpdateNowPlayingUI(player, channel, true).catch(err => 
            logger.warn(`Batch update failed for guild ${guildId}:`, err)
          )
        );
      }
    }
  }
  
  await Promise.allSettled(updatePromises);
  logger.debug(`[batchUpdateUI] Updated ${updatePromises.length} players`);
}

// OPTIMIZATION: Enhanced UI reset for better performance
export function resetPlayerUIOptimized(player) {
  try {
    // Clear all timers and collectors
    if (player.nowPlayingInterval) {
      clearInterval(player.nowPlayingInterval);
      player.nowPlayingInterval = null;
    }
    
    if (player.nowPlayingCollector) {
      player.nowPlayingCollector.stop();
      player.nowPlayingCollector = null;
    }
    
    if (player.stopConfirmationTimeout) {
      clearTimeout(player.stopConfirmationTimeout);
      player.stopConfirmationTimeout = null;
    }
    
    // Reset all UI state variables
    player._lastUIUpdate = null;
    player._lastEmbedData = null;
    player._pausedPosition = undefined;
    player.uiRefreshing = false;
    
    // Update UI to stopped state
    if (player.nowPlayingMessage) {
      safeEdit(player.nowPlayingMessage, {
        embeds: [generateStoppedEmbed()],
        components: []
      }).catch(() => {});
      player.nowPlayingMessage = null;
    }
    
    logger.debug(`[resetPlayerUIOptimized] Complete UI reset for guild ${player.guildId}`);
  } catch (err) {
    logger.error("Error in resetPlayerUIOptimized:", err);
  }
}

// OPTIMIZATION: Cleanup functions for memory management
function cleanupUIResources() {
  // Clear queued updates
  for (const timeout of uiUpdateQueue.values()) {
    clearTimeout(timeout);
  }
  uiUpdateQueue.clear();
  
  // Clear button cooldowns older than 5 minutes
  const now = Date.now();
  for (const [userId, timestamp] of buttonCooldowns.entries()) {
    if (now - timestamp > 300000) {
      buttonCooldowns.delete(userId);
    }
  }
}

// OPTIMIZATION: Periodic cleanup for memory management
setInterval(cleanupUIResources, 60000); // Every minute

// Cleanup on shutdown
process.on('exit', cleanupUIResources);
process.on('SIGINT', cleanupUIResources);
process.on('SIGTERM', cleanupUIResources);
