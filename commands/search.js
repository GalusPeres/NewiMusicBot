// commands/search.js
// Command to search for multiple tracks and let the user select one via a dropdown menu

import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../utils/nowPlayingManager.js";
import logger from "../utils/logger.js";

export default {
  name: "search",
  aliases: ["searchm", "searchyt"],
  description: "Search for multiple tracks. Use .searchm for YouTube Music search, .searchyt for YouTube search. Default is used otherwise.",
  async execute(client, message, args) {
    // Ensure Lavalink is ready before searching
    if (!client.lavalinkReady) {
      return message.reply("Lavalink is not initialized yet. Please wait a moment.");
    }
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply("You must be in a voice channel!");
    }
    const query = args.join(" ").trim();
    if (!query) {
      return message.reply("Please provide a search term!");
    }

    // Determine search mode based on command alias
    const invoked = message.content.slice(client.config.prefix.length).split(" ")[0].toLowerCase();
    let forcedMode = null;
    if (invoked === "searchm") forcedMode = "ytmsearch";
    else if (invoked === "searchyt") forcedMode = "ytsearch";

    // Use forced mode or fallback to default search platform from config
    const searchMode = forcedMode || client.config.defaultSearchPlatform;
    
    // Retrieve or create the player for this guild
    let player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: voiceChannel.id,
        textChannelId: message.channel.id,
        selfDeaf: true
      });
      await player.connect();
      // Set volume to the configured defaultVolume, fallback to 50
      await player.setVolume(client.config.defaultVolume || 50, false);
    }
    
    let result;
    try {
      // Perform the search using Lavalink
      result = await player.search({ query: `${searchMode}:${query}`, source: searchMode }, message.author);
    } catch (error) {
      logger.error("[search] Search error:", error);
      return message.reply("An error occurred while searching.");
    }
    if (!result || !result.tracks || result.tracks.length === 0) {
      return message.reply("No tracks found for that query.");
    }
    
    // Limit results to the first 25 tracks
    const tracks = result.tracks.slice(0, 25);
    const options = tracks.map((track, index) => ({
      label: track.info.title.slice(0, 100),
      description: (track.info.author || "Unknown Author").slice(0, 100),
      value: String(index)
    }));
    
    // Build a dropdown menu using Discord's select menu
    const menu = new StringSelectMenuBuilder()
      .setCustomId("searchSelect")
      .setPlaceholder("Select a track")
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(menu);
    
    // Send the menu to the channel
    const selectMsg = await message.channel.send({
      content: "Select a track:",
      components: [row]
    });
    
    // Create a collector to handle the user's selection for 30 seconds
    const collector = selectMsg.createMessageComponentCollector({ time: 30000 });
    collector.on("collect", async (interaction) => {
      if (!interaction.isStringSelectMenu() || interaction.customId !== "searchSelect") return;
      const selectedIndex = parseInt(interaction.values[0], 10);
      const chosenTrack = tracks[selectedIndex];
      if (!chosenTrack) {
        await interaction.reply({ content: "Invalid selection.", ephemeral: true });
        return;
      }
      // Add the chosen track to the player's queue
      player.queue.add(chosenTrack);
      if (!player.playing && !player.paused) {
        await player.play();
      }
      await interaction.deferUpdate();
      selectMsg.delete().catch(() => {});
      await sendOrUpdateNowPlayingUI(player, message.channel);
      logger.debug(`[search] Track selected and added to queue in Guild="${message.guild.id}"`);
    });
    
    collector.on("end", (_collected, reason) => {
      if (reason === "time") {
        selectMsg.delete().catch(() => {});
      }
    });
  }
};
