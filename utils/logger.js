// utils/logger.js
// A centralized logger with configurable log levels supplied via LOG_LEVEL.
// Also pushes every emitted log into the api/logBuffer ring for the dashboard.

import { push as pushLog } from "../api/logBuffer.js";

const levels = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevel() {
  const configuredLevel = (global.config?.logLevel || process.env.LOG_LEVEL || "info").toLowerCase();
  return levels[configuredLevel] !== undefined ? levels[configuredLevel] : levels.info;
}

function formatArg(a) {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === "object") {
    try { return JSON.stringify(a); } catch { return String(a); }
  }
  return String(a);
}

function inferSource(text) {
  if (/lavalink|player|track|queue/i.test(text)) return "music";
  if (/voice/i.test(text)) return "voice";
  return "core";
}

function log(level, ...args) {
  if (levels[level] < currentLevel()) return;
  const line = args.map(formatArg).join(" ");
  console.log(`[${level.toUpperCase()}]`, line);
  pushLog({ level, src: inferSource(line), text: line });
}

export default {
  debug: (...args) => log("debug", ...args),
  info: (...args) => log("info", ...args),
  warn: (...args) => log("warn", ...args),
  error: (...args) => log("error", ...args),
};
