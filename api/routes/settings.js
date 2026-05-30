import { Router } from "express";
import { CONFIG_ENV_VARS } from "../../config/env.js";
import { writeEnvUpdates } from "../envFile.js";

const SECRET_KEYS = new Set(["token", "lavalinkPassword"]);
const EDITABLE_KEYS = new Set(
  Object.keys(CONFIG_ENV_VARS).filter((key) => !["token", "clientId"].includes(key) && !key.startsWith("emoji"))
);
const EMOJI_KEYS = Object.freeze({
  emojiPrevious: "previous",
  emojiPlaypause: "playpause",
  emojiSkip: "skip",
  emojiShuffle: "shuffle",
  emojiStop: "stop",
  emojiYt: "yt",
  emojiYtm: "ytm",
});
for (const key of Object.keys(EMOJI_KEYS)) EDITABLE_KEYS.add(key);
const RESTART_REQUIRED_KEYS = new Set([
  "username",
  "lavalinkHost",
  "lavalinkPort",
  "lavalinkPassword",
  "lavalinkTimeout",
  "lavalinkRetryDelay",
  "lavalinkRetryCount",
  "maxPreviousTracks",
]);
const NUMBER_KEYS = new Set([
  "lavalinkPort",
  "defaultVolume",
  "lavalinkTimeout",
  "connectionTimeout",
  "commandCooldown",
  "lavalinkRetryDelay",
  "lavalinkRetryCount",
  "maxPlaylistSize",
  "maxSearchResults",
  "uiUpdateInterval",
  "progressBarLength",
  "maxDisplayTracks",
  "autoDisconnectDelay",
  "pauseTimeout",
  "volumeStep",
  "cacheTTL",
  "maxCacheSize",
  "maxConcurrentSearches",
  "maxQueueSize",
  "maxPreviousTracks",
]);
const BOOLEAN_KEYS = new Set([
  "fastModeEnabled",
  "fastUIUpdates",
  "autoUICleanup",
  "preBufferNext",
  "smartVolumeControl",
  "cacheEnabled",
  "cacheSearchResults",
  "trackQualityCache",
]);
const LABELS = Object.freeze({
  prefix: "Command prefix",
  username: "Bot username",
  logLevel: "Log level",
  lavalinkPassword: "Lavalink password",
  lavalinkHost: "Lavalink host",
  lavalinkPort: "Lavalink port",
  defaultSearchPlatform: "Default search platform",
  defaultVolume: "Default volume",
  lavalinkTimeout: "Lavalink timeout",
  connectionTimeout: "Connection timeout",
  commandCooldown: "Command cooldown",
  lavalinkRetryDelay: "Lavalink retry delay",
  lavalinkRetryCount: "Lavalink retry count",
  maxPlaylistSize: "Max playlist size",
  maxSearchResults: "Max search results",
  fastModeEnabled: "Fast mode",
  uiUpdateInterval: "UI update interval",
  fastUIUpdates: "Fast UI updates",
  progressBarLength: "Progress bar length",
  maxDisplayTracks: "Max displayed tracks",
  autoUICleanup: "Auto UI cleanup",
  autoDisconnectDelay: "Auto disconnect delay",
  pauseTimeout: "Pause timeout",
  volumeStep: "Volume step",
  preBufferNext: "Pre-buffer next track",
  smartVolumeControl: "Smart volume control",
  cacheEnabled: "Cache enabled",
  cacheSearchResults: "Cache search results",
  cacheTTL: "Cache TTL",
  maxCacheSize: "Max cache size",
  trackQualityCache: "Track quality cache",
  maxConcurrentSearches: "Max concurrent searches",
  maxQueueSize: "Max queue size",
  maxPreviousTracks: "Max previous tracks",
  emojiPrevious: "Previous emoji ID",
  emojiPlaypause: "Play/pause emoji ID",
  emojiSkip: "Skip emoji ID",
  emojiShuffle: "Shuffle emoji ID",
  emojiStop: "Stop emoji ID",
  emojiYt: "YouTube emoji ID",
  emojiYtm: "YouTube Music emoji ID",
});
const SETTING_SECTIONS = [
  {
    id: "general",
    label: "General",
    fields: ["prefix", "username", "logLevel", "defaultSearchPlatform", "defaultVolume"],
  },
  {
    id: "lavalink",
    label: "Lavalink",
    fields: ["lavalinkHost", "lavalinkPort", "lavalinkPassword", "lavalinkTimeout", "lavalinkRetryDelay", "lavalinkRetryCount"],
  },
  {
    id: "limits",
    label: "Limits and timing",
    fields: [
      "connectionTimeout",
      "commandCooldown",
      "maxPlaylistSize",
      "maxSearchResults",
      "maxQueueSize",
      "maxPreviousTracks",
      "autoDisconnectDelay",
      "pauseTimeout",
    ],
  },
  {
    id: "ui",
    label: "Player UI",
    fields: ["fastModeEnabled", "uiUpdateInterval", "fastUIUpdates", "progressBarLength", "maxDisplayTracks", "autoUICleanup", "volumeStep"],
  },
  {
    id: "cache",
    label: "Cache",
    fields: [
      "preBufferNext",
      "smartVolumeControl",
      "cacheEnabled",
      "cacheSearchResults",
      "cacheTTL",
      "maxCacheSize",
      "trackQualityCache",
      "maxConcurrentSearches",
    ],
  },
  {
    id: "emoji",
    label: "Emoji IDs",
    fields: Object.keys(EMOJI_KEYS),
  },
];

function redact(cfg) {
  const out = { ...cfg };
  for (const key of SECRET_KEYS) {
    if (out[key]) out[key] = "******";
  }
  return out;
}

function exposeSettings(cfg) {
  const out = redact(cfg || {});
  for (const [key, nestedKey] of Object.entries(EMOJI_KEYS)) {
    out[key] = cfg?.emojiIds?.[nestedKey] || "";
  }
  return out;
}

function currentSetting(cfg, key) {
  const nestedKey = EMOJI_KEYS[key];
  return nestedKey ? cfg?.emojiIds?.[nestedKey] || "" : cfg?.[key];
}

function settingField(key) {
  return {
    key,
    env: CONFIG_ENV_VARS[key],
    label: LABELS[key] || key,
    type: SECRET_KEYS.has(key) ? "password" : BOOLEAN_KEYS.has(key) ? "boolean" : NUMBER_KEYS.has(key) ? "number" : "text",
    editable: EDITABLE_KEYS.has(key),
    restartRequired: RESTART_REQUIRED_KEYS.has(key),
    secret: SECRET_KEYS.has(key),
  };
}

function settingsSchema() {
  return {
    managedBy: "environment",
    sections: SETTING_SECTIONS.map((section) => ({
      ...section,
      fields: section.fields.map(settingField).filter((field) => field.env),
    })),
  };
}

export default function settingsRoutes(client) {
  const router = Router();

  router.get("/schema", (req, res) => {
    res.json(settingsSchema());
  });

  router.get("/", (req, res) => {
    res.json({
      ...exposeSettings(client.config),
      managedBy: "environment",
      environmentVariables: CONFIG_ENV_VARS,
    });
  });

  router.put("/", async (req, res) => {
    try {
      const patch = req.body || {};
      const applied = {};
      const envUpdates = {};

      for (const [key, rawValue] of Object.entries(patch)) {
        if (!EDITABLE_KEYS.has(key)) {
          return res.status(400).json({ error: `setting is not editable: ${key}` });
        }
        if (key === "lavalinkPassword" && rawValue === "******") continue;

        const current = currentSetting(client.config, key);
        let value = rawValue;
        if (typeof current === "number") {
          value = Number(rawValue);
          if (!Number.isFinite(value)) return res.status(400).json({ error: `invalid number for ${key}` });
        } else if (typeof current === "boolean") {
          if (typeof rawValue !== "boolean") return res.status(400).json({ error: `invalid boolean for ${key}` });
        } else {
          value = String(rawValue ?? "").trim();
          if (!value) return res.status(400).json({ error: `empty value for ${key}` });
        }

        applied[key] = value;
        envUpdates[CONFIG_ENV_VARS[key]] = value;
      }

      if (!Object.keys(applied).length) {
        return res.status(400).json({ error: "no editable settings supplied" });
      }

      await writeEnvUpdates(envUpdates);
      for (const [key, value] of Object.entries(applied)) {
        const nestedKey = EMOJI_KEYS[key];
        if (nestedKey) {
          client.config.emojiIds[nestedKey] = value;
        } else {
          client.config[key] = value;
        }
      }
      res.json({
        ...exposeSettings(client.config),
        managedBy: "environment",
        environmentVariables: CONFIG_ENV_VARS,
        saved: Object.keys(applied),
        restartRequired: Object.keys(applied).some((key) => RESTART_REQUIRED_KEYS.has(key)),
      });
    } catch (err) {
      res.status(500).json({ error: `failed to update .env: ${err.message}` });
    }
  });

  return router;
}
