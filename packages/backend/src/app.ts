import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { BackendConfig } from "./config.js";

const serviceVersion = "0.1.0";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function handleRequest(config: BackendConfig, request: IncomingMessage, response: ServerResponse): void {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "lorebridge-backend",
      version: serviceVersion,
      pairingEnabled: config.pairingEnabled,
    });
    return;
  }

  if (method === "GET" && url.pathname === "/v1") {
    sendJson(response, 200, {
      service: "lorebridge-backend",
      version: serviceVersion,
      protocolVersion: "0.1",
      capabilities: ["health"],
    });
    return;
  }

  sendJson(response, 404, {
    error: {
      code: "route_not_found",
      message: "The requested LoreBridge route does not exist.",
    },
  });
}

export function createLoreBridgeServer(config: BackendConfig): Server {
  return createServer((request, response) => {
    try {
      handleRequest(config, request, response);
    } catch (error) {
      console.error("LoreBridge request failed", error);
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: {
            code: "internal_error",
            message: "LoreBridge could not process the request.",
          },
        });
      } else {
        response.end();
      }
    }
  });
}
