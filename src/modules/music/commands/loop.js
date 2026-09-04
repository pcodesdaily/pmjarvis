import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { updatePanel } from "../lib/panel.js";

const LABELS = {
  off: "Loop is now **off**.",
  track: "Now looping the **current track**.",
  queue: "Now looping the **whole queue**.",
};

export default {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Repeat the current song, the whole queue, or nothing")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("What to repeat (leave empty to cycle through the modes)")
        .addChoices(
          { name: "Off", value: "off" },
          { name: "Current track", value: "track" },
          { name: "Whole queue", value: "queue" },
        ),
    ),

  aliases: ["repeat"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    const order = ["off", "track", "queue"];
    const requested = (ctx.string("mode") ?? "").toLowerCase();
    const mode = order.includes(requested)
      ? requested
      : order[(order.indexOf(player.repeatMode) + 1) % order.length];

    await player.setRepeatMode(mode);
    await updatePanel(ctx.client, player);
    return ctx.reply({ embeds: [success(LABELS[mode])] });
  },
};
