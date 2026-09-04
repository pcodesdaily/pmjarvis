import { createLogger } from "../../../core/logger.js";
import { warn } from "../lib/embeds.js";
import { trackLink } from "../lib/format.js";

const log = createLogger("track");

export default {
  name: "trackStuck",
  emitter: "lavalink",

  async execute(client, player, track) {
    log.warn(`Track stuck in ${player.guildId}: ${track?.info?.title}`);
    const channel = await client.channels.fetch(player.textChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel
        .send({ embeds: [warn(`${trackLink(track)} stopped responding, so I am skipping it.`)] })
        .catch(() => {});
    }
  },
};
