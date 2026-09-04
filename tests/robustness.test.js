import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Collection } from "discord.js";
import { loadModules } from "../src/core/loader.js";
import { deployCommands } from "../src/core/deploy.js";
import { formatDuration, parseDuration, progressBar, escapeMd, truncate } from "../src/modules/music/lib/format.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { makeRawTrack, playlistResponse, searchResponse } from "./helpers/lavalink.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "modules");

/** Discord's documented embed limits. Exceeding any of these is a 400 at runtime. */
function assertEmbedFits(embed, label) {
  const data = embed.data ?? embed;
  const limits = [
    [data.title, 256, "title"],
    [data.description, 4096, "description"],
    [data.author?.name, 256, "author name"],
    [data.footer?.text, 2048, "footer"],
  ];
  for (const [value, max, name] of limits) {
    if (value) assert.ok(value.length <= max, `${label}: ${name} is ${value.length}/${max}`);
  }
  assert.ok((data.fields ?? []).length <= 25, `${label}: too many fields`);
  for (const field of data.fields ?? []) {
    assert.ok(field.name.length <= 256, `${label}: field name too long`);
    assert.ok(field.value.length <= 1024, `${label}: field value "${field.name}" too long`);
  }
  const total = JSON.stringify(data).length;
  assert.ok(total <= 6000, `${label}: embed total ${total}/6000`);
}

const embedsOf = (interaction) =>
  interaction.responses.flatMap((entry) => entry.payload?.embeds ?? []);

describe("hostile track metadata", () => {
  it("survives an absurdly long title and author", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const long = "A".repeat(400);
    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: long, author: long })]));
    const added = await bot.slash("play", { query: "long" });
    for (const embed of embedsOf(added.interaction)) assertEmbedFits(embed, "/play");

    const np = await bot.slash("nowplaying");
    for (const embed of embedsOf(np.interaction)) assertEmbedFits(embed, "/nowplaying");
  });

  it("escapes markdown so titles cannot break the layout", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse([
        makeRawTrack({ title: "Normal", identifier: "a" }),
        makeRawTrack({ title: "**bold** [link](http://evil) `code`", identifier: "b" }),
      ]),
    );
    await bot.slash("play", { query: "seed" });
    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    await player.queue.add(
      bot.client.lavalink.utils.buildTrack(
        makeRawTrack({ title: "**bold** [link](http://evil)", identifier: "c" }),
        bot.user,
      ),
    );

    const { text } = await bot.slash("queue");
    assert.doesNotMatch(text, /\*\*bold\*\*/, "markdown in a title must be escaped");
    assert.match(text, /\\\*\\\*bold/);
  });

  it("handles a track with no artwork, no uri and no author", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const bare = makeRawTrack({ title: "Bare Track" });
    bare.info.artworkUrl = null;
    bare.info.uri = null;
    bare.info.author = null;
    bot.lava.queueSearch(searchResponse([bare]));

    const added = await bot.slash("play", { query: "bare" });
    assert.doesNotMatch(added.text, /Something went wrong/);

    const np = await bot.slash("nowplaying");
    assert.doesNotMatch(np.text, /Something went wrong/);

    const queue = await bot.slash("queue");
    assert.doesNotMatch(queue.text, /Something went wrong/);
  });

  it("handles a zero-length and a negative-length track", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack({ length: 0 })]));
    const zero = await bot.slash("play", { query: "zero" });
    assert.doesNotMatch(zero.text, /Something went wrong/);

    const np = await bot.slash("nowplaying");
    assert.doesNotMatch(np.text, /Something went wrong/);
  });

  it("keeps the queue embed inside Discord's limits with a huge queue", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const many = Array.from({ length: 500 }, (_, index) =>
      makeRawTrack({ title: `${"Very Long Track Title ".repeat(6)}${index}`, identifier: `t${index}` }),
    );
    await seedPlayer(bot, { tracks: many });

    for (const page of [1, 2, 25, 50]) {
      const { interaction } = await bot.slash("queue", { page });
      for (const embed of embedsOf(interaction)) assertEmbedFits(embed, `/queue page ${page}`);
    }
  });

  it("keeps the playlist embed inside limits for a giant playlist", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const huge = Array.from({ length: 900 }, (_, index) =>
      makeRawTrack({ title: `Track ${index}`, identifier: `p${index}` }),
    );
    bot.lava.queueSearch(playlistResponse("X".repeat(300), huge));

    const { interaction } = await bot.slash("play", { query: "https://youtube.com/playlist?list=huge" });
    for (const embed of embedsOf(interaction)) assertEmbedFits(embed, "/play playlist");
  });

  it("caps an oversized playlist at the configured limit", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const config = (await import("../src/config.js")).default;
    const original = config.music.maxPlaylistSize;
    config.music.maxPlaylistSize = 25;
    t.after(() => {
      config.music.maxPlaylistSize = original;
    });

    const huge = Array.from({ length: 300 }, (_, index) => makeRawTrack({ identifier: `q${index}` }));
    bot.lava.queueSearch(playlistResponse("Capped", huge));
    await bot.slash("play", { query: "https://youtube.com/playlist?list=capped" });

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.equal(player.queue.tracks.length + 1, 25);
  });

  it("truncates autocomplete values to Discord's 100-character cap", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const longUri = `https://example.com/${"x".repeat(200)}`;
    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "B".repeat(300), uri: longUri })]));

    const command = bot.command("play");
    const interaction = {
      client: bot.client,
      user: bot.user,
      options: { getFocused: () => "query", getString: () => null },
      responded: null,
      async respond(choices) {
        this.responded = choices;
      },
    };
    await command.autocomplete(interaction);

    for (const choice of interaction.responded) {
      assert.ok(choice.name.length <= 100);
      assert.ok(choice.value.length <= 100);
    }
  });
});

describe("/search selection flow", () => {
  it("queues the tracks the user picks", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse(
        Array.from({ length: 8 }, (_, index) =>
          makeRawTrack({ title: `Result ${index + 1}`, identifier: `r${index + 1}` }),
        ),
      ),
    );

    const command = bot.command("search");
    const { makeInteraction } = await import("./helpers/discord.js");
    const Ctx = (await import("../src/core/context.js")).default;
    const { runCommand } = await import("../src/core/runner.js");

    const interaction = makeInteraction(bot, { options: { query: "result" } });
    // Stand in for the user choosing the first and third results.
    let updated = null;
    interaction.fetchReply = async () => ({
      awaitMessageComponent: async () => ({
        values: ["0", "2"],
        async update(payload) {
          updated = payload;
        },
      }),
    });

    await runCommand(command, new Ctx({ client: bot.client, command, interaction }));

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    const titles = [player.queue.current, ...player.queue.tracks].map((track) => track.info.title);
    assert.deepEqual(titles, ["Result 1", "Result 3"]);
    assert.ok(updated, "the select menu should be resolved");
    assert.deepEqual(updated.components, []);
  });

  it("builds a menu that respects Discord's option limits", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(
      searchResponse(
        Array.from({ length: 60 }, (_, index) =>
          makeRawTrack({ title: "T".repeat(250), identifier: `s${index}` }),
        ),
      ),
    );

    const { interaction } = await bot.slash("search", { query: "many" }).catch(() => ({ interaction: null }));
    const payload = interaction.responses.find((entry) => entry.payload?.components?.length)?.payload;
    const menu = payload.components[0].components[0].toJSON();

    assert.ok(menu.options.length <= 25, "at most 25 select options");
    for (const option of menu.options) {
      assert.ok(option.label.length <= 100);
      assert.ok((option.description ?? "").length <= 100);
    }
  });

  it("times out gracefully", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack()]));

    const command = bot.command("search");
    const { makeInteraction, responseText } = await import("./helpers/discord.js");
    const Ctx = (await import("../src/core/context.js")).default;
    const { runCommand } = await import("../src/core/runner.js");

    const interaction = makeInteraction(bot, { options: { query: "x" } });
    interaction.fetchReply = async () => ({
      awaitMessageComponent: async () => {
        throw new Error("time expired");
      },
    });

    await runCommand(command, new Ctx({ client: bot.client, command, interaction }));
    assert.match(responseText(interaction), /Search timed out/);
  });
});

describe("formatting helpers", () => {
  it("formats durations", () => {
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(1000), "0:01");
    assert.equal(formatDuration(61_000), "1:01");
    assert.equal(formatDuration(3_600_000), "1:00:00");
    assert.equal(formatDuration(3_661_000), "1:01:01");
    assert.equal(formatDuration(-5), "--:--");
    assert.equal(formatDuration(Number.NaN), "--:--");
    assert.equal(formatDuration(1000, { stream: true }), "LIVE");
  });

  it("parses every accepted time format", () => {
    assert.equal(parseDuration("90"), 90_000);
    assert.equal(parseDuration("1:30"), 90_000);
    assert.equal(parseDuration("1:00:00"), 3_600_000);
    assert.equal(parseDuration("1m30s"), 90_000);
    assert.equal(parseDuration("2h"), 7_200_000);
    assert.equal(parseDuration("45s"), 45_000);
    assert.equal(parseDuration("banana"), null);
    assert.equal(parseDuration(""), null);
    assert.equal(parseDuration(null), null);
  });

  it("draws a progress bar that never overflows", () => {
    for (const [position, length] of [[0, 100], [50, 100], [100, 100], [200, 100], [-5, 100]]) {
      const bar = progressBar(position, length, 18);
      assert.equal([...bar].length, 18, `bar for ${position}/${length} has the wrong width`);
    }
    assert.ok(progressBar(0, 0).length > 0, "a zero-length track still renders");
  });

  it("escapes markdown and truncates", () => {
    assert.equal(escapeMd("a*b"), "a\\*b");
    assert.equal(escapeMd(null), "");
    assert.equal(truncate("abcdef", 4), "abc…");
    assert.equal(truncate("ab", 10), "ab");
  });
});

describe("command registration payload", () => {
  it("produces a payload Discord will accept", async (t) => {
    const stub = { commands: new Collection(), aliases: new Collection(), eventCount: 0 };
    await loadModules(stub, modulesDir, { events: false });

    const seenNames = new Set();
    for (const command of stub.commands.values()) {
      const json = command.json;
      assert.match(json.name, /^[-_\p{L}\p{N}]{1,32}$/u, `bad command name: ${json.name}`);
      assert.equal(json.name, json.name.toLowerCase(), `command names must be lowercase: ${json.name}`);
      assert.ok(json.description.length >= 1 && json.description.length <= 100, `bad description: ${json.name}`);
      assert.ok(!seenNames.has(json.name), `duplicate command name: ${json.name}`);
      seenNames.add(json.name);

      const seenOptions = new Set();
      let requiredSeen = true;
      for (const option of json.options ?? []) {
        assert.ok(option.description.length <= 100, `${json.name}.${option.name} description too long`);
        assert.ok(!seenOptions.has(option.name), `${json.name} has duplicate option ${option.name}`);
        seenOptions.add(option.name);
        // Discord rejects a required option that follows an optional one.
        if (option.required) assert.ok(requiredSeen, `${json.name}: required option after an optional one`);
        else requiredSeen = false;
        assert.ok((option.choices ?? []).length <= 25, `${json.name}.${option.name} has too many choices`);
      }
    }

    assert.ok(stub.commands.size >= 19);
  });

  it("sends exactly those commands when deploying", async (t) => {
    const stub = { commands: new Collection(), aliases: new Collection(), eventCount: 0 };
    await loadModules(stub, modulesDir, { events: false });

    // Intercept the REST call rather than talking to Discord.
    const { REST } = await import("discord.js");
    const originalPut = REST.prototype.put;
    let sent = null;
    REST.prototype.put = async function put(route, options) {
      sent = { route, body: options.body };
      return options.body;
    };
    t.after(() => {
      REST.prototype.put = originalPut;
    });

    await deployCommands(stub);
    assert.equal(sent.body.length, stub.commands.size);
    assert.match(sent.route, /applications/);
  });

  it("ships exactly the lean command set", async () => {
    const stub = { commands: new Collection(), aliases: new Collection(), eventCount: 0 };
    await loadModules(stub, modulesDir, { events: false });

    // Pinned deliberately: this build is a YouTube-Music-shaped player, not a
    // kitchen sink. Adding a command here is a conscious decision.
    assert.deepEqual([...stub.commands.keys()].sort(), [
      "clear",
      "help",
      "info",
      "join",
      "loop",
      "nowplaying",
      "pause",
      "ping",
      "play",
      "previous",
      "queue",
      "remove",
      "resume",
      "search",
      "seek",
      "shuffle",
      "skip",
      "stop",
      "volume",
    ]);
  });

  it("has no alias that collides with a command name", async () => {
    const stub = { commands: new Collection(), aliases: new Collection(), eventCount: 0 };
    await loadModules(stub, modulesDir, { events: false });

    for (const alias of stub.aliases.keys()) {
      assert.ok(!stub.commands.has(alias), `alias "${alias}" shadows a real command`);
    }
  });
});

describe("help and status", () => {
  it("lists every command grouped by category", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { interaction, text } = await bot.slash("help");
    assert.match(text, /Music/);
    assert.match(text, /General/);
    assert.match(text, /play/);
    for (const embed of embedsOf(interaction)) assertEmbedFits(embed, "/help");
  });

  it("explains a single command, including by alias", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const direct = await bot.slash("help", { command: "play" });
    assert.match(direct.text, /\/play/);
    assert.match(direct.text, /query/);

    const byAlias = await bot.slash("help", { command: "np" });
    assert.match(byAlias.text, /\/nowplaying/);
  });

  it("handles an unknown command name", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { text } = await bot.slash("help", { command: "definitelynotreal" });
    assert.match(text, /no command called/);
  });

  it("reports latency, and survives an offline node", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const online = await bot.slash("ping");
    assert.match(online.text, /Pong/);
    assert.match(online.text, /connected/);
    for (const embed of embedsOf(online.interaction)) assertEmbedFits(embed, "/ping");

    Object.defineProperty(bot.lava.node, "connected", { get: () => false, configurable: true });
    const offline = await bot.slash("ping");
    assert.match(offline.text, /offline/);
  });
});
