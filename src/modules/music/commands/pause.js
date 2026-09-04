import { SlashCommandBuilder } from "discord.js";
import { success, warn } from "../lib/embeds.js";
import { getPlayer, requireSameVoice } from "../lib/guards.js";
import { updatePanel } from "../lib/panel.js";

export default {
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),
  aliases: ["hold"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx, { playing: true });
    requireSameVoice(ctx, player);

    if (player.paused) return ctx.reply({ embeds: [warn("The music is already paused. Use `/resume` to start it again.")], ephemeral: true });

    await player.pause();
    await updatePanel(ctx.client, player);
    return ctx.reply({ embeds: [success("Paused.")] });
  },
};
