// index.js (improved version)
// Main entry point with enhanced error handling and robustness

import { Client, Collection, GatewayIntentBits } from "discord.js";
import { LavalinkManager } from "lavalink-client";
import fs from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { sendOrUpdateNowPlayingUI } from "./utils/nowPlayingManager.js";
import { generateStoppedEmbed } from "./utils/nowPlayingEmbed.js";
import logger from "./utils/logger.js";
import CleanupManager from "./utils/cleanupManager.js";
import LavalinkReconnectManager from "./utils/reconnectManager.js";

// Catch uncaught exceptions so the process doesn't die
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
});

// Catch rejected promises that aren't handled
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Helpers to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load and validate config
const cfgPath = join(__dirname, "config", "config.json");
let config = {};
try {
  const raw = await fs.readFile(cfgPath, "utf-8");
  config = JSON.parse(raw);

  const requiredFields = ["token", "clientId", "lavalinkHost", "lavalinkPort", "lavalinkPassword"];
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required config field: ${field}`);
    }
  }
  logger.info("Configuration loaded and validated.");
} catch (err) {
  logger.error("Failed to load configuration:", err);
  process.exit(1);
}

// Create Discord client with retries and timeouts
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  restRequestTimeout: 30_000, // 30s REST timeout
  retryLimit: 3,              // retry failed REST calls up to 3 times
  presence: {
    activities: [{
      name: `${config.prefix}help`,
      type: 2, // LISTENING
    }],
    status: "online",
  },
});
client.config = config;
global.config = config;

// Initialize your custom managers
client.cleanupManager   = new CleanupManager(client);
client.reconnectManager = new LavalinkReconnectManager(client);

// -------------------- Command Loader --------------------
client.commands = new Collection();
const commandsPath = join(__dirname, "commands");

try {
  const entries = await fs.readdir(commandsPath, { withFileTypes: true });

  // Load subfolder commands
  for (const dirent of entries.filter(e => e.isDirectory())) {
    const folderPath = join(commandsPath, dirent.name);
    const files = (await fs.readdir(folderPath)).filter(f => f.endsWith(".js"));
    for (const file of files) {
      try {
        const mod = await import(pathToFileURL(join(folderPath, file)).href);
        if (!mod.default?.name) {
          logger.warn(`Command file "${file}" in "${dirent.name}" has no name.`);
          continue;
        }
        mod.default.category = dirent.name;
        client.commands.set(mod.default.name, mod.default);
        logger.debug(`Loaded "${mod.default.name}" from category "${dirent.name}".`);
      } catch (err) {
        logger.error(`Failed to load command ${file}:`, err);
      }
    }
  }

  // Load root-level commands
  for (const fileEnt of entries.filter(e => e.isFile() && e.name.endsWith(".js"))) {
    try {
      const mod = await import(pathToFileURL(join(commandsPath, fileEnt.name)).href);
      if (!mod.default?.name) {
        logger.warn(`Root command "${fileEnt.name}" has no name.`);
        continue;
      }
      mod.default.category = "Uncategorized";
      client.commands.set(mod.default.name, mod.default);
      logger.debug(`Loaded "${mod.default.name}" (root).`);
    } catch (err) {
      logger.error(`Failed to load command ${fileEnt.name}:`, err);
    }
  }
} catch (err) {
  logger.error("Failed to load commands directory:", err);
}

// -------------------- Message Handler --------------------
const cooldowns = new Map();
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (!msg.content.startsWith(client.config.prefix)) return;

  // 3 commands per 10 seconds per user
  const now = Date.now();
  const userTimestamps = cooldowns.get(msg.author.id) || [];
  const recent = userTimestamps.filter(ts => now - ts < 10_000);
  if (recent.length >= 3) {
    return msg.reply("Please slow down! You can only use 3 commands every 10 seconds.")
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5_000));
  }
  recent.push(now);
  cooldowns.set(msg.author.id, recent);

  const args    = msg.content.slice(client.config.prefix.length).trim().split(/\s+/);
  const name    = args.shift().toLowerCase();
  const command = client.commands.get(name)
                || [...client.commands.values()].find(c => c.aliases?.includes(name));
  if (!command) return;

  logger.debug(`Guild=${msg.guild.id} User=${msg.author.tag} Cmd=${name} Args=[${args.join(",")}]`);
  try {
    // Timeout a long-running command after 30s
    const race = Promise.race([
      command.execute(client, msg, args),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Command timeout")), 30_000))
    ]);
    await race;
  } catch (err) {
    logger.error(`Error executing ${name}:`, err);
    const reply = err.message === "Command timeout"
                ? "Command timed out, please try again."
                : "An error occurred while executing that command.";
    msg.reply(reply).catch(() => {});
  }
});

// -------------------- Voice State Logging --------------------
client.on("voiceStateUpdate", (oldState, newState) => {
  if (newState.id !== client.user.id) return;
  const from = oldState.channelId || "None";
  const to   = newState.channelId || "None";
  logger.debug(`[VOICE] Moved from ${from} to ${to} in guild ${newState.guild.id}`);

  // If kicked out of the channel, destroy the player
  if (from !== "None" && to === "None") {
    const player = client.lavalink?.getPlayer(newState.guild.id);
    if (player) {
      logger.info(`Player in guild ${newState.guild.id} was disconnected, cleaning up.`);
      player.destroy();
      client.lavalink.players.delete(newState.guild.id);
    }
  }
});

// -------------------- Lavalink Manager --------------------
client.lavalink = new LavalinkManager({
  nodes: [{
    host: config.lavalinkHost,
    port: config.lavalinkPort,
    authorization: config.lavalinkPassword,
    id: "node1",
    retryAmount: 5,
    retryDelay: 10_000,
    secure: false
  }],
  // Correct shard sender
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild?.shard) guild.shard.send(payload);
  },
  autoSkip: true,
  client: {
    id: config.clientId,
    username: config.username
  },
  // Advanced options for heartbeat & stats
  advancedOptions: {
    enablePingOnStatsCheck: true,
    heartBeatInterval: 30_000
  },
  queueOptions: {
    maxPreviousTracks: 1000
  },
  playerOptions: {
    defaultSearchPlatform: config.defaultSearchPlatform || "ytmsearch",
    volumeDecrementer: 1,
    requesterTransformer: r => r,
    onDisconnect: {
      autoReconnect: false,
      destroyPlayer: true
    }
  }
});

client.lavalinkReady = false;
client.on("raw", d => client.lavalink.sendRawData(d));

client.once("ready", async () => {
  logger.info(`Bot ${client.user.tag} is online.`);
  try {
    await client.lavalink.init(client.user);
    client.lavalinkReady = true;
    // Now hand off all reconnect logic to LavalinkReconnectManager
    client.reconnectManager.initialize();
    client.cleanupManager.start();
    logger.info("Lavalink initialized successfully.");
  } catch (err) {
    logger.error("Lavalink init failed:", err);
  }
});

// -------------------- FIXED Track & Queue Events --------------------
const trackStartTimes = new Map();

client.lavalink.on("trackStart", async (player, track) => {
  logger.debug(`Track started in guild ${player.guildId}: ${track.info.title}`);
  trackStartTimes.set(player.guildId, Date.now());
  
  // CRITICAL FIX: Reset UI state completely for clean start
  if (player.nowPlayingInterval) {
    clearInterval(player.nowPlayingInterval);
    player.nowPlayingInterval = null;
    logger.debug(`[trackStart] Cleared existing interval for guild ${player.guildId}`);
  }
  
  // CRITICAL: Reset UI tracking variables (fixes post-stop issues)
  player._lastUIUpdate = null;
  player._lastEmbedData = null;
  player._pausedPosition = undefined;
  
  setTimeout(async () => {
    try {
      const ch = client.channels.cache.get(player.textChannelId);
      if (ch) await sendOrUpdateNowPlayingUI(player, ch);
    } catch (err) {
      logger.error("Error updating Now Playing UI:", err);
    }
  }, 1000);
});

// FIXED: resetPlayerUI function with complete state reset
function resetPlayerUI(player) {
  try {
    // Clear intervals and collectors first
    if (player.nowPlayingInterval) {
      clearInterval(player.nowPlayingInterval);
      player.nowPlayingInterval = null;
      logger.debug(`[resetPlayerUI] Cleared interval for guild ${player.guildId}`);
    }
    
    if (player.nowPlayingCollector) {
      player.nowPlayingCollector.stop();
      player.nowPlayingCollector = null;
      logger.debug(`[resetPlayerUI] Stopped collector for guild ${player.guildId}`);
    }
    
    // CRITICAL FIX: Reset ALL UI state variables (fixes post-stop issues)
    player._lastUIUpdate = null;
    player._lastEmbedData = null;
    player._pausedPosition = undefined;
    player.uiRefreshing = false;
    
    // Clear queue
    player.queue.previous = [];
    player.queue.tracks   = [];
    
    // Update UI message to stopped state
    if (player.nowPlayingMessage) {
      player.nowPlayingMessage
        .edit({ embeds: [generateStoppedEmbed()], components: [] })
        .catch(() => {});
      player.nowPlayingMessage = null;
    }
    
    logger.debug(`[resetPlayerUI] Complete UI reset for guild ${player.guildId}`);
  } catch (err) {
    logger.error("Error resetting player UI:", err);
  }
}

client.lavalink.on("queueEnd", player => {
  const elapsed = Date.now() - (trackStartTimes.get(player.guildId) || 0);
  const wait    = elapsed < 2000 ? 2000 - elapsed : 0;
  setTimeout(() => {
    resetPlayerUI(player);
    trackStartTimes.delete(player.guildId);
  }, wait);
});

client.lavalink.on("trackException", (player, track, payload) => {
  logger.error(`Track exception in guild ${player.guildId}: ${payload.exception.message}`);
  try {
    const ch = client.channels.cache.get(player.textChannelId);
    if (!ch) return;
    const msg = payload.exception.message;
    if (msg.includes("unavailable")) {
      ch.send(`Track **${track.info.title}** is unavailable.`);
    } else {
      ch.send(`Error playing **${track.info.title}**:\n\`${msg}\``);
    }
  } catch (err) {
    logger.error("Error sending track exception message:", err);
  }
});

client.lavalink.on("trackEnd", (player, track, payload) => {
  if (payload.reason === "LOAD_FAILED") {
    try {
      const ch = client.channels.cache.get(player.textChannelId);
      if (ch) ch.send(`Failed to load track **${track.info.title}**.`);
    } catch (err) {
      logger.error("Error sending track end message:", err);
    }
  }
});

// -------------------- Graceful Shutdown --------------------
async function gracefulShutdown() {
  logger.info("Initiating graceful shutdown...");
  try {
    client.cleanupManager.stop();
    for (const player of client.lavalink.players.values()) {
      await player.destroy().catch(err => 
        logger.error(`Error destroying player for guild ${player.guildId}:`, err)
      );
    }
    client.destroy();
    logger.info("Shutdown complete.");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown:", err);
    process.exit(1);
  }
}
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// -------------------- Login with Retry --------------------
async function login(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await client.login(config.token);
      return;
    } catch (err) {
      logger.error(`Login attempt ${i+1} failed:`, err);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 5000 * (i+1)));
      }
    }
  }
  logger.error("All login attempts failed. Exiting.");
  process.exit(1);
}
login();

export default client;