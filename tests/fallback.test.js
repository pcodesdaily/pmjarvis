import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config from "../src/config.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { emptyResponse, makeRawTrack, searchResponse } from "./helpers/lavalink.js";

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
};

const failTrack = async (bot, player, track) => {
  bot.client.lavalink.emit("trackError", player, track, {
    exception: { message: "This video requires login", severity: "common" },
  });
  await flush();
};

const lastEmbedText = (bot) => JSON.stringify(bot.textChannel.sent.at(-1)?.embeds ?? []);

describe("cross-platform fallback", () => {
  it("replays a failed YouTube track from SoundCloud", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const youtubeTrack = makeRawTrack({
      title: "Treat You Better",
      author: "Shawn Mendes",
      sourceName: "youtube",
    });
    const player = await seedPlayer(bot, { tracks: [youtubeTrack] });

    let seenQuery = null;
    bot.lava.onSearch((identifier) => {
      seenQuery = identifier;
      return searchResponse([
        makeRawTrack({ title: "Treat You Better", identifier: "sc1", sourceName: "soundcloud" }),
      ]);
    });

    await failTrack(bot, player, player.queue.current);

    assert.equal(seenQuery, "scsearch:Shawn Mendes Treat You Better");
    assert.equal(player.queue.tracks[0]?.info?.identifier, "sc1", "the replacement goes to the front");
    assert.match(lastEmbedText(bot), /SoundCloud/);
    assert.doesNotMatch(lastEmbedText(bot), /skipping it/);
  });

  it("marks the replacement so it can be traced back", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const original = makeRawTrack({ title: "Song", sourceName: "youtube", identifier: "yt1" });
    const player = await seedPlayer(bot, { tracks: [original] });
    bot.lava.onSearch(() => searchResponse([makeRawTrack({ identifier: "sc9", sourceName: "soundcloud" })]));

    await failTrack(bot, player, player.queue.current);
    assert.equal(player.queue.tracks[0].userData.fallbackFor, "yt1");
  });

  it("skips normally when the other platform has nothing either", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const player = await seedPlayer(bot, { tracks: [makeRawTrack({ sourceName: "youtube" })] });
    bot.lava.onSearch(() => emptyResponse());

    await failTrack(bot, player, player.queue.current);

    assert.equal(player.queue.tracks.length, 0);
    assert.match(lastEmbedText(bot), /skipping it/);
  });

  it("does not fall back onto the platform that just failed", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    // A SoundCloud track failing must not trigger a SoundCloud search.
    const player = await seedPlayer(bot, { tracks: [makeRawTrack({ sourceName: "soundcloud" })] });
    let searched = false;
    bot.lava.onSearch(() => {
      searched = true;
      return searchResponse([makeRawTrack()]);
    });

    await failTrack(bot, player, player.queue.current);

    assert.equal(searched, false);
    assert.match(lastEmbedText(bot), /skipping it/);
  });

  it("can be switched off entirely", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const original = config.music.fallbackSearchPlatform;
    config.music.fallbackSearchPlatform = "";
    t.after(() => {
      config.music.fallbackSearchPlatform = original;
    });

    const player = await seedPlayer(bot, { tracks: [makeRawTrack({ sourceName: "youtube" })] });
    let searched = false;
    bot.lava.onSearch(() => {
      searched = true;
      return searchResponse([makeRawTrack()]);
    });

    await failTrack(bot, player, player.queue.current);
    assert.equal(searched, false);
    assert.match(lastEmbedText(bot), /skipping it/);
  });

  it("never picks a livestream as the replacement", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const player = await seedPlayer(bot, { tracks: [makeRawTrack({ sourceName: "youtube" })] });
    bot.lava.onSearch(() =>
      searchResponse([
        makeRawTrack({ identifier: "live", isStream: true, sourceName: "soundcloud" }),
        makeRawTrack({ identifier: "normal", sourceName: "soundcloud" }),
      ]),
    );

    await failTrack(bot, player, player.queue.current);
    assert.equal(player.queue.tracks[0].info.identifier, "normal");
  });
});
