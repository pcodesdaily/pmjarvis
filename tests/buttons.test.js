import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config from "../src/config.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { addListener, makeButtonInteraction, makeVoiceChannel, responseText } from "./helpers/discord.js";
import { makeRawTrack } from "./helpers/lavalink.js";

const tracks = (count) =>
  Array.from({ length: count }, (_, index) =>
    makeRawTrack({ title: `Song ${index + 1}`, identifier: `t${index + 1}` }),
  );

/** Pushes a button through the real interactionCreate handler. */
async function press(bot, customId) {
  const interaction = makeButtonInteraction(bot, customId);
  for (const handler of bot.client.rawListeners("interactionCreate")) await handler(interaction);
  await new Promise((resolve) => setImmediate(resolve));
  return { interaction, text: responseText(interaction) };
}

describe("player control buttons", () => {
  it("play/pause toggles and re-renders the panel", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    const paused = await press(bot, "music:playpause");
    assert.equal(player.paused, true);
    assert.equal(paused.interaction.responses.at(-1).kind, "update");

    await press(bot, "music:playpause");
    assert.equal(player.paused, false);
  });

  it("skip ends the current track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    await press(bot, "music:skip");
    assert.equal(bot.lava.lastPatch().track.encoded, null);
    assert.equal(player.queue.tracks.length, 2);
  });

  it("skip on the last track stops instead of erroring", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await press(bot, "music:skip");
    assert.doesNotMatch(text, /Something went wrong/);
    assert.equal(player.queue.tracks.length, 0);
  });

  it("stop leaves the voice channel", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(4) });

    await press(bot, "music:stop");
    assert.equal(bot.client.lavalink.getPlayer(bot.guild.id), undefined);
  });

  it("loop cycles the repeat mode", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    await press(bot, "music:loop");
    assert.equal(player.repeatMode, "track");
    await press(bot, "music:loop");
    assert.equal(player.repeatMode, "queue");
    await press(bot, "music:loop");
    assert.equal(player.repeatMode, "off");
  });

  it("shuffle reorders, and refuses with too few tracks", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(20) });

    const before = player.queue.tracks.map((track) => track.info.identifier);
    await press(bot, "music:shuffle");
    assert.notDeepEqual(player.queue.tracks.map((track) => track.info.identifier), before);

    await player.queue.splice(0, player.queue.tracks.length - 1);
    const { text } = await press(bot, "music:shuffle");
    assert.match(text, /Not enough tracks/);
  });

  it("volume buttons step by ten and stop at the limits", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(2) });

    const { displayVolume, setDisplayVolume } = await import("../src/modules/music/lib/volume.js");

    await press(bot, "music:voldown");
    assert.equal(displayVolume(player), 90);
    await press(bot, "music:volup");
    assert.equal(displayVolume(player), 100);

    // Stepping repeatedly must land on exact tens, not drift.
    for (let i = 0; i < 5; i += 1) await press(bot, "music:voldown");
    assert.equal(displayVolume(player), 50);
    for (let i = 0; i < 5; i += 1) await press(bot, "music:volup");
    assert.equal(displayVolume(player), 100);

    await setDisplayVolume(player, config.music.maxVolume);
    const capped = await press(bot, "music:volup");
    assert.match(capped.text, /already at/);

    await setDisplayVolume(player, 0);
    const floored = await press(bot, "music:voldown");
    assert.match(floored.text, /already at/);
  });

  it("previous restores the last played track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(3) });

    player.queue.previous.unshift(player.queue.current);
    player.queue.current = player.queue.tracks[0];
    await player.queue.splice(0, 1);

    await press(bot, "music:previous");
    assert.equal(player.queue.current.info.title, "Song 1");
  });

  it("the queue button opens an ephemeral queue", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(15) });

    const { interaction, text } = await press(bot, "music:queue");
    assert.match(text, /Now playing/);
    const payload = interaction.responses.at(-1).payload;
    assert.equal(payload.components.length, 1, "pagination row should be present");
  });
});

describe("queue pagination buttons", () => {
  it("moves between pages", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(35) });

    const second = await press(bot, "music:queuepage:2");
    assert.match(second.text, /Page 2\/4/);

    const last = await press(bot, "music:queuepage:4");
    assert.match(last.text, /Page 4\/4/);
  });

  it("clamps a page beyond the end", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(12) });

    const { text } = await press(bot, "music:queuepage:99");
    assert.match(text, /Page 2\/2/);
  });

  it("ignores the page-counter button", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(12) });

    const { interaction } = await press(bot, "music:queuepage:noop");
    assert.equal(interaction.responses.at(-1).kind, "deferUpdate");
  });
});

describe("button guards", () => {
  it("tells a user outside the voice channel to join", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    bot.member.voice.channel = null;
    bot.member.voice.channelId = null;

    const { text } = await press(bot, "music:skip");
    assert.match(text, /Join a voice channel first/);
  });

  it("tells a user in the wrong channel where to go", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    const other = makeVoiceChannel({ guild: bot.guild });
    bot.guild.channels.cache.set(other.id, other);
    bot.member.voice.channel = other;
    bot.member.voice.channelId = other.id;

    const { text } = await press(bot, "music:skip");
    assert.match(text, /to use these controls/);
  });

  it("reports a dead panel from a previous session", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { text } = await press(bot, "music:playpause");
    assert.match(text, /Nothing is playing right now/);
  });

  it("applies DJ rules to destructive buttons", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const original = config.music.freeForAll;
    config.music.freeForAll = false;
    t.after(() => {
      config.music.freeForAll = original;
    });

    const player = await seedPlayer(bot, { tracks: tracks(3) });
    addListener(bot);
    player.queue.current.requester = { id: "999" };

    const blocked = await press(bot, "music:skip");
    assert.match(blocked.text, /DJ/);

    // Non-destructive controls stay open to everyone.
    const allowed = await press(bot, "music:queue");
    assert.match(allowed.text, /Now playing/);
  });

  it("ignores custom ids that are not ours", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { interaction } = await press(bot, "someothermodule:action");
    assert.equal(interaction.responses.length, 0);
  });
});
