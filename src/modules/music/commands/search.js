import { SlashCommandBuilder } from "discord.js";
import { addedTrackEmbed, info } from "../lib/embeds.js";
import { truncate } from "../lib/format.js";
import { promptTrackChoice } from "../lib/picker.js";
import { assertQueueSpace, ensurePlayer, searchTracks, SEARCH_SOURCES } from "../lib/player.js";

export default {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for a song and choose from the results yourself")
    .addStringOption((option) =>
      option.setName("query").setDescription("What to search for").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("source").setDescription("Platform to search").addChoices(...SEARCH_SOURCES),
    ),

  aliases: ["find", "sr"],
  greedy: "query",
  category: "Music",

  async execute(ctx) {
    await ctx.defer();

    const player = await ensurePlayer(ctx);
    const result = await searchTracks(player, {
      query: ctx.string("query") ?? ctx.rest,
      source: ctx.string("source"),
      requester: ctx.user,
    });

    const picked = await promptTrackChoice(ctx, result.tracks);
    if (!picked) return;

    const { chosen, selection } = picked;
    assertQueueSpace(player, chosen.length);
    const begin = !player.playing && !player.paused && !player.queue.current;
    await player.queue.add(chosen);

    const lines = chosen
      .map((track, index) => `\`${index + 1}.\` ${truncate(track.info.title, 60)}`)
      .join("\n");

    await selection.update({
      embeds:
        chosen.length === 1
          ? [addedTrackEmbed(chosen[0], { position: begin ? 0 : player.queue.tracks.length, player })]
          : [info(lines, `Added ${chosen.length} songs to the queue`)],
      components: [],
    });

    if (begin) await player.play();
  },
};
