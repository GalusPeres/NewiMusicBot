// In-memory ring buffer for recent log entries + EventEmitter for live streaming.
// Used by the HTTP API (/api/logs and /api/logs/stream) so the Botboard dashboard
// can display recent logs and subscribe to new ones.

import { EventEmitter } from "events";

const MAX_ENTRIES = 500;
const buffer = [];
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function push(entry) {
  const stamped = {
    time: entry.time || new Date().toISOString(),
    level: entry.level,
    src: entry.src || "core",
    text: entry.text,
  };
  buffer.push(stamped);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  emitter.emit("log", stamped);
  return stamped;
}

export function recent(limit = 200) {
  if (limit >= buffer.length) return [...buffer];
  return buffer.slice(buffer.length - limit);
}

export function subscribe(handler) {
  emitter.on("log", handler);
  return () => emitter.off("log", handler);
}
