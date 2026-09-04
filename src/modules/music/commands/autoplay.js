import { SlashCommandBuilder } from "discord.js";
import { isAutoplayEnabled, setAutoplay } from "../lib/autoplay.js";
import { success } from "../lib/embeds.js";
import { getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { updatePanel } from "../lib/panel.js";

export default {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Keep playing similar songs when the queue runs out")
    .addBooleanOption((option) =>
      option.setName("enabled").setDescription("Turn it on or off (leave empty to switch it over)"),
    ),

  aliases: ["ap", "radio"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    const requested = ctx.boolean("enabled");
    const enabled = setAutoplay(player, requested === null ? !isAutoplayEnabled(player) : requested);
    await updatePanel(ctx.client, player);

    return ctx.reply({
      embeds: [
        success(
          enabled
            ? "Autoplay is **on**. When the queue runs out I will keep playing similar songs."
            : "Autoplay is **off**. The music stops once the queue is empty.",
        ),
      ],
    });
  },
};
