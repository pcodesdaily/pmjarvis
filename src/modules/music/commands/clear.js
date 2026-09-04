import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { fail, getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { updatePanel } from "../lib/panel.js";

export default {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear the queue but keep the current track playing"),

  aliases: ["cq", "clearqueue"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    const size = player.queue.tracks.length;
    if (!size) fail("The queue is already empty.");

    await player.queue.splice(0, size);
    await updatePanel(ctx.client, player);
    return ctx.reply({ embeds: [success(`Cleared **${size}** track(s) from the queue.`)] });
  },
};
