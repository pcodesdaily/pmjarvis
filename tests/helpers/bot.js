import "./env.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../../src/config.js";
import Ctx from "../../src/core/context.js";
import { loadModules } from "../../src/core/loader.js";
import { runCommand } from "../../src/core/runner.js";
import { attachLavalink } from "./lavalink.js";
import { makeInteraction, makeMessage, makeWorld, responseText } from "./discord.js";

const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "modules");

/**
 * Boots the real bot: real client, real module loader, real command objects,
 * real Lavalink manager. Only the Discord gateway and the Lavalink socket are
 * replaced. Anything a test asserts is therefore production behaviour.
 */
export async function bootBot(worldOptions = {}) {
  const world = makeWorld(worldOptions);
  const lava = attachLavalink(world.client);
  await loadModules(world.client, modulesDir);

  const command = (name) => {
    const found = world.client.commands.get(name) ?? world.client.commands.get(world.client.aliases.get(name));
    if (!found) throw new Error(`No command named "${name}" was loaded`);
    return found;
  };

  /** Invoke a command the way a slash interaction would. */
  const slash = async (name, options = {}, extra = {}) => {
    const cmd = command(name);
    const interaction = makeInteraction(world, { options, ...extra });
    interaction.commandName = cmd.name;
    await runCommand(cmd, new Ctx({ client: world.client, command: cmd, interaction }));
    return { interaction, text: responseText(interaction) };
  };

  /** Invoke a command the way a `!prefix` message would. */
  const text = async (line) => {
    const [name, ...args] = line.trim().split(/\s+/);
    const cmd = command(name.toLowerCase());
    const message = makeMessage(world, `${config.prefix}${line}`);
    await runCommand(cmd, new Ctx({ client: world.client, command: cmd, message, args }));
    return { message, text: responseText(message) };
  };

  const teardown = async () => {
    for (const player of [...world.client.lavalink.players.values()]) {
      await player.destroy("test teardown", false).catch(() => {});
    }
    for (const timer of world.client.emptyChannelTimers.values()) clearTimeout(timer);
    world.client.emptyChannelTimers.clear();
    world.client.removeAllListeners();
    world.client.lavalink.removeAllListeners();
    world.client.lavalink.nodeManager.removeAllListeners();
  };

  return { ...world, lava, command, slash, text, teardown };
}

/** Creates a connected player with `count` tracks already queued and playing. */
export async function seedPlayer(bot, { tracks, playing = true } = {}) {
  const { ensurePlayer } = await import("../../src/modules/music/lib/player.js");
  const ctx = new Ctx({
    client: bot.client,
    command: { json: {} },
    interaction: makeInteraction(bot),
  });
  const player = await ensurePlayer(ctx);

  if (tracks?.length) {
    const built = tracks.map((raw) => bot.client.lavalink.utils.buildTrack(raw, bot.user));
    await player.queue.add(built);
    if (playing) {
      player.queue.current = built[0];
      await player.queue.splice(0, 1);
      player.playing = true;
      player.paused = false;
    }
  }
  return player;
}
