import { SlashCommandBuilder } from "discord.js";
import { success, warn } from "../lib/embeds.js";
import { getPlayer, requireSameVoice } from "../lib/guards.js";
import { updatePanel } from "../lib/panel.js";

export default {
  data: new SlashCommandBuilder().setName("resume").setDescription("Resume playback"),
  aliases: ["unpause", "continue"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx, { playing: true });
    requireSameVoice(ctx, player);

    if (!player.paused) return ctx.reply({ embeds: [warn("Playback isn't paused.")], ephemeral: true });

    await player.resume();
    await updatePanel(ctx.client, player);
    return ctx.reply({ embeds: [success("Resumed.")] });
  },
};
