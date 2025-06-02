// commands/playback/play.js (enhanced version)
// Play command with comprehensive error handling and recovery

import { EmbedBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

// Track retry attempts for failed searches
const searchRetries = new Map();

export default {
  name: "play",
  aliases: ["playm", "playyt"],
  description: "Plays a song or playlist with automatic error recovery.",
  async execute(client, message, args) {
    // Pre-flight checks
    if (!client.lavalinkReady) {
      return message.reply("Lavalink is not ready. Please wait a moment and try again.");
    }

    const userVC = message.member.voice.channel;
    if (!userVC) {
      return message.reply("You must join a voice channel first!");
    }

    // Check bot permissions in voice channel
    const permissions = userVC.permissionsFor(client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return message.reply("I don't have permission to join or speak in that voice channel!");
    }

    const query = args.join(" ").trim();
    if (!query) {
      return message.reply("Please provide a song name or link.");
    }

    // Show loading message for better UX
    const loadingMsg = await message.reply("Searching...");

    try {
      logger.debug(`[play] ${message.author.tag} requested "${query}" in VC=${userVC.id}`);

      // Determine search mode
      const invoked = message.content
        .slice(client.config.prefix.length)
        .split(" ")[0]
        .toLowerCase();
      const forced = invoked === "playm" ? "ytmsearch" : invoked === "playyt" ? "ytsearch" : null;

      const isUrl = /^https?:\/\//.test(query);
      const isSpotify = isUrl && query.includes("spotify.com");
      const mode = isUrl
        ? isSpotify ? "ytmsearch" : "ytsearch"
        : forced || client.config.defaultSearchPlatform;
      const finalQuery = isUrl ? query : `${mode}:${query}`;

      // Get or create player with enhanced error handling
      let player = await getOrCreatePlayer(client, message, userVC);
      if (!player) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("Failed to create music player. Please try again.");
      }

      // Perform search with retry logic
      const searchKey = `${message.guild.id}-${query}`;
      const retryCount = searchRetries.get(searchKey) || 0;

      let res;
      try {
        res = await player.search({ query: finalQuery, source: mode }, message.author);
      } catch (searchError) {
        logger.error("[play] Search error:", searchError);
        
        // Retry with alternative search if first attempt fails
        if (retryCount < 2) {
          searchRetries.set(searchKey, retryCount + 1);
          
          // Try alternative search platform
          const altMode = mode === "ytsearch" ? "ytmsearch" : "ytsearch";
          const altQuery = isUrl ? query : `${altMode}:${query}`;
          
          try {
            res = await player.search({ query: altQuery, source: altMode }, message.author);
            logger.info(`[play] Retry successful with ${altMode}`);
          } catch (retryError) {
            throw retryError;
          }
        } else {
          throw searchError;
        }
      }

      // Clear retry counter on success
      searchRetries.delete(searchKey);

      // Handle search results
      if (!res?.tracks?.length) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("No tracks found for that query. Try a different search term.");
      }

      // Add tracks to queue
      let confirmation = "";
      let addedTracks = [];
      
      if (res.loadType === "playlist" && res.playlist) {
        // Filter out unavailable tracks
        const validTracks = res.tracks.filter(track => 
          track.info.isSeekable !== false && 
          track.info.isStream !== true
        );
        
        if (validTracks.length === 0) {
          await loadingMsg.delete().catch(() => {});
          return message.reply("All tracks in this playlist are unavailable.");
        }
        
        player.queue.add(validTracks);
        addedTracks = validTracks;
        confirmation = `Added **${validTracks.length}** tracks from **${res.playlist.name}** to the queue.`;
        
        if (validTracks.length < res.tracks.length) {
          confirmation += `\n${res.tracks.length - validTracks.length} tracks were unavailable and skipped.`;
        }
      } else {
        const track = res.tracks[0];
        if (track.info.isSeekable === false || track.info.isStream === true) {
          await loadingMsg.delete().catch(() => {});
          return message.reply("This track is not available for playback (might be a livestream or restricted).");
        }
        
        player.queue.add(track);
        addedTracks = [track];
        confirmation = `Added **${track.info.title}** to the queue.`;
      }

      // Delete loading message
      await loadingMsg.delete().catch(() => {});

      // Show confirmation only when something is already playing
      if (player.playing || player.paused) {
        const embed = new EmbedBuilder()
          .setColor("Blurple")
          .setDescription(confirmation)
          .setFooter({ text: `Position in queue: ${player.queue.tracks.length}` });
        
        const confirmMsg = await message.channel.send({ embeds: [embed] });
        
        // Auto-delete confirmation after 10 seconds
        setTimeout(() => {
          confirmMsg.delete().catch(() => {});
        }, 10000);
      }

      // Start playback if idle
      if (!player.playing && !player.paused) {
        try {
          await player.play();
        } catch (playError) {
          logger.error("[play] Playback start error:", playError);
          
          // Try to skip to next track if current fails
          if (player.queue.tracks.length > 0) {
            await player.skip();
          } else {
            return message.channel.send("Failed to start playback. The track might be unavailable.");
          }
        }
      }

      // FIXED: Always update UI so buttons are correct after adding songs
      await sendOrUpdateNowPlayingUI(player, message.channel);

    } catch (error) {
      logger.error("[play] Command error:", error);
      await loadingMsg.delete().catch(() => {});
      
      // Provide user-friendly error messages
      let errorMessage = "An error occurred while processing your request.";
      
      if (error.message?.includes("connect")) {
        errorMessage = "Failed to connect to voice channel. Please check my permissions.";
      } else if (error.message?.includes("search")) {
        errorMessage = "Search service is temporarily unavailable. Please try again later.";
      } else if (error.message?.includes("429")) {
        errorMessage = "Too many requests. Please wait a moment and try again.";
      }
      
      message.reply(errorMessage);
    }
  }
};

// Helper function to get or create player with proper error handling
async function getOrCreatePlayer(client, message, userVC) {
  try {
    let player = client.lavalink.getPlayer(message.guild.id);
    
    // Clean up zombie players
    if (player && !player.playing && !player.paused && player.voiceChannelId !== userVC.id) {
      await player.destroy();
      client.lavalink.players.delete(message.guild.id);
      await new Promise(r => setTimeout(r, 300));
      player = null;
    }

    // Create new player if needed
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: userVC.id,
        textChannelId: message.channel.id,
        selfDeaf: true,
        volume: client.config.defaultVolume || 50
      });
      
      // Connect with timeout
      const connectTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );
      
      await Promise.race([
        player.connect(),
        connectTimeout
      ]);
    } else {
      // Update existing player
      if (player.voiceChannelId !== userVC.id) {
        if (typeof player.setVoiceChannel === "function") {
          await player.setVoiceChannel(userVC.id);
        } else {
          player.voiceChannelId = userVC.id;
        }
        await player.connect();
      } else if (!player.connected) {
        await player.connect();
      }
    }

    // Ensure volume is set
    if (player.volume == null) {
      await player.setVolume(client.config.defaultVolume || 50, false);
    }

    return player;
  } catch (error) {
    logger.error("[getOrCreatePlayer] Error:", error);
    return null;
  }
}

// Cleanup old search retries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of searchRetries.entries()) {
    if (now - timestamp > 300000) { // 5 minutes
      searchRetries.delete(key);
    }
  }
}, 60000); // Every minute