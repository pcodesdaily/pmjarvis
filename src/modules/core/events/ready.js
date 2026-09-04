import { ActivityType, Events } from "discord.js";
import config from "../../../config.js";
import { createLogger } from "../../../core/logger.js";
import { deployCommands } from "../../../core/deploy.js";

const log = createLogger("ready");

function applyPresence(client) {
  const text = config.activity
    .replaceAll("{guilds}", String(client.guilds.cache.size))
    .replaceAll("{prefix}", config.prefix);
  client.user.setPresence({
    status: "online",
    activities: [{ name: text, type: ActivityType.Listening }],
  });
}

export default {
  name: Events.ClientReady,
  emitter: "client",
  once: true,

  async execute(client) {
    log.info(`Logged in as ${client.user.tag} in ${client.guilds.cache.size} server(s).`);

    // Connect to Lavalink. Nothing can play until this succeeds.
    await client.lavalink.init({ id: client.user.id, username: client.user.username });

    if (config.autoDeployCommands) {
      await deployCommands(client).catch((error) => log.error("Command deployment failed:", error));
    }

    applyPresence(client);
    setInterval(() => applyPresence(client), 10 * 60 * 1000).unref();
  },
};
