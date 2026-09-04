import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Collection, REST, Routes } from "discord.js";
import config, { assertConfig } from "../config.js";
import { createLogger } from "./logger.js";

const log = createLogger("deploy");

/** Bulk-overwrites the application's slash commands with what is loaded. */
export async function deployCommands(client) {
  const body = [...client.commands.values()].map((command) => command.json);
  const rest = new REST({ version: "10" }).setToken(config.token);

  const route = config.devGuildId
    ? Routes.applicationGuildCommands(config.clientId, config.devGuildId)
    : Routes.applicationCommands(config.clientId);

  const registered = await rest.put(route, { body });
  log.info(
    `Registered ${registered.length} slash command(s) ${
      config.devGuildId ? `in guild ${config.devGuildId}` : "globally (may take up to an hour to appear)"
    }.`,
  );
  return registered;
}

/** `npm run deploy` — registers commands without starting the bot. */
async function main() {
  assertConfig();
  const { loadModules } = await import("./loader.js");
  const stub = { commands: new Collection(), aliases: new Collection(), eventCount: 0 };
  const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "modules");

  await loadModules(stub, modulesDir, { events: false });
  await deployCommands(stub);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    log.error(error);
    process.exit(1);
  });
}
