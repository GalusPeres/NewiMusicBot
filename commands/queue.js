// commands/queue.js
// Displays a merged queue (history, current track, upcoming) in a paginated embed.
// You can use ".queue 16" to jump to the 16th upcoming track, or ".queue -2" to jump to the history track labeled "-02".
// In Jump Mode, the target track is immediately played and the merged queue remains in chronological order.
// In Display Mode, the embed is shown with persistent navigation buttons.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { formatTrackTitle } from "../utils/formatTrack.js";
import logger from "../utils/logger.js";

// Helper: Truncate a string if it exceeds maxLength characters.
function truncateTitle(title, maxLength = 45) {
  return title.length > maxLength ? title.slice(0, maxLength - 3) + "..." : title;
}

// Helper: Build the merged array of display lines.
function buildQueueLines(player) {
  const lines = [];
  // History: all history entries (oldest first)
  const fullHistory = player.queue.previous || [];
  const reversedHistory = fullHistory.slice().reverse();
  const historyLength = reversedHistory.length;
  for (let i = 0; i < historyLength; i++) {
    const offset = i - historyLength; // e.g. for 3 items: 0 -> -3, 1 -> -2, 2 -> -1
    const indexStr =
      offset < 0
        ? `-${Math.abs(offset).toString().padStart(2, "0")}`
        : offset.toString();
    const track = reversedHistory[i];
    const rawTitle = formatTrackTitle(track.info, track.requestedAsUrl);
    const title = truncateTitle(rawTitle, 45);
    // Use \u2002 for indentation.
    lines.push(`\u2002\`${indexStr}\`\u2002\`${title}\``);
  }
  // Current track (no indentation, bold "Now" label)
  const current = player.queue.current;
  if (current) {
    const curTitle = truncateTitle(
      formatTrackTitle(current.info, current.requestedAsUrl),
      100
    );
    lines.push(`\u2009\u200A\u200A**Now**\u2002\`${curTitle}\``);
  }
  // Upcoming tracks: positive indices starting at 01.
  const upcoming = player.queue.tracks;
  upcoming.forEach((track, i) => {
    const indexStr = (i + 1).toString().padStart(2, "0");
    const rawTitle = formatTrackTitle(track.info, track.requestedAsUrl);
    const title = truncateTitle(rawTitle, 45);
    lines.push(`\u2002\`${indexStr}\`\u2002\`${title}\``);
  });
  return lines;
}

// Helper: Split an array into chunks of a given size.
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Helper: Build an embed from a list of lines; prepend \u200B to the first line as a rendering workaround.
function buildEmbed(lines, pageNumber, totalPages, prefix) {
  if (lines.length > 0 && !lines[0].startsWith("\u200B")) {
    lines[0] = "\u200B" + lines[0];
  }
  return new EmbedBuilder()
    .setTitle("Current Queue")
    .setColor("Green")
    .setFooter({
      text: `Page ${pageNumber} / ${totalPages}\u2002•\u2002Use "${prefix}queue <number>" (positive or negative) to jump to a track.`
    })
    .setDescription(lines.join("\n"));
}

// Helper: Returns the merged queue as an array of track objects (in display order).
function getMergedQueue(player) {
  const history = (player.queue.previous || []).slice().reverse();
  const current = player.queue.current;
  const upcoming = player.queue.tracks.slice();
  return [...history, current, ...upcoming];
}

// Persistent interaction handling: Register a global listener if not already registered.
function registerQueueInteractionHandler(client) {
  if (!client.activeQueueMessagesHandlerRegistered) {
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isButton()) return;
      const state = client.activeQueueMessages.get(interaction.message.id);
      if (!state) return;
      let { pages, currentPage, player, pageSize } = state;
      if (interaction.customId === "prevPage" && currentPage > 0) {
        currentPage--;
      } else if (interaction.customId === "nextPage" && currentPage < pages.length - 1) {
        currentPage++;
      } else if (interaction.customId === "refreshPage") {
        const allLines = buildQueueLines(player);
        pages = chunkArray(allLines, pageSize);
        // Recalculate current page based on the current track position.
        const newHistoryCount = (player.queue.previous || []).length;
        currentPage = Math.floor(newHistoryCount / pageSize);
        if (currentPage >= pages.length) currentPage = pages.length - 1;
      }
      // Update state.
      state.currentPage = currentPage;
      state.pages = pages;
      client.activeQueueMessages.set(interaction.message.id, state);
      const prefix = client.config.prefix; // Dynamisch verwenden
      const newEmbed = buildEmbed(pages[currentPage], currentPage + 1, pages.length, prefix);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prevPage")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === 0),
        new ButtonBuilder()
          .setCustomId("refreshPage")
          .setLabel("Refresh")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("nextPage")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(currentPage === pages.length - 1)
      );
      await interaction.update({ embeds: [newEmbed], components: [row] });
    });
    client.activeQueueMessagesHandlerRegistered = true;
  }
}

export default {
  name: "queue",
  description:
    "Shows a merged queue with persistent pagination and a Refresh button. Use '.queue <number>' to jump to that track and play it.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("No tracks are currently playing.");
    }

    // Jump Mode: if an argument is provided, jump to that track.
    if (args[0]) {
      const target = Number(args[0]);
      if (isNaN(target)) return message.reply("Please provide a valid number as argument.");
      const historyCount = (player.queue.previous || []).length;
      const merged = getMergedQueue(player);
      let targetIndex;
      if (target < 0) {
        targetIndex = historyCount + target;
      } else if (target === 0) {
        targetIndex = historyCount;
      } else {
        targetIndex = historyCount + target; // For positive numbers, no subtraction of 1.
      }
      if (targetIndex < 0 || targetIndex >= merged.length) {
        return message.reply("That track does not exist in the queue.");
      }
      // Rebuild the queue so that:
      // newHistory = merged.slice(0, targetIndex)
      // newCurrent = merged[targetIndex]
      // newUpcoming = merged.slice(targetIndex + 1)
      const newHistory = merged.slice(0, targetIndex);
      const newCurrent = merged[targetIndex];
      const newUpcoming = merged.slice(targetIndex + 1);
      // player.queue.previous is stored in reverse.
      player.queue.previous = newHistory.slice().reverse();
      player.queue.current = newCurrent;
      player.queue.tracks = newUpcoming;
      await player.play({ clientTrack: newCurrent });
      // Also update the display embed by sending a message.
      return message.channel.send(`Jumped to track number ${args[0]}.`);
    }

    // Display Mode: Show paginated queue.
    const pageSize = 20;
    function getAllLines() {
      return buildQueueLines(player);
    }
    let allLines = getAllLines();
    // The current track is at merged index = historyCount.
    const historyCount = (player.queue.previous || []).length;
    let targetLineIndex = historyCount;
    let currentPage = Math.floor(targetLineIndex / pageSize);
    let pages = chunkArray(allLines, pageSize);
    if (currentPage >= pages.length) currentPage = pages.length - 1;
    if (pages.length === 1) {
      const prefix = client.config.prefix;
      const singleEmbed = buildEmbed(pages[0], 1, 1, prefix);
      await message.channel.send({ embeds: [singleEmbed] });
      logger.debug(`[queue] Single-page queue displayed for Guild="${message.guild.id}"`);
      return;
    }
    const prefix = client.config.prefix;
    let embed = buildEmbed(pages[currentPage], currentPage + 1, pages.length, prefix);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prevPage")
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId("refreshPage")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("nextPage")
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === pages.length - 1)
    );
    const queueMessage = await message.channel.send({
      embeds: [embed],
      components: [row]
    });
    // Register persistent interaction handler.
    if (!client.activeQueueMessages) client.activeQueueMessages = new Map();
    registerQueueInteractionHandler(client);
    // Save state for this message.
    client.activeQueueMessages.set(queueMessage.id, {
      player,
      pages,
      currentPage,
      pageSize,
      message: queueMessage
    });
  }
};
