// utils/safeDiscord.js
// -----------------------------------------------------------------------------
// Safe wrappers around Discord message operations.
//
// • safeEdit(message, payload, retried = false, log = false)
//     – Ignores DiscordAPIError[10008] (unknown message – already gone).
//     – Handles HTTP-429: waits retry_after seconds and retries once.
//     – Writes a debug entry **only if log === true**.
// • safeDelete(message)
// -----------------------------------------------------------------------------

import logger from "./logger.js";

/**
 * Edits a Discord message safely.
 * @param {import('discord.js').Message} message
 * @param {object} payload          – same payload you’d pass to message.edit()
 * @param {boolean} retried         – internal recursion flag
 * @param {boolean} log             – write logger.debug if the edit succeeds
 */
export async function safeEdit(message, payload, retried = false, log = false) {
  if (!message) return;
  try {
    // Only compare if payload actually contains data to modify
    if (payload.content !== undefined || payload.embeds !== undefined) {
      const sameContent =
        (payload.content === undefined || payload.content === message.content) &&
        (payload.embeds === undefined ||
          (payload.embeds.length === message.embeds.length &&
           JSON.stringify(payload.embeds.map(e => e.toJSON?.() || e)) ===
           JSON.stringify(message.embeds.map(e => e.toJSON()))));

      if (sameContent) return message;
    }

    const res = await message.edit(payload);
    if (log) logger.debug(`[safeEdit] message ${message.id} patched`);
    return res;
  } catch (err) {
    if (err.code === 10008) return;                        // message already deleted
    if (err.status === 429 && !retried && err.retry_after) {
      await new Promise(r => setTimeout(r, err.retry_after * 1000));
      return safeEdit(message, payload, true, log);        // one retry
    }
    throw err;
  }
}

/**
 * Deletes a Discord message safely.
 * @param {import('discord.js').Message} message
 */
export async function safeDelete(message, retried = false) {
  if (!message) return;
  try {
    await message.delete();
    logger.debug(`[safeDelete] message ${message.id} removed`);
  } catch (err) {
    if (err.code === 10008) return;                        // already gone
    if (err.status === 429 && !retried && err.retry_after) {
      await new Promise(r => setTimeout(r, err.retry_after * 1000));
      return safeDelete(message, true);
    }
    throw err;
  }
}
