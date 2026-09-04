import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { fail, getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";
import { trackLink } from "../lib/format.js";

export default {
  data: new SlashCommandBuilder().setName("previous").setDescription("Go back to the song that played before this one"),
  aliases: ["prev", "back", "b"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx);
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    const previous = await player.queue.shiftPrevious();
    if (!previous) fail("There's no previous track to go back to.");

    // Push what is currently playing back to the front so nothing is lost.
    if (player.queue.current) await player.queue.add(player.queue.current, 0);
    await player.play({ clientTrack: previous });

    return ctx.reply({ embeds: [success(`Playing ${trackLink(previous)} again.`)] });
  },
};
