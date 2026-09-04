import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config from "../src/config.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { makeRawTrack } from "./helpers/lavalink.js";

const tracks = (count) =>
  Array.from({ length: count }, (_, index) =>
    makeRawTrack({ title: `Song ${index + 1}`, identifier: `t${index + 1}` }),
  );

/** Lets the loader's promise-wrapped handlers settle. */
const flush = async (ms = 0) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await new Promise((resolve) => setImmediate(resolve));
};

const emitLavalink = async (bot, event, ...args) => {
  bot.client.lavalink.emit(event, ...args);
  await flush();
};

/** Builds the pair of voice states discord.js hands to voiceStateUpdate. */
const voiceState = (bot, { id, channelId, suppress = false }) => ({
  id,
  guild: bot.guild,
  channelId,
  channel: channelId ? bot.guild.channels.cache.get(channelId) : null,
  suppress,
  setSuppressed: async () => {},
});

const emitVoice = async (bot, oldState, newState) => {
  bot.client.emit("voiceStateUpdate", oldState, newState);
  await flush();
};

describe("now-playing panel", () => {
  it("posts a panel when a track starts", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    await emitLavalink(bot, "trackStart", player, player.queue.current, {});

    assert.equal(bot.textChannel.sent.length, 1);
    const panel = bot.textChannel.sent[0];
    assert.equal(panel.components.length, 2);
    assert.ok(bot.client.nowPlayingMessages.has(bot.guild.id));
  });

  it("reposts rather than stacking panels on the next track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    await emitLavalink(bot, "trackStart", player, player.queue.current, {});
    const firstId = bot.client.nowPlayingMessages.get(bot.guild.id).messageId;

    player.queue.current = player.queue.tracks[0];
    await emitLavalink(bot, "trackStart", player, player.queue.current, {});

    const secondId = bot.client.nowPlayingMessages.get(bot.guild.id).messageId;
    assert.notEqual(firstId, secondId, "a new track gets a fresh panel at the bottom");
    assert.equal(bot.textChannel.sent.length, 1, "the old panel is deleted, not left behind");
  });

  it("removes the panel and explains when the queue ends", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(1) });

    await emitLavalink(bot, "trackStart", player, player.queue.current, {});
    player.queue.current = null;
    await emitLavalink(bot, "queueEnd", player, null, {});

    assert.equal(bot.client.nowPlayingMessages.has(bot.guild.id), false);
    const last = bot.textChannel.sent.at(-1);
    assert.match(JSON.stringify(last.embeds), /queue is empty/);
    assert.match(JSON.stringify(last.embeds), /I will leave the voice channel in 120 seconds/);
  });

  it("cleans up the panel when the player is destroyed", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(2) });

    await emitLavalink(bot, "trackStart", player, player.queue.current, {});
    assert.ok(bot.client.nowPlayingMessages.has(bot.guild.id));

    await player.destroy("test", false);
    await flush();
    assert.equal(bot.client.nowPlayingMessages.has(bot.guild.id), false);
  });
});

describe("track problems", () => {
  it("warns in chat on a track error", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(2) });

    await emitLavalink(bot, "trackError", player, player.queue.current, {
      exception: { message: "Video unavailable", severity: "common" },
    });

    assert.match(JSON.stringify(bot.textChannel.sent.at(-1).embeds), /skipping it/);
  });

  it("warns on a stuck track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(2) });

    await emitLavalink(bot, "trackStuck", player, player.queue.current, { thresholdMs: 10_000 });
    assert.match(JSON.stringify(bot.textChannel.sent.at(-1).embeds), /stopped responding/);
  });

  it("survives a track event with no text channel", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(2) });
    player.textChannelId = null;

    await emitLavalink(bot, "trackError", player, player.queue.current, { exception: { message: "x" } });
    await emitLavalink(bot, "trackStart", player, player.queue.current, {});
    // Reaching here without an unhandled rejection is the assertion.
    assert.ok(true);
  });
});

describe("voice state handling", () => {
  it("pauses when the last listener leaves, resumes when they return", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });
    player.playing = true;

    bot.voiceChannel.members.delete(bot.member.id);
    await emitVoice(
      bot,
      voiceState(bot, { id: bot.member.id, channelId: bot.voiceChannel.id }),
      voiceState(bot, { id: bot.member.id, channelId: null }),
    );

    assert.equal(player.paused, true);
    assert.equal(player.getData("pausedBecauseEmpty"), true);
    assert.ok(bot.client.emptyChannelTimers.has(bot.guild.id));

    bot.voiceChannel.members.set(bot.member.id, bot.member);
    await emitVoice(
      bot,
      voiceState(bot, { id: bot.member.id, channelId: null }),
      voiceState(bot, { id: bot.member.id, channelId: bot.voiceChannel.id }),
    );

    assert.equal(player.paused, false);
    assert.equal(bot.client.emptyChannelTimers.has(bot.guild.id), false);
  });

  it("leaves after the grace period if nobody comes back", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const original = config.music.leaveOnEmptyMs;
    config.music.leaveOnEmptyMs = 30;
    t.after(() => {
      config.music.leaveOnEmptyMs = original;
    });

    const player = await seedPlayer(bot, { tracks: tracks(3) });
    player.playing = true;

    bot.voiceChannel.members.delete(bot.member.id);
    await emitVoice(
      bot,
      voiceState(bot, { id: bot.member.id, channelId: bot.voiceChannel.id }),
      voiceState(bot, { id: bot.member.id, channelId: null }),
    );

    await flush(80);
    assert.equal(bot.client.lavalink.getPlayer(bot.guild.id), undefined, "the player should be gone");
    assert.match(JSON.stringify(bot.textChannel.sent.at(-1).embeds), /Everyone left/);
  });

  it("destroys the player when the bot itself is disconnected", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    await emitVoice(
      bot,
      voiceState(bot, { id: bot.client.user.id, channelId: bot.voiceChannel.id }),
      voiceState(bot, { id: bot.client.user.id, channelId: null }),
    );

    assert.equal(bot.client.lavalink.getPlayer(bot.guild.id), undefined);
  });

  it("ignores activity in unrelated channels", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    await emitVoice(
      bot,
      voiceState(bot, { id: "someone", channelId: "999" }),
      voiceState(bot, { id: "someone", channelId: null }),
    );

    assert.equal(player.paused, false);
    assert.equal(bot.client.emptyChannelTimers.has(bot.guild.id), false);
  });

  it("does nothing when there is no player", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    await emitVoice(
      bot,
      voiceState(bot, { id: bot.member.id, channelId: bot.voiceChannel.id }),
      voiceState(bot, { id: bot.member.id, channelId: null }),
    );
    assert.ok(true);
  });
});


describe("node events", () => {
  it("handles connect, disconnect and error without throwing", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.client.lavalink.nodeManager.emit("connect", bot.lava.node);
    bot.client.lavalink.nodeManager.emit("disconnect", bot.lava.node, { code: 1006, reason: "abnormal" });
    bot.client.lavalink.nodeManager.emit("error", bot.lava.node, new Error("boom"));
    await flush();
    assert.ok(true);
  });
});
