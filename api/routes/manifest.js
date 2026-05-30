import { Router } from "express";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"));

function botIdentity(client) {
  if (!client.user) return null;
  return {
    id: client.user.id,
    tag: client.user.tag,
    username: client.user.username,
    displayName: client.user.username,
    applicationName: client.application?.name || null,
    avatar: client.user.displayAvatarURL?.(),
  };
}

export default function manifestRoutes(client) {
  const router = Router();

  router.get("/", (req, res) => {
    res.json({
      apiVersion: 1,
      id: "music",
      type: "music-player",
      name: pkg.name,
      displayName: client.user?.username || client.config?.username || "Music Bot",
      description: "Discord music player powered by Lavalink.",
      icon: "music",
      bot: botIdentity(client),
      capabilities: ["status", "guilds", "logs", "stats", "settings", "music-player", "voice"],
      pages: [
        { id: "player", label: "Music Player", icon: "music", kind: "music-player" },
        { id: "stats", label: "Statistics", icon: "stats", kind: "stats" },
        { id: "logs", label: "Live Logs", icon: "logs", kind: "logs" },
        { id: "settings", label: "Settings", icon: "settings", kind: "settings" },
      ],
      endpoints: {
        status: "/api/status",
        guilds: "/api/guilds",
        logs: "/api/logs",
        logStream: "/api/logs/stream",
        stats: "/api/stats",
        settings: "/api/settings",
        settingsSchema: "/api/settings/schema",
      },
    });
  });

  return router;
}
