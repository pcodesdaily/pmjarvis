import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { trackLink } from "../lib/format.js";
import { fail, getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove one track, or a range of tracks, from the queue")
    .addIntegerOption((option) =>
      option.setName("position").setDescription("Queue position to remove").setRequired(true).setMinValue(1),
    )
    .addIntegerOption((option) =>
      option.setName("to").setDescription("Remove everything up to this position too").setMinValue(1),
    ),

  aliases: ["rm", "delete"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    const size = player.queue.tracks.length;
    if (!size) fail("The queue is empty.");

    const from = ctx.integer("position");
    const to = ctx.integer("to") ?? from;
    if (from > size || to > size) fail(`The queue only has **${size}** track(s).`);

    const start = Math.min(from, to) - 1;
    const amount = Math.abs(to - from) + 1;
    const first = player.queue.tracks[start];

    await player.queue.splice(start, amount);

    const description =
      amount === 1
        ? `Removed ${trackLink(first)} from the queue.`
        : `Removed **${amount}** tracks (positions ${start + 1}-${start + amount}).`;
    return ctx.reply({ embeds: [success(description)] });
  },
};
