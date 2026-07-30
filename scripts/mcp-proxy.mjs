#!/usr/bin/env node
/**
 * stdio-to-HTTP MCP proxy for Claude Desktop.
 * Claude Desktop speaks MCP over stdio; LoreBridge speaks MCP over HTTP.
 * This script bridges the two so Claude Desktop can use LoreBridge tools.
 *
 * Usage (via claude_desktop_config.json):
 *   "command": "node"
 *   "args": ["C:\\path\\to\\lorebridge\\scripts\\mcp-proxy.mjs"]
 *   "env": { "LOREBRIDGE_URL": "...", "LOREBRIDGE_TOKEN": "..." }
 */

import { createInterface } from "node:readline";

const url = process.env.LOREBRIDGE_URL;
const token = process.env.LOREBRIDGE_TOKEN;

if (!url || !token) {
  process.stderr.write(
    "[lorebridge-proxy] LOREBRIDGE_URL and LOREBRIDGE_TOKEN environment variables must be set\n",
  );
  process.exit(1);
}

process.stderr.write(`[lorebridge-proxy] connecting to ${url}\n`);

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    process.stderr.write(`[lorebridge-proxy] could not parse stdin line: ${trimmed}\n`);
    return;
  }

  // Notifications (no id) are one-way; forward but don't wait for a response.
  const isNotification = parsed.id === undefined || parsed.id === null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        "accept": "application/json, text/event-stream",
      },
      body: trimmed,
    });

    if (isNotification) return;

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      for (const eventLine of text.split("\n")) {
        if (eventLine.startsWith("data: ")) {
          const data = eventLine.slice(6).trim();
          if (data && data !== "[DONE]") {
            process.stdout.write(data + "\n");
          }
        }
      }
    } else {
      const text = await res.text();
      if (text.trim()) {
        process.stdout.write(text.trim() + "\n");
      }
    }
  } catch (err) {
    if (isNotification) return;
    process.stderr.write(`[lorebridge-proxy] request failed: ${err}\n`);
    const id = typeof parsed.id !== "undefined" ? parsed.id : null;
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: `LoreBridge proxy error: ${err}` },
      }) + "\n",
    );
  }
});

rl.on("close", () => {
  process.stderr.write("[lorebridge-proxy] stdin closed, exiting\n");
  process.exit(0);
});
