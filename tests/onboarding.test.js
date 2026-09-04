import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config from "../src/config.js";
import { bootBot } from "./helpers/bot.js";
import { makeTextChannel } from "./helpers/discord.js";

const EM_DASH = "—";

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
};

const emitGuildCreate = async (bot, guild) => {
  bot.client.emit("guildCreate", guild);
  await flush();
};

const embedText = (embed) => {
  const data = embed.data ?? embed;
  return [
    data.title,
    data.description,
    data.author?.name,
    data.footer?.text,
    ...(data.fields ?? []).flatMap((field) => [field.name, field.value]),
  ]
    .filter(Boolean)
    .join("\n");
};

describe("/info", () => {
  it("shows the bot and the developer", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { interaction } = await bot.slash("info");
    const text = embedText(interaction.responses.at(-1).payload.embeds[0]);

    assert.match(text, /PMJARVIS/);
    assert.match(text, /Piyush Manna/);
    assert.match(text, /AI Engineer/);
    assert.match(text, /https:\/\/www\.linkedin\.com\/in\/pcodesdaily\//);
    assert.match(text, /https:\/\/www\.instagram\.com\/piyushiitm\//);
  });

  it("tells a first-time user exactly what to type", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { interaction } = await bot.slash("info");
    const text = embedText(interaction.responses.at(-1).payload.embeds[0]);

    assert.match(text, /Join a voice channel/);
    assert.match(text, /pm!join/);
    assert.match(text, /pm!play/);
  });

  it("uses no em dashes", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { interaction } = await bot.slash("info");
    const text = embedText(interaction.responses.at(-1).payload.embeds[0]);

    assert.ok(!text.includes(EM_DASH), `/info must not contain an em dash: ${text}`);
  });

  it("works as a text command too", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { text } = await bot.text("info");
    assert.match(text, /Piyush Manna/);
  });
});

describe("welcome message", () => {
  it("posts in the system channel when the bot is added to a server", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    await emitGuildCreate(bot, bot.guild);

    assert.equal(bot.textChannel.sent.length, 1);
    const text = embedText(bot.textChannel.sent[0].embeds[0]);
    assert.match(text, /Thank you for inviting me/);
    assert.match(text, /Join a voice channel/);
    assert.match(text, /pm!play/);
    assert.match(text, /pm!stop/);
    assert.ok(!text.includes(EM_DASH), "the welcome message must not contain an em dash");
  });

  it("falls back to another channel when the system channel is unusable", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    // System channel the bot cannot post in, plus a usable one further down.
    const blocked = makeTextChannel({ guild: bot.guild, rawPosition: 0, permissions: ["ViewChannel"] });
    bot.guild.channels.cache.set(blocked.id, blocked);
    bot.guild.systemChannel = blocked;
    bot.textChannel.rawPosition = 1;

    await emitGuildCreate(bot, bot.guild);

    assert.equal(blocked.sent.length, 0, "must not try a channel it cannot write to");
    assert.equal(bot.textChannel.sent.length, 1);
  });

  it("stays quiet when there is nowhere it can post", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const blocked = makeTextChannel({ guild: bot.guild, permissions: ["ViewChannel"] });
    bot.guild.channels.cache.clear();
    bot.guild.channels.cache.set(blocked.id, blocked);
    bot.guild.systemChannel = blocked;

    await emitGuildCreate(bot, bot.guild);
    assert.equal(blocked.sent.length, 0);
  });
});

describe("command prefix", () => {
  it("is pm! by default", () => {
    assert.equal(config.prefix, "pm!");
  });

  it("is what the help and welcome text tell people to type", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { interaction } = await bot.slash("help");
    const text = embedText(interaction.responses.at(-1).payload.embeds[0]);

    assert.match(text, /pm!play/);
    assert.match(text, /pm!join/);
    assert.doesNotMatch(text, /Spotify|Apple Music|Deezer/, "help must not advertise removed platforms");
  });
});

describe("/join and /stop as a pair", () => {
  it("join connects without playing, stop disconnects", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    await bot.slash("join");
    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.ok(player, "join should create a player");
    assert.equal(player.playing, false);

    const { text } = await bot.slash("stop");
    assert.match(text, /left the voice channel/);
    assert.equal(bot.client.lavalink.getPlayer(bot.guild.id), undefined);
  });
});

describe("button panel", () => {
  it("labels every control with a readable word, not a symbol", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { makeRawTrack } = await import("./helpers/lavalink.js");
    const { seedPlayer } = await import("./helpers/bot.js");
    await seedPlayer(bot, { tracks: [makeRawTrack(), makeRawTrack(), makeRawTrack()] });

    const { interaction } = await bot.slash("nowplaying");
    const rows = interaction.responses.at(-1).payload.components;
    const buttons = rows.flatMap((row) => row.components.map((b) => b.toJSON()));

    assert.equal(buttons.length, 8);
    for (const b of buttons) {
      assert.ok(b.label, `every button needs a label: ${b.custom_id}`);
      assert.ok(b.label.length <= 80, "Discord caps button labels at 80 characters");
      assert.equal(b.emoji, undefined, "labels replace emoji on this panel");
    }

    const labels = buttons.map((b) => b.label);
    assert.deepEqual(labels, [
      "Previous",
      "Pause",
      "Skip",
      "Stop",
      "Loop: Off",
      "Shuffle",
      "Autoplay: On",
      "Queue",
    ]);
  });

  it("says what the loop and play buttons will do next", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { makeRawTrack } = await import("./helpers/lavalink.js");
    const { seedPlayer } = await import("./helpers/bot.js");
    const player = await seedPlayer(bot, { tracks: [makeRawTrack(), makeRawTrack()] });

    const labelsNow = async () => {
      const { interaction } = await bot.slash("nowplaying");
      return interaction.responses
        .at(-1)
        .payload.components.flatMap((row) => row.components.map((b) => b.toJSON().label));
    };

    await player.pause();
    assert.ok((await labelsNow()).includes("Resume"), "a paused player offers Resume");

    await player.resume();
    assert.ok((await labelsNow()).includes("Pause"));

    await player.setRepeatMode("queue");
    assert.ok((await labelsNow()).includes("Loop: Queue"), "the loop button shows its state");
  });

  it("uses words on the queue pagination row too", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { makeRawTrack } = await import("./helpers/lavalink.js");
    const { seedPlayer } = await import("./helpers/bot.js");
    await seedPlayer(bot, {
      tracks: Array.from({ length: 30 }, (_, i) => makeRawTrack({ identifier: `p${i}` })),
    });

    const { interaction } = await bot.slash("queue");
    const row = interaction.responses.at(-1).payload.components[0];
    const labels = row.components.map((b) => b.toJSON().label);

    assert.deepEqual(labels, ["First", "Back", "Page 1 of 3", "Next", "Last"]);
  });
});
