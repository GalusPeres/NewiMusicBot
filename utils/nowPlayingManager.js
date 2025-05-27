// utils/nowPlayingManager.js
// ─────────────────────────────────────────────────────────────────────────────
// Manages the “Now Playing” UI message.  Robust against message deletions and
// Discord 404s, keeps the UI alive for very long sessions.
// Update-interval is throttled to 5 s; only real changes trigger a PATCH.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import {
  generateNowPlayingEmbed,
  generateStoppedEmbed
} from "./nowPlayingEmbed.js";
import { updateNowPlaying } from "./updateNowPlaying.js";
import {
  togglePlayPause,
  performSkip,
  performStop
} from "./playerControls.js";
import logger from "./logger.js";
import { isDeepStrictEqual as isEqual } from "node:util";

// Minimum time between two automatic UI updates (ms)
const MIN_UI_UPDATE_INTERVAL = 5000;   // 5 s

// ─────────────────────────────────────────────────────────────────────────────
// Helper – build the five control buttons
// ─────────────────────────────────────────────────────────────────────────────
function createButtonRow(player) {
  const prevDisabled = !(player.queue.previous && player.queue.previous.length);
  const skipDisabled = !(player.queue.tracks   && player.queue.tracks.length);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("previous")
      .setEmoji({ name: "previous", id: "1343186231856730172" })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId("playpause")
      .setEmoji({ name: "playpause", id: "1342881662660509776" })
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("skip")
      .setEmoji({ name: "skip", id: "1342881629432971314" })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(skipDisabled),
    new ButtonBuilder()
      .setCustomId("shuffle")
      .setEmoji({ name: "shuffle", id: "1343989666826682489" })
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("stop")
      .setEmoji({ name: "stop", id: "1342881694893604967" })
      .setStyle(ButtonStyle.Danger)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureNowPlayingMessage – returns a *valid* UI message, re-creates if lost
// ─────────────────────────────────────────────────────────────────────────────
async function ensureNowPlayingMessage(player, channel) {
  if (player.nowPlayingMessage) return player.nowPlayingMessage;

  const embed = generateNowPlayingEmbed(player);
  if (!embed) return null;               // nothing playing – nothing to show

  const buttonRow = createButtonRow(player);
  player.nowPlayingMessage = await channel.send({
    embeds:     [embed],
    components: [buttonRow]
  });

  registerCollector(player, channel);    // new message ⇒ new collector
  logger.debug(`[nowPlayingManager] Fresh UI message created in Guild=${channel.guildId}.`);
  return player.nowPlayingMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// registerCollector – sets up (or replaces) the interaction collector
// ─────────────────────────────────────────────────────────────────────────────
function registerCollector(player, channel) {
  if (player.nowPlayingCollector) {
    player.nowPlayingCollector.stop();   // remove stale collector first
    player.nowPlayingCollector = null;
  }
  if (!player.nowPlayingMessage) return;

  const collector = player.nowPlayingMessage.createMessageComponentCollector();
  player.nowPlayingCollector = collector;

  collector.on("collect", async interaction => {
    if (!interaction.isButton()) return;
    await interaction.deferUpdate();

    // guarantee message exists before editing
    await ensureNowPlayingMessage(player, interaction.channel);

    switch (interaction.customId) {
      // ───────── STOP BUTTON ─────────
      case "stop": {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirmStop")
            .setLabel("Confirm Stop")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cancelStop")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
        );
        await player.nowPlayingMessage.edit({ components: [confirmRow] });
        player.stopConfirmationTimeout = setTimeout(
          () => restoreOriginalUI(player, interaction.channel),
          10_000
        );
        break;
      }

      case "confirmStop":
        clearTimeout(player.stopConfirmationTimeout);
        await performStop(player);
        collector.stop();
        break;

      case "cancelStop":
        clearTimeout(player.stopConfirmationTimeout);
        await restoreOriginalUI(player, interaction.channel);
        break;

      // ───────── PREVIOUS ─────────
      case "previous":
        try {
          const prev = await player.queue.shiftPrevious();
          if (prev) {
            if (player.queue.current)
              player.queue.tracks.unshift(player.queue.current);
            player.queue.current = prev;
            await player.play({ clientTrack: prev });
            await sendOrUpdateNowPlayingUI(player, interaction.channel);
          }
        } catch (err) {
          logger.error("[nowPlayingManager] Error on 'previous':", err);
        }
        break;

      // ───────── PLAY/PAUSE ─────────
      case "playpause":
        try {
          await togglePlayPause(player);
          await sendOrUpdateNowPlayingUI(player, interaction.channel);
        } catch (err) {
          logger.error("[nowPlayingManager] Error on 'playpause':", err);
        }
        break;

      // ───────── SKIP ─────────
      case "skip":
        try {
          await performSkip(player);
          setTimeout(() => sendOrUpdateNowPlayingUI(player, interaction.channel), 500);
        } catch (err) {
          logger.error("[nowPlayingManager] Error on 'skip':", err);
        }
        break;

      // ───────── SHUFFLE ─────────
      case "shuffle":
        try {
          for (let i = player.queue.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [player.queue.tracks[i], player.queue.tracks[j]] =
              [player.queue.tracks[j], player.queue.tracks[i]];
          }
          await sendOrUpdateNowPlayingUI(player, interaction.channel);
        } catch (err) {
          logger.error("[nowPlayingManager] Error on 'shuffle':", err);
        }
        break;
    }
  });

  collector.on("end", () => {
    player.nowPlayingMessage?.edit({ components: [] }).catch(() => {});
  });
}

// Restore UI after cancel/timeout on stop
async function restoreOriginalUI(player, channel) {
  const emb = generateNowPlayingEmbed(player) || generateStoppedEmbed();
  const row = createButtonRow(player);
  await ensureNowPlayingMessage(player, channel);
  await player.nowPlayingMessage
    .edit({ embeds: [emb], components: [row] })
    .catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Public – main entry: create or update UI, diff-checked & throttled
// ─────────────────────────────────────────────────────────────────────────────
export async function sendOrUpdateNowPlayingUI(player, channel) {
  const now = Date.now();
  if (player._lastUIUpdate && now - player._lastUIUpdate < MIN_UI_UPDATE_INTERVAL) {
    return player.nowPlayingMessage;   // too soon – skip
  }
  player._lastUIUpdate = now;

  // Ensure we have a message (may recreate)
  const msg = await ensureNowPlayingMessage(player, channel);
  if (!msg) return null;               // nothing playing

  const embed      = generateNowPlayingEmbed(player);
  const buttonRow  = createButtonRow(player);
  const newData    = embed?.toJSON() || {};

  if (player._lastEmbedData && isEqual(player._lastEmbedData, newData)) {
    return msg;                        // unchanged – no PATCH
  }
  player._lastEmbedData = newData;

  try {
    await msg.edit({ embeds: [embed], components: [buttonRow] });
  } catch (err) {
    // 10008 Unknown Message – message vanished
    if (err.code === 10008) {
      logger.warn(`[nowPlayingManager] UI message lost (10008) in Guild=${channel.guildId}.`);
      if (player.nowPlayingCollector) {
        player.nowPlayingCollector.stop();
        player.nowPlayingCollector = null;
      }
      player.nowPlayingMessage = null;
    } else {
      logger.error("[nowPlayingManager] sendOrUpdateNowPlayingUI Error:", err);
    }
  }

  // Auto-progress ticker (5 s) – keeps the time bar moving
  if (!player.nowPlayingInterval) {
    player.nowPlayingInterval = setInterval(() => {
      if (player.playing || player.paused) {
        updateNowPlaying(player);
      } else {
        clearInterval(player.nowPlayingInterval);
        player.nowPlayingInterval = null;
      }
    }, MIN_UI_UPDATE_INTERVAL);
  }
  return msg;
}
