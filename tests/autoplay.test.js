import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoPlayFunction, isAutoplayEnabled, setAutoplay } from "../src/modules/music/lib/autoplay.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { emptyResponse, makeRawTrack, playlistResponse, searchResponse } from "./helpers/lavalink.js";

const seed = (overrides = {}) =>
  makeRawTrack({
    title: "Tere Paas Main",
    author: "A. R. Rahman",
    identifier: "seed1",
    sourceName: "soundcloud",
    uri: "https://soundcloud.com/karuna/tere-paas-main",
    ...overrides,
  });

describe("autoplay wiring", () => {
  it("is on by default, so music keeps going without anyone asking", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const player = await seedPlayer(bot, { tracks: [seed()] });
    assert.equal(isAutoplayEnabled(player), true);
  });

  it("is registered as the manager's empty-queue handler", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    assert.equal(bot.client.lavalink.options.playerOptions.onEmptyQueue.autoPlayFunction, autoPlayFunction);
  });

  it("does nothing once switched off", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });
    setAutoplay(player, false);

    let searched = false;
    bot.lava.onSearch(() => {
      searched = true;
      return searchResponse([makeRawTrack()]);
    });

    await autoPlayFunction(player, player.queue.current);
    assert.equal(searched, false);
    assert.equal(player.queue.tracks.length, 0);
  });
});

describe("finding a similar song", () => {
  it("asks SoundCloud for related tracks first", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    const queries = [];
    bot.lava.onSearch((identifier) => {
      queries.push(identifier);
      return playlistResponse("Related", [
        makeRawTrack({ title: "Similar Song", identifier: "rel1", sourceName: "soundcloud" }),
      ]);
    });

    await autoPlayFunction(player, player.queue.current);

    assert.match(queries[0], /soundcloud\.com\/karuna\/tere-paas-main\/recommended/);
    assert.equal(player.queue.tracks[0].info.title, "Similar Song");
  });

  it("falls back to the artist when there are no related tracks", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    const queries = [];
    bot.lava.onSearch((identifier) => {
      queries.push(identifier);
      return identifier.includes("Rahman")
        ? searchResponse([makeRawTrack({ identifier: "byartist", sourceName: "soundcloud" })])
        : emptyResponse();
    });

    await autoPlayFunction(player, player.queue.current);

    assert.ok(queries.some((q) => q === "scsearch:A. R. Rahman"));
    assert.equal(player.queue.tracks[0].info.identifier, "byartist");
  });

  it("strips bracketed noise from the title before searching", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const noisy = seed({ title: "Janiye (from the Film) [Official Video]", author: "" , uri: "" });
    const player = await seedPlayer(bot, { tracks: [noisy] });

    const queries = [];
    bot.lava.onSearch((identifier) => {
      queries.push(identifier);
      return emptyResponse();
    });

    await autoPlayFunction(player, player.queue.current);
    assert.ok(queries.includes("scsearch:Janiye"), `expected a cleaned query, got ${queries.join(" | ")}`);
  });

  it("never repeats the seed, the queue or anything played recently", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const track = seed();
    const player = await seedPlayer(bot, { tracks: [track] });

    const alreadyQueued = makeRawTrack({ identifier: "queued", sourceName: "soundcloud" });
    await player.queue.add(bot.client.lavalink.utils.buildTrack(alreadyQueued, bot.user));

    bot.lava.onSearch(() =>
      searchResponse([
        track, // the seed itself
        alreadyQueued, // already coming up
        makeRawTrack({ identifier: "fresh", title: "Fresh One", sourceName: "soundcloud" }),
      ]),
    );

    await autoPlayFunction(player, player.queue.current);
    assert.equal(player.queue.tracks.at(-1).info.identifier, "fresh");
  });

  it("skips livestreams", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    bot.lava.onSearch(() =>
      searchResponse([
        makeRawTrack({ identifier: "radio", isStream: true, sourceName: "soundcloud" }),
        makeRawTrack({ identifier: "song", sourceName: "soundcloud" }),
      ]),
    );

    await autoPlayFunction(player, player.queue.current);
    assert.equal(player.queue.tracks[0].info.identifier, "song");
  });

  it("remembers its picks so a long session does not loop", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    bot.lava.onSearch(() => searchResponse([makeRawTrack({ identifier: "only", sourceName: "soundcloud" })]));

    await autoPlayFunction(player, player.queue.current);
    assert.deepEqual(player.getData("autoplayHistory"), ["only"]);

    await player.queue.splice(0, 1);
    await autoPlayFunction(player, player.queue.current);
    assert.equal(player.queue.tracks.length, 0, "the same song must not be queued twice");
  });

  it("tags its picks so they can be told apart from requests", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    bot.lava.onSearch(() => searchResponse([makeRawTrack({ identifier: "auto", sourceName: "soundcloud" })]));
    await autoPlayFunction(player, player.queue.current);

    assert.equal(player.queue.tracks[0].userData.autoplay, true);
  });

  it("gives up quietly when nothing similar exists", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    bot.lava.onSearch(() => emptyResponse());
    await autoPlayFunction(player, player.queue.current);

    assert.equal(player.queue.tracks.length, 0);
  });

  it("survives a lookup that throws, and a missing seed", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    let calls = 0;
    bot.lava.onSearch(() => {
      calls += 1;
      if (calls === 1) throw new Error("network blip");
      return searchResponse([makeRawTrack({ identifier: "recovered", sourceName: "soundcloud" })]);
    });

    await autoPlayFunction(player, player.queue.current);
    assert.equal(player.queue.tracks[0].info.identifier, "recovered");

    await assert.doesNotReject(() => autoPlayFunction(player, null));
  });
});

describe("/autoplay command", () => {
  it("turns off and back on", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [seed()] });

    const off = await bot.slash("autoplay");
    assert.match(off.text, /Autoplay is \*\*off\*\*/);
    assert.equal(isAutoplayEnabled(player), false);

    const on = await bot.slash("autoplay");
    assert.match(on.text, /Autoplay is \*\*on\*\*/);
    assert.equal(isAutoplayEnabled(player), true);
  });
});

describe("adding a song while one is playing", () => {
  it("queues it behind the current track instead of interrupting", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "First Song", identifier: "one" })]));
    const first = await bot.slash("play", { query: "first song" });
    assert.match(first.text, /Playing now/);

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "Second Song", identifier: "two" })]));
    const second = await bot.slash("play", { query: "second song" });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.match(second.text, /Added to queue/);
    assert.match(second.text, /#1/, "the reply states its position in the queue");
    assert.equal(player.queue.current.info.title, "First Song", "the current song keeps playing");
    assert.deepEqual(player.queue.tracks.map((track) => track.info.title), ["Second Song"]);
  });

  it("keeps stacking further requests in order", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    for (const title of ["One", "Two", "Three", "Four"]) {
      bot.lava.queueSearch(searchResponse([makeRawTrack({ title, identifier: title })]));
      await bot.slash("play", { query: title });
    }

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.current.info.title, "One");
    assert.deepEqual(player.queue.tracks.map((track) => track.info.title), ["Two", "Three", "Four"]);
  });
});
