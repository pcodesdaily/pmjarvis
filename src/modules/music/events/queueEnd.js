import config from "../../../config.js";
import { info } from "../lib/embeds.js";
import { destroyPanel } from "../lib/panel.js";

export default {
  name: "queueEnd",
  emitter: "lavalink",

  async execute(client, player) {
    await destroyPanel(client, player.guildId);

    const channel = await client.channels.fetch(player.textChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const stays = config.music.leaveOnEndMs <= 0;
    await channel
      .send({
        embeds: [
          info(
            stays
              ? `The queue is empty. Add another song with \`${config.prefix}play\` and I will keep playing.`
              : `The queue is empty. I will leave the voice channel in ${Math.round(config.music.leaveOnEndMs / 1000)} seconds unless you add another song.`,
          ),
        ],
      })
      .catch(() => {});
  },
};
