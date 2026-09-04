import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionsBitField } from "discord.js";
import config from "../src/config.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { addListener, makeVoiceChannel } from "./helpers/discord.js";
import { makeRawTrack, searchResponse } from "./helpers/lavalink.js";

const tracks = (count) =>
  Array.from({ length: count }, (_, index) => makeRawTrack({ title: `Song ${index + 1}` }));

describe("voice channel requirements", () => {
  it("asks the user to join a voice channel first", async (t) => {
    const bot = await bootBot({ userInVoice: false });
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse(tracks(1)));
    const { text } = await bot.slash("play", { query: "anything" });
    assert.match(text, /Join a voice channel first/);
  });

  it("blocks control from a different voice channel", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(2) });

    const other = makeVoiceChannel({ guild: bot.guild });
    bot.guild.channels.cache.set(other.id, other);
    bot.voiceChannel.members.delete(bot.member.id);
    other.members.set(bot.member.id, bot.member);
    bot.member.voice.channel = other;
    bot.member.voice.channelId = other.id;

    const { text } = await bot.slash("pause");
    assert.match(text, /You need to be in/);
  });

  it("refuses to start playing in a channel it cannot join", async (t) => {
    const bot = await bootBot({ permissions: ["ViewChannel"] });
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse(tracks(1)));
    const { text } = await bot.slash("play", { query: "anything" });
    assert.match(text, /I need these permissions/);
    assert.match(text, /Connect/);
    assert.match(text, /Speak/);
  });

  it("refuses to join a full channel", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    bot.voiceChannel.userLimit = 1;

    bot.lava.queueSearch(searchResponse(tracks(1)));
    const { text } = await bot.slash("play", { query: "anything" });
    assert.match(text, /is full/);
  });

  it("will not hijack a player that is busy in another channel", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const other = makeVoiceChannel({ guild: bot.guild });
    bot.guild.channels.cache.set(other.id, other);
    bot.member.voice.channel = other;
    bot.member.voice.channelId = other.id;

    bot.lava.queueSearch(searchResponse(tracks(1)));
    const { text } = await bot.slash("play", { query: "anything" });
    assert.match(text, /already playing in/);
  });
});

describe("player state requirements", () => {
  const needsPlayer = ["pause", "resume", "skip", "stop", "queue", "nowplaying", "shuffle", "clear"];

  for (const name of needsPlayer) {
    it(`/${name} reports that nothing is playing`, async (t) => {
      const bot = await bootBot();
      t.after(() => bot.teardown());

      const { text } = await bot.slash(name);
      assert.match(text, /Nothing is playing right now/);
      assert.doesNotMatch(text, /Something went wrong/);
    });
  }

  it("commands that need a current track reject an idle player", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: [] });

    for (const name of ["seek"]) {
      const { text } = await bot.slash(name, { position: "10" });
      assert.match(text, /Nothing is playing right now/, `/${name} should require a current track`);
    }
  });
});

describe("DJ restrictions", () => {
  const withDjMode = (t) => {
    const original = config.music.freeForAll;
    config.music.freeForAll = false;
    t.after(() => {
      config.music.freeForAll = original;
    });
  };

  it("lets a lone listener do anything", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    withDjMode(t);
    await seedPlayer(bot, { tracks: tracks(3) });

    const { text } = await bot.slash("skip");
    assert.match(text, /Skipped/);
  });

  it("blocks a second listener who is not a DJ", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    withDjMode(t);
    const player = await seedPlayer(bot, { tracks: tracks(3) });
    addListener(bot);

    // The current track was queued by someone else.
    player.queue.current.requester = { id: "999", username: "someone-else" };

    const { text } = await bot.slash("skip");
    assert.match(text, /You need the \*\*DJ\*\* role/);
  });

  it("lets the requester skip their own track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    withDjMode(t);
    const player = await seedPlayer(bot, { tracks: tracks(3) });
    addListener(bot);
    player.queue.current.requester = { id: bot.user.id, username: bot.user.username };

    const { text } = await bot.slash("skip");
    assert.match(text, /Skipped/);
  });

  it("lets a member with Manage Server through", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    withDjMode(t);
    const player = await seedPlayer(bot, { tracks: tracks(3) });
    addListener(bot);
    player.queue.current.requester = { id: "999" };
    bot.member.permissions = new PermissionsBitField([PermissionsBitField.Flags.ManageGuild]);

    const { text } = await bot.slash("skip");
    assert.match(text, /Skipped/);
  });

  it("lets a member holding the DJ role through", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    withDjMode(t);
    const player = await seedPlayer(bot, { tracks: tracks(3) });
    addListener(bot);
    player.queue.current.requester = { id: "999" };

    const djRole = { id: "dj-role", name: "DJ" };
    bot.guild.roles.cache.set(djRole.id, djRole);
    bot.member.roles.cache.set(djRole.id, djRole);

    const { text } = await bot.slash("skip");
    assert.match(text, /Skipped/);
  });

  it("still allows read-only commands for everyone", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    withDjMode(t);
    const player = await seedPlayer(bot, { tracks: tracks(3) });
    addListener(bot);
    player.queue.current.requester = { id: "999" };

    const queue = await bot.slash("queue");
    assert.match(queue.text, /Now playing/);
    const np = await bot.slash("nowplaying");
    assert.match(np.text, /Now playing/);
    const volume = await bot.slash("volume");
    assert.match(volume.text, /Volume is at/);
  });
});
