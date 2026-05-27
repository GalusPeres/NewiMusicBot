// Bearer token middleware. The Botboard backend sends Authorization: Bearer <token>.
// Token comes from BOT_API_TOKEN and is required when the API starts.

export function bearerAuth(req, res, next) {
  const expected = process.env.BOT_API_TOKEN;
  const header = req.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (provided !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
