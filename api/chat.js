// Vercel serverless function: POST /api/chat
// Runs in production. Reads the request body, calls Anthropic with the server key.
import { callAnthropic } from "../lib/anthropic.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    // Vercel parses JSON bodies automatically; fall back to manual parse just in case.
    let payload = req.body;
    if (!payload || typeof payload === "string") {
      const raw = typeof payload === "string" ? payload : await readBody(req);
      payload = raw ? JSON.parse(raw) : {};
    }
    const { system, messages, max_tokens } = payload || {};
    const { status, body } = await callAnthropic({ system, messages, max_tokens });
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
