import { SlashCommandBuilder } from "discord.js";
import config from "../../../config.js";
import { info, success } from "../lib/embeds.js";
import { fail, getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { updatePanel } from "../lib/panel.js";
import { displayVolume, setDisplayVolume } from "../lib/volume.js";

export default {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Show or change the playback volume")
    .addIntegerOption((option) =>
      option.setName("percent").setDescription("Volume in percent").setMinValue(0).setMaxValue(500),
    ),

  aliases: ["vol", "v"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    const percent = ctx.integer("percent");

    if (percent === null) {
      return ctx.reply({ embeds: [info(`Volume is at **${displayVolume(player)}%**.`)] });
    }

    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    if (percent > config.music.maxVolume) fail(`The maximum volume is **${config.music.maxVolume}%**.`);

    await setDisplayVolume(player, percent);
    await updatePanel(ctx.client, player);

    const note = percent > 100 ? " Values above 100% can distort quieter masters." : "";
    return ctx.reply({ embeds: [success(`Volume set to **${percent}%**.${note}`)] });
  },
};
