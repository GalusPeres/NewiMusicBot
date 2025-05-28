// utils/cleanupManager.js
// Manages cleanup of stale resources to prevent memory leaks

import logger from "./logger.js";

class CleanupManager {
  constructor(client) {
    this.client = client;
    this.intervals = new Map();
    this.timeouts = new Map();
  }

  start() {
    // Clean up stale playlist/queue messages every 30 minutes
    this.intervals.set('messageCleanup', setInterval(() => {
      this.cleanupStaleMessages();
    }, 30 * 60 * 1000));

    // Clean up disconnected players every 5 minutes
    this.intervals.set('playerCleanup', setInterval(() => {
      this.cleanupDisconnectedPlayers();
    }, 5 * 60 * 1000));

    logger.info("[CleanupManager] Started periodic cleanup tasks");
  }

  cleanupStaleMessages() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    // Clean playlist messages
    if (this.client.activePlaylistMessages) {
      for (const [messageId, state] of this.client.activePlaylistMessages.entries()) {
        if (!state.message || now - state.message.createdTimestamp > maxAge) {
          this.client.activePlaylistMessages.delete(messageId);
          logger.debug(`[CleanupManager] Removed stale playlist message ${messageId}`);
        }
      }
    }

    // Clean queue messages
    if (this.client.activeQueueMessages) {
      for (const [messageId, state] of this.client.activeQueueMessages.entries()) {
        if (!state.message || now - state.message.createdTimestamp > maxAge) {
          this.client.activeQueueMessages.delete(messageId);
          logger.debug(`[CleanupManager] Removed stale queue message ${messageId}`);
        }
      }
    }
  }

  cleanupDisconnectedPlayers() {
    if (!this.client.lavalink?.players) return;

    for (const [guildId, player] of this.client.lavalink.players) {
      // Check if bot is still in the guild
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        player.destroy();
        this.client.lavalink.players.delete(guildId);
        logger.info(`[CleanupManager] Removed player for deleted guild ${guildId}`);
        continue;
      }

      // Check if bot is in a voice channel
      const voiceChannel = guild.channels.cache.get(player.voiceChannelId);
      if (!voiceChannel || !voiceChannel.members.has(this.client.user.id)) {
        player.destroy();
        this.client.lavalink.players.delete(guildId);
        logger.info(`[CleanupManager] Removed orphaned player for guild ${guildId}`);
      }
    }
  }

  stop() {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();

    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    logger.info("[CleanupManager] Stopped all cleanup tasks");
  }
}

export default CleanupManager;