// utils/reconnectManager.js
// Manages automatic reconnection to Lavalink nodes and cleans up players when a node disconnects

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
  }

  initialize() {
    if (!this.client.lavalink) return;

    // Prevent unhandled errors from bubbling up in the node manager
    this.client.lavalink.nodeManager.on("error", (err, node) => {
      if (node && node.id) {
        logger.error(`[LavalinkReconnect] NodeManager error on ${node.id}:`, err);
      } else {
        logger.error(`[LavalinkReconnect] NodeManager error (no node provided):`, err);
      }
    });

    // When a node disconnects, clean up all players and schedule a reconnect
    this.client.lavalink.on("nodeDisconnect", (node, reason) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} disconnected: ${reason}`);
      this._cleanupAllPlayers();
      this._scheduleReconnect(node);
    });

    // Treat node errors as disconnects if not connected
    this.client.lavalink.on("nodeError", (node, error) => {
      logger.error(`[LavalinkReconnect] Node ${node.id} error:`, error);
      if (!node.connected) {
        this._cleanupAllPlayers();
        this._scheduleReconnect(node);
      }
    });

    // After a node reconnects, restore all player states
    this.client.lavalink.on("nodeConnect", node => {
      logger.info(`[LavalinkReconnect] Node ${node.id} reconnected`);
      this.reconnectAttempts.delete(node.id);
      this._restorePlayerStates();
    });

    // Periodic health check for all nodes
    setInterval(() => {
      this._checkNodeHealth().catch(err => {
        logger.error("[LavalinkReconnect] Health check failed:", err);
      });
    }, 30_000);
  }

  /**
   * Stop playback, update UI, disconnect from voice, and remove players.
   */
  async _cleanupAllPlayers() {
    for (const [guildId, player] of this.client.lavalink.players) {
      // 1) Stop playback and clear the queue (with UI update)
      try {
        await performStop(player);
      } catch (err) {
        logger.warn(`[LavalinkReconnect] performStop failed for ${guildId}: ${err.message}`);
        // Even if stopping fails, attempt to update the UI to “stopped”
        if (player.nowPlayingMessage) {
          await safeEdit(player.nowPlayingMessage, {
            embeds: [generateStoppedEmbed()],
            components: []
          }).catch(e => logger.error(`[LavalinkReconnect] UI update failed: ${e.message}`));
          player.nowPlayingMessage = null;
        }
      }

      // 1b) Explicitly disconnect the Lavalink player from the voice channel
      try {
        await player.disconnect(false);
        logger.info(`[LavalinkReconnect] player.disconnect(false) called for guild ${guildId}`);
      } catch (e) {
        logger.error(`[LavalinkReconnect] Error in player.disconnect() for ${guildId}: ${e.message}`);
      }

      // 2) Ensure the “Now Playing” UI is updated to “stopped”
      if (player.nowPlayingMessage) {
        await safeEdit(player.nowPlayingMessage, {
          embeds: [generateStoppedEmbed()],
          components: []
        }).catch(e => logger.error(`[LavalinkReconnect] UI update failed: ${e.message}`));
        player.nowPlayingMessage = null;
      }

      // 3) Forcefully destroy any lingering Discord voice connection
      try {
        const connection = getVoiceConnection(guildId);
        if (connection) {
          connection.destroy();
          logger.info(`[LavalinkReconnect] Destroyed voice connection in guild ${guildId}`);
        } else {
          logger.debug(`[LavalinkReconnect] No active Discord connection found for ${guildId}`);
        }
      } catch (e) {
        logger.error(`[LavalinkReconnect] Could not destroy voice connection in ${guildId}: ${e.message}`);
      }

      // 4) Destroy the Lavalink player and remove it from the cache
      try {
        await player.destroy();
      } catch {
        // ignore if destroy fails
      }
      this.client.lavalink.players.delete(guildId);
      logger.info(`[LavalinkReconnect] Player cleaned up for guild ${guildId}`);
    }
  }

  /**
   * Schedule a reconnect attempt for the given node using exponential backoff.
   */
  _scheduleReconnect(node) {
    const attempts = this.reconnectAttempts.get(node.id) || 0;
    if (attempts >= this.maxReconnectAttempts) {
      logger.error(`[LavalinkReconnect] Maximum reconnect attempts reached for ${node.id}`);
      return;
    }
    const delay = this.reconnectDelay * 2 ** attempts;
    this.reconnectAttempts.set(node.id, attempts + 1);
    logger.info(`[LavalinkReconnect] Scheduling reconnect for ${node.id} in ${delay}ms`);
    setTimeout(async () => {
      try {
        if (!node.connected) await node.connect();
      } catch (err) {
        logger.error(`[LavalinkReconnect] Reconnect failed for ${node.id}:`, err);
        this._scheduleReconnect(node);
      }
    }, delay);
  }

  /**
   * Iterate through all nodes; if offline, cleanup players and reconnect.
   */
  async _checkNodeHealth() {
    const manager = this.client.lavalink.nodeManager;
    if (!manager?.nodes) return;

    for (const node of manager.nodes.values()) {
      if (!node.connected) {
        logger.warn(`[LavalinkReconnect] Node ${node.id} is offline`);
        this._cleanupAllPlayers();
        this._scheduleReconnect(node);
      } else {
        try {
          await node.fetchStats();
        } catch (err) {
          logger.error(`[LavalinkReconnect] Stats fetch failed for ${node.id}:`, err);
          this._cleanupAllPlayers();
          this._scheduleReconnect(node);
        }
      }
    }
  }

  /**
   * After node reconnection, rejoin voice channels and resume playback.
   */
  async _restorePlayerStates() {
    logger.info("[LavalinkReconnect] Restoring player states after reconnection");
    for (const [guildId, player] of this.client.lavalink.players) {
      try {
        if (player.voiceChannelId && !player.connected) {
          await player.connect();
          if (player.queue.current && !player.playing && !player.paused) {
            await player.play({ clientTrack: player.queue.current });
            logger.debug(`[LavalinkReconnect] Resumed playback in guild ${guildId}`);
          }
        }
      } catch (err) {
        logger.error(`[LavalinkReconnect] Failed to restore player for guild ${guildId}:`, err);
      }
    }
  }
}

export default LavalinkReconnectManager;
