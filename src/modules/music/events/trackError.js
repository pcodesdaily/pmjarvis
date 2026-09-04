import { createLogger } from "../../../core/logger.js";
import { warn } from "../lib/embeds.js";
import { trackLink } from "../lib/format.js";

const log = createLogger("track");

async function notify(client, player, message) {
  const channel = await client.channels.fetch(player.textChannelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [warn(message)] }).catch(() => {});
}

export default {
  name: "trackError",
  emitter: "lavalink",

  async execute(client, player, track, payload) {
    log.warn(`Track error in ${player.guildId}: ${payload?.exception?.message ?? "unknown"}`);
    // autoSkipOnResolveError moves on for us; this just explains the gap.
    await notify(client, player, `I could not play ${trackLink(track)}, so I am skipping it.`);
  },
};
