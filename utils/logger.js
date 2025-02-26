// utils/logger.js
// A centralized logger with configurable log levels, which loads the log level from config.json

import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Determine the path to config.json similar to setconfig.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, "..", "config", "config.json");

let config = {};
try {
  // Read the configuration file synchronously
  const data = fs.readFileSync(configPath, "utf-8");
  config = JSON.parse(data);
} catch (err) {
  console.error("[LOGGER] Failed to load config:", err);
  // If config cannot be loaded, set a default logLevel
  config.logLevel = "error";
}

// Define log levels with numerical priorities
const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Use the log level from config or default to "error" (only errors will be logged)
const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : levels.error;

/**
 * Logs messages if the message level is greater than or equal to the current level.
 * Formats the output with the log level in uppercase.
 *
 * @param {string} level - The log level of the message (debug, info, warn, error)
 * @param {...any} args - The message or objects to log.
 */
function log(level, ...args) {
  if (levels[level] >= currentLevel) {
    console.log(`[${level.toUpperCase()}]`, ...args);
  }
}

export default {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
