// commands/playback/play.js (fixed version)
// Play command with clean and reliable search logic

import { EmbedBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

// Track retry attempts and quality cache for performance
const searchRetries = new Map();
const trackQualityCache = new Map();

export default {
  name: "play",
  aliases: ["playm", "playyt"],
  description: "Plays a song or playlist with optimized buffering and faster starts.",
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

    // Show loading message
    const loadingMsg = await message.reply("Searching...");

    try {
      logger.debug(`[play] ${message.author.tag} requested "${query}" in VC=${userVC.id}`);

      // FIXED: Clean and reliable search mode detection
      const invoked = message.content
        .slice(client.config.prefix.length)
        .split(" ")[0]
        .toLowerCase();

      let mode;
      let forceMode = false;

      // Handle URLs first
      const isUrl = /^https?:\/\//.test(query);
      if (isUrl) {
        const isSpotify = query.includes("spotify.com");
        mode = isSpotify ? "ytmsearch" : "ytsearch";
        forceMode = true;
        logger.debug(`[play] URL detected: ${isSpotify ? 'Spotify' : 'Direct'} → Mode: ${mode}`);
      } else {
        // Handle search commands
        if (invoked === "playm") {
          mode = "ytmsearch";
          forceMode = true;
        } else if (invoked === "playyt") {
          mode = "ytsearch";
          forceMode = true;
        } else {
          mode = client.config.defaultSearchPlatform || "ytsearch";
          forceMode = false;
        }
      }

      const finalQuery = isUrl ? query : `${mode}:${query}`;
      
      // DEBUG LOG - Shows search mode decision process
      logger.debug(`[play] Command: "${invoked}" → Mode: "${mode}" → Forced: ${forceMode} → Query: "${finalQuery}"`);

      // Get or create player with enhanced performance
      let player = await getOrCreatePlayerOptimized(client, message, userVC);
      if (!player) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("Failed to create music player. Please try again.");
      }

      // Pre-warm the player if idle for faster start
      if (!player.playing && !player.paused) {
        await preWarmPlayer(player);
      }

      // Perform search with reliable logic (NO AUTOMATIC RETRY TO OTHER PLATFORM)
      const res = await performReliableSearch(player, finalQuery, mode, message.author, query, forceMode);
      if (!res) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("No tracks found for that query. Try a different search term.");
      }

      // Process results with quality filtering
      const { tracks, confirmation } = await processSearchResults(res);
      if (!tracks.length) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("All found tracks are unavailable.");
      }

      // Add tracks to queue
      player.queue.add(tracks);

      // Delete loading message
      await loadingMsg.delete().catch(() => {});

      // Show confirmation only when something is already playing
      if (player.playing || player.paused) {
        const embed = new EmbedBuilder()
          .setColor("Blurple")
          .setDescription(confirmation)
          .setFooter({ text: `Position in queue: ${player.queue.tracks.length}` });
        
        const confirmMsg = await message.channel.send({ embeds: [embed] });
        
        // Auto-delete confirmation after 8 seconds
        setTimeout(() => {
          confirmMsg.delete().catch(() => {});
        }, 8000);
      }

      // Start playback with optimized timing if idle
      if (!player.playing && !player.paused) {
        try {
          player._requestTimestamp = Date.now();
          if (client.perfMonitor) client.perfMonitor.recordRequest(message.guild.id);
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

      // Fast UI update for immediate feedback
      setTimeout(() => {
        sendOrUpdateNowPlayingUI(player, message.channel).catch(err => 
          logger.warn("UI update failed:", err)
        );
      }, 100);

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

// Pre-warm player for faster start
async function preWarmPlayer(player) {
  try {
    // Set optimal volume early
    const targetVolume = player.volume || global.config.defaultVolume || 50;
    if (player.volume !== targetVolume) {
      await player.setVolume(targetVolume, false);
    }
    
    // Ensure connection is stable
    if (!player.connected) {
      await player.connect();
    }
    
    logger.debug(`[preWarmPlayer] Player pre-warmed for guild ${player.guildId}`);
  } catch (error) {
    logger.warn("[preWarmPlayer] Failed to pre-warm player:", error);
  }
}

// FIXED: Reliable search without automatic platform switching
async function performReliableSearch(player, finalQuery, mode, author, originalQuery, forceMode) {
  const searchKey = `${player.guildId}-${originalQuery}`;
  const retryCount = searchRetries.get(searchKey) || 0;

  // FIXED: Cache key includes mode to separate YouTube vs YouTube Music results
  const cacheKey = `${mode}:${originalQuery}`;
  const cached = trackQualityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < (global.config.cacheTTL * 1000 || 300000)) {
    logger.debug(`[performReliableSearch] Using cached result for ${cacheKey}`);
    return cached.result;
  }

  let res;
  try {
    res = await player.search({ query: finalQuery, source: mode }, author);
    
    // Cache good results with mode-specific key
    if (res?.tracks?.length && global.config.cacheSearchResults !== false) {
      trackQualityCache.set(cacheKey, {
        result: res,
        timestamp: Date.now()
      });
      logger.debug(`[performReliableSearch] Cached result for ${cacheKey}`);
    }
    
    logger.debug(`[performReliableSearch] Search successful with ${mode}: ${res?.tracks?.length || 0} tracks`);
  } catch (searchError) {
    logger.error(`[performReliableSearch] Search error with ${mode}:`, searchError);
    
    // ONLY retry with alternative platform if mode was not forced and we haven't retried yet
    if (!forceMode && retryCount < 1) {
      searchRetries.set(searchKey, retryCount + 1);
      
      // Try alternative search platform ONLY if not forced
      const altMode = mode === "ytsearch" ? "ytmsearch" : "ytsearch";
      const altQuery = `${altMode}:${originalQuery}`;
      
      logger.info(`[performReliableSearch] Trying fallback search with ${altMode}`);
      
      try {
        res = await player.search({ query: altQuery, source: altMode }, author);
        logger.info(`[performReliableSearch] Fallback successful with ${altMode}: ${res?.tracks?.length || 0} tracks`);
      } catch (retryError) {
        logger.error(`[performReliableSearch] Fallback also failed:`, retryError);
        throw retryError;
      }
    } else {
      // If forced mode or already retried, don't try alternatives
      if (forceMode) {
        logger.warn(`[performReliableSearch] Forced mode ${mode} failed, not trying alternatives`);
      }
      throw searchError;
    }
  }

  // Clear retry counter on success
  searchRetries.delete(searchKey);
  return res;
}

// Filter tracks by quality and availability
async function processSearchResults(res) {
  if (!res?.tracks?.length) return { tracks: [], confirmation: "" };

  let tracks = [];
  let confirmation = "";

  if (res.loadType === "playlist" && res.playlist) {
    // Filter and sort by quality for playlists
    const validTracks = res.tracks
      .filter(track => isTrackPlayable(track))
      .sort((a, b) => getTrackQualityScore(b) - getTrackQualityScore(a))
      .slice(0, global.config.maxPlaylistSize || 50); // Limit for performance
    
    tracks = validTracks;
    confirmation = `Added **${validTracks.length}** tracks from **${res.playlist.name}** to the queue.`;
    
    if (validTracks.length < res.tracks.length) {
      confirmation += `\n${res.tracks.length - validTracks.length} tracks were unavailable and skipped.`;
    }
  } else {
    const track = res.tracks[0];
    if (isTrackPlayable(track)) {
      tracks = [track];
      confirmation = `Added **${track.info.title}** to the queue.`;
    }
  }

  return { tracks, confirmation };
}

// Check if track is playable with quality filters - RELAXED FILTERS
function isTrackPlayable(track) {
  if (!track || !track.info) return false;
  
  // Only filter livestreams, not isSeekable
  if (track.info.isStream === true) {
    return false;
  }
  
  // Relaxed duration filters
  const duration = track.info.duration;
  if (duration < 3000 || duration > 7200000) { // 3s - 2h
    return false;
  }
  
  return true; // Allow everything else
}

// Rate track quality for sorting
function getTrackQualityScore(track) {
  let score = 0;
  
  // Prefer higher quality sources
  if (track.info.sourceName === "youtube") score += 10;
  if (track.info.sourceName === "soundcloud") score += 5;
  
  // Prefer tracks with artwork
  if (track.info.artworkUrl) score += 2;
  
  // Prefer tracks with reasonable duration
  const duration = track.info.duration;
  if (duration >= 30000 && duration <= 600000) score += 5; // 30s - 10min
  
  // Prefer tracks with complete metadata
  if (track.info.author && track.info.author !== "Unknown") score += 3;
  
  return score;
}

// Enhanced player creation with performance optimizations - VOICE CHANNEL FIX
async function getOrCreatePlayerOptimized(client, message, userVC) {
  try {
    let player = client.lavalink.getPlayer(message.guild.id);
    
    // FIXED: Better voice channel switching logic
    if (player && player.voiceChannelId !== userVC.id) {
      logger.debug(`[getOrCreatePlayerOptimized] Voice channel switch: ${player.voiceChannelId} → ${userVC.id}`);
      
      // If player is idle, destroy and recreate (safer than switching)
      if (!player.playing && !player.paused) {
        await player.destroy();
        client.lavalink.players.delete(message.guild.id);
        await new Promise(r => setTimeout(r, 800)); // LONGER WAIT for cleanup
        player = null;
      } else {
        // If playing, try to switch voice channel
        try {
          player.voiceChannelId = userVC.id;
          await player.connect();
        } catch (switchError) {
          logger.warn(`[getOrCreatePlayerOptimized] Voice switch failed, recreating player:`, switchError);
          await player.destroy();
          client.lavalink.players.delete(message.guild.id);
          await new Promise(r => setTimeout(r, 800));
          player = null;
        }
      }
    }

    // Create new player if needed
    if (!player) {
      player = await client.lavalink.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: userVC.id,
        textChannelId: message.channel.id,
        selfDeaf: true,
        volume: client.config.defaultVolume || 50,
        // Additional performance options
        instaUpdateFiltersFix: true,
        applyVolumeAsFilter: false
      });
      
      // FIXED: Better connection with retry
      const connectTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), client.config.connectionTimeout || 7000)
      );
      
      try {
        await Promise.race([player.connect(), connectTimeout]);
        logger.debug(`[getOrCreatePlayerOptimized] Successfully connected to ${userVC.id}`);
      } catch (connectError) {
        logger.error(`[getOrCreatePlayerOptimized] Connection failed, retrying once:`, connectError);
        // ONE RETRY
        await new Promise(r => setTimeout(r, 1000));
        await player.connect();
      }
    } else if (!player.connected) {
      // Reconnect if disconnected
      await player.connect();
    }

    // Ensure volume is set optimally
    const targetVolume = client.config.defaultVolume || 50;
    if (player.volume == null || player.volume !== targetVolume) {
      await player.setVolume(targetVolume, false);
    }

    // FIXED: Always update textChannelId to current channel
    player.textChannelId = message.channel.id;

    return player;
  } catch (error) {
    logger.error("[getOrCreatePlayerOptimized] Error:", error);
    return null;
  }
}

// Cleanup old cache entries periodically for memory management
setInterval(() => {
  const now = Date.now();
  const maxCacheSize = global.config.maxCacheSize || 500;
  const cacheEntries = Array.from(trackQualityCache.entries());
  
  // Remove old entries by timestamp
  for (const [key, data] of cacheEntries) {
    if (now - data.timestamp > (global.config.cacheTTL * 1000 || 600000)) { // 10 minutes default
      trackQualityCache.delete(key);
      logger.debug(`[cleanup] Removed expired cache entry: ${key}`);
    }
  }
  
  // Limit cache size by removing oldest entries
  if (cacheEntries.length > maxCacheSize) {
    const sortedEntries = cacheEntries
      .sort((a, b) => a[1].timestamp - b[1].timestamp) // Oldest first
      .slice(0, cacheEntries.length - maxCacheSize); // Take excess entries
    
    for (const [key] of sortedEntries) {
      trackQualityCache.delete(key);
      logger.debug(`[cleanup] Removed cache entry due to size limit: ${key}`);
    }
  }
  
  // Clean up retry attempts older than 5 minutes
  for (const [key, timestamp] of searchRetries.entries()) {
    if (now - timestamp > 300000) { // 5 minutes
      searchRetries.delete(key);
    }
  }
}, 120000); // Every 2 minutes
