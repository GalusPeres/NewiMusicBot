import { Router } from "express";
import { serializeGuild } from "../serialize.js";

export default function guildsRoutes(client) {
  const router = Router();

  router.get("/", (req, res) => {
    const userId = req.get("x-dashboard-user-id");
    const guilds = [...client.guilds.cache.values()].map((g) => serializeGuild(g, client, userId));
    res.json(guilds);
  });

  router.get("/:id", (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: "guild not found" });
    res.json(serializeGuild(guild, client, req.get("x-dashboard-user-id")));
  });

  return router;
}
