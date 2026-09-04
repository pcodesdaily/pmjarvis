import { SlashCommandBuilder } from "discord.js";
import { isAutoplayEnabled } from "../lib/autoplay.js";
import { success } from "../lib/embeds.js";
import { fail, getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { trackLink } from "../lib/format.js";

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current track, or jump ahead in the queue")
    .addIntegerOption((option) =>
      option.setName("to").setDescription("Skip straight to this queue position").setMinValue(1),
    ),

  aliases: ["s", "next", "fs"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx, { playing: true });
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    const to = ctx.integer("to");
    const skipped = player.queue.current;

    if (to) {
      if (to > player.queue.tracks.length) fail(`There are only ${player.queue.tracks.length} track(s) queued.`);
      await player.skip(to);
      return ctx.reply({ embeds: [success(`Jumped to track **#${to}**.`)] });
    }

    if (!player.queue.tracks.length && !isAutoplayEnabled(player)) {
      await player.stopPlaying(true, false);
      return ctx.reply({ embeds: [success("Skipped the last song. The queue is now empty.")] });
    }

    await player.skip(0, false);
    return ctx.reply({ embeds: [success(`Skipped ${trackLink(skipped)}.`)] });
  },
};
