// Shared server-side call to the Anthropic Messages API.
// The API key is read from the environment and NEVER sent to the browser.
// Used by both the local dev proxy (server.js) and the Vercel function (api/chat.js).

export async function callAnthropic({ system, messages, max_tokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env (local) or your host's env vars." } };
  }
  // Model is fixed server-side so the browser can't request a pricier model.
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: max_tokens || 800,
        system,
        messages: messages || [],
      }),
    });
    const body = await r.json();
    return { status: r.status, body };
  } catch (e) {
    return { status: 502, body: { error: "Upstream request to Anthropic failed: " + String(e && e.message || e) } };
  }
}
