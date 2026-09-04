import path from "node:path";
import { fileURLToPath } from "node:url";
import config, { assertConfig } from "./config.js";
import BotClient from "./core/client.js";
import { createLavalink } from "./core/lavalink.js";
import { loadModules } from "./core/loader.js";
import logger from "./core/logger.js";

const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "modules");

async function main() {
  assertConfig();

  const client = new BotClient();

  // Lavalink first: module event files may attach to its emitters.
  createLavalink(client);
  await loadModules(client, modulesDir);

  registerShutdown(client);
  await client.login(config.token);
}

function registerShutdown(client) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down…`);

    // Give listeners a clean stop rather than cutting the audio mid-frame.
    await Promise.allSettled(
      [...(client.lavalink?.players?.values() ?? [])].map((player) =>
        player.destroy("Bot is restarting", true),
      ),
    );

    await client.destroy().catch(() => {});
    setTimeout(() => process.exit(0), 250).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection:", reason));
  process.on("uncaughtException", (error) => logger.error("Uncaught exception:", error));
}

main().catch((error) => {
  logger.error("Failed to start:", error);
  process.exit(1);
});
