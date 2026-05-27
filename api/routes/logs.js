import { Router } from "express";
import { recent, subscribe } from "../logBuffer.js";

export default function logsRoutes() {
  const router = Router();

  router.get("/", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    res.json(recent(limit));
  });

  router.get("/stream", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    for (const entry of recent(50)) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
      res.flush?.();
    }
    const unsubscribe = subscribe((entry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
      res.flush?.();
    });
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
      res.flush?.();
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
