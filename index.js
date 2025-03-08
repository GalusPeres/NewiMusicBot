// index.js
// Main entry point for the Discord music bot application

import { Client, Collection, GatewayIntentBits } from "discord.js";
import { LavalinkManager } from "lavalink-client";
import fs from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { sendOrUpdateNowPlayingUI } from "./utils/nowPlayingManager.js";
import { generateStoppedEmbed } from "./utils/nowPlayingEmbed.js";
import logger from "./utils/logger.js";

// Map to track the timestamp of trackStart events per guild
const trackStartTimestamps = new Map();

// Determine the current directory using ES module utilities
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration from config/config.json
const configPath = join(__dirname, "config", "config.json");
let config = {};
try {
  const data = await fs.readFile(configPath, "utf-8");
  config = JSON.parse(data);
  logger.info("Configuration loaded successfully.");
} catch (err) {
  logger.error("Failed to load configuration:", err);
  process.exit(1);
}

// Create a new Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
client.config = config;
global.config = config;

// Collection für alle Commands
client.commands = new Collection();

/**
 * DYNAMISCHES LADEN DER COMMANDS
 * 1) Unterordner durchgehen → darin enthaltene JS-Dateien laden und "category" = Unterordnername
 * 2) Dateien direkt im "commands"-Ordner → "category" = "Uncategorized"
 */
const commandsPath = join(__dirname, "commands");

// 1) Unterordner ermitteln
const dirEntries = await fs.readdir(commandsPath, { withFileTypes: true });
const folderNames = dirEntries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);

for (const folder of folderNames) {
  const folderPath = join(commandsPath, folder);
  const commandFiles = (await fs.readdir(folderPath)).filter(file => file.endsWith(".js"));
  
  for (const file of commandFiles) {
    const fileUrl = pathToFileURL(join(folderPath, file)).href;
    const { default: command } = await import(fileUrl);

    if (command && command.name) {
      // Automatisch die Kategorie aus dem Ordnernamen setzen
      command.category = folder;
      client.commands.set(command.name, command);
      logger.debug(`Command "${command.name}" loaded from category "${folder}".`);
    } else {
      logger.warn(`Command file "${file}" in folder "${folder}" is missing a valid "name" property.`);
    }
  }
}

// 2) Dateien im Root-Verzeichnis von "commands" (ohne Unterordner)
const rootCommandFiles = dirEntries
  .filter(dirent => dirent.isFile() && dirent.name.endsWith(".js"))
  .map(dirent => dirent.name);

for (const file of rootCommandFiles) {
  const fileUrl = pathToFileURL(join(commandsPath, file)).href;
  const { default: command } = await import(fileUrl);
  
  if (command && command.name) {
    // Falls gewünscht: Standard-Kategorie, z. B. "Uncategorized"
    command.category = "Uncategorized";
    client.commands.set(command.name, command);
    logger.debug(`Command "${command.name}" loaded from root folder as "Uncategorized".`);
  } else {
    logger.warn(`Command file "${file}" in root commands folder is missing a valid "name" property.`);
  }
}

// MESSAGE CREATE LISTENER
client.on("messageCreate", async (message) => {
  // Ignore messages from bots or messages outside guilds
  if (message.author.bot || !message.guild) return;

  const prefix = client.config.prefix;
  if (!message.content.startsWith(prefix)) return;

  // Parse the command and arguments from the message
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  // Retrieve the command by name or alias
  const command =
    client.commands.get(commandName) ||
    client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
  if (!command) return;

  logger.debug(`Guild="${message.guild.id}" | Command="${commandName}" | Args=[${args.join(", ")}]`);
  
  try {
    // Execute the command
    await command.execute(client, message, args);
  } catch (error) {
    logger.error(`Error executing command "${commandName}":`, error);
    message.reply("An error occurred while executing that command.");
  }
});

// Initialize Lavalink (music streaming manager)
client.lavalink = new LavalinkManager({
  nodes: [
    {
      authorization: config.lavalinkPassword,
      host: config.lavalinkHost,
      port: config.lavalinkPort,
      id: "node1"
    }
  ],
  // Function to send payloads to the correct shard based on guild ID
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild && guild.shard) guild.shard.send(payload);
  },
  autoSkip: true,
  client: {
    id: config.clientId,
    username: config.username
  },
  queueOptions: {
    maxPreviousTracks: 1000
  },
  playerOptions: {
    useUnresolvedData: false,
    defaultSearchPlatform: config.defaultSearchPlatform || "ytmsearch"
  }
});
client.lavalinkReady = false;

// Forward raw events from Discord to Lavalink
client.on("raw", d => client.lavalink.sendRawData(d));

// Log in to Discord with the bot token from the configuration
client.login(config.token);

// When the client is ready, initialize Lavalink and set up event listeners
client.once("ready", async () => {
  logger.info(`Bot "${client.user.tag}" is now online.`);
  await client.lavalink.init(client.user);
  client.lavalinkReady = true;

  // Log when a Lavalink node is connected
  client.lavalink.nodeManager.on("create", (node) => {
    logger.debug(`Lavalink Node #${node.id} connected.`);
  });

  // Handle the trackStart event to update the UI after a track starts
  client.lavalink.on("trackStart", async (player, track) => {
    logger.debug(`Guild="${player.guildId}" | Track started: "${track.info.title}"`);
    trackStartTimestamps.set(player.guildId, Date.now());
    // Delay UI update to ensure the track has started
    setTimeout(async () => {
      const channel = player.textChannelId ? client.channels.cache.get(player.textChannelId) : null;
      if (channel) {
        await sendOrUpdateNowPlayingUI(player, channel);
        logger.debug(`UI updated for Guild="${player.guildId}" after trackStart.`);
      }
    }, 1000);
  });

  // Function to process end-of-queue events and reset player state
  const processQueueEnd = (player) => {
    logger.debug(`Processing queue end for Guild="${player.guildId}"`);
    player.queue.previous = [];
    player.queue.tracks = [];
    if (player.nowPlayingCollector) {
      logger.debug(`Stopping collector for Guild="${player.guildId}"`);
      player.nowPlayingCollector.stop();
      player.nowPlayingCollector = null;
    }
    if (player.nowPlayingInterval) {
      logger.debug(`Clearing interval for Guild="${player.guildId}"`);
      clearInterval(player.nowPlayingInterval);
      player.nowPlayingInterval = null;
    }
    if (player.nowPlayingMessage) {
      const stoppedEmbed = generateStoppedEmbed();
      player.nowPlayingMessage.edit({ embeds: [stoppedEmbed], components: [] }).catch(() => {});
      player.nowPlayingMessage = null;
    }
  };

  // Listen for the queueEnd event to reset the UI and state when the queue ends
  client.lavalink.on("queueEnd", (player) => {
    const startTime = trackStartTimestamps.get(player.guildId) || 0;
    const elapsed = Date.now() - startTime;
    if (elapsed < 2000) {
      const delay = 2000 - elapsed;
      logger.debug(`Delaying queueEnd processing for Guild="${player.guildId}" by ${delay}ms`);
      setTimeout(() => {
        processQueueEnd(player);
        trackStartTimestamps.delete(player.guildId);
      }, delay);
    } else {
      processQueueEnd(player);
      trackStartTimestamps.delete(player.guildId);
    }
  });

  // Listen for track exceptions and log errors in Discord
  client.lavalink.on("trackException", (player, track, payload) => {
    const errorMsg = payload.exception.message;
    logger.error(`Guild="${player.guildId}" | Track="${track.info.title}" | Exception: ${errorMsg}`);
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel) {
      if (errorMsg.includes("This video is unavailable")) {
        channel.send(`The track **${track.info.title}** is unavailable.`);
      } else {
        channel.send(`An error occurred while playing **${track.info.title}**: ${errorMsg}`);
      }
    }
  });

  // Listen for track end events with specific reasons (e.g., LOAD_FAILED)
  client.lavalink.on("trackEnd", (player, track, payload) => {
    logger.debug(`Guild="${player.guildId}" | Track="${track.info.title}" ended with reason: ${payload.reason}`);
    if (payload.reason === "LOAD_FAILED") {
      const channel = client.channels.cache.get(player.textChannelId);
      if (channel) {
        channel.send(`Track **${track.info.title}** ended unexpectedly (failed to load).`);
      }
    }
  });
});

export default client;
