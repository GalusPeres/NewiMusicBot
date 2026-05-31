import fs from "node:fs";

// Load persisted settings from BOT_ENV_FILE (default /data/.env) into
// process.env before the bot config is read. Values in the file override
// the container ENV so Botboard-saved settings survive restarts.
export function loadEnvFile() {
  const filePath = process.env.BOT_ENV_FILE || "/data/.env";
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("[env] Could not load env file:", err.message);
  }
}

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function text(env, name, fallback) {
  return env[name] ?? fallback;
}

function number(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric environment variable: ${name}`);
  return value;
}

function boolean(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`Invalid boolean environment variable: ${name}`);
}

export const CONFIG_ENV_VARS = Object.freeze({
  token: "DISCORD_TOKEN",
  clientId: "DISCORD_CLIENT_ID",
  prefix: "COMMAND_PREFIX",
  username: "BOT_USERNAME",
  logLevel: "LOG_LEVEL",
  lavalinkPassword: "LAVALINK_PASSWORD",
  lavalinkHost: "LAVALINK_HOST",
  lavalinkPort: "LAVALINK_PORT",
  defaultSearchPlatform: "DEFAULT_SEARCH_PLATFORM",
  defaultVolume: "DEFAULT_VOLUME",
  lavalinkTimeout: "LAVALINK_TIMEOUT_MS",
  connectionTimeout: "CONNECTION_TIMEOUT_MS",
  commandCooldown: "COMMAND_COOLDOWN_MS",
  lavalinkRetryDelay: "LAVALINK_RETRY_DELAY_MS",
  lavalinkRetryCount: "LAVALINK_RETRY_COUNT",
  maxPlaylistSize: "MAX_PLAYLIST_SIZE",
  maxSearchResults: "MAX_SEARCH_RESULTS",
  fastModeEnabled: "FAST_MODE_ENABLED",
  uiUpdateInterval: "UI_UPDATE_INTERVAL_MS",
  fastUIUpdates: "FAST_UI_UPDATES",
  progressBarLength: "PROGRESS_BAR_LENGTH",
  maxDisplayTracks: "MAX_DISPLAY_TRACKS",
  autoUICleanup: "AUTO_UI_CLEANUP",
  autoDisconnectDelay: "AUTO_DISCONNECT_DELAY_MS",
  pauseTimeout: "PAUSE_TIMEOUT_MS",
  volumeStep: "VOLUME_STEP",
  preBufferNext: "PREBUFFER_NEXT",
  smartVolumeControl: "SMART_VOLUME_CONTROL",
  cacheEnabled: "CACHE_ENABLED",
  cacheSearchResults: "CACHE_SEARCH_RESULTS",
  cacheTTL: "CACHE_TTL_SECONDS",
  maxCacheSize: "MAX_CACHE_SIZE",
  trackQualityCache: "TRACK_QUALITY_CACHE",
  maxConcurrentSearches: "MAX_CONCURRENT_SEARCHES",
  maxQueueSize: "MAX_QUEUE_SIZE",
  maxPreviousTracks: "MAX_PREVIOUS_TRACKS",
  emojiPrevious: "EMOJI_PREVIOUS_ID",
  emojiPlaypause: "EMOJI_PLAYPAUSE_ID",
  emojiSkip: "EMOJI_SKIP_ID",
  emojiShuffle: "EMOJI_SHUFFLE_ID",
  emojiStop: "EMOJI_STOP_ID",
  emojiYt: "EMOJI_YT_ID",
  emojiYtm: "EMOJI_YTM_ID",
});

export function loadConfig(env = process.env) {
  return {
    token: required(env, CONFIG_ENV_VARS.token),
    clientId: required(env, CONFIG_ENV_VARS.clientId),
    prefix: text(env, CONFIG_ENV_VARS.prefix, "."),
    username: text(env, CONFIG_ENV_VARS.username, "NewiMusicBot"),
    logLevel: text(env, CONFIG_ENV_VARS.logLevel, "info"),
    lavalinkPassword: required(env, CONFIG_ENV_VARS.lavalinkPassword),
    lavalinkHost: text(env, CONFIG_ENV_VARS.lavalinkHost, "localhost"),
    lavalinkPort: number(env, CONFIG_ENV_VARS.lavalinkPort, 2333),
    defaultSearchPlatform: text(env, CONFIG_ENV_VARS.defaultSearchPlatform, "ytsearch"),
    defaultVolume: number(env, CONFIG_ENV_VARS.defaultVolume, 40),
    lavalinkTimeout: number(env, CONFIG_ENV_VARS.lavalinkTimeout, 15000),
    connectionTimeout: number(env, CONFIG_ENV_VARS.connectionTimeout, 7000),
    commandCooldown: number(env, CONFIG_ENV_VARS.commandCooldown, 2000),
    lavalinkRetryDelay: number(env, CONFIG_ENV_VARS.lavalinkRetryDelay, 5000),
    lavalinkRetryCount: number(env, CONFIG_ENV_VARS.lavalinkRetryCount, 3),
    maxPlaylistSize: number(env, CONFIG_ENV_VARS.maxPlaylistSize, 50),
    maxSearchResults: number(env, CONFIG_ENV_VARS.maxSearchResults, 10),
    fastModeEnabled: boolean(env, CONFIG_ENV_VARS.fastModeEnabled, true),
    uiUpdateInterval: number(env, CONFIG_ENV_VARS.uiUpdateInterval, 3000),
    fastUIUpdates: boolean(env, CONFIG_ENV_VARS.fastUIUpdates, true),
    progressBarLength: number(env, CONFIG_ENV_VARS.progressBarLength, 18),
    maxDisplayTracks: number(env, CONFIG_ENV_VARS.maxDisplayTracks, 10),
    autoUICleanup: boolean(env, CONFIG_ENV_VARS.autoUICleanup, true),
    autoDisconnectDelay: number(env, CONFIG_ENV_VARS.autoDisconnectDelay, 300000),
    pauseTimeout: number(env, CONFIG_ENV_VARS.pauseTimeout, 1200000),
    volumeStep: number(env, CONFIG_ENV_VARS.volumeStep, 5),
    preBufferNext: boolean(env, CONFIG_ENV_VARS.preBufferNext, true),
    smartVolumeControl: boolean(env, CONFIG_ENV_VARS.smartVolumeControl, true),
    cacheEnabled: boolean(env, CONFIG_ENV_VARS.cacheEnabled, true),
    cacheSearchResults: boolean(env, CONFIG_ENV_VARS.cacheSearchResults, true),
    cacheTTL: number(env, CONFIG_ENV_VARS.cacheTTL, 300),
    maxCacheSize: number(env, CONFIG_ENV_VARS.maxCacheSize, 500),
    trackQualityCache: boolean(env, CONFIG_ENV_VARS.trackQualityCache, true),
    maxConcurrentSearches: number(env, CONFIG_ENV_VARS.maxConcurrentSearches, 3),
    maxQueueSize: number(env, CONFIG_ENV_VARS.maxQueueSize, 1000),
    maxPreviousTracks: number(env, CONFIG_ENV_VARS.maxPreviousTracks, 50),
    emojiIds: {
      previous: text(env, CONFIG_ENV_VARS.emojiPrevious, ""),
      playpause: text(env, CONFIG_ENV_VARS.emojiPlaypause, ""),
      skip: text(env, CONFIG_ENV_VARS.emojiSkip, ""),
      shuffle: text(env, CONFIG_ENV_VARS.emojiShuffle, ""),
      stop: text(env, CONFIG_ENV_VARS.emojiStop, ""),
      yt: text(env, CONFIG_ENV_VARS.emojiYt, ""),
      ytm: text(env, CONFIG_ENV_VARS.emojiYtm, ""),
    },
  };
}
