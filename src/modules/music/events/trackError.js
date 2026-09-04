import { createLogger } from "../../../core/logger.js";
import { info, warn } from "../lib/embeds.js";
import { findFallbackTrack } from "../lib/fallback.js";
import { trackLink } from "../lib/format.js";

const log = createLogger("track");

async function notify(client, player, embed) {
  const channel = await client.channels.fetch(player.textChannelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => {});
}

export default {
  name: "trackError",
  emitter: "lavalink",

  async execute(client, player, track, payload) {
    log.warn(`Track error in ${player.guildId}: ${payload?.exception?.message ?? "unknown"}`);

    // Try the same song on another platform before giving up on it. Queued at
    // the front so the automatic skip picks it up as the next track.
    const replacement = await findFallbackTrack(player, track);
    if (replacement) {
      await player.queue.add(replacement, 0);
      log.info(`Falling back to ${replacement.info.sourceName} for "${track?.info?.title}".`);
      await notify(
        client,
        player,
        info(`That upload of ${trackLink(track)} was broken, so I am trying another one.`),
      );
      return;
    }

    await notify(client, player, warn(`I could not play ${trackLink(track)}, so I am skipping it.`));
  },
};
