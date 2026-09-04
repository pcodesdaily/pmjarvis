import {
  ActionRowBuilder,
  ComponentType,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { addedTrackEmbed, info, warn } from "../lib/embeds.js";
import { assertQueueSpace, ensurePlayer, searchTracks, SEARCH_SOURCES } from "../lib/player.js";
import { formatDuration, trackLength, truncate } from "../lib/format.js";

export default {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search a platform and pick from the top results")
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

    const tracks = result.tracks.slice(0, 25);
    const menu = new StringSelectMenuBuilder()
      .setCustomId("music:searchpick")
      .setPlaceholder("Choose up to 5 tracks to queue")
      .setMinValues(1)
      .setMaxValues(Math.min(5, tracks.length))
      .addOptions(
        tracks.map((track, index) => ({
          label: truncate(track.info.title, 100),
          description: truncate(
            `${track.info.author ?? "Unknown"} • ${formatDuration(trackLength(track), { stream: track.info.isStream })}`,
            100,
          ),
          value: String(index),
        })),
      );

    const prompt = await ctx.reply({
      embeds: [info(`Found **${tracks.length}** results. Pick the ones you want to add.`, "Search results")],
      components: [new ActionRowBuilder().addComponents(menu)],
    });

    const message = ctx.isInteraction ? await ctx.interaction.fetchReply() : prompt;

    let selection;
    try {
      selection = await message.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: (i) => i.user.id === ctx.user.id,
      });
    } catch {
      await ctx.edit({ embeds: [warn("Search timed out.")], components: [] });
      return;
    }

    const chosen = selection.values.map((value) => tracks[Number(value)]).filter(Boolean);
    assertQueueSpace(player, chosen.length);

    const startNow = !player.playing && !player.paused && !player.queue.current;
    await player.queue.add(chosen);

    await selection.update({
      embeds:
        chosen.length === 1
          ? [addedTrackEmbed(chosen[0], { position: startNow ? 0 : player.queue.tracks.length, player })]
          : [info(chosen.map((track, i) => `\`${i + 1}.\` ${truncate(track.info.title, 60)}`).join("\n"), `Queued ${chosen.length} tracks`)],
      components: [],
    });

    if (startNow) await player.play();
  },
};
