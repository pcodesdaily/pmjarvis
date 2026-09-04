import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config from "../src/config.js";
import Ctx from "../src/core/context.js";
import { bootBot, seedPlayer } from "./helpers/bot.js";
import { makeMessage, responseText } from "./helpers/discord.js";
import { makeRawTrack, playlistResponse, searchResponse } from "./helpers/lavalink.js";

const tracks = (count) =>
  Array.from({ length: count }, (_, index) =>
    makeRawTrack({ title: `Song ${index + 1}`, identifier: `t${index + 1}` }),
  );

/** Drives the real messageCreate handler, exactly as Discord would. */
async function sendMessage(bot, content) {
  const message = makeMessage(bot, content);
  const handlers = bot.client.rawListeners("messageCreate");
  for (const handler of handlers) await handler(message);
  // Handlers are wrapped in promises by the loader; let them settle.
  await new Promise((resolve) => setImmediate(resolve));
  return { message, text: responseText(message) };
}

describe("prefix command routing", () => {
  it("runs a command typed with the prefix", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "Prefix Song" })]));
    const { text } = await sendMessage(bot, `${config.prefix}play prefix song`);

    assert.match(text, /Prefix Song/);
  });

  it("resolves aliases", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(3) });

    const { text } = await sendMessage(bot, `${config.prefix}q`);
    assert.match(text, /Now playing/);
  });

  it("answers a bare mention with the prefix", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { text } = await sendMessage(bot, `<@${bot.client.user.id}>`);
    assert.match(text, /My prefix here is/);
  });

  it("accepts a mention as the prefix", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(2) });

    const { text } = await sendMessage(bot, `<@${bot.client.user.id}> queue`);
    assert.match(text, /Now playing/);
  });

  it("ignores messages without the prefix", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { message } = await sendMessage(bot, "just chatting about play");
    assert.equal(message.responses.length, 0);
  });

  it("ignores unknown commands silently", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const { message } = await sendMessage(bot, `${config.prefix}notacommand`);
    assert.equal(message.responses.length, 0);
  });

  it("ignores other bots", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    const message = makeMessage(bot, `${config.prefix}queue`);
    message.author = { ...bot.user, bot: true };
    for (const handler of bot.client.rawListeners("messageCreate")) await handler(message);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(message.responses.length, 0);
  });

  it("respects ENABLE_MESSAGE_COMMANDS=false", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const original = config.enableMessageCommands;
    config.enableMessageCommands = false;
    t.after(() => {
      config.enableMessageCommands = original;
    });

    const { message } = await sendMessage(bot, `${config.prefix}queue`);
    assert.equal(message.responses.length, 0);
  });
});

describe("every command runs through the text path", () => {
  // A crash here means the shared Ctx does not cover some command's option use.
  const invocations = [
    "play never gonna give you up",
    "search never gonna give you up",
    "nowplaying",
    "queue",
    "queue 1",
    "pause",
    "resume",
    "skip",
    "skip 2",
    "previous",
    "seek 1:00",
    "shuffle",
    "loop",
    "loop track",
    "volume",
    "volume 90",
    "remove 1",
    "remove 1 2",
    "clear",
    "autoplay",
    "join",
    "info",
    "help",
    "help play",
    "ping",
    "stop",
  ];


  for (const line of invocations) {
    it(`${config.prefix}${line}`, async (t) => {
      const bot = await bootBot();
      t.after(() => bot.teardown());

      // Give every command something to work with.
      await seedPlayer(bot, { tracks: tracks(8) });
      bot.lava.onSearch(() => searchResponse(tracks(3)));

      const { text } = await sendMessage(bot, `${config.prefix}${line}`);
      assert.doesNotMatch(
        text,
        /Something went wrong/,
        `"!${line}" produced an unexpected error:\n${text}`,
      );
    });
  }
});

describe("greedy argument handling", () => {
  it("keeps a multi-word query intact", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    let seen = null;
    bot.lava.onSearch((identifier) => {
      seen = identifier;
      return searchResponse(tracks(1));
    });
    await sendMessage(bot, `${config.prefix}play the sound of silence disturbed cover`);

    assert.equal(seen, "scsearch:the sound of silence disturbed cover");
  });

  it("splits flags off the end of the query", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    let seen = null;
    bot.lava.onSearch((identifier) => {
      seen = identifier;
      return searchResponse(tracks(1));
    });
    await sendMessage(bot, `${config.prefix}play bohemian rhapsody --source bcsearch`);

    assert.equal(seen, "bcsearch:bohemian rhapsody");
  });

  it("treats a bare boolean flag as true", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    bot.lava.queueSearch(playlistResponse("Mixed", tracks(20)));
    const command = bot.command("play");
    const message = makeMessage(bot, `${config.prefix}play https://soundcloud.com/u/sets/x --shuffle`);
    const ctx = new Ctx({
      client: bot.client,
      command,
      message,
      args: ["https://soundcloud.com/u/sets/x", "--shuffle"],
    });

    assert.equal(ctx.boolean("shuffle"), true);
    assert.equal(ctx.string("query"), "https://soundcloud.com/u/sets/x");
  });
});
