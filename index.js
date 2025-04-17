// index.js
// Main entry point for NewiMusicBot.

import { Client, Collection, GatewayIntentBits } from "discord.js";
import { LavalinkManager } from "lavalink-client";
import fs from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { sendOrUpdateNowPlayingUI } from "./utils/nowPlayingManager.js";
import { generateStoppedEmbed } from "./utils/nowPlayingEmbed.js";
import logger from "./utils/logger.js";

// ────────────────────────────────────────────────────────────────────
// 1.  Helpers
// ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ────────────────────────────────────────────────────────────────────
// 2.  Load configuration
// ────────────────────────────────────────────────────────────────────
const cfgPath = join(__dirname, "config", "config.json");
let config = {};
try {
  const raw = await fs.readFile(cfgPath, "utf-8"); // ← plain ASCII hyphen
  config = JSON.parse(raw);
  logger.info("Configuration loaded.");
} catch (err) {
  logger.error("Failed to load configuration:", err);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────
// 3.  Discord client
// ────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────
// 4.  Dynamic command loader
// ────────────────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = join(__dirname, "commands");
const dirEntries   = await fs.readdir(commandsPath, { withFileTypes: true });

// 4‑a) folders act as categories
for (const folder of dirEntries.filter(e => e.isDirectory())) {
  const folderPath = join(commandsPath, folder.name);
  const files = (await fs.readdir(folderPath)).filter(f => f.endsWith(".js"));

  for (const file of files) {
    const mod = await import(pathToFileURL(join(folderPath, file)).href);
    if (!mod.default?.name) {
      logger.warn(`Command file "${file}" in "${folder.name}" has no name.`);
      continue;
    }
    mod.default.category = folder.name;
    client.commands.set(mod.default.name, mod.default);
    logger.debug(`Loaded "${mod.default.name}" from category "${folder.name}".`);
  }
}

// 4‑b) single files in commands root
for (const f of dirEntries.filter(e => e.isFile() && e.name.endsWith(".js"))) {
  const mod = await import(pathToFileURL(join(commandsPath, f.name)).href);
  if (!mod.default?.name) {
    logger.warn(`Root command "${f.name}" has no name.`);
    continue;
  }
  mod.default.category = "Uncategorized";
  client.commands.set(mod.default.name, mod.default);
  logger.debug(`Loaded "${mod.default.name}" (root).`);
}

// ────────────────────────────────────────────────────────────────────
// 5.  Message handler
// ────────────────────────────────────────────────────────────────────
client.on("messageCreate", async msg => {
  if (msg.author.bot || !msg.guild) return;
  if (!msg.content.startsWith(config.prefix)) return;

  const args = msg.content.slice(config.prefix.length).trim().split(/\s+/);
  const cmdName = args.shift().toLowerCase();

  const cmd =
    client.commands.get(cmdName) ||
    [...client.commands.values()].find(c => c.aliases?.includes(cmdName));
  if (!cmd) return;

  logger.debug(
    `Guild="${msg.guild.id}" | User="${msg.author.tag}" | Cmd="${cmdName}" | Args=[${args.join(", ")}]`
  );

  try {
    await cmd.execute(client, msg, args);
  } catch (err) {
    logger.error(`Error executing "${cmdName}":`, err);
    msg.reply("An error occurred while executing that command.");
  }
});

// ────────────────────────────────────────────────────────────────────
// 6.  Voice‑state logger (bot only)
// ────────────────────────────────────────────────────────────────────
client.on("voiceStateUpdate", (oldS, newS) => {
  if (newS.id !== client.user.id) return;
  const oldVC = oldS.channelId || "None";
  const newVC = newS.channelId || "None";
  logger.debug(`[VOICE] Guild="${newS.guild.id}" Bot moved: ${oldVC} -> ${newVC}`);
});

// ────────────────────────────────────────────────────────────────────
// 7.  Lavalink manager
// ────────────────────────────────────────────────────────────────────
client.lavalink = new LavalinkManager({
  nodes: [
    {
      authorization: config.lavalinkPassword,
      host:          config.lavalinkHost,
      port:          config.lavalinkPort,
      id:            "node1"
    }
  ],
  sendToShard: (gid, payload) => {
    const g = client.guilds.cache.get(gid);
    if (g && g.shard) g.shard.send(payload);
  },
  autoSkip: true,
  client: { id: config.clientId, username: config.username },
  queueOptions:  { maxPreviousTracks: 1000 },
  playerOptions: { defaultSearchPlatform: config.defaultSearchPlatform || "ytmsearch" }
});
client.lavalinkReady = false;
client.on("raw", d => client.lavalink.sendRawData(d));

// ────────────────────────────────────────────────────────────────────
// 8.  Login & ready
// ────────────────────────────────────────────────────────────────────
client.login(config.token);

client.once("ready", async () => {
  logger.info(`Bot "${client.user.tag}" is online.`);
  await client.lavalink.init(client.user);
  client.lavalinkReady = true;
});

// ────────────────────────────────────────────────────────────────────
// 9.  Lavalink event wiring
// ────────────────────────────────────────────────────────────────────
const trackStartTimestamps = new Map();

client.lavalink.on("trackStart", async (player, track) => {
  logger.debug(`Guild="${player.guildId}" | Track started: "${track.info.title}"`);
  trackStartTimestamps.set(player.guildId, Date.now());

  // update UI one second later so the voice state is in sync
  setTimeout(async () => {
    const ch = client.channels.cache.get(player.textChannelId);
    if (ch) await sendOrUpdateNowPlayingUI(player, ch);
  }, 1000);
});

function resetPlayerUI(player) {
  player.queue.previous = [];
  player.queue.tracks   = [];

  if (player.nowPlayingCollector) {
    player.nowPlayingCollector.stop();
    player.nowPlayingCollector = null;
  }
  if (player.nowPlayingInterval) {
    clearInterval(player.nowPlayingInterval);
    player.nowPlayingInterval = null;
  }
  if (player.nowPlayingMessage) {
    player.nowPlayingMessage
      .edit({ embeds: [generateStoppedEmbed()], components: [] })
      .catch(() => {});
    player.nowPlayingMessage = null;
  }
}

client.lavalink.on("queueEnd", player => {
  const elapsed = Date.now() - (trackStartTimestamps.get(player.guildId) || 0);
  const delay   = elapsed < 2000 ? 2000 - elapsed : 0;
  setTimeout(() => {
    resetPlayerUI(player);
    trackStartTimestamps.delete(player.guildId);
  }, delay);
});

client.lavalink.on("trackException", (player, track, payload) => {
  const msg = payload.exception.message;
  logger.error(`Guild="${player.guildId}" | Track="${track.info.title}" | Exception: ${msg}`);

  const ch = client.channels.cache.get(player.textChannelId);
  if (!ch) return;
  if (msg.includes("unavailable")) {
    ch.send(`The track **${track.info.title}** is unavailable.`);
  } else {
    ch.send(`An error occurred while playing **${track.info.title}**:\n\`${msg}\``);
  }
});

client.lavalink.on("trackEnd", (player, track, payload) => {
  logger.debug(
    `Guild="${player.guildId}" | Track="${track.info.title}" ended with reason: ${payload.reason}`
  );
  if (payload.reason === "LOAD_FAILED") {
    const ch = client.channels.cache.get(player.textChannelId);
    if (ch) ch.send(`Track **${track.info.title}** ended unexpectedly (failed to load).`);
  }
});

export default client;
