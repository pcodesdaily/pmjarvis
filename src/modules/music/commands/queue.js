import { SlashCommandBuilder } from "discord.js";
import { buildQueueRows } from "../lib/controls.js";
import { QUEUE_PAGE_SIZE, queueEmbed } from "../lib/embeds.js";
import { getPlayer } from "../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the upcoming tracks")
    .addIntegerOption((option) =>
      option.setName("page").setDescription("Page number").setMinValue(1),
    ),

  aliases: ["q", "list"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    const pages = Math.max(Math.ceil(player.queue.tracks.length / QUEUE_PAGE_SIZE), 1);
    const page = Math.min(Math.max(ctx.integer("page", 1) ?? 1, 1), pages);

    await ctx.reply({ embeds: [queueEmbed(player, page)], components: buildQueueRows(page, pages) });
  },
};
