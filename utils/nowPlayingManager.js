// utils/nowPlayingManager.js
// Manages sending and updating the "Now Playing" UI in a Discord channel with interactive buttons.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { generateNowPlayingEmbed, generateStoppedEmbed } from "./nowPlayingEmbed.js";
import { updateNowPlaying } from "./updateNowPlaying.js";
import { togglePlayPause, performSkip, performStop } from "./playerControls.js";
import logger from "./logger.js";

/**
 * Sends or updates the "Now Playing" UI message in the specified Discord channel.
 *
 * @param {Object} player - The Lavalink player instance.
 * @param {Object} channel - The Discord text channel to send the UI message.
 * @returns {Promise<Object|null>} - The sent/updated message object or null if no track is playing.
 */
export async function sendOrUpdateNowPlayingUI(player, channel) {
  // Generate the embed for the currently playing track
  let embed = generateNowPlayingEmbed(player);
  if (!embed) {
    logger.debug("[nowPlayingManager] No current track - skipping UI update.");
    return;
  }

  // Prepare control buttons (previous, play/pause, skip, shuffle, stop)
  const previousDisabled = !(player.queue.previous && player.queue.previous.length > 0);
  const skipDisabled = !(player.queue.tracks && player.queue.tracks.length > 0);
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("previous")
      .setEmoji({ name: "previous", id: "1343186231856730172" })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(previousDisabled),
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

  // Determine whether to recreate the message or simply update it
  const shouldRecreateMessage =
    !player.nowPlayingMessage ||
    !player.nowPlayingMessage.components ||
    player.nowPlayingMessage.components.length === 0 ||
    (player.nowPlayingMessage.embeds[0] &&
      player.nowPlayingMessage.embeds[0].title === "Playback Stopped");

  // Function to start an interval that updates the UI every 3 seconds
  function startNowPlayingInterval() {
    if (!player.nowPlayingInterval) {
      player.nowPlayingInterval = setInterval(() => {
        if (player.playing || player.paused) {
          updateNowPlaying(player);
        } else {
          clearInterval(player.nowPlayingInterval);
          player.nowPlayingInterval = null;
        }
      }, 3000);
    }
  }

  try {
    if (shouldRecreateMessage) {
      // If there is an old message, delete it before sending a new one
      if (player.nowPlayingMessage) {
        try {
          await player.nowPlayingMessage.delete();
        } catch (_) {}
        player.nowPlayingMessage = null;
      }
      // Send a new message with the embed and control buttons
      player.nowPlayingMessage = await channel.send({
        embeds: [embed],
        components: [buttonRow]
      });

      if (!player.nowPlayingInterval) {
        startNowPlayingInterval();
      }

      // Set up a collector to handle button interactions on the UI message
      const collector = player.nowPlayingMessage.createMessageComponentCollector();
      player.nowPlayingCollector = collector;

      collector.on("collect", async (interaction) => {
        if (!interaction.isButton()) return;
        await interaction.deferUpdate();
        logger.debug(`[nowPlayingManager] Guild="${interaction.guildId}" - Button "${interaction.customId}" pressed.`);
        // Handle button actions based on the custom ID
        if (interaction.customId === "previous") {
          try {
            const previousTrack = await player.queue.shiftPrevious();
            if (!previousTrack) {
              await sendOrUpdateNowPlayingUI(player, channel);
              return;
            }
            if (player.queue.current) {
              player.queue.tracks.unshift(player.queue.current);
            }
            player.queue.current = previousTrack;
            await player.play({ clientTrack: previousTrack });
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error with 'previous':", error);
          }
        } else if (interaction.customId === "playpause") {
          try {
            await togglePlayPause(player);
            if (!player.paused && player.playing) {
              startNowPlayingInterval();
            }
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error with 'playpause':", error);
          }
        } else if (interaction.customId === "skip") {
          try {
            await performSkip(player);
            await new Promise(resolve => setTimeout(resolve, 500));
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error with 'skip':", error);
          }
        } else if (interaction.customId === "shuffle") {
          try {
            // Shuffle the queue using the Fisher-Yates algorithm
            function shuffle(array) {
              for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
              }
            }
            shuffle(player.queue.tracks);
            logger.debug(`[nowPlayingManager] [shuffle] Queue shuffled for Guild="${player.guildId}"`);
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error with 'shuffle':", error);
          }
        } else if (interaction.customId === "stop") {
          try {
            await performStop(player);
            collector.stop();
          } catch (error) {
            logger.error("[nowPlayingManager] Error with 'stop':", error);
          }
        }
        // Update the UI after any action
        updateNowPlaying(player);
      });

      // When the collector ends, disable the buttons
      collector.on("end", () => {
        if (player.nowPlayingMessage) {
          player.nowPlayingMessage.edit({ components: [] }).catch(() => {});
        }
      });

    } else {
      // If a UI message already exists, update it
      await player.nowPlayingMessage.edit({
        embeds: [embed],
        components: [buttonRow]
      }).catch(() => {});
    }
  } catch (err) {
    logger.error("[nowPlayingManager] Error in sendOrUpdateNowPlayingUI:", err);
    if (player.nowPlayingMessage) {
      try {
        await player.nowPlayingMessage.delete();
      } catch (_) {}
      player.nowPlayingMessage = null;
    }
  }
  return player.nowPlayingMessage;
}
