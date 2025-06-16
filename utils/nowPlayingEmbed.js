// utils/nowPlayingEmbed.js
// This module generates Discord embeds for the "Now Playing" status and when playback is stopped.

import { EmbedBuilder } from "discord.js";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { formatTrackTitle } from "./formatTrack.js";
import logger from "./logger.js";

// Determine the path to the config file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, "../config/config.json");

let config = {};
try {
  const data = await fs.readFile(configPath, "utf-8");
  config = JSON.parse(data);
} catch (err) {
  if (typeof logger.error === 'function') {
    logger.error("Loading config in nowPlayingEmbed.js", err);
  } else {
    console.error("Loading config in nowPlayingEmbed.js", err);
  }
}

/**
 * Converts milliseconds to a MM:SS format string.
 *
 * @param {number} ms - Time in milliseconds.
 * @returns {string} - Formatted time as "MM:SS".
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Builds a progress bar string to visually represent the playback progress.
 *
 * @param {number} current - Current position in milliseconds.
 * @param {number} total - Total duration in milliseconds.
 * @param {number} barLength - The length of the progress bar (default is 18).
 * @returns {string} - A string representing the progress bar.
 */
function buildProgressBar(current, total, barLength = 18) {
  if (total <= 0) return "";
  const progress = Math.min(Math.floor((current / total) * barLength), barLength);
  const remaining = barLength - progress;
  return `${"▬".repeat(progress)}🔘${"▬".repeat(remaining)}`;
}

/**
 * Truncates a string if it exceeds maxLength characters, appending '...'.
 *
 * @param {string} title - The full track title.
 * @param {number} maxLength - Maximum allowed length before truncation.
 * @returns {string} - Possibly shortened title.
 */
function truncateTitle(title, maxLength = 50) {
  if (title.length > maxLength) {
    return title.slice(0, maxLength - 3) + "...";
  }
  return title;
}

/**
 * Generates an embed displaying the currently playing track along with queue status.
 *
 * @param {Object} player - The Lavalink player instance.
 * @returns {EmbedBuilder|null} - The generated embed or null if no track is playing.
 */
export function generateNowPlayingEmbed(player) {
  const track = player.queue.current;
  if (!track) return null;

  // Use paused position if available; otherwise, use the live position
  const currentPosition = (player.paused && player._pausedPosition !== undefined)
    ? player._pausedPosition
    : player.position;
  const currentTime = formatTime(currentPosition);
  const totalTime = formatTime(track.info.duration);

  // Build a progress line with current time, progress bar, and total time
  const progressLine = `\`${currentTime}\`  ${buildProgressBar(currentPosition, track.info.duration, 18)}  \`${totalTime}\``;

  const displayCount = 10;
  const upcomingCount = player.queue.tracks.length;

  // Create a list of upcoming tracks with numbered entries
  const upcomingList = player.queue.tracks.slice(0, displayCount)
    .map((t, i) => {
      const indexStr = String(i + 1).padStart(2, "0");
      const fullTitle = formatTrackTitle(t.info, t.requestedAsUrl || false);
      const truncatedTitle = truncateTitle(fullTitle, 45);
      return `\u2002\`${indexStr}\`\u2002\`${truncatedTitle}\``;
    })
    .join("\n");

  let queueValue = upcomingList ? "\u200B" + upcomingList : "No additional tracks.";

  // If more tracks exist, show how many remain
  if (upcomingCount > displayCount) {
    const remaining = upcomingCount - displayCount;
    queueValue += `\n\u2002\u2004*… and \`${remaining}\` more track${remaining > 1 ? "s" : ""}.*`;
  }

  // Determine the current status of the player
  const status = player.paused ? "Paused" : player.playing ? "Playing" : "Stopped";
  const prefix = global.config.prefix || ".";
  const footerText = `${status}  •  Use ${prefix}search <song> for multiple results, ${prefix}play <song> to play directly.`;

  // Build and return the embed
  const embed = new EmbedBuilder()
    .setColor("Green")
    .setTitle(formatTrackTitle(track.info, track.requestedAsUrl || false))
    .setDescription(progressLine)
    .addFields({ name: "Queue", value: queueValue })
    .setFooter({ text: footerText });

  if (track.info.artworkUrl) {
    embed.setThumbnail(track.info.artworkUrl);
  }
  return embed;
}

/**
 * Generates an embed indicating that playback has stopped.
 *
 * @returns {EmbedBuilder} - The embed for stopped playback.
 */
export function generateStoppedEmbed() {
  const prefix = global.config.prefix || ".";
  return new EmbedBuilder()
    .setTitle("Playback Stopped")
    .setColor("Red")
    .setFooter({ text: `Stopped  •  Use ${prefix}search <song> for multiple results, ${prefix}play <song> to play directly.` });
}
