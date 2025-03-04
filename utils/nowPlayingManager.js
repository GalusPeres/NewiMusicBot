// utils/nowPlayingManager.js
// Manages sending and updating the "Now Playing" UI in a Discord channel with interactive buttons.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { generateNowPlayingEmbed, generateStoppedEmbed } from "./nowPlayingEmbed.js";
import { updateNowPlaying } from "./updateNowPlaying.js";
import { togglePlayPause, performSkip, performStop } from "./playerControls.js";
import logger from "./logger.js";

export async function sendOrUpdateNowPlayingUI(player, channel) {
  // Generate the embed for the current track
  let embed = generateNowPlayingEmbed(player);
  if (!embed) {
    logger.debug("[nowPlayingManager] No current track - skipping UI update.");
    return;
  }

  // Create control buttons
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

  // Determine if we need to recreate the message
  const shouldRecreateMessage =
    !player.nowPlayingMessage ||
    !player.nowPlayingMessage.components ||
    player.nowPlayingMessage.components.length === 0 ||
    (player.nowPlayingMessage.embeds[0] &&
      player.nowPlayingMessage.embeds[0].title === "Playback Stopped");

  // Function to start the interval that updates the UI every 3 seconds
  function startNowPlayingInterval() {
    if (!player.nowPlayingInterval) {
      player.nowPlayingInterval = setInterval(() => {
        // Do not update if stopConfirmationActive is set (handled in updateNowPlaying.js)
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
      // Delete the old message if it exists
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
      logger.debug("[nowPlayingManager] Sent new Now Playing message.");
      if (!player.nowPlayingInterval) {
        startNowPlayingInterval();
      }

      // Create a collector for component interactions on the message
      const collector = player.nowPlayingMessage.createMessageComponentCollector();
      player.nowPlayingCollector = collector;

      collector.on("collect", async (interaction) => {
        if (!interaction.isButton()) return;
        await interaction.deferUpdate();
        logger.debug(`[nowPlayingManager] Guild="${interaction.guildId}" - Button "${interaction.customId}" pressed.`);

        // Special handling for the "stop" button
        if (interaction.customId === "stop") {
          // Show confirmation buttons by editing the message
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
          await player.nowPlayingMessage.edit({
            components: [confirmRow]
          });
          // Set a timeout to restore the original UI after 10 seconds
          const timeoutId = setTimeout(async () => {
            await restoreOriginalUI();
          }, 10000);
          player.stopConfirmationTimeout = timeoutId;
        } else if (interaction.customId === "confirmStop") {
          // Clear timeout if exists
          if (player.stopConfirmationTimeout) {
            clearTimeout(player.stopConfirmationTimeout);
            player.stopConfirmationTimeout = null;
          }
          try {
            await performStop(player);
            collector.stop();
          } catch (error) {
            logger.error("[nowPlayingManager] Error in 'confirmStop':", error);
          }
        } else if (interaction.customId === "cancelStop") {
          // Clear timeout if exists
          if (player.stopConfirmationTimeout) {
            clearTimeout(player.stopConfirmationTimeout);
            player.stopConfirmationTimeout = null;
          }
          await restoreOriginalUI();
        } else if (interaction.customId === "previous") {
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
            logger.error("[nowPlayingManager] Error in 'previous':", error);
          }
        } else if (interaction.customId === "playpause") {
          try {
            await togglePlayPause(player);
            if (!player.paused && player.playing) {
              startNowPlayingInterval();
            }
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error in 'playpause':", error);
          }
        } else if (interaction.customId === "skip") {
          try {
            await performSkip(player);
            await new Promise(resolve => setTimeout(resolve, 500));
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error in 'skip':", error);
          }
        } else if (interaction.customId === "shuffle") {
          try {
            function shuffle(array) {
              for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
              }
            }
            shuffle(player.queue.tracks);
            logger.debug(`[nowPlayingManager] [shuffle] Shuffled queue for Guild="${player.guildId}"`);
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error in 'shuffle':", error);
          }
        }
        updateNowPlaying(player);
      });

      collector.on("end", () => {
        if (player.nowPlayingMessage) {
          player.nowPlayingMessage.edit({ components: [] }).catch(() => {});
        }
      });

      // Function to restore the original UI
      async function restoreOriginalUI() {
        const embed = generateNowPlayingEmbed(player);
        if (!embed) return;
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
        await player.nowPlayingMessage.edit({
          content: null,
          embeds: [embed],
          components: [buttonRow]
        });
      }
    } else {
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
