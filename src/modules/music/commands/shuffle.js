import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { fail, getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { updatePanel } from "../lib/panel.js";

export default {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the queue"),
  aliases: ["mix"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    if (player.queue.tracks.length < 2) fail("There are not enough tracks queued to shuffle.");

    const size = await player.queue.shuffle();
    await updatePanel(ctx.client, player);
    return ctx.reply({ embeds: [success(`Shuffled **${size}** tracks.`)] });
  },
};
