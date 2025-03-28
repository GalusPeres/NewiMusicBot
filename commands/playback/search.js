// commands/playback/search.js
// Command to search for multiple tracks and let the user select one via a dropdown menu.
// Uses .search, .searchm (for YouTube Music search), or .searchyt (for YouTube search).
// If the bot is idle (stopped) and in a different voice channel than the user,
// it will disconnect the old player (and remove it) before reconnecting in the user's channel.

import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

export default {
  name: "search",
  aliases: ["searchm", "searchyt"],
  description: "Search for multiple tracks. Use .searchm for YouTube Music search, .searchyt for YouTube search. Default is used otherwise.",
  async execute(client, message, args) {
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

    // Determine if a specific search mode is forced by the command alias
    const invoked = message.content.slice(client.config.prefix.length).split(" ")[0].toLowerCase();
    let forcedMode = null;
    if (invoked === "searchm") forcedMode = "ytmsearch";
    else if (invoked === "searchyt") forcedMode = "ytsearch";
    
    const searchMode = forcedMode || client.config.defaultSearchPlatform;
    
    // Retrieve the player for this guild
    let player = client.lavalink.getPlayer(message.guild.id);
    // Modified robust check:
    // If a player exists, is connected, is in a different voice channel,
    // and is NOT active (not playing and not paused), then disconnect and remove it.
    if (
      player &&
      player.connected &&
      player.voiceChannelId !== voiceChannel.id &&
      !player.playing &&
      !player.paused
    ) {
      logger.debug(`[search] Guild="${message.guild.id}" - Player is idle in a different voice channel. Reconnecting to user's channel.`);
      await player.disconnect();
      client.lavalink.players.delete(message.guild.id);
      await new Promise(resolve => setTimeout(resolve, 500));
      player = null;
    }
    
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: voiceChannel.id,
        textChannelId: message.channel.id,
        selfDeaf: true
      });
      await player.connect();
      await player.setVolume(client.config.defaultVolume || 50, false);
    }
    
    let result;
    try {
      result = await player.search({ query: `${searchMode}:${query}`, source: searchMode }, message.author);
    } catch (error) {
      logger.error("[search] Search error:", error);
      return message.reply("An error occurred while searching.");
    }
    if (!result || !result.tracks || result.tracks.length === 0) {
      return message.reply("No tracks found for that query.");
    }
    
    // Limit results to a maximum of 25 tracks
    const tracks = result.tracks.slice(0, 25);
    const options = tracks.map((track, index) => ({
      label: track.info.title.slice(0, 100),
      description: (track.info.author || "Unknown Author").slice(0, 100),
      value: String(index)
    }));
    
    // Create a dropdown menu for track selection
    const menu = new StringSelectMenuBuilder()
      .setCustomId("searchSelect")
      .setPlaceholder("Select a track")
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(menu);
    
    const selectMsg = await message.channel.send({
      content: "Select a track:",
      components: [row]
    });
    
    // Collect the user's selection (30-second timeout)
    const collector = selectMsg.createMessageComponentCollector({ time: 30000 });
    collector.on("collect", async (interaction) => {
      if (!interaction.isStringSelectMenu() || interaction.customId !== "searchSelect") return;
      const selectedIndex = parseInt(interaction.values[0], 10);
      const chosenTrack = tracks[selectedIndex];
      if (!chosenTrack) {
        await interaction.reply({ content: "Invalid selection.", ephemeral: true });
        return;
      }
      // Add the selected track to the player's queue
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
