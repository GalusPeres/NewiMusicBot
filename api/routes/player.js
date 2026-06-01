import { Router } from "express";
import { serializePlayer, serializeTrack } from "../serialize.js";
import { togglePlayPause, performSkip, performStop } from "../../utils/playerControls.js";
import logger from "../../utils/logger.js";

export default function playerRoutes(client) {
  const router = Router({ mergeParams: true });

  router.use((req, res, next) => {
    if (!client.lavalinkReady) {
      return res.status(503).json({ error: "lavalink not ready" });
    }
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: "guild not found" });
    req.guild = guild;
    req.player = client.lavalink.getPlayer(guild.id);
    next();
  });

  router.get("/", (req, res) => {
    if (!req.player) return res.json(null);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/connect", async (req, res) => {
    const channelId = req.body?.channelId;
    const voiceChannel = channelId ? req.guild.channels.cache.get(channelId) : null;
    if (!voiceChannel || voiceChannel.type !== 2) {
      return res.status(400).json({ error: "valid voice channelId required" });
    }
    try {
      let player = req.player;
      if (!player) {
        player = await client.lavalink.createPlayer({
          guildId: req.guild.id,
          voiceChannelId: voiceChannel.id,
          textChannelId: voiceChannel.id,
          selfDeaf: true,
          volume: client.config.defaultVolume || 50,
        });
        await player.connect();
      } else if (player.voiceChannelId !== voiceChannel.id) {
        // Use changeVoiceState to properly move channels — player.connect() reads
        // from player.options.voiceChannelId (not the property) so direct assignment
        // has no effect and the bot stays in the old channel.
        await player.changeVoiceState({ voiceChannelId: voiceChannel.id });
      } else if (!player.connected) {
        await player.connect();
      }
      // else: already in the right channel and connected — nothing to do
      res.json(serializePlayer(player, client));
    } catch (err) {
      logger.error("[api] connect error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/search", async (req, res) => {
    const query = String(req.body?.query || "").trim();
    if (query.length < 2) return res.json([]);

    try {
      const mode = client.config.defaultSearchPlatform || "ytsearch";
      const isUrl = /^https?:\/\//.test(query);
      const finalQuery = isUrl ? query : `${mode}:${query}`;
      const node = req.player || client.lavalink.nodeManager.leastUsedNodes("calls")[0];
      if (!node) return res.status(503).json({ error: "no connected lavalink node" });

      const result = await node.search({ query: finalQuery, source: mode }, { id: "dashboard" });
      const limit = client.config.maxSearchResults || 10;
      res.json((result?.tracks || []).slice(0, limit).map(serializeTrack));
    } catch (err) {
      logger.error("[api] search error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/play", async (req, res) => {
    const { query, channelId } = req.body || {};
    if (!query) return res.status(400).json({ error: "query required" });

    const voiceChannel = channelId
      ? req.guild.channels.cache.get(channelId)
      : req.player?.voiceChannelId
        ? req.guild.channels.cache.get(req.player.voiceChannelId)
        : null;
    if (!voiceChannel || voiceChannel.type !== 2) {
      return res.status(400).json({ error: "valid voice channelId required" });
    }

    try {
      let player = req.player;
      if (!player) {
        player = await client.lavalink.createPlayer({
          guildId: req.guild.id,
          voiceChannelId: voiceChannel.id,
          textChannelId: voiceChannel.id,
          selfDeaf: true,
          volume: client.config.defaultVolume || 50,
        });
        await player.connect();
      } else if (player.voiceChannelId !== voiceChannel.id) {
        await player.changeVoiceState({ voiceChannelId: voiceChannel.id });
      }

      const isUrl = /^https?:\/\//.test(query);
      const mode = client.config.defaultSearchPlatform || "ytsearch";
      const finalQuery = isUrl ? query : `${mode}:${query}`;
      const result = await player.search({ query: finalQuery, source: mode }, { id: "dashboard" });
      if (!result?.tracks?.length) {
        return res.status(404).json({ error: "no tracks found" });
      }

      const tracks = result.loadType === "playlist" ? result.tracks : [result.tracks[0]];
      player.queue.add(tracks);
      if (!player.playing && !player.paused) await player.play();
      logger.info(`[api] Queued ${tracks.length} track(s) via dashboard: "${query}"`);
      res.json({ added: tracks.length, player: serializePlayer(player, client) });
    } catch (err) {
      logger.error("[api] play error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/pause", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    await togglePlayPause(req.player);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/skip", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    await performSkip(req.player);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/previous", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    try {
      const previous = req.player.queue.previous?.[0];
      if (previous) {
        req.player.queue.add(previous, 0);
        await req.player.skip();
      } else {
        await req.player.seek(0);
      }
      res.json(serializePlayer(req.player, client));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/stop", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    await performStop(req.player);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/volume", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    const value = Number(req.body?.value);
    if (Number.isNaN(value) || value < 0 || value > 200) {
      return res.status(400).json({ error: "value must be 0..200" });
    }
    await req.player.setVolume(value, false);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/seek", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    const position = Number(req.body?.position);
    if (Number.isNaN(position) || position < 0) {
      return res.status(400).json({ error: "position required (ms)" });
    }
    await req.player.seek(position);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/shuffle", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    req.player.queue.shuffle();
    res.json(serializePlayer(req.player, client));
  });

  router.post("/repeat", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    const mode = req.body?.mode;
    const valid = ["off", "track", "queue"];
    if (!valid.includes(mode)) return res.status(400).json({ error: "mode must be off|track|queue" });
    await req.player.setRepeatMode(mode);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/clear", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    req.player.queue.tracks = [];
    res.json(serializePlayer(req.player, client));
  });

  router.post("/remove", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    const index = Number(req.body?.index);
    if (Number.isNaN(index) || index < 0 || index >= req.player.queue.tracks.length) {
      return res.status(400).json({ error: "invalid index" });
    }
    req.player.queue.tracks.splice(index, 1);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/move", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    const from = Number(req.body?.from);
    const to = Number(req.body?.to);
    const tracks = req.player.queue.tracks;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= tracks.length || to < 0 || to >= tracks.length) {
      return res.status(400).json({ error: "invalid queue indices" });
    }
    const [track] = tracks.splice(from, 1);
    tracks.splice(to, 0, track);
    res.json(serializePlayer(req.player, client));
  });

  router.post("/jump", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    const index = Number(req.body?.index);
    if (Number.isNaN(index) || index < 0 || index >= req.player.queue.tracks.length) {
      return res.status(400).json({ error: "invalid index" });
    }
    req.player.queue.tracks.splice(0, index);
    await req.player.skip();
    res.json(serializePlayer(req.player, client));
  });

  router.delete("/", async (req, res) => {
    if (!req.player) return res.status(404).json({ error: "no active player" });
    await req.player.destroy();
    client.lavalink.players.delete(req.guild.id);
    res.json({ disconnected: true });
  });

  return router;
}
