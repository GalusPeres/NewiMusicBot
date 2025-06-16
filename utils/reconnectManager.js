// utils/reconnectManager.js
// Enhanced Lavalink reconnection manager with intelligent voice channel handling

import logger from "./logger.js";
import { performStop } from "./playerControls.js";
import { generateStoppedEmbed } from "./nowPlayingEmbed.js";
import { safeEdit } from "./safeDiscord.js";
import { getVoiceConnection } from "@discordjs/voice";

class LavalinkReconnectManager {
  constructor(client) {
    this.client = client;
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.lastHealthCheck = Date.now();
    this.isCleaningUp = false;
    this.healthCheckInterval = null;
    this.quickHealthCheckInterval = null;
  }

  initialize() {
    if (!this.client.lavalink) return;

    // Enhanced error handling - prevent unhandled errors
    this.client.lavalink.nodeManager.on("error", (err, node) => {
      if (node && node.id) {
        logger.error(`[LavalinkReconnect] NodeManager error on ${node.id}:`, err);
        // Trigger cleanup on node errors
        if (!node.connected) {
          this._handleLavalinkDown(node, "NodeManager error");
        }
      } else {
        logger.error(`[LavalinkReconnect] NodeManager error (no node provided):`, err);
      }
    });

    // Multiple disconnect event handlers for reliability
    this.client.lavalink.on("nodeDisconnect", (node, reason) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} disconnected: ${reason}`);
      this._handleLavalinkDown(node, `nodeDisconnect: ${reason}`);
    });

    // Handle node errors as potential disconnects
    this.client.lavalink.on("nodeError", (node, error) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} error:`, error);
      if (!node.connected) {
        this._handleLavalinkDown(node, `nodeError: ${error.message}`);
      }
    });

    // Handle node destroy events
    this.client.lavalink.on("nodeDestroy", (node) => {
      logger.warn(`[LavalinkReconnect] Node ${node.id} destroyed`);
      this._handleLavalinkDown(node, "nodeDestroy");
    });

    // Handle successful reconnections
    this.client.lavalink.on("nodeConnect", node => {
      logger.info(`[LavalinkReconnect] Node ${node.id} reconnected successfully`);
      this.reconnectAttempts.delete(node.id);
      this.lastHealthCheck = Date.now();
      // Don't restore player states - let users manually restart music
    });

    // Start health monitoring
    this.startHealthMonitoring();

    logger.info("[LavalinkReconnect] Enhanced reconnection manager initialized");
  }

  /**
   * Main function: Handles Lavalink failures intelligently based on bot status
   */
  async _handleLavalinkDown(node, reason) {
    if (this.isCleaningUp) {
      logger.debug(`[LavalinkReconnect] Cleanup already in progress, skipping duplicate`);
      return;
    }

    this.isCleaningUp = true;
    logger.warn(`[LavalinkReconnect] Lavalink down detected: ${reason}`);

    try {
      await this._intelligentCleanup(reason);
      this._scheduleReconnect(node);
    } catch (error) {
      logger.error(`[LavalinkReconnect] Error during intelligent cleanup:`, error);
    } finally {
      // Reset cleanup flag after a short delay
      setTimeout(() => {
        this.isCleaningUp = false;
      }, 2000);
    }
  }

  /**
   * Intelligent cleanup logic based on bot status
   */
  async _intelligentCleanup(reason) {
    logger.info(`[LavalinkReconnect] Starting intelligent cleanup: ${reason}`);
    
    const players = Array.from(this.client.lavalink.players.entries());
    logger.info(`[LavalinkReconnect] Analyzing ${players.length} players`);

    for (const [guildId, player] of players) {
      try {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          logger.debug(`[LavalinkReconnect] Guild ${guildId} not found, removing player`);
          this.client.lavalink.players.delete(guildId);
          continue;
        }

        // Check if bot is in voice channel
        const botMember = guild.members.me;
        const isInVoiceChannel = botMember?.voice?.channel;
        
        // Check bot status
        const isPlaying = player.playing || player.paused;
        const hasCurrentTrack = !!player.queue.current;
        
        logger.debug(`[LavalinkReconnect] Guild ${guildId}: InVoice=${!!isInVoiceChannel}, Playing=${isPlaying}, HasTrack=${hasCurrentTrack}`);

        if (!isInVoiceChannel) {
          // Case 4: Bot is not in voice channel - do nothing, just cleanup player
          logger.info(`[LavalinkReconnect] Guild ${guildId}: Bot not in voice channel, cleaning up player only`);
          await this._cleanupPlayerOnly(player, guildId);
          continue;
        }

        if (isPlaying || hasCurrentTrack) {
          // Case 2: Bot is playing something - jump to stopped and disconnect
          logger.info(`[LavalinkReconnect] Guild ${guildId}: Bot was playing, stopping and disconnecting`);
          await this._stopAndDisconnect(player, guildId, guild);
        } else {
          // Case 1 & 3: Bot is stopped or idle - just disconnect
          logger.info(`[LavalinkReconnect] Guild ${guildId}: Bot was stopped/idle, disconnecting only`);
          await this._disconnectOnly(player, guildId, guild);
        }

      } catch (error) {
        logger.error(`[LavalinkReconnect] Error processing guild ${guildId}:`, error);
        // Force cleanup on errors
        await this._forceCleanupPlayer(player, guildId);
      }
    }

    logger.info(`[LavalinkReconnect] Intelligent cleanup completed`);
  }

  /**
   * Case 2: Bot was playing - set UI to stopped and disconnect
   */
  async _stopAndDisconnect(player, guildId, guild) {
    try {
      // 1. Set UI to stopped status
      if (player.nowPlayingMessage) {
        await safeEdit(player.nowPlayingMessage, {
          embeds: [generateStoppedEmbed()],
          components: []
        });
        logger.debug(`[LavalinkReconnect] Updated UI to stopped for guild ${guildId}`);
      }

      // 2. Reset player state
      this._resetPlayerState(player);

      // 3. Disconnect from voice channel
      await this._disconnectFromVoice(guildId, guild);

      // 4. Player cleanup
      await this._cleanupPlayerResources(player, guildId);

    } catch (error) {
      logger.error(`[LavalinkReconnect] Error in stopAndDisconnect for guild ${guildId}:`, error);
      await this._forceCleanupPlayer(player, guildId);
    }
  }

  /**
   * Case 1 & 3: Bot is stopped - just disconnect
   */
  async _disconnectOnly(player, guildId, guild) {
    try {
      // 1. Disconnect from voice channel
      await this._disconnectFromVoice(guildId, guild);

      // 2. Player cleanup (UI stays on stopped)
      await this._cleanupPlayerResources(player, guildId);

    } catch (error) {
      logger.error(`[LavalinkReconnect] Error in disconnectOnly for guild ${guildId}:`, error);
      await this._forceCleanupPlayer(player, guildId);
    }
  }

  /**
   * Case 4: Bot not in voice channel - only player cleanup
   */
  async _cleanupPlayerOnly(player, guildId) {
    try {
      this._resetPlayerState(player);
      await this._cleanupPlayerResources(player, guildId);
    } catch (error) {
      logger.error(`[LavalinkReconnect] Error in cleanupPlayerOnly for guild ${guildId}:`, error);
      this.client.lavalink.players.delete(guildId);
    }
  }

  /**
   * Voice channel disconnection - robust method
   */
  async _disconnectFromVoice(guildId, guild) {
    let disconnected = false;

    try {
      // Method 1: Discord.js Guild Voice Disconnect
      if (guild.members.me?.voice?.channel) {
        await guild.members.me.voice.disconnect();
        logger.debug(`[LavalinkReconnect] Guild voice disconnect successful for guild ${guildId}`);
        disconnected = true;
      }
    } catch (e) {
      logger.warn(`[LavalinkReconnect] Guild voice disconnect failed for guild ${guildId}:`, e.message);
    }

    try {
      // Method 2: @discordjs/voice Connection Destroy
      const connection = getVoiceConnection(guildId);
      if (connection) {
        connection.destroy();
        logger.debug(`[LavalinkReconnect] Discord voice connection destroyed for guild ${guildId}`);
        disconnected = true;
      }
    } catch (e) {
      logger.warn(`[LavalinkReconnect] Voice connection destroy failed for guild ${guildId}:`, e.message);
    }

    if (disconnected) {
      logger.info(`[LavalinkReconnect] Successfully disconnected from voice in guild ${guildId}`);
    } else {
      logger.warn(`[LavalinkReconnect] Could not disconnect from voice in guild ${guildId}`);
    }
  }

  /**
   * Reset player state
   */
  _resetPlayerState(player) {
    // Stop intervals and collectors
    if (player.nowPlayingInterval) {
      clearInterval(player.nowPlayingInterval);
      player.nowPlayingInterval = null;
    }
    if (player.nowPlayingCollector) {
      player.nowPlayingCollector.stop();
      player.nowPlayingCollector = null;
    }
    if (player.stopConfirmationTimeout) {
      clearTimeout(player.stopConfirmationTimeout);
      player.stopConfirmationTimeout = null;
    }

    // Clear player state
    player.queue.current = null;
    player.queue.tracks = [];
    player.queue.previous = [];
    player.playing = false;
    player.paused = false;
    player._lastUIUpdate = null;
    player._lastEmbedData = null;
    player._pausedPosition = undefined;
    player.uiRefreshing = false;
  }

  /**
   * Player resources cleanup
   */
  async _cleanupPlayerResources(player, guildId) {
    try {
      // Lavalink player destroy (if possible)
      if (typeof player.destroy === 'function') {
        await player.destroy();
        logger.debug(`[LavalinkReconnect] Lavalink player destroyed for guild ${guildId}`);
      }
    } catch (e) {
      logger.warn(`[LavalinkReconnect] Player destroy failed for guild ${guildId}:`, e.message);
    }

    // Remove from cache
    this.client.lavalink.players.delete(guildId);
    logger.info(`[LavalinkReconnect] Player cleanup completed for guild ${guildId}`);
  }

  /**
   * Force cleanup for error handling
   */
  async _forceCleanupPlayer(player, guildId) {
    try {
      this._resetPlayerState(player);
      
      if (player.nowPlayingMessage) {
        await safeEdit(player.nowPlayingMessage, {
          embeds: [generateStoppedEmbed()],
          components: []
        });
        player.nowPlayingMessage = null;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        await this._disconnectFromVoice(guildId, guild);
      }
    } catch (e) {
      logger.error(`[LavalinkReconnect] Force cleanup error for guild ${guildId}:`, e);
    } finally {
      this.client.lavalink.players.delete(guildId);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  _scheduleReconnect(node) {
    const attempts = this.reconnectAttempts.get(node.id) || 0;
    if (attempts >= this.maxReconnectAttempts) {
      logger.error(`[LavalinkReconnect] Maximum reconnect attempts (${this.maxReconnectAttempts}) reached for ${node.id}`);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, attempts);
    this.reconnectAttempts.set(node.id, attempts + 1);
    
    logger.info(`[LavalinkReconnect] Scheduling reconnect for ${node.id} in ${delay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        if (!node.connected) {
          logger.info(`[LavalinkReconnect] Attempting to reconnect ${node.id}...`);
          await node.connect();
          logger.info(`[LavalinkReconnect] Reconnection successful for ${node.id}`);
        } else {
          logger.debug(`[LavalinkReconnect] Node ${node.id} already connected, skipping reconnect`);
          this.reconnectAttempts.delete(node.id);
        }
      } catch (err) {
        logger.error(`[LavalinkReconnect] Reconnection failed for ${node.id}:`, err);
        this._scheduleReconnect(node); // Try again
      }
    }, delay);
  }

  /**
   * Start health monitoring to catch missed disconnect events
   */
  startHealthMonitoring() {
    // Quick health checks every 10 seconds for better responsiveness
    this.quickHealthCheckInterval = setInterval(async () => {
      try {
        await this._performQuickHealthCheck();
      } catch (error) {
        logger.error("[LavalinkReconnect] Quick health check failed:", error);
      }
    }, 10000);

    // Detailed health checks every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this._performDetailedHealthCheck();
      } catch (error) {
        logger.error("[LavalinkReconnect] Detailed health check failed:", error);
      }
    }, 30000);

    logger.debug("[LavalinkReconnect] Enhanced health monitoring started");
  }

  /**
   * Quick health check - only connection status
   */
  async _performQuickHealthCheck() {
    const manager = this.client.lavalink.nodeManager;
    if (!manager?.nodes) return;

    for (const node of manager.nodes.values()) {
      if (!node.connected) {
        logger.warn(`[LavalinkReconnect] Quick check: Node ${node.id} is disconnected`);
        this._handleLavalinkDown(node, "Quick health check: Node disconnected");
      }
    }
  }

  /**
   * Detailed health check with stats
   */
  async _performDetailedHealthCheck() {
    const manager = this.client.lavalink.nodeManager;
    if (!manager?.nodes) return;

    for (const node of manager.nodes.values()) {
      try {
        if (!node.connected) {
          logger.warn(`[LavalinkReconnect] Detailed check: Node ${node.id} is disconnected`);
          this._handleLavalinkDown(node, "Detailed health check: Node disconnected");
        } else {
          // Try to fetch stats to verify connection is actually working
          const stats = await Promise.race([
            node.fetchStats(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Stats timeout')), 5000))
          ]);
          
          if (stats) {
            this.lastHealthCheck = Date.now();
            logger.debug(`[LavalinkReconnect] Detailed health check passed for ${node.id}`);
          }
        }
      } catch (error) {
        logger.warn(`[LavalinkReconnect] Detailed health check failed for node ${node.id}:`, error.message);
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
          this._handleLavalinkDown(node, `Detailed health check failed: ${error.message}`);
        }
      }
    }
  }

  /**
   * Manual cleanup trigger for testing/debugging
   */
  async forceCleanup(reason = "Manual trigger") {
    logger.info(`[LavalinkReconnect] Manual cleanup triggered: ${reason}`);
    await this._intelligentCleanup(reason);
  }

  /**
   * Stop all monitoring and cleanup
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.quickHealthCheckInterval) {
      clearInterval(this.quickHealthCheckInterval);
      this.quickHealthCheckInterval = null;
    }
    
    logger.info("[LavalinkReconnect] Reconnection manager stopped");
  }
}

export default LavalinkReconnectManager;
