import "./helpers/env.js";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { bootBot } from "./helpers/bot.js";
import { makeRawTrack, searchResponse } from "./helpers/lavalink.js";

describe("harness", () => {
  it("boots the real bot and runs a command", async () => {
    const bot = await bootBot();
    after(() => bot.teardown());

    assert.ok(bot.client.commands.size >= 20, "commands should be loaded");

    const { text } = await bot.slash("ping");
    assert.match(text, /Pong/);
  });

  it("plays a searched track end to end", async () => {
    const bot = await bootBot();
    after(() => bot.teardown());

    bot.lava.queueSearch(searchResponse([makeRawTrack({ title: "Never Gonna Give You Up" })]));
    const { text } = await bot.slash("play", { query: "never gonna give you up" });

    assert.match(text, /Added to queue/);
    assert.match(text, /Never Gonna Give You Up/);

    const player = bot.client.lavalink.getPlayer(bot.guild.id);
    assert.ok(player, "a player should exist");
    assert.equal(player.queue.current?.info?.title, "Never Gonna Give You Up");
  });
});
