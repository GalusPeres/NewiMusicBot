// utils/reconnectManager.js
// Handles automatic reconnection to Lavalink nodes and cleanup on node disconnect

import logger from "./logger.js";
import { performStop } from "./playerControls.js";
import { generateStoppedEmbed } from "./nowPlayingEmbed.js";
import { safeEdit } from "./safeDiscord.js";

class LavalinkReconnectManager {
  constructor(client) {
    this.client = client;
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // initial backoff delay in ms
  }

  /**
   * Initialize event listeners for Lavalink node lifecycle.
   */
  initialize() {
    if (!this.client.lavalink) return;

    // When a node disconnects, clean up players and schedule reconnect
    this.client.lavalink.on("nodeDisconnect", (node, reason) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} disconnected: ${reason}`);
      this._cleanupAllPlayers();
      this._scheduleReconnect(node);
    });

    // Treat errors on disconnected nodes as disconnect events
    this.client.lavalink.on("nodeError", (node, error) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} error:`, error);
      if (!node.connected) {
        this._cleanupAllPlayers();
        this._scheduleReconnect(node);
      }
    });

    // After a successful reconnect, restore player states
    this.client.lavalink.on("nodeConnect", node => {
      logger.info(`[LavalinkReconnect] Node ${node.id} reconnected`);
      this.reconnectAttempts.delete(node.id);
      this._restorePlayerStates();
    });

    // Periodic health check to detect silent outages
    setInterval(() => {
      this._checkNodeHealth().catch(error => {
        logger.error("[LavalinkReconnect] Health check failed:", error);
      });
    }, 30000);
  }

  /**
   * Clean up all active players: stop playback, disconnect voice, update UI, destroy players.
   */
  async _cleanupAllPlayers() {
    for (const [guildId, player] of this.client.lavalink.players) {
      try {
        // 1) Stop playback and clear the queue
        await performStop(player);

        // 2) Disconnect the bot from Discord voice
        const guild = this.client.guilds.cache.get(guildId);
        const me = guild?.members.me;
        if (me?.voice?.channel) {
          await me.voice.disconnect("Cleanup after Lavalink node disconnect");
          logger.info(`[LavalinkReconnect] Disconnected voice in guild ${guildId}`);
        }

        // 3) Update the Now Playing UI to show “stopped”
        if (player.nowPlayingMessage) {
          await safeEdit(player.nowPlayingMessage, {
            embeds: [generateStoppedEmbed()],
            components: []
          });
          player.nowPlayingMessage = null;
        }

        // 4) Destroy the Lavalink player instance and remove from cache
        await player.destroy().catch(() => {});
        this.client.lavalink.players.delete(guildId);
        logger.info(`[LavalinkReconnect] Player cleaned up for guild ${guildId}`);
      } catch (err) {
        logger.error(`[LavalinkReconnect] Failed cleanup for guild ${guildId}:`, err);
      }
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * @param {LavalinkNode} node
   */
  _scheduleReconnect(node) {
    const attempts = this.reconnectAttempts.get(node.id) || 0;
    if (attempts >= this.maxReconnectAttempts) {
      logger.error(`[LavalinkReconnect] Max reconnect attempts reached for node ${node.id}`);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, attempts);
    this.reconnectAttempts.set(node.id, attempts + 1);
    logger.info(`[LavalinkReconnect] Scheduling reconnect for node ${node.id} in ${delay}ms (attempt ${attempts + 1})`);

    setTimeout(async () => {
      try {
        if (!node.connected) {
          await node.connect();
        }
      } catch (error) {
        logger.error(`[LavalinkReconnect] Reconnect failed for node ${node.id}:`, error);
        this._scheduleReconnect(node);
      }
    }, delay);
  }

  /**
   * Check the health of all nodes and trigger reconnect if any are down.
   */
  async _checkNodeHealth() {
    const nm = this.client.lavalink.nodeManager;
    if (!nm?.nodes) return;

    for (const node of nm.nodes.values()) {
      if (!node.connected) {
        logger.warn(`[LavalinkReconnect] Node ${node.id} appears offline`);
        this._cleanupAllPlayers();
        this._scheduleReconnect(node);
      } else {
        try {
          await node.fetchStats();
        } catch (error) {
          logger.error(`[LavalinkReconnect] Stats fetch failed for node ${node.id}:`, error);
          this._cleanupAllPlayers();
          this._scheduleReconnect(node);
        }
      }
    }
  }

  /**
   * Restore players after a node reconnects: rejoin voice channels and resume playback.
   */
  async _restorePlayerStates() {
    logger.info("[LavalinkReconnect] Restoring player states after reconnect");
    for (const [guildId, player] of this.client.lavalink.players) {
      try {
        if (player.voiceChannelId && !player.connected) {
          await player.connect();
          if (player.queue.current && !player.playing && !player.paused) {
            await player.play({ clientTrack: player.queue.current });
            logger.debug(`[LavalinkReconnect] Resumed playback for guild ${guildId}`);
          }
        }
      } catch (error) {
        logger.error(`[LavalinkReconnect] Failed to restore player for guild ${guildId}:`, error);
      }
    }
  }
}

export default LavalinkReconnectManager;
