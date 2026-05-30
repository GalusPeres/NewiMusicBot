import { Router } from "express";

function collectionSize(value) {
  if (!value) return 0;
  if (typeof value.size === "number") return value.size;
  if (typeof value.length === "number") return value.length;
  if (Array.isArray(value)) return value.length;
  return 0;
}

function queueSize(player) {
  const tracks = player?.queue?.tracks;
  const pending = collectionSize(tracks);
  return pending + (player?.queue?.current ? 1 : 0);
}

function isActive(player) {
  return !!(player?.playing || player?.paused || player?.queue?.current);
}

export default function statsRoutes(client) {
  const router = Router();

  router.get("/", (req, res) => {
    const players = [...(client.lavalink?.players?.values?.() || [])];
    const nodes = [...(client.lavalink?.nodeManager?.nodes?.values?.() || [])];
    const node = nodes[0];
    const queuedTracks = players.reduce((sum, player) => sum + queueSize(player), 0);
    const activePlayers = players.filter(isActive).length;

    res.json({
      updatedAt: new Date().toISOString(),
      scope: "live",
      cards: [
        { key: "guilds", label: "Servers", value: client.guilds?.cache?.size || 0 },
        { key: "players", label: "Players", value: players.length },
        { key: "activePlayers", label: "Active players", value: activePlayers },
        { key: "queuedTracks", label: "Queued tracks", value: queuedTracks },
        {
          key: "lavalink",
          label: "Lavalink",
          value: node?.connected ? "connected" : "offline",
          status: node?.connected ? "ok" : "warn",
        },
      ],
      health: [
        {
          key: "discord",
          label: "Discord gateway",
          status: client.isReady?.() ? "ok" : "warn",
          detail: client.isReady?.() ? "ready" : "not ready",
        },
        {
          key: "lavalink",
          label: "Lavalink node",
          status: node?.connected ? "ok" : "warn",
          detail: node ? `${node.id || "node"} ${node.connected ? "connected" : "offline"}` : "no node",
        },
      ],
      charts: [],
      tables: [
        {
          key: "players",
          label: "Active guild players",
          rows: players.map((player) => ({
            guildId: player.guildId,
            queue: queueSize(player),
            playing: !!player.playing,
            paused: !!player.paused,
            volume: player.volume ?? null,
          })),
        },
      ],
    });
  });

  return router;
}
