import { createLoreBridgeServer } from "./app.js";
import { loadConfig } from "./config.js";
import { loadOrCreateIdentity } from "./identity.js";

const config = loadConfig();
const identity = await loadOrCreateIdentity(config.dataDir);
const server = createLoreBridgeServer(config, identity);

server.listen(config.port, config.host, () => {
  console.log(`LoreBridge backend listening on http://${config.host}:${config.port}`);
  console.log(`LoreBridge backend identity ${identity.id} (${identity.fingerprint})`);
});

function shutdown(signal: string): void {
  console.log(`LoreBridge backend received ${signal}; shutting down.`);
  server.close((error) => {
    if (error) {
      console.error("LoreBridge backend shutdown failed", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
