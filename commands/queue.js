// commands/queue.js
// Command to display the current music queue and track history

import { EmbedBuilder } from "discord.js";
import { formatTrackTitle } from "../utils/formatTrack.js";
import logger from "../utils/logger.js";

export default {
  name: "queue",
  description: "Shows the current music queue and track history.",
  async execute(client, message) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player || !player.queue.current) {
      return message.reply("No tracks are currently playing.");
    }
    
    // Current track that is playing
    const current = player.queue.current;
    
    // Format the next up to 10 tracks in the queue
    const upcoming = player.queue.tracks.slice(0, 10)
      .map((track, index) => `${index + 1}. ${formatTrackTitle(track.info, track.requestedAsUrl)}`)
      .join("\n") || "No upcoming tracks.";
    
    // Format the last 10 tracks from the history
    const history = (player.queue.previous || [])
      .slice(-10)
      .reverse()
      .map((track, index) => `${index + 1}. ${formatTrackTitle(track.info, track.requestedAsUrl)}`)
      .join("\n") || "No previous tracks.";

    // Create an embed to display the queue and history
    const embed = new EmbedBuilder()
      .setTitle("Current Queue")
      .setColor("Green")
      .setDescription(`**Now Playing:** ${formatTrackTitle(current.info, current.requestedAsUrl)}`)
      .addFields(
        { name: "Upcoming Tracks", value: upcoming },
        { name: "History", value: history }
      );

    message.channel.send({ embeds: [embed] });
    logger.debug(`[queue] Queue displayed for Guild="${message.guild.id}"`);
  }
};
