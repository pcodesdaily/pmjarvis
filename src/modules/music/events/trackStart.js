import { updatePanel } from "../lib/panel.js";

export default {
  name: "trackStart",
  emitter: "lavalink",

  async execute(client, player) {
    // Re-post so the panel is always the newest message in the channel.
    await updatePanel(client, player, { repost: true });
  },
};
