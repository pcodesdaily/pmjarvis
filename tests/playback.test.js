import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import {
  emptyResponse,
  errorResponse,
  makeRawTrack,
  playlistResponse,
  searchResponse,
  trackResponse,
} from "./helpers/lavalink.js";

const tracks = (count, overrides = {}) =>
  Array.from({ length: count }, (_, index) =>
    makeRawTrack({ title: `Song ${index + 1}`, identifier: `t${index + 1}`, ...overrides }),
  );

describe("/play", () => {
  it("queues a track found by title", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "Bohemian Rhapsody", author: "Queen" })]));
    const { text } = await bot.slash("play", { query: "bohemian rhapsody" });

    assert.match(text, /Added to queue/);
    assert.match(text, /Bohemian Rhapsody/);
    assert.match(text, /Playing now/);
  });

  it("searches the default platform when no source is given", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    let seen = null;
    bot.lava.onSearch((identifier) => {
      seen = identifier;
      return searchResponse([makeRawTrack()]);
    });
    await bot.slash("play", { query: "lofi beats" });

    assert.equal(seen, "scsearch:lofi beats");
  });

  it("honours an explicit source", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    let seen = null;
    bot.lava.onSearch((identifier) => {
      seen = identifier;
      return searchResponse([makeRawTrack({ sourceName: "soundcloud" })]);
    });
    await bot.slash("play", { query: "yesterday", source: "scsearch" });

    assert.equal(seen, "scsearch:yesterday");
  });

  it("passes a URL through untouched instead of searching", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const url = "https://soundcloud.com/artist/some-track";
    let seen = null;
    bot.lava.onSearch((identifier) => {
      seen = identifier;
      return trackResponse(makeRawTrack({ uri: url, sourceName: "soundcloud" }));
    });
    await bot.slash("play", { query: url });

    assert.equal(seen, url, "a link must not be prefixed with a search source");
  });

  it("adds a whole playlist", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(playlistResponse("Road Trip", tracks(12)));
    const { text } = await bot.slash("play", { query: "https://soundcloud.com/user/sets/road-trip" });

    assert.match(text, /Playlist added to queue/);
    assert.match(text, /Road Trip/);

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    // One track becomes `current`, the rest stay queued.
    assert.equal(player.queue.tracks.length + 1, 12);
  });

  it("puts a track at the front with next:true", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    // Straight to playing: this test is about queue position, not choosing.
    const config = (await import("../src/config.js")).default;
    const original = config.music.playAsksToChoose;
    config.music.playAsksToChoose = false;
    t.after(() => {
      config.music.playAsksToChoose = original;
    });

    bot.lava.queueSearch(searchResponse(tracks(3)));
    await bot.slash("play", { query: "playlist seed" });

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "Jump The Line", identifier: "jump" })]));
    await bot.slash("play", { query: "jump the line", next: true });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.tracks[0].info.title, "Jump The Line");
  });

  it("shuffles a playlist when asked", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(playlistResponse("Big List", tracks(40)));
    await bot.slash("play", { query: "https://soundcloud.com/user/sets/big", shuffle: true });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    const order = player.queue.tracks.map((track) => track.info.identifier);
    const sorted = [...order].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    assert.notDeepEqual(order, sorted, "40 tracks should not stay in their original order");
  });

  it("reports when nothing was found", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(emptyResponse());
    const { text } = await bot.slash("play", { query: "asdkjhasdkjh" });

    assert.match(text, /No results/);
  });

  it("surfaces a load error from the source", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(errorResponse("This video is unavailable"));
    const { text } = await bot.slash("play", { query: "broken" });

    assert.match(text, /This video is unavailable/);
  });

  it("explains that a closed-platform link cannot be played", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    for (const [url, platform] of [
      ["https://www.youtube.com/watch?v=abc", "YouTube"],
      ["https://open.spotify.com/track/abc", "Spotify"],
      ["https://music.apple.com/us/album/x/1", "Apple Music"],
      ["https://www.deezer.com/track/123", "Deezer"],
    ]) {
      const { text } = await bot.slash("play", { query: url });
      assert.match(text, new RegExp(`${platform} links do not work here`));
      assert.match(text, /search by song name instead/i);
    }
  });

  it("returns autocomplete suggestions", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse(tracks(30)));
    const command = bot.command("play");
    const interaction = {
      client: bot.client,
      user: bot.user,
      options: { getFocused: () => "song", getString: () => null },
      responded: null,
      async respond(choices) {
        this.responded = choices;
      },
    };
    await command.autocomplete(interaction);

    assert.ok(interaction.responded.length <= 25, "Discord allows at most 25 choices");
    assert.ok(interaction.responded.length > 0);
    for (const choice of interaction.responded) {
      assert.ok(choice.name.length <= 100, `choice name too long: ${choice.name}`);
      assert.ok(choice.value.length <= 100, `choice value too long: ${choice.value}`);
    }
  });
});

describe("transport controls", () => {
  it("pauses and resumes", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    const paused = await bot.slash("pause");
    assert.match(paused.text, /Paused/);
    assert.equal(player.paused, true);

    const already = await bot.slash("pause");
    assert.match(already.text, /already paused/);

    const resumed = await bot.slash("resume");
    assert.match(resumed.text, /Resumed/);
    assert.equal(player.paused, false);

    const notPaused = await bot.slash("resume");
    assert.match(notPaused.text, /isn't paused/);
  });

  it("skips the current track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    const { text } = await bot.slash("skip");
    assert.match(text, /Skipped/);
    // Lavalink is told to end the current track; the queue advances on trackEnd.
    assert.equal(bot.lava.lastPatch().track.encoded, null);
    assert.equal(player.queue.tracks.length, 2);
  });

  it("skips straight to a queue position", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(6) });

    const { text } = await bot.slash("skip", { to: 3 });
    assert.match(text, /#3/);
    // Two tracks are dropped so that the third becomes next up.
    assert.equal(player.queue.tracks.length, 3);
    assert.equal(player.queue.tracks[0].info.title, "Song 4");
  });

  it("refuses to skip past the end of the queue", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    const { text } = await bot.slash("skip", { to: 99 });
    assert.match(text, /only 2 track/);
  });

  it("skipping the last track stops cleanly when autoplay is off", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(1) });
    player.setData("autoplay", false);

    const { text } = await bot.slash("skip");
    assert.match(text, /queue is now empty/);
    assert.doesNotMatch(text, /Something went wrong/);
  });

  it("skipping the last track with autoplay on does not error", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(1) });
    assert.equal(player.getData("autoplay"), true, "autoplay is on by default");

    const { text } = await bot.slash("skip");
    assert.doesNotMatch(text, /Something went wrong/);
  });

  it("plays the previous track again", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    const first = player.queue.current;
    const second = player.queue.tracks[0];
    // Simulate the first track having finished.
    player.queue.previous.unshift(first);
    player.queue.current = second;
    await player.queue.splice(0, 1);

    const { text } = await bot.slash("previous");
    assert.match(text, /Song 1/);
    assert.equal(player.queue.current.info.title, "Song 1");
    assert.equal(player.queue.tracks[0].info.title, "Song 2", "the interrupted track goes back on top");
  });

  it("says so when there is no previous track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(2) });

    const { text } = await bot.slash("previous");
    assert.match(text, /no previous track/);
  });

  it("stops the music and leaves the voice channel", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(5) });

    const { text } = await bot.slash("stop");
    assert.match(text, /left the voice channel/);
    assert.equal(bot.client.lavalink.getPlayer(bot.guild.id), undefined);
  });
});

describe("seeking", () => {
  it("seeks to a mm:ss position", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("seek", { position: "1:30" });
    assert.match(text, /1:30/);
    assert.equal(bot.lava.lastPatch().position, 90_000);
  });

  it("accepts bare seconds and 1m30s style input", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    await bot.slash("seek", { position: "45" });
    assert.equal(bot.lava.lastPatch().position, 45_000);

    await bot.slash("seek", { position: "2m10s" });
    assert.equal(bot.lava.lastPatch().position, 130_000);
  });

  it("rejects a position past the end of the track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: [makeRawTrack({ length: 60_000 })] });

    const { text } = await bot.slash("seek", { position: "5:00" });
    assert.match(text, /past the end/);
  });

  it("rejects gibberish", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("seek", { position: "banana" });
    assert.match(text, /could not read that position/i);
  });

  it("refuses to seek a live stream", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: [makeRawTrack({ isStream: true, isSeekable: false })] });

    const { text } = await bot.slash("seek", { position: "30" });
    assert.match(text, /cannot be seeked/);
  });
});

describe("connection", () => {
  it("joins the caller's channel automatically on /play", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse(tracks(1)));
    await bot.slash("play", { query: "anything" });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.voiceChannelId, bot.voiceChannel.id);
  });

  it("joins on demand with /join", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { text } = await bot.slash("join");
    assert.match(text, /Joined/);
    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.voiceChannelId, bot.voiceChannel.id);
    assert.equal(player.queue.current, null, "joining should not start any music");
  });

  it("accepts leave as a text alias for stop", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(2) });

    const { text } = await bot.text("leave");
    assert.match(text, /left the voice channel/);
    assert.equal(bot.client.lavalink.getPlayer(bot.guild.id), undefined);
  });
});
