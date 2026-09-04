import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config from "../src/config.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { makeRawTrack, searchResponse } from "./helpers/lavalink.js";

const tracks = (count) =>
  Array.from({ length: count }, (_, index) =>
    makeRawTrack({ title: `Song ${index + 1}`, identifier: `t${index + 1}` }),
  );

describe("/queue", () => {
  it("lists the upcoming tracks", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(4) });

    const { text } = await bot.slash("queue");
    assert.match(text, /Now playing/);
    assert.match(text, /Song 2/);
    assert.match(text, /Page 1\/1/);
  });

  it("paginates ten per page", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(26) });

    const first = await bot.slash("queue");
    assert.match(first.text, /Page 1\/3/);
    assert.match(first.text, /Song 2/);
    assert.doesNotMatch(first.text, /Song 12/);

    const second = await bot.slash("queue", { page: 2 });
    assert.match(second.text, /Page 2\/3/);
    assert.match(second.text, /Song 12/);
  });

  it("clamps an out-of-range page instead of erroring", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(5) });

    const { text } = await bot.slash("queue", { page: 99 });
    assert.match(text, /Page 1\/1/);
  });

  it("shows an empty queue gracefully", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("queue");
    assert.match(text, /Nothing queued yet/);
  });

  it("adds pagination buttons only when there is more than one page", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    const small = await bot.slash("queue");
    const smallPayload = small.interaction.responses.at(-1).payload;
    assert.equal(smallPayload.components.length, 0);

    await seedPlayer(bot, { tracks: tracks(30) });
    const big = await bot.slash("queue");
    const bigPayload = big.interaction.responses.at(-1).payload;
    assert.equal(bigPayload.components.length, 1);
  });
});

describe("queue editing", () => {
  it("shuffles", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(30) });

    const before = player.queue.tracks.map((track) => track.info.identifier);
    const { text } = await bot.slash("shuffle");

    assert.match(text, /Shuffled/);
    assert.notDeepEqual(player.queue.tracks.map((track) => track.info.identifier), before);
    assert.equal(player.queue.tracks.length, before.length, "shuffling must not lose tracks");
  });

  it("refuses to shuffle fewer than two tracks", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(2) });

    const { text } = await bot.slash("shuffle");
    assert.match(text, /not enough tracks/i);
  });

  it("removes a single track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(5) });

    const { text } = await bot.slash("remove", { position: 2 });
    assert.match(text, /Song 3/, "position 2 is the second queued track");
    assert.equal(player.queue.tracks.length, 3);
    assert.deepEqual(player.queue.tracks.map((track) => track.info.title), ["Song 2", "Song 4", "Song 5"]);
  });

  it("removes a range", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(8) });

    const { text } = await bot.slash("remove", { position: 2, to: 4 });
    assert.match(text, /Removed \*\*3\*\* tracks/);
    assert.deepEqual(player.queue.tracks.map((track) => track.info.title), ["Song 2", "Song 6", "Song 7", "Song 8"]);
  });

  it("rejects an out-of-range removal", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    const { text } = await bot.slash("remove", { position: 9 });
    assert.match(text, /only has \*\*2\*\* track/);
  });

  it("clears the queue but keeps playing", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(6) });

    const { text } = await bot.slash("clear");
    assert.match(text, /Cleared \*\*5\*\*/);
    assert.equal(player.queue.tracks.length, 0);
    assert.ok(player.queue.current, "the current track keeps playing");
  });

  it("says the queue is already empty", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("clear");
    assert.match(text, /already empty/);
  });

  it("enforces the queue size limit", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const original = config.music.maxQueueSize;
    config.music.maxQueueSize = 3;
    t.after(() => {
      config.music.maxQueueSize = original;
    });

    await seedPlayer(bot, { tracks: tracks(4) });
    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "One Too Many" })]));

    const { text } = await bot.slash("play", { query: "one too many" });
    assert.match(text, /queue is full/i);
  });
});

describe("/loop", () => {
  it("cycles off -> track -> queue -> off", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    assert.equal(player.repeatMode, "off");

    await bot.slash("loop");
    assert.equal(player.repeatMode, "track");
    await bot.slash("loop");
    assert.equal(player.repeatMode, "queue");
    await bot.slash("loop");
    assert.equal(player.repeatMode, "off");
  });

  it("sets an explicit mode", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    const { text } = await bot.slash("loop", { mode: "queue" });
    assert.match(text, /whole queue/);
    assert.equal(player.repeatMode, "queue");
  });
});

describe("/volume", () => {
  it("reports the current volume without an argument", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("volume");
    assert.match(text, /Volume is at \*\*100%\*\*/);
  });

  it("sets the volume and applies the headroom factor", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("volume", { percent: 60 });
    assert.match(text, /set to \*\*60%\*\*/);
    assert.equal(player.volume, 60, "the displayed volume is what the user asked for");
    assert.equal(player.lavalinkVolume, 51, "Lavalink runs 15% lower to leave headroom");
    assert.equal(bot.lava.lastPatch().volume, 51);
  });

  it("rejects a volume above the configured maximum", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("volume", { percent: 400 });
    assert.match(text, /maximum volume is \*\*150%\*\*/);
  });

  it("warns when going above 100%", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("volume", { percent: 140 });
    assert.match(text, /distort/);
  });
});


describe("/nowplaying", () => {
  it("renders the panel with controls", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    const { interaction, text } = await bot.slash("nowplaying");
    assert.match(text, /Now playing/);
    assert.match(text, /Song 1/);

    const payload = interaction.responses.at(-1).payload;
    assert.equal(payload.components.length, 2, "two rows of buttons");
    const ids = payload.components.flatMap((row) => row.components.map((button) => button.data.custom_id));
    assert.deepEqual(ids, [
      "music:previous",
      "music:playpause",
      "music:skip",
      "music:stop",
      "music:loop",
      "music:shuffle",
      "music:autoplay",
      "music:queue",
    ]);
  });

  it("shows the length, and never a progress bar", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    await seedPlayer(bot, { tracks: [makeRawTrack({ length: 200_000 })] });
    const normal = await bot.slash("nowplaying");
    // A bar inside a static embed freezes at whatever position it was posted
    // at, so it reads as broken. The length stays true instead.
    assert.doesNotMatch(normal.text, /🔘|▬/u);
    assert.match(normal.text, /Length/);
    assert.match(normal.text, /3:20/);

    await seedPlayer(bot, { tracks: [makeRawTrack({ isStream: true })] });
    const live = await bot.slash("nowplaying");
    assert.match(live.text, /Live stream/);
  });

  it("does not show volume or source", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: [makeRawTrack()] });

    const { text } = await bot.slash("nowplaying");
    assert.doesNotMatch(text, /Volume/);
    assert.doesNotMatch(text, /Source/);
    assert.match(text, /Requested by/);
    assert.match(text, /In queue/);
  });
});
