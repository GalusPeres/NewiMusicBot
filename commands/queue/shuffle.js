// commands/shuffle.js
// Command to shuffle the current music queue randomly using the Fisher-Yates algorithm

import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

export default {
  name: "shuffle",
  aliases: ["random"],
  description: "Shuffles the current queue randomly.",
  async execute(client, message, args) {
    const player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      return message.reply("No music is playing in this server.");
    }
    if (!player.queue.tracks || player.queue.tracks.length === 0) {
      return message.reply("There are no upcoming tracks to shuffle.");
    }
    
    // Fisher-Yates shuffle algorithm implementation
    function shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    }
    shuffle(player.queue.tracks);
    
    // Update the Now Playing UI after shuffling
    await sendOrUpdateNowPlayingUI(player, message.channel);
    message.channel.send("Queue shuffled!");
    logger.debug(`[shuffle] Queue shuffled in Guild="${message.guild.id}"`);
  }
};
