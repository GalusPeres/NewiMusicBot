// commands/play.js
// Command to play a track or playlist based on a query or URL

import { formatTrackTitle } from "../utils/formatTrack.js";
import { sendOrUpdateNowPlayingUI } from "../utils/nowPlayingManager.js";
import logger from "../utils/logger.js";

export default {
  name: "play",
  aliases: ["playm", "playyt"],
  description: "Plays a song. Use .playm for YouTube Music search, .playyt for YouTube search. Otherwise, the default platform is used.",
  async execute(client, message, args) {
    // Ensure Lavalink is initialized
    if (!client.lavalinkReady) {
      return message.reply("Lavalink is not initialized yet. Please wait a moment.");
    }
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      logger.debug(`[play] Guild="${message.guild.id}" - User is not in a voice channel.`);
      return message.reply("You must be in a voice channel!");
    }
    const query = args.join(" ").trim();
    if (!query) {
      logger.debug(`[play] Guild="${message.guild.id}" - No query provided.`);
      return message.reply("Please provide a song name or link.");
    }
    
    // Determine if the command alias forces a specific search mode
    const invoked = message.content.slice(client.config.prefix.length).split(" ")[0].toLowerCase();
    let forcedMode = null;
    if (invoked === "playm") forcedMode = "ytmsearch";
    else if (invoked === "playyt") forcedMode = "ytsearch";

    // Determine if the query is a URL and adjust the search mode accordingly
    const isUrl = /^https?:\/\//.test(query);
    const isSpotify = isUrl && query.includes("spotify.com");
    const defaultMode = isUrl ? (isSpotify ? "ytmsearch" : "ytsearch") : (forcedMode || client.config.defaultSearchPlatform);
    const finalQuery = isUrl ? query : `${defaultMode}:${query}`;
    
    // Retrieve or create the player instance for the guild
    let player = client.lavalink.getPlayer(message.guild.id);
    if (!player) {
      logger.debug(`[play] Guild="${message.guild.id}" - Creating new player.`);
      player = await client.lavalink.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: voiceChannel.id,
        textChannelId: message.channel.id,
        selfDeaf: true
      });
      await player.setVolume(50, false);
    }
    if (!player.connected) {
      logger.debug(`[play] Guild="${message.guild.id}" - Connecting player.`);
      await player.connect();
    }
    
    let result;
    try {
      // Search for the track or playlist using Lavalink's search function
      result = await player.search({ query: finalQuery, source: defaultMode }, message.author);
      logger.debug(`[play] Search loadType="${result.loadType}" for Guild="${message.guild.id}"`);
      if (result.tracks[0]) {
        logger.debug(`[play] First track found: "${result.tracks[0].info.title}"`);
      }
    } catch (error) {
      logger.error("[play] Search error:", error);
      return message.reply("An error occurred while searching.");
    }
    
    if (!result || !result.tracks || result.tracks.length === 0) {
      logger.debug(`[play] Guild="${message.guild.id}" - No tracks found.`);
      return message.reply("No tracks found for that query.");
    }
    
    // If a playlist is loaded, add all tracks; otherwise, add a single track
    if (result.loadType === "playlist") {
      result.tracks.forEach(t => (t.requestedAsUrl = false));
      player.queue.add(result.tracks);
      logger.debug(`[play] Playlist added (size=${result.tracks.length}). New queue length: ${player.queue.tracks.length}`);
    } else {
      const track = result.tracks[0];
      track.requestedAsUrl = isSpotify ? false : isUrl;
      player.queue.add(track);
      logger.debug(`[play] Single track added. New queue length: ${player.queue.tracks.length}`);
    }
    
    // Start playback if not already playing
    if (!player.playing && !player.paused) {
      logger.debug(`[play] Guild="${message.guild.id}" - Starting playback.`);
      await player.play();
    }
    // Update the Now Playing UI
    await sendOrUpdateNowPlayingUI(player, message.channel);
  }
};
