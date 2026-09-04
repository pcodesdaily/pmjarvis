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
  it("plays the original when SoundCloud offers edits first", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse([
        makeRawTrack({ title: "Janiye (slowed reverb)", identifier: "slow" }),
        makeRawTrack({ title: "Janiye - LOOP", identifier: "loop", length: 734_000 }),
        makeRawTrack({ title: "Janiye - Vishal Mishra", identifier: "real" }),
      ]),
    );

    await bot.slash("play", { query: "janiye vishal mishra" });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.current.info.identifier, "real");
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
