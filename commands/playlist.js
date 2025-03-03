// commands/playlist.js
// Displays a merged playlist (history, current track, upcoming) in a paginated embed with sequential numbering.
// You can use ".playlist 16" (or ".list 16") to jump to that track and play it.
// In Jump Mode the target track is immediately played and the merged playlist remains in chronological order.
// In Display Mode, the embed is shown with persistent navigation buttons.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { formatTrackTitle } from "../utils/formatTrack.js";
import logger from "../utils/logger.js";

// Helper: Truncate a string if it exceeds maxLength characters.
function truncateTitle(title, maxLength = 45) {
  return title.length > maxLength
    ? title.slice(0, maxLength - 3) + "..."
    : title;
}

// Helper: Returns the merged playlist as an array of track objects in display order.
// Display order: all history (oldest first), then current track, then upcoming tracks.
function getMergedPlaylist(player) {
  const history = (player.queue.previous || []).slice().reverse();
  const current = player.queue.current;
  const upcoming = player.queue.tracks.slice();
  return [...history, current, ...upcoming];
}

// Helper: Build the merged display lines for the playlist command.
// All entries are numbered sequentially (1-based). The current track is marked with "Now" before its number.
function buildPlaylistLines(player) {
  const merged = getMergedPlaylist(player);
  const lines = [];
  merged.forEach((track, i) => {
    const num = (i + 1).toString().padStart(2, "0"); // 1-based numbering
    const rawTitle = formatTrackTitle(track.info, track.requestedAsUrl);
    const title = truncateTitle(rawTitle, 45);
    if (track === player.queue.current) {
      // For the current track: no extra indentation before the number, "Now" is prefixed.
      lines.push(`\u2009\u200A\u200A**Now**\u2002\`${num}\`\u2002\`${title}\``);
    } else {
      lines.push(`\u2002\`${num}\`\u2002\`${title}\``);
    }
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
  logger.debug(`Building embed: Page ${pageNumber} of ${totalPages}`);
  return new EmbedBuilder()
    .setTitle("Current Playlist")
    .setColor("Blue")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `Page ${pageNumber} / ${totalPages}\u2002•\u2002Use "${prefix}playlist <number>" to jump to a track.`
    });
}

// (Der Rest des Codes bleibt unverändert)

export default {
  name: "playlist",
  aliases: ["list"],
  description:
    "Shows a merged playlist with persistent pagination and a Refresh button. Use '.playlist <number>' to jump to that track and play it. The list is sequentially numbered.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("No tracks are currently playing.");
    }
    logger.debug("Executing playlist command.");
    // Jump Mode: If an argument is provided, jump to that track.
    if (args[0]) {
      const target = Number(args[0]);
      if (isNaN(target))
        return message.reply("Please provide a valid number as argument.");
      const merged = getMergedPlaylist(player);
      const targetIndex = target - 1; // Convert 1-based number to 0-based index.
      if (targetIndex < 0 || targetIndex >= merged.length) {
        return message.reply("That track does not exist in the playlist.");
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
      logger.debug("Jumped to track number " + args[0]);
      return message.channel.send(`Jumped to track number ${args[0]}.`);
    }
    // Display Mode: Show paginated playlist.
    const pageSize = 20;
    const allLines = buildPlaylistLines(player);
    // Find the sequential index (0-based) of the current track.
    const merged = getMergedPlaylist(player);
    const currentIndex = merged.findIndex(
      (track) => track === player.queue.current
    );
    let currentPage = Math.floor(currentIndex / pageSize);
    let pages = chunkArray(allLines, pageSize);
    if (currentPage >= pages.length) currentPage = pages.length - 1;
    if (pages.length === 1) {
      const prefix = client.config.prefix;
      const singleEmbed = buildEmbed(pages[0], 1, 1, prefix);
      await message.channel.send({ embeds: [singleEmbed] });
      logger.debug("Single-page playlist displayed.");
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
    const playlistMessage = await message.channel.send({
      embeds: [embed],
      components: [row]
    });
    if (!client.activePlaylistMessages) client.activePlaylistMessages = new Map();
    registerPlaylistInteractionHandler(client);
    client.activePlaylistMessages.set(playlistMessage.id, {
      player,
      pages,
      currentPage,
      pageSize,
      message: playlistMessage
    });
    logger.debug("Playlist command executed successfully.");
  }
};
