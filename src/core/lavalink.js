import { LavalinkManager } from "lavalink-client";
import config from "../config.js";
import { createLogger } from "./logger.js";

const log = createLogger("lavalink");

export function createLavalink(client) {
  const manager = new LavalinkManager({
    nodes: config.lavalink.nodes,

    // Lavalink asks us to forward its voice payloads to Discord's gateway.
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),

    client: { id: config.clientId, username: "PMJARVIS" },

    autoSkip: true,
    autoSkipOnResolveError: true,
    autoMove: true,
    linksAllowed: true,

    queueOptions: {
      maxPreviousTracks: 50,
    },

    playerOptions: {
      // Lavalink plays a little below 100% so that boosted EQ presets and loud
      // masters have headroom instead of clipping.
      volumeDecrementer: config.music.volumeDecrementer,
      clientBasedPositionUpdateInterval: 150,
      defaultSearchPlatform: config.music.defaultSearchPlatform,
      useUnresolvedData: true,
      maxErrorsPerTime: { threshold: 35_000, maxAmount: 3 },
      // Store only what we actually render, so long queues stay cheap in RAM.
      requesterTransformer: (requester) =>
        requester && typeof requester === "object"
          ? {
              id: requester.id,
              username: requester.username ?? requester.tag ?? null,
              displayName: requester.displayName ?? requester.globalName ?? null,
            }
          : requester,
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      ...(config.music.leaveOnEndMs > 0
        ? { onEmptyQueue: { destroyAfterMs: config.music.leaveOnEndMs } }
        : {}),
    },

    advancedOptions: {
      enableDebugEvents: config.logLevel === "debug",
      debugOptions: { playerDestroy: { dontThrowError: true } },
    },
  });

  client.lavalink = manager;

  // Lavalink needs the raw VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE packets.
  client.on("raw", (packet) => manager.sendRawData(packet));

  log.info(
    `Configured ${config.lavalink.nodes.length} node(s): ${config.lavalink.nodes
      .map((node) => `${node.id}@${node.host}:${node.port}`)
      .join(", ")}`,
  );

  return manager;
}

export default createLavalink;
