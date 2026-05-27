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

export default function settingsRoutes(client) {
  const router = Router();

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
