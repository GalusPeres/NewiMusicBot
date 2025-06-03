// utils/reconnectManager.js
// Enhanced Lavalink reconnection manager with reliable cleanup

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
  }

  initialize() {
    if (!this.client.lavalink) return;

    // Enhanced error handling - prevent unhandled errors
    this.client.lavalink.nodeManager.on("error", (err, node) => {
      if (node && node.id) {
        logger.error(`[LavalinkReconnect] NodeManager error on ${node.id}:`, err);
        // Trigger cleanup on node errors
        if (!node.connected) {
          this._forceCleanupAndReconnect(node, "NodeManager error");
        }
      } else {
        logger.error(`[LavalinkReconnect] NodeManager error (no node provided):`, err);
      }
    });

    // Multiple disconnect event handlers for reliability
    this.client.lavalink.on("nodeDisconnect", (node, reason) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} disconnected: ${reason}`);
      this._forceCleanupAndReconnect(node, `nodeDisconnect: ${reason}`);
    });

    // Handle node errors as potential disconnects
    this.client.lavalink.on("nodeError", (node, error) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} error:`, error);
      if (!node.connected) {
        this._forceCleanupAndReconnect(node, `nodeError: ${error.message}`);
      }
    });

    // Handle node destroy events
    this.client.lavalink.on("nodeDestroy", (node) => {
      logger.warn(`[LavalinkReconnect] Node ${node.id} destroyed`);
      this._forceCleanupAndReconnect(node, "nodeDestroy");
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
   * Force cleanup and reconnection - centralized method
   */
  async _forceCleanupAndReconnect(node, reason) {
    if (this.isCleaningUp) {
      logger.debug(`[LavalinkReconnect] Cleanup already in progress, skipping duplicate`);
      return;
    }

    this.isCleaningUp = true;
    logger.warn(`[LavalinkReconnect] Force cleanup triggered: ${reason}`);

    try {
      await this._emergencyCleanupAllPlayers(reason);
      this._scheduleReconnect(node);
    } catch (error) {
      logger.error(`[LavalinkReconnect] Error during force cleanup:`, error);
    } finally {
      // Reset cleanup flag after a short delay
      setTimeout(() => {
        this.isCleaningUp = false;
      }, 2000);
    }
  }

  /**
   * Emergency cleanup - more aggressive and reliable
   */
  async _emergencyCleanupAllPlayers(reason) {
    logger.info(`[LavalinkReconnect] Emergency cleanup starting: ${reason}`);
    
    const players = Array.from(this.client.lavalink.players.entries());
    logger.info(`[LavalinkReconnect] Found ${players.length} players to cleanup`);

    for (const [guildId, player] of players) {
      try {
        logger.debug(`[LavalinkReconnect] Cleaning up player in guild ${guildId}`);

        // 1) Immediate UI update to stopped state
        if (player.nowPlayingMessage) {
          try {
            await safeEdit(player.nowPlayingMessage, {
              embeds: [generateStoppedEmbed()],
              components: []
            });
            logger.debug(`[LavalinkReconnect] Updated UI to stopped for guild ${guildId}`);
          } catch (uiError) {
            logger.warn(`[LavalinkReconnect] UI update failed for guild ${guildId}:`, uiError.message);
          }
          player.nowPlayingMessage = null;
        }

        // 2) Stop intervals and collectors immediately
        if (player.nowPlayingInterval) {
          clearInterval(player.nowPlayingInterval);
          player.nowPlayingInterval = null;
        }
        if (player.nowPlayingCollector) {
          player.nowPlayingCollector.stop();
          player.nowPlayingCollector = null;
        }

        // 3) Clear player state
        player.queue.current = null;
        player.queue.tracks = [];
        player.queue.previous = [];
        player.playing = false;
        player.paused = false;

        // 4) Disconnect from voice (multiple methods for reliability)
        try {
          // Method 1: Lavalink player disconnect
          if (typeof player.disconnect === 'function') {
            await player.disconnect(false);
            logger.debug(`[LavalinkReconnect] Lavalink disconnect successful for guild ${guildId}`);
          }
        } catch (e) {
          logger.warn(`[LavalinkReconnect] Lavalink disconnect failed for guild ${guildId}:`, e.message);
        }

        try {
          // Method 2: Discord voice connection destroy
          const connection = getVoiceConnection(guildId);
          if (connection) {
            connection.destroy();
            logger.debug(`[LavalinkReconnect] Discord voice connection destroyed for guild ${guildId}`);
          }
        } catch (e) {
          logger.warn(`[LavalinkReconnect] Voice connection destroy failed for guild ${guildId}:`, e.message);
        }

        try {
          // Method 3: Guild voice state update (force leave)
          const guild = this.client.guilds.cache.get(guildId);
          if (guild && guild.members.me?.voice?.channel) {
            await guild.members.me.voice.disconnect();
            logger.debug(`[LavalinkReconnect] Guild voice disconnect successful for guild ${guildId}`);
          }
        } catch (e) {
          logger.warn(`[LavalinkReconnect] Guild voice disconnect failed for guild ${guildId}:`, e.message);
        }

        // 5) Destroy Lavalink player
        try {
          await player.destroy();
          logger.debug(`[LavalinkReconnect] Player destroyed for guild ${guildId}`);
        } catch (e) {
          logger.warn(`[LavalinkReconnect] Player destroy failed for guild ${guildId}:`, e.message);
        }

        // 6) Remove from cache
        this.client.lavalink.players.delete(guildId);
        
        logger.info(`[LavalinkReconnect] Emergency cleanup completed for guild ${guildId}`);

      } catch (error) {
        logger.error(`[LavalinkReconnect] Emergency cleanup failed for guild ${guildId}:`, error);
        // Force remove from cache even if cleanup failed
        this.client.lavalink.players.delete(guildId);
      }
    }

    logger.info(`[LavalinkReconnect] Emergency cleanup completed for all ${players.length} players`);
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
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this._performHealthCheck();
      } catch (error) {
        logger.error("[LavalinkReconnect] Health check failed:", error);
      }
    }, 30000);

    logger.debug("[LavalinkReconnect] Health monitoring started");
  }

  /**
   * Perform health check on all nodes
   */
  async _performHealthCheck() {
    const manager = this.client.lavalink.nodeManager;
    if (!manager?.nodes) return;

    for (const node of manager.nodes.values()) {
      try {
        if (!node.connected) {
          logger.warn(`[LavalinkReconnect] Health check: Node ${node.id} is disconnected`);
          this._forceCleanupAndReconnect(node, "Health check: Node disconnected");
        } else {
          // Try to fetch stats to verify connection is actually working
          const stats = await Promise.race([
            node.fetchStats(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Stats timeout')), 5000))
          ]);
          
          if (stats) {
            this.lastHealthCheck = Date.now();
            logger.debug(`[LavalinkReconnect] Health check passed for ${node.id}`);
          }
        }
      } catch (error) {
        logger.warn(`[LavalinkReconnect] Health check failed for node ${node.id}:`, error.message);
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
          this._forceCleanupAndReconnect(node, `Health check failed: ${error.message}`);
        }
      }
    }
  }

  /**
   * Manual cleanup trigger for testing/debugging
   */
  async forceCleanup(reason = "Manual trigger") {
    logger.info(`[LavalinkReconnect] Manual cleanup triggered: ${reason}`);
    await this._emergencyCleanupAllPlayers(reason);
  }

  /**
   * Stop all monitoring and cleanup
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    logger.info("[LavalinkReconnect] Reconnection manager stopped");
  }
}

export default LavalinkReconnectManager;