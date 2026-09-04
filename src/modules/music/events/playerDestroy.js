import { destroyPanel } from "../lib/panel.js";

export default {
  name: "playerDestroy",
  emitter: "lavalink",

  async execute(client, player) {
    const timer = client.emptyChannelTimers.get(player.guildId);
    if (timer) clearTimeout(timer);
    client.emptyChannelTimers.delete(player.guildId);

    await destroyPanel(client, player.guildId);
  },
};
