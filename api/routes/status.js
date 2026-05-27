import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"));

export default function statusRoutes(client) {
  const router = Router();
  const startedAt = Date.now();

  router.get("/", (req, res) => {
    const nodes = [...(client.lavalink?.nodeManager?.nodes?.values() || [])];
    const node = nodes[0];
    res.json({
      name: pkg.name,
      version: pkg.version,
      bot: client.user
        ? { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL?.() }
        : null,
      ready: !!client.lavalinkReady,
      uptimeMs: Date.now() - startedAt,
      lavalink: node
        ? {
            connected: !!node.connected,
            latency: node.stats?.frameStats?.deficit ?? null,
            ping: node.ping ?? null,
          }
        : { connected: false },
      guildCount: client.guilds?.cache?.size || 0,
      playerCount: client.lavalink?.players?.size || 0,
    });
  });

  return router;
}
