import express from "express";
import cors from "cors";
import { bearerAuth } from "./auth.js";
import statusRoutes from "./routes/status.js";
import guildsRoutes from "./routes/guilds.js";
import playerRoutes from "./routes/player.js";
import settingsRoutes from "./routes/settings.js";
import logsRoutes from "./routes/logs.js";
import logger from "../utils/logger.js";

export function startApi(client) {
  if (!process.env.BOT_API_TOKEN) {
    throw new Error("Missing required environment variable: BOT_API_TOKEN");
  }
  const port = Number(process.env.BOT_API_PORT) || 3001;
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(bearerAuth);

  app.use("/api/status", statusRoutes(client));
  app.use("/api/guilds", guildsRoutes(client));
  app.use("/api/guilds/:guildId/player", playerRoutes(client));
  app.use("/api/settings", settingsRoutes(client));
  app.use("/api/logs", logsRoutes());

  app.use((err, req, res, _next) => {
    logger.error("[api] unhandled error:", err);
    res.status(500).json({ error: err.message || "internal error" });
  });

  const server = app.listen(port, "0.0.0.0", () => {
    logger.info(`HTTP API listening on :${port}`);
  });
  return server;
}
