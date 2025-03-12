// utils/nowPlayingManager.js
// Manages sending and updating the "Now Playing" UI in a Discord channel with interactive buttons.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { generateNowPlayingEmbed, generateStoppedEmbed } from "./nowPlayingEmbed.js";
import { updateNowPlaying } from "./updateNowPlaying.js";
import { togglePlayPause, performSkip, performStop } from "./playerControls.js";
import logger from "./logger.js";

// Helper function to create the button row
function createButtonRow(player) {
  const previousDisabled = !(player.queue.previous && player.queue.previous.length > 0);
  const skipDisabled = !(player.queue.tracks && player.queue.tracks.length > 0);
  
  return new ActionRowBuilder().addComponents(
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
}

// Main function to send or update the Now Playing UI
export async function sendOrUpdateNowPlayingUI(player, channel) {
  // Generate the embed for the current track
  let embed = generateNowPlayingEmbed(player);
  if (!embed) {
    logger.debug("[nowPlayingManager] No current track - skipping UI update.");
    return;
  }

  // Check if a new message needs to be created
  const shouldRecreateMessage =
    !player.nowPlayingMessage ||
    !player.nowPlayingMessage.components ||
    player.nowPlayingMessage.components.length === 0 ||
    (player.nowPlayingMessage.embeds[0] &&
      player.nowPlayingMessage.embeds[0].title === "Playback Stopped");

  // Function to start the update interval (every 3 seconds)
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
      // Delete old message if present
      if (player.nowPlayingMessage) {
        try {
          await player.nowPlayingMessage.delete();
        } catch (_) {}
        player.nowPlayingMessage = null;
      }

      // Create the button row
      const buttonRow = createButtonRow(player);

      // Send a new message with the embed and buttons
      player.nowPlayingMessage = await channel.send({
        embeds: [embed],
        components: [buttonRow]
      });
      logger.debug("[nowPlayingManager] New Now Playing message sent.");
      
      // Start the interval if not already active
      if (!player.nowPlayingInterval) {
        startNowPlayingInterval();
      }

      // Create a collector for button interactions on the message
      const collector = player.nowPlayingMessage.createMessageComponentCollector();
      player.nowPlayingCollector = collector;

      collector.on("collect", async (interaction) => {
        if (!interaction.isButton()) return;
        await interaction.deferUpdate();
        logger.debug(`[nowPlayingManager] Guild="${interaction.guildId}" - Button "${interaction.customId}" pressed.`);

        // Special handling for the "stop" button
        if (interaction.customId === "stop") {
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
          if (player.nowPlayingMessage) {
            await player.nowPlayingMessage.edit({
              components: [confirmRow]
            });
          }
          // Set a timeout to restore the original UI after 10 seconds
          const timeoutId = setTimeout(async () => {
            await restoreOriginalUI();
          }, 10000);
          player.stopConfirmationTimeout = timeoutId;
        } 
        // Confirm Stop
        else if (interaction.customId === "confirmStop") {
          if (player.stopConfirmationTimeout) {
            clearTimeout(player.stopConfirmationTimeout);
            player.stopConfirmationTimeout = null;
          }
          try {
            await performStop(player);
            collector.stop();
          } catch (error) {
            logger.error("[nowPlayingManager] Error on 'confirmStop':", error);
          }
        } 
        // Cancel Stop
        else if (interaction.customId === "cancelStop") {
          if (player.stopConfirmationTimeout) {
            clearTimeout(player.stopConfirmationTimeout);
            player.stopConfirmationTimeout = null;
          }
          await restoreOriginalUI();
        } 
        // Previous track
        else if (interaction.customId === "previous") {
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
            logger.error("[nowPlayingManager] Error on 'previous':", error);
          }
        } 
        // Toggle Play/Pause
        else if (interaction.customId === "playpause") {
          try {
            await togglePlayPause(player);
            if (!player.paused && player.playing) {
              startNowPlayingInterval();
            }
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error on 'playpause':", error);
          }
        } 
        // Skip track
        else if (interaction.customId === "skip") {
          try {
            await performSkip(player);
            await new Promise(resolve => setTimeout(resolve, 500));
            await sendOrUpdateNowPlayingUI(player, channel);
          } catch (error) {
            logger.error("[nowPlayingManager] Error on 'skip':", error);
          }
        } 
        // Shuffle queue
        else if (interaction.customId === "shuffle") {
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
            logger.error("[nowPlayingManager] Error on 'shuffle':", error);
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
        const buttonRow = createButtonRow(player);
        if (player.nowPlayingMessage) {
          await player.nowPlayingMessage.edit({
            content: null,
            embeds: [embed],
            components: [buttonRow]
          });
        }
      }
    } else {
      // Update existing message with new embed and buttons
      const buttonRow = createButtonRow(player);
      if (player.nowPlayingMessage) {
        await player.nowPlayingMessage.edit({
          embeds: [embed],
          components: [buttonRow]
        }).catch(() => {});
      }
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
