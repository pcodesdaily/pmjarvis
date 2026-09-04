import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { formatDuration, parseDuration, trackLength } from "../lib/format.js";
import { fail, getPlayer, requireDJ, requireSameVoice } from "../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Jump to a position in the current track")
    .addStringOption((option) =>
      option
        .setName("position")
        .setDescription("Position, e.g. 90, 1:30 or 1m30s")
        .setRequired(true),
    ),

  aliases: ["goto"],
  greedy: "position",
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx, { playing: true });
    requireSameVoice(ctx, player);
    requireDJ(ctx, player);

    const track = player.queue.current;
    if (!track.info.isSeekable || track.info.isStream) fail("This track cannot be seeked.");

    const position = parseDuration(ctx.string("position") ?? ctx.rest);
    if (position === null) fail("I could not read that position. Try `1:30`, `90` or `1m30s`.");

    const length = trackLength(track);
    if (position > length) fail(`That is past the end of the track (${formatDuration(length)}).`);

    await player.seek(Math.max(position, 0));
    return ctx.reply({ embeds: [success(`Seeked to \`${formatDuration(position)}\`.`)] });
  },
};
