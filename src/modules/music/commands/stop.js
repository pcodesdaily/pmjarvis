import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { destroyPanel } from "../lib/panel.js";

export default {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop the music, clear the queue and leave the voice channel"),

  // /leave and /disconnect are the same action, so they are aliases rather than
  // separate commands.
  aliases: ["leave", "dc", "disconnect", "st"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    await destroyPanel(ctx.client, ctx.guildId);
    await player.destroy("Stopped by a user", true);

    return ctx.reply({ embeds: [success("Stopped the music and left the voice channel.")] });
  },
};
