import { SlashCommandBuilder } from "discord.js";
import config from "../../../config.js";
import { addedPlaylistEmbed, addedTrackEmbed, info } from "../lib/embeds.js";
import { truncate } from "../lib/format.js";
import { promptTrackChoice } from "../lib/picker.js";
import { assertQueueSpace, ensurePlayer, isUrl, normaliseSource, searchTracks, SEARCH_SOURCES } from "../lib/player.js";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song, or add it to the queue if something is already playing")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("A song name, or a SoundCloud or Bandcamp link")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName("source")
        .setDescription("Which platform to search (ignored when you paste a link)")
        .addChoices(...SEARCH_SOURCES),
    )
    .addBooleanOption((option) =>
      option.setName("next").setDescription("Put it at the front of the queue instead of the end"),
    )
    .addBooleanOption((option) =>
      option.setName("shuffle").setDescription("Shuffle a playlist as it is added"),
    ),

  aliases: ["p"],
  greedy: "query",
  category: "Music",

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused()?.trim();
    if (!focused || focused.length < 2) return interaction.respond([]);
    if (/^https?:\/\//i.test(focused)) {
      return interaction.respond([{ name: truncate(focused, 100), value: focused.slice(0, 100) }]);
    }

    const node = interaction.client.lavalink.nodeManager.leastUsedNodes()[0];
    if (!node) return interaction.respond([]);

    const source =
      normaliseSource(interaction.options.getString("source")) ?? config.music.defaultSearchPlatform;
    const result = await node.search({ query: focused, source }, interaction.user).catch(() => null);

    const choices = (result?.tracks ?? []).slice(0, 25).map((track) => ({
      name: truncate(`${track.info.title} by ${track.info.author}`, 100),
      value:
        (track.info.uri ?? track.info.title).length <= 100
          ? (track.info.uri ?? track.info.title)
          : truncate(track.info.title, 100),
    }));
    return interaction.respond(choices);
  },

  async execute(ctx) {
    await ctx.defer();

    const query = ctx.string("query") ?? ctx.rest;
    const player = await ensurePlayer(ctx);
    const result = await searchTracks(player, {
      query,
      source: ctx.string("source"),
      requester: ctx.user,
    });

    const insertAt = ctx.boolean("next", false) ? 0 : undefined;
    const startNow = () => !player.playing && !player.paused && !player.queue.current;

    /* ---- a link to a whole playlist: take it as given ---- */
    if (result.loadType === "playlist") {
      let tracks = result.tracks.slice(0, config.music.maxPlaylistSize);
      assertQueueSpace(player, tracks.length);
      if (ctx.boolean("shuffle", false)) {
        tracks = tracks
          .map((track) => ({ track, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map((entry) => entry.track);
      }
      const begin = startNow();
      await player.queue.add(tracks, insertAt);
      await ctx.reply({
        embeds: [addedPlaylistEmbed(result.playlist, tracks, result.tracks[0]?.info?.sourceName)],
      });
      if (begin) await player.play();
      return;
    }

    /* ---- a direct link, a single result, or asking turned off ---- */
    const searched = result.loadType === "search";
    const askToChoose = config.music.playAsksToChoose && searched && result.tracks.length > 1;

    if (!askToChoose) {
      const track = result.tracks[0];
      assertQueueSpace(player, 1);
      const begin = startNow();
      await player.queue.add(track, insertAt);
      const position = begin ? 0 : insertAt === 0 ? 1 : player.queue.tracks.length;
      await ctx.reply({ embeds: [addedTrackEmbed(track, { position, player })] });
      if (begin) await player.play();
      return;
    }

    /* ---- several results: let them choose ---- */
    const picked = await promptTrackChoice(ctx, result.tracks, { title: `Results for "${truncate(query, 60)}"` });
    if (!picked) return;

    const { chosen, selection } = picked;
    assertQueueSpace(player, chosen.length);
    const begin = startNow();
    await player.queue.add(chosen, insertAt);

    await selection.update({
      embeds:
        chosen.length === 1
          ? [addedTrackEmbed(chosen[0], { position: begin ? 0 : player.queue.tracks.length, player })]
          : [
              info(
                chosen.map((track, index) => `\`${index + 1}.\` ${truncate(track.info.title, 60)}`).join("\n"),
                `Added ${chosen.length} songs to the queue`,
              ),
            ],
      components: [],
    });

    if (begin) await player.play();
  },
};
