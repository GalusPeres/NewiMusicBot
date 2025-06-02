// commands/playback/search.js (enhanced version)
// Search command with comprehensive error handling and recovery

import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from "discord.js";
import { sendOrUpdateNowPlayingUI } from "../../utils/nowPlayingManager.js";
import logger from "../../utils/logger.js";

// Track retry attempts for failed searches
const searchRetries = new Map();

export default {
  name: "search",
  aliases: ["searchm", "searchyt"],
  description: "Searches for multiple tracks with automatic error recovery.",
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
        res = await player.search({ query: `${mode}:${query}`, source: mode }, message.author);
      } catch (searchError) {
        logger.error("[search] Search error:", searchError);
        
        // Retry with alternative search if first attempt fails
        if (retryCount < 2) {
          searchRetries.set(searchKey, retryCount + 1);
          
          // Try alternative search platform
          const altMode = mode === "ytsearch" ? "ytmsearch" : "ytsearch";
          
          try {
            res = await player.search({ query: `${altMode}:${query}`, source: altMode }, message.author);
            logger.info(`[search] Retry successful with ${altMode}`);
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
        return message.reply("No tracks found. Try a different search term.");
      }

      // Filter out unavailable tracks
      const validTracks = res.tracks.filter(track => 
        track.info.isSeekable !== false && 
        track.info.isStream !== true
      ).slice(0, 25);

      if (validTracks.length === 0) {
        await loadingMsg.delete().catch(() => {});
        return message.reply("All found tracks are unavailable (might be livestreams or restricted).");
      }

      // Build select menu options
      const options = validTracks.map((t, i) => ({
        label: t.info.title.slice(0, 100),
        description: (t.info.author || "Unknown").slice(0, 100),
        value: String(i)
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId("searchSelect")
        .setPlaceholder("Select a track")
        .addOptions(options);
      
      const row = new ActionRowBuilder().addComponents(menu);

      // Delete loading message and show select menu
      await loadingMsg.delete().catch(() => {});
      
      const selectMsg = await message.channel.send({
        content: `Found ${validTracks.length} tracks. Select one:`,
        components: [row]
      });

      // Handle user selection with timeout
      const collector = selectMsg.createMessageComponentCollector({ 
        filter: i => i.user.id === message.author.id,
        time: 30000 
      });

      let responded = false;

      collector.on("collect", async interaction => {
        if (!interaction.isStringSelectMenu() || interaction.customId !== "searchSelect") return;
        
        responded = true;

        try {
          const idx = Number(interaction.values[0]);
          const chosen = validTracks[idx];
          
          if (!chosen) {
            return interaction.reply({ content: "Invalid selection.", ephemeral: true });
          }

          // Add track to queue
          player.queue.add(chosen);

          // Show confirmation only if music is already playing
          if (player.playing || player.paused) {
            const embed = new EmbedBuilder()
              .setColor("Blurple")
              .setDescription(`Added **${chosen.info.title}** to the queue.`)
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
          
          // FIXED: Always update UI so buttons are correct after adding songs
          await sendOrUpdateNowPlayingUI(player, message.channel);

        } catch (error) {
          logger.error("[search] Selection handling error:", error);
          await interaction.reply({ 
            content: "An error occurred while processing your selection.", 
            ephemeral: true 
          });
        }
      });

      collector.on("end", (_, reason) => {
        if (reason === "time" && !responded) {
          selectMsg.delete().catch(() => {});
          message.channel.send("Search timed out. Please try again.")
            .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
      });

    } catch (error) {
      logger.error("[search] Command error:", error);
      await loadingMsg.delete().catch(() => {});
      
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