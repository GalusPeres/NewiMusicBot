// utils/nowPlayingManager.js
// This module manages the "Now Playing" UI in a Discord channel. It sends or updates the embed with playback information and interactive controls, using throttling and diff-checking to minimize unnecessary edits.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { generateNowPlayingEmbed, generateStoppedEmbed } from "./nowPlayingEmbed.js";
import { updateNowPlaying } from "./updateNowPlaying.js";
import { togglePlayPause, performSkip, performStop } from "./playerControls.js";
import logger from "./logger.js";
import { isDeepStrictEqual as isEqual } from "node:util";

// Minimum interval between two updates (ms)
const MIN_UI_UPDATE_INTERVAL = 3000;

// Helper: create the button row
function createButtonRow(player) {
  const prevDisabled = !(player.queue.previous && player.queue.previous.length > 0);
  const skipDisabled = !(player.queue.tracks   && player.queue.tracks.length   > 0);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("previous")
      .setEmoji({ name: "previous", id: "1343186231856730172" })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId("playpause")
      .setEmoji({ name: "playpause", id: "1342881662660509776" })
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("skip")
      .setEmoji({ name: "skip", id: "1342881629432971314" })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(skipDisabled),
    new ButtonBuilder()
      .setCustomId("shuffle")
      .setEmoji({ name: "shuffle", id: "1343989666826682489" })
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("stop")
      .setEmoji({ name: "stop", id: "1342881694893604967" })
      .setStyle(ButtonStyle.Danger)
  );
}

/**
 * Sends or updates the "Now Playing" UI:
 * - at most every MIN_UI_UPDATE_INTERVAL ms
 * - only if the embed content has actually changed
 */
export async function sendOrUpdateNowPlayingUI(player, channel) {
  const now = Date.now();

  // 1) Throttle: only every MIN_UI_UPDATE_INTERVAL ms
  if (player._lastUIUpdate && now - player._lastUIUpdate < MIN_UI_UPDATE_INTERVAL) {
    logger.debug(`[nowPlayingManager] Skipping UI update: only ${now - player._lastUIUpdate}ms since last.`);
    return player.nowPlayingMessage;
  }
  player._lastUIUpdate = now;

  // 2) Generate embed
  const embed = generateNowPlayingEmbed(player);
  if (!embed) {
    logger.debug("[nowPlayingManager] No current track – skipping UI update.");
    return;
  }

  // 3) Diff-check: only if data changed
  const newData = embed.toJSON();
  if (player._lastEmbedData && isEqual(player._lastEmbedData, newData)) {
    logger.debug("[nowPlayingManager] Embed unchanged – skipping update.");
    return player.nowPlayingMessage;
  }
  player._lastEmbedData = newData;

  // 4) Create buttons
  const buttonRow = createButtonRow(player);

  try {
    if (!player.nowPlayingMessage) {
      // Initial send
      player.nowPlayingMessage = await channel.send({
        embeds:     [embed],
        components: [buttonRow]
      });
      logger.debug("[nowPlayingManager] New Now Playing message sent.");

      // Start auto-update interval
      if (!player.nowPlayingInterval) {
        player.nowPlayingInterval = setInterval(() => {
          if (player.playing || player.paused) {
            updateNowPlaying(player);
          } else {
            clearInterval(player.nowPlayingInterval);
            player.nowPlayingInterval = null;
          }
        }, MIN_UI_UPDATE_INTERVAL);
      }

      // Create collector for button interactions
      const collector = player.nowPlayingMessage.createMessageComponentCollector();
      player.nowPlayingCollector = collector;

      collector.on("collect", async interaction => {
        if (!interaction.isButton()) return;
        await interaction.deferUpdate();
        logger.debug(`[nowPlayingManager] Button "${interaction.customId}" pressed in Guild=${interaction.guildId}.`);

        switch (interaction.customId) {
          case "stop": {
            // Stop confirmation
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
            await player.nowPlayingMessage.edit({ components: [confirmRow] });
            player.stopConfirmationTimeout = setTimeout(async () => {
              await restoreOriginalUI();
            }, 10000);
            break;
          }

          case "confirmStop":
            clearTimeout(player.stopConfirmationTimeout);
            await performStop(player);
            collector.stop();
            break;

          case "cancelStop":
            clearTimeout(player.stopConfirmationTimeout);
            await restoreOriginalUI();
            break;

          case "previous":
            try {
              const prev = await player.queue.shiftPrevious();
              if (prev) {
                if (player.queue.current) player.queue.tracks.unshift(player.queue.current);
                player.queue.current = prev;
                await player.play({ clientTrack: prev });
                await sendOrUpdateNowPlayingUI(player, channel);
              }
            } catch (err) {
              logger.error("[nowPlayingManager] Error on 'previous':", err);
            }
            break;

          case "playpause":
            try {
              await togglePlayPause(player);
              await sendOrUpdateNowPlayingUI(player, channel);
            } catch (err) {
              logger.error("[nowPlayingManager] Error on 'playpause':", err);
            }
            break;

          case "skip":
            try {
              await performSkip(player);
              setTimeout(() => sendOrUpdateNowPlayingUI(player, channel), 500);
            } catch (err) {
              logger.error("[nowPlayingManager] Error on 'skip':", err);
            }
            break;

          case "shuffle":
            try {
              // Fisher-Yates shuffle
              for (let i = player.queue.tracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [player.queue.tracks[i], player.queue.tracks[j]] = [player.queue.tracks[j], player.queue.tracks[i]];
              }
              await sendOrUpdateNowPlayingUI(player, channel);
            } catch (err) {
              logger.error("[nowPlayingManager] Error on 'shuffle':", err);
            }
            break;
        }
      });

      collector.on("end", () => {
        if (player.nowPlayingMessage) {
          player.nowPlayingMessage.edit({ components: [] }).catch(() => {});
        }
      });

      // Restore UI after cancel or end of confirmation
      async function restoreOriginalUI() {
        const e = generateNowPlayingEmbed(player);
        if (!e) return;
        const row = createButtonRow(player);
        await player.nowPlayingMessage.edit({ embeds: [e], components: [row] }).catch(() => {});
      }

    } else {
      // Update existing message
      await player.nowPlayingMessage.edit({
        embeds:     [embed],
        components: [buttonRow]
      }).catch(() => {});
    }
  } catch (err) {
    logger.error("[nowPlayingManager] sendOrUpdateNowPlayingUI Error:", err);
    if (player.nowPlayingMessage) {
      try { await player.nowPlayingMessage.delete(); } catch {}
      player.nowPlayingMessage = null;
    }
  }

  return player.nowPlayingMessage;
}
