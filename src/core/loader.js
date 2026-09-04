import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createLogger } from "./logger.js";

const log = createLogger("loader");

async function walk(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) found.push(...(await walk(full)));
    else if (entry.endsWith(".js") && !entry.endsWith(".test.js")) found.push(full);
  }
  return found;
}

const importDefault = async (file) => (await import(pathToFileURL(file).href)).default;

/**
 * A "module" is a self-contained feature folder under src/modules/<name>/ with
 * optional `commands/` and `events/` subfolders. Dropping a new folder in there
 * is all it takes to add a whole new feature area to the bot.
 */
export async function loadModules(client, modulesDir, { events = true } = {}) {
  const moduleNames = existsSync(modulesDir)
    ? (await readdir(modulesDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  for (const name of moduleNames) {
    const base = path.join(modulesDir, name);
    await loadCommands(client, path.join(base, "commands"), name);
    // `events: false` is used by the standalone command-deploy script, which
    // has no gateway client to attach handlers to.
    if (events) await loadEvents(client, path.join(base, "events"), name);
  }

  log.info(
    events
      ? `Loaded ${client.commands.size} commands and ${client.eventCount} event handlers from ${moduleNames.length} modules.`
      : `Loaded ${client.commands.size} commands from ${moduleNames.length} modules.`,
  );
  return moduleNames;
}

async function loadCommands(client, dir, moduleName) {
  for (const file of await walk(dir)) {
    const command = await importDefault(file);
    if (!command?.data?.name) {
      log.warn(`Skipping ${path.basename(file)} — no \`data\` export with a name.`);
      continue;
    }
    command.module = moduleName;
    command.json = command.data.toJSON();
    command.name = command.json.name;
    command.aliases = command.aliases ?? [];

    client.commands.set(command.name, command);
    for (const alias of command.aliases) client.aliases.set(alias, command.name);
    log.debug(`+ command /${command.name} (${moduleName})`);
  }
}

async function loadEvents(client, dir, moduleName) {
  for (const file of await walk(dir)) {
    const event = await importDefault(file);
    if (!event?.name || typeof event.execute !== "function") {
      log.warn(`Skipping ${path.basename(file)} — events need \`name\` and \`execute\`.`);
      continue;
    }
    const handler = (...args) =>
      Promise.resolve(event.execute(client, ...args)).catch((error) =>
        createLogger(`event:${event.name}`).error(error),
      );

    const target = resolveEmitter(client, event.emitter);
    if (typeof target?.on !== "function") {
      log.warn(`Skipping ${event.name} — emitter "${event.emitter ?? "client"}" is not available.`);
      continue;
    }

    if (event.once) target.once(event.name, handler);
    else target.on(event.name, handler);

    client.eventCount += 1;
    log.debug(`+ event ${event.emitter ?? "client"}:${event.name} (${moduleName})`);
  }
}

function resolveEmitter(client, emitter = "client") {
  switch (emitter) {
    case "client":
      return client;
    case "lavalink":
      return client.lavalink;
    case "nodes":
      return client.lavalink?.nodeManager;
    case "process":
      return process;
    default:
      return null;
  }
}

export default loadModules;
