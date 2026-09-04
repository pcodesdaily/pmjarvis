import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankTracks, scoreTrack } from "../src/modules/music/lib/ranking.js";
import { bootBot } from "./helpers/bot.js";
import { makeRawTrack, playlistResponse, searchResponse } from "./helpers/lavalink.js";

const track = (title, extra = {}) =>
  makeRawTrack({ title, author: "Artist", length: 210_000, ...extra });

const titles = (list) => list.map((t) => t.info?.title ?? t.title);

describe("search ranking", () => {
  it("puts the original above every edited re-upload", () => {
    const results = [
      track("Tum Hi Ho (slowed + reverb)"),
      track("Tum Hi Ho - LOOP", { length: 734_000 }),
      track("Tum Hi Ho lofi flip"),
      track("Tum Hi Ho - Arijit Singh"),
      track("Tum Hi Ho 8D AUDIO"),
    ].map((t) => ({ info: { ...t.info, duration: t.info.length } }));

    const ranked = titles(rankTracks(results, "tum hi ho arijit singh"));
    assert.equal(ranked[0], "Tum Hi Ho - Arijit Singh");
    assert.equal(ranked.at(-1), "Tum Hi Ho (slowed + reverb)");
  });

  it("respects the user asking for an edit", () => {
    const results = [
      track("Tum Hi Ho - Arijit Singh"),
      track("Tum Hi Ho (slowed + reverb)"),
    ].map((t) => ({ info: { ...t.info, duration: t.info.length } }));

    const ranked = titles(rankTracks(results, "tum hi ho slowed reverb"));
    assert.equal(ranked[0], "Tum Hi Ho (slowed + reverb)", "asking for it should return it");
  });

  it("demotes hour-long mixes and very short snippets", () => {
    const normal = { info: { title: "Song", author: "A", duration: 200_000 } };
    const hourMix = { info: { title: "Song", author: "A", duration: 3_600_000 } };
    const snippet = { info: { title: "Song", author: "A", duration: 20_000 } };

    assert.ok(scoreTrack(normal, "song") > scoreTrack(hourMix, "song"));
    assert.ok(scoreTrack(normal, "song") > scoreTrack(snippet, "song"));
  });

  it("demotes livestreams", () => {
    const song = { info: { title: "Song", author: "A", duration: 200_000, isStream: false } };
    const radio = { info: { title: "Song", author: "A", duration: 200_000, isStream: true } };
    assert.ok(scoreTrack(song, "song") > scoreTrack(radio, "song"));
  });

  it("rewards a title and artist that match what was typed", () => {
    const right = { info: { title: "Kesariya", author: "Arijit Singh", duration: 200_000 } };
    const wrong = { info: { title: "Something Else", author: "Nobody", duration: 200_000 } };
    assert.ok(scoreTrack(right, "kesariya arijit singh") > scoreTrack(wrong, "kesariya arijit singh"));
  });

  it("is stable, so equal results keep the platform's own order", () => {
    const a = { info: { title: "Song A", author: "X", duration: 200_000 } };
    const b = { info: { title: "Song B", author: "X", duration: 200_000 } };
    assert.deepEqual(titles(rankTracks([a, b], "song")), ["Song A", "Song B"]);
  });

  it("copes with missing metadata", () => {
    assert.doesNotThrow(() => rankTracks([{ info: {} }, {}], "anything"));
  });
});

describe("ranking through /play", () => {
  it("offers the original first when SoundCloud puts edits on top", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse([
        makeRawTrack({ title: "Janiye (slowed reverb)", identifier: "slow" }),
        makeRawTrack({ title: "Janiye - LOOP", identifier: "loop", length: 734_000 }),
        makeRawTrack({ title: "Janiye - Vishal Mishra", identifier: "real" }),
      ]),
    );

    const { interaction } = await bot.slash("play", { query: "janiye vishal mishra" });
    const payload = interaction.responses.find((entry) => entry.payload?.components?.length)?.payload;
    const menu = payload.components[0].components[0].toJSON();

    assert.match(menu.options[0].label, /Janiye - Vishal Mishra/, "the real song is the first choice");
    assert.match(menu.options.at(-1).label, /slowed reverb/);
  });

  it("plays the single result straight away, with nothing to choose", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "Only One", identifier: "solo" })]));
    const { interaction } = await bot.slash("play", { query: "only one" });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.current.info.identifier, "solo");
    const payload = interaction.responses.at(-1).payload;
    assert.ok(!payload.components?.length, "one result needs no menu");
  });

  it("leaves a playlist in the order the uploader chose", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const ordered = [
      makeRawTrack({ title: "Track 1 (slowed)", identifier: "p1" }),
      makeRawTrack({ title: "Track 2", identifier: "p2" }),
      makeRawTrack({ title: "Track 3", identifier: "p3" }),
    ];
    bot.lava.queueSearch(playlistResponse("A Playlist", ordered));

    await bot.slash("play", { query: "https://soundcloud.com/u/sets/x" });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    const got = [player.queue.current, ...player.queue.tracks].map((x) => x.info.identifier);
    assert.deepEqual(got, ["p1", "p2", "p3"], "playlist order must be untouched");
  });

  it("ranks the results shown by /search too", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse([
        makeRawTrack({ title: "Kesariya nightcore", identifier: "nc" }),
        makeRawTrack({ title: "Kesariya - Arijit Singh", identifier: "real" }),
      ]),
    );

    const { interaction } = await bot.slash("search", { query: "kesariya arijit singh" });
    const payload = interaction.responses.find((entry) => entry.payload?.components?.length)?.payload;
    const menu = payload.components[0].components[0].toJSON();

    assert.match(menu.options[0].label, /Kesariya - Arijit Singh/);
  });
});

describe("choosing a song from /play", () => {
  /** Drives the real command and answers the select menu as a user would. */
  async function playAndPick(bot, query, index) {
    const { makeInteraction } = await import("./helpers/discord.js");
    const Ctx = (await import("../src/core/context.js")).default;
    const { runCommand } = await import("../src/core/runner.js");

    const command = bot.command("play");
    const interaction = makeInteraction(bot, { options: { query } });
    let updated = null;
    interaction.fetchReply = async () => ({
      awaitMessageComponent: async () => ({
        values: [String(index)],
        async update(payload) {
          updated = payload;
        },
      }),
    });

    await runCommand(command, new Ctx({ client: bot.client, command, interaction }));
    return { interaction, updated };
  }

  it("plays exactly what was picked, not the top result", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse([
        makeRawTrack({ title: "Deewaniyat - Original", identifier: "first" }),
        makeRawTrack({ title: "Deewaniyat - Another Take", identifier: "second" }),
        makeRawTrack({ title: "Deewaniyat - Third", identifier: "third" }),
      ]),
    );

    const { updated } = await playAndPick(bot, "deewaniyat", 1);

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.current.info.identifier, "second", "the second option was chosen");
    assert.ok(updated, "the menu is resolved once picked");
    assert.deepEqual(updated.components, [], "and the menu is removed afterwards");
  });

  it("queues the pick behind whatever is already playing", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "Already Playing", identifier: "one" })]));
    await bot.slash("play", { query: "already playing" });

    bot.lava.queueSearch(
      searchResponse([
        makeRawTrack({ title: "Choice A", identifier: "a" }),
        makeRawTrack({ title: "Choice B", identifier: "b" }),
      ]),
    );
    await playAndPick(bot, "choice", 1);

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.current.info.identifier, "one", "the current song keeps playing");
    assert.deepEqual(player.queue.tracks.map((track) => track.info.identifier), ["b"]);
  });

  it("shows the artist, length and platform for each option", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse([
        makeRawTrack({ title: "Song One", author: "Vishal Mishra", length: 188_000 }),
        makeRawTrack({ title: "Song Two", author: "Someone Else" }),
      ]),
    );

    const { interaction } = await bot.slash("play", { query: "song" });
    const payload = interaction.responses.find((entry) => entry.payload?.components?.length)?.payload;
    const menu = payload.components[0].components[0].toJSON();

    assert.match(menu.options[0].description, /Vishal Mishra/);
    assert.match(menu.options[0].description, /3:08/);
    assert.match(menu.options[0].description, /SoundCloud/);
    for (const option of menu.options) {
      assert.ok(option.label.length <= 100);
      assert.ok(option.description.length <= 100);
    }
  });

  it("never asks when a link was pasted", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.onSearch(() =>
      searchResponse([makeRawTrack({ title: "From A Link", identifier: "linked" })]),
    );
    const { interaction } = await bot.slash("play", { query: "https://soundcloud.com/a/track" });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.current.info.identifier, "linked");
    const payload = interaction.responses.at(-1).payload;
    assert.ok(!payload.components?.length, "a link plays straight away");
  });
});
