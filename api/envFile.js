import fs from "node:fs/promises";
import path from "node:path";

function envFilePath() {
  return process.env.BOT_ENV_FILE || path.join(process.cwd(), ".env");
}

function encodeValue(value) {
  return JSON.stringify(String(value));
}

export async function writeEnvUpdates(updates) {
  const target = envFilePath();
  let content = "";

  try {
    content = await fs.readFile(target, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const remaining = new Map(Object.entries(updates));
  const lines = content.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match || !remaining.has(match[1])) return line;
    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${encodeValue(value)}`;
  });

  for (const [key, value] of remaining) {
    lines.push(`${key}=${encodeValue(value)}`);
  }

  const next = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  await fs.writeFile(target, next, "utf8");
}
