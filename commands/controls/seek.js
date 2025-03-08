// commands/seek.js
// Command to seek to a specific time in the current track

import { updateNowPlaying } from "../../utils/updateNowPlaying.js";
import logger from "../../utils/logger.js";

export default {
  name: "seek",
  description: "Jumps to a specific point in the current track. Usage: .seek 2, .seek 3:20, or .seek 1:00:00",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("No track is currently playing.");
    }
    if (!args[0]) {
      return message.reply("Please provide a time to seek to (e.g., 2, 3:20, or 1:00:00).");
    }
    // Split the time input into parts (hours, minutes, seconds)
    const parts = args[0].split(/[:.,;]/).map(Number);
    if (parts.some(isNaN)) {
      return message.reply("Invalid time format. Use m, m:ss, or h:mm:ss.");
    }
    let seekTimeSec = 0;
    // Convert the input parts into seconds
    if (parts.length === 1) {
      seekTimeSec = parts[0] * 60;
    } else if (parts.length === 2) {
      seekTimeSec = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      seekTimeSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      return message.reply("Invalid time format. Use m, m:ss, or h:mm:ss.");
    }
    const trackDurationSec = Math.floor(player.queue.current.info.duration / 1000);
    if (seekTimeSec > trackDurationSec) {
      return message.reply("The specified time is beyond the track duration.");
    }
    try {
      // Convert seconds to milliseconds and seek in the track
      const seekTimeMs = seekTimeSec * 1000;
      await player.seek(seekTimeMs);
      if (player.paused) {
        player._pausedPosition = seekTimeMs;
      }
      // Format the output time for display
      const pad = num => num.toString().padStart(2, "0");
      let outputTime = "";
      if (parts.length === 3 || seekTimeSec >= 3600) {
        const hours = Math.floor(seekTimeSec / 3600);
        const minutes = Math.floor((seekTimeSec % 3600) / 60);
        const seconds = seekTimeSec % 60;
        outputTime = `${hours}:${pad(minutes)}:${pad(seconds)}`;
      } else {
        const minutes = Math.floor(seekTimeSec / 60);
        const seconds = seekTimeSec % 60;
        outputTime = `${minutes}:${pad(seconds)}`;
      }
      message.channel.send(`Seeked to ${outputTime}.`);
      updateNowPlaying(player);
      logger.debug(`[seek] Seeked to ${outputTime} in Guild="${message.guild.id}"`);
    } catch (error) {
      logger.error("[seek] Error seeking in track:", error);
      message.channel.send("An error occurred while seeking.");
    }
  }
};
