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

describe("retrying a broken upload", () => {
  it("tries another upload of the same song", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const broken = makeRawTrack({
      title: "Treat You Better",
      author: "Shawn Mendes",
      identifier: "brokenHls",
    });
    const player = await seedPlayer(bot, { tracks: [broken] });

    let seenQuery = null;
    bot.lava.onSearch((identifier) => {
      seenQuery = identifier;
      return searchResponse([
        broken, // the same broken upload comes back in the results
        makeRawTrack({ title: "Treat You Better", identifier: "working" }),
      ]);
    });

    await failTrack(bot, player, player.queue.current);

    assert.equal(seenQuery, "scsearch:Shawn Mendes Treat You Better");
    assert.equal(
      player.queue.tracks[0]?.info?.identifier,
      "working",
      "the upload that just failed must not be retried",
    );
    assert.match(lastEmbedText(bot), /trying another one/);
    assert.doesNotMatch(lastEmbedText(bot), /skipping it/);
  });

  it("gives up rather than looping when every upload is broken", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const player = await seedPlayer(bot, { tracks: [makeRawTrack({ title: "Cursed", identifier: "b0" })] });
    let searches = 0;
    bot.lava.onSearch(() => {
      searches += 1;
      return searchResponse([makeRawTrack({ title: "Cursed", identifier: `b${searches}` })]);
    });

    // Every replacement fails in turn.
    for (let i = 0; i < 6; i += 1) {
      const current = player.queue.tracks[0] ?? player.queue.current;
      if (!current) break;
      await failTrack(bot, player, current);
    }

    assert.ok(searches <= 4, `should stop after a few attempts, made ${searches}`);
    assert.match(lastEmbedText(bot), /skipping it/);
  });

  it("forgets past failures once something plays", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: [makeRawTrack({ identifier: "x1" })] });

    await failTrack(bot, player, player.queue.current);
    assert.ok((player.getData("failedTrackIds") ?? []).length > 0);

    bot.client.lavalink.emit("trackStart", player, player.queue.current, {});
    await flush();
    assert.equal(player.getData("failedTrackIds"), undefined);
  });

  it("marks the replacement so it can be traced back", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const original = makeRawTrack({ title: "Song", identifier: "yt1" });
    const player = await seedPlayer(bot, { tracks: [original] });
    bot.lava.onSearch(() => searchResponse([makeRawTrack({ identifier: "sc9" })]));

    await failTrack(bot, player, player.queue.current);
    assert.equal(player.queue.tracks[0].userData.fallbackFor, "yt1");
  });

  it("skips normally when the other platform has nothing either", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const player = await seedPlayer(bot, { tracks: [makeRawTrack()] });
    bot.lava.onSearch(() => emptyResponse());

    await failTrack(bot, player, player.queue.current);

    assert.equal(player.queue.tracks.length, 0);
    assert.match(lastEmbedText(bot), /skipping it/);
  });

  it("prefers the best-ranked alternative, not just the next one", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const player = await seedPlayer(bot, {
      tracks: [makeRawTrack({ title: "Kesariya", author: "Arijit Singh", identifier: "gone" })],
    });
    bot.lava.onSearch(() =>
      searchResponse([
        makeRawTrack({ title: "Kesariya (slowed reverb)", identifier: "slow" }),
        makeRawTrack({ title: "Kesariya - Arijit Singh", identifier: "good" }),
      ]),
    );

    await failTrack(bot, player, player.queue.current);
    assert.equal(player.queue.tracks[0].info.identifier, "good");
  });

  it("can be switched off entirely", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const original = config.music.fallbackSearchPlatform;
    config.music.fallbackSearchPlatform = "";
    t.after(() => {
      config.music.fallbackSearchPlatform = original;
    });

    const player = await seedPlayer(bot, { tracks: [makeRawTrack()] });
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

    const player = await seedPlayer(bot, { tracks: [makeRawTrack()] });
    bot.lava.onSearch(() =>
      searchResponse([
        makeRawTrack({ identifier: "live", isStream: true }),
        makeRawTrack({ identifier: "normal" }),
      ]),
    );

    await failTrack(bot, player, player.queue.current);
    assert.equal(player.queue.tracks[0].info.identifier, "normal");
  });
});
