// commands/playback/search.js (performance optimized version)
// Search command with enhanced performance and faster track selection

import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

// Track retry attempts and quality cache for performance (shared with play.js)
const searchRetries = new Map();
const trackQualityCache = new Map();
const activeSelections = new Map(); // Track active selection menus

export default {
  name: "search",
  aliases: ["searchm", "searchyt"],
  description: "Searches for multiple tracks with optimized performance and quality filtering.",
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
      return message.reply("Please provide a search term!");
    }

    // Check if user already has an active selection
    if (activeSelections.has(message.author.id)) {
      return message.reply("You already have an active search selection. Please complete it first.");
    }

    // Show loading message
    const loadingMsg = await message.reply("Searching...");

    try {
      logger.debug(`[search] ${message.author.tag} requested "${query}" in VC=${userVC.id}`);

      // Determine search mode
      const invoked = message.content
        .slice(client.config.prefix.length)
        .split(" ")[0]
        .toLowerCase();
      const forced = invoked === "searchm" ? "ytmsearch" : invoked === "searchyt" ? "ytsearch" : null;
      const mode = forced || client.config.defaultSearchPlatform;

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

      // Perform search with caching and quality checking
      const res = await performOptimizedSearch(player, `${mode}:${query}`, mode, message.author, query);
      if (!res) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("No tracks found. Try a different search term.");
      }

      // Filter out unavailable tracks and sort by quality
      const validTracks = res.tracks
        .filter(track => isTrackPlayable(track))
        .sort((a, b) => getTrackQualityScore(b) - getTrackQualityScore(a))
        .slice(0, client.config?.maxSearchResults || 25);

      if (validTracks.length === 0) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("All found tracks are unavailable (might be livestreams or restricted).");
      }

      // Build select menu options with better formatting
      const options = validTracks.map((t, i) => {
        const title = truncateString(t.info.title, 100);
        const author = truncateString(t.info.author || "Unknown", 100);
        const duration = formatDuration(t.info.duration);
        
        return {
          label: title,
          description: `${author} • ${duration}`,
          value: String(i)
        };
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("searchSelect")
        .setPlaceholder("Select a track to play")
        .addOptions(options);
      
      const row = new ActionRowBuilder().addComponents(menu);

      // Delete loading message and show select menu
      await loadingMsg.delete().catch(() => {});
      
      const selectMsg = await message.channel.send({
        content: `Found **${validTracks.length}** tracks. Select one:`,
        components: [row]
      });

      // Mark user as having active selection
      activeSelections.set(message.author.id, {
        messageId: selectMsg.id,
        tracks: validTracks,
        player: player,
        timestamp: Date.now()
      });

      // Handle user selection with enhanced timeout and error handling
      const collector = selectMsg.createMessageComponentCollector({ 
        filter: i => i.user.id === message.author.id,
        time: 30000 
      });

      let responded = false;

      collector.on("collect", async interaction => {
        if (!interaction.isStringSelectMenu() || interaction.customId !== "searchSelect") return;
        
        responded = true;
        activeSelections.delete(message.author.id);

        try {
          const idx = Number(interaction.values[0]);
          const chosen = validTracks[idx];
          
          if (!chosen) {
            return interaction.reply({ content: "Invalid selection.", ephemeral: true });
          }

          // Add track to queue with immediate feedback
          player.queue.add(chosen);

          // Show confirmation only if music is already playing
          if (player.playing || player.paused) {
            const embed = new EmbedBuilder()
              .setColor("Blurple")
              .setDescription(`Added **${chosen.info.title}** to the queue.`)
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
              await player.play();
            } catch (playError) {
              logger.error("[search] Playback start error:", playError);
              
              // Try to skip to next track if current fails
              if (player.queue.tracks.length > 0) {
                await player.skip();
              } else {
                message.channel.send("Failed to start playback. The track might be unavailable.");
              }
            }
          }

          await interaction.deferUpdate();
          selectMsg.delete().catch(() => {});
          
          // Fast UI update for immediate feedback
          setTimeout(() => {
            sendOrUpdateNowPlayingUI(player, message.channel, true).catch(err => 
              logger.warn("UI update failed:", err)
            );
          }, 100);

        } catch (error) {
          logger.error("[search] Selection handling error:", error);
          await interaction.reply({ 
            content: "An error occurred while processing your selection.", 
            ephemeral: true 
          });
        }
      });

      collector.on("end", (_, reason) => {
        activeSelections.delete(message.author.id);
        
        if (reason === "time" && !responded) {
          selectMsg.delete().catch(() => {});
          message.channel.send("Search timed out. Please try again.")
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
      });

    } catch (error) {
      logger.error("[search] Command error:", error);
      await loadingMsg.delete().catch(() => {});
      activeSelections.delete(message.author.id);
      
      // Provide user-friendly error messages
      let errorMessage = "An error occurred while searching.";
      
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

// Pre-warm player for faster start (shared with play.js)
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

// Enhanced search with caching and quality checking (shared with play.js)
async function performOptimizedSearch(player, finalQuery, mode, author, originalQuery) {
  const searchKey = `${player.guildId}-${originalQuery}`;
  const retryCount = searchRetries.get(searchKey) || 0;

  // Check cache first for performance
  const cached = trackQualityCache.get(originalQuery);
  if (cached && Date.now() - cached.timestamp < (global.config.cacheTTL * 1000 || 300000)) {
    logger.debug("[performOptimizedSearch] Using cached result");
    return cached.result;
  }

  let res;
  try {
    res = await player.search({ query: finalQuery, source: mode }, author);
    
    // Cache good results for future use
    if (res?.tracks?.length && global.config.cacheSearchResults !== false) {
      trackQualityCache.set(originalQuery, {
        result: res,
        timestamp: Date.now()
      });
    }
  } catch (searchError) {
    logger.error("[performOptimizedSearch] Search error:", searchError);
    
    // Retry with alternative search if first attempt fails
    if (retryCount < 2) {
      searchRetries.set(searchKey, retryCount + 1);
      
      // Try alternative search platform
      const altMode = mode === "ytsearch" ? "ytmsearch" : "ytsearch";
      const altQuery = finalQuery.replace(mode, altMode);
      
      try {
        res = await player.search({ query: altQuery, source: altMode }, author);
        logger.info(`[performOptimizedSearch] Retry successful with ${altMode}`);
      } catch (retryError) {
        throw retryError;
      }
    } else {
      throw searchError;
    }
  }

  // Clear retry counter on success
  searchRetries.delete(searchKey);
  return res;
}

// Check if track is playable with quality filters (shared with play.js)
function isTrackPlayable(track) {
  if (!track || !track.info) return false;
  
  // Basic availability checks
  if (track.info.isSeekable === false || track.info.isStream === true) {
    return false;
  }
  
  // Duration checks (skip very short or very long tracks)
  const duration = track.info.duration;
  if (duration < 10000 || duration > 3600000) { // 10s - 1h
    return false;
  }
  
  // Additional quality checks
  if (track.info.title?.toLowerCase().includes("unavailable")) {
    return false;
  }
  
  return true;
}

// Rate track quality for sorting (shared with play.js)
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
  
  // Bonus for exact title matches (for search results)
  const titleWords = track.info.title.toLowerCase().split(' ');
  if (titleWords.length >= 2) score += 1;
  
  return score;
}

// Enhanced player creation with performance optimizations (shared with play.js)
async function getOrCreatePlayerOptimized(client, message, userVC) {
  try {
    let player = client.lavalink.getPlayer(message.guild.id);
    
    // Clean up zombie players efficiently
    if (player && !player.playing && !player.paused && player.voiceChannelId !== userVC.id) {
      await player.destroy();
      client.lavalink.players.delete(message.guild.id);
      await new Promise(r => setTimeout(r, 100)); // Shorter wait for faster response
      player = null;
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
      
      // Connect with shorter timeout for faster response
      const connectTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), client.config.connectionTimeout || 7000)
      );
      
      await Promise.race([player.connect(), connectTimeout]);
    } else {
      // Update existing player efficiently
      if (player.voiceChannelId !== userVC.id) {
        player.voiceChannelId = userVC.id;
        await player.connect();
      } else if (!player.connected) {
        await player.connect();
      }
    }

    // Ensure volume is set optimally
    const targetVolume = client.config.defaultVolume || 50;
    if (player.volume == null || player.volume !== targetVolume) {
      await player.setVolume(targetVolume, false);
    }

    return player;
  } catch (error) {
    logger.error("[getOrCreatePlayerOptimized] Error:", error);
    return null;
  }
}

// Utility functions for better formatting
function truncateString(str, maxLength) {
  if (!str) return "Unknown";
  return str.length > maxLength ? str.slice(0, maxLength - 3) + "..." : str;
}

function formatDuration(ms) {
  if (!ms || ms < 1000) return "0:00";
  
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Cleanup old cache entries and active selections periodically
setInterval(() => {
  const now = Date.now();
  const maxCacheSize = global.config.maxCacheSize || 500;
  const cacheEntries = Array.from(trackQualityCache.entries());
  
  // Remove old cache entries
  for (const [key, data] of cacheEntries) {
    if (now - data.timestamp > (global.config.cacheTTL * 1000 || 600000)) { // 10 minutes default
      trackQualityCache.delete(key);
    }
  }
  
  // Limit cache size
  if (cacheEntries.length > maxCacheSize) {
    const sortedEntries = cacheEntries
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(maxCacheSize);
    
    for (const [key] of sortedEntries) {
      trackQualityCache.delete(key);
    }
  }
  
  // Clean up retry attempts
  for (const [key, timestamp] of searchRetries.entries()) {
    if (now - timestamp > 300000) { // 5 minutes
      searchRetries.delete(key);
    }
  }
  
  // Clean up stale active selections (older than 2 minutes)
  for (const [userId, data] of activeSelections.entries()) {
    if (now - data.timestamp > 120000) { // 2 minutes
      activeSelections.delete(userId);
      logger.debug(`[search] Cleaned up stale selection for user ${userId}`);
    }
  }
}, 120000); // Every 2 minutes