// Local dev proxy. Serves POST /api/chat on port 3001.
// Vite (port 5173) forwards /api → here. Not used in production (Vercel uses api/chat.js).
import "dotenv/config";
import express from "express";
import { callAnthropic } from "./lib/anthropic.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/api/chat", async (req, res) => {
  try {
    const { system, messages, max_tokens } = req.body || {};
    const { status, body } = await callAnthropic({ system, messages, max_tokens });
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`[api] proxy running on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[api] WARNING: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  }
});
