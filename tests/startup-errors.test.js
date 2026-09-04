import "./helpers/env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explainStartupError } from "../src/core/startup-errors.js";

describe("startup error messages", () => {
  it("explains the disallowed-intents failure", () => {
    // This is the exact error discord.js throws when MESSAGE CONTENT is off.
    const text = explainStartupError(new Error("Used disallowed intents"));

    assert.ok(text, "the error should be recognised");
    assert.match(text, /privileged intent is not enabled/);
    assert.match(text, /MESSAGE CONTENT INTENT/);
    assert.match(text, /discord\.com\/developers\/applications/);
    assert.match(text, /ENABLE_MESSAGE_COMMANDS=false/, "the alternative fix should be offered too");
    assert.match(text, /docker compose restart bot/);
  });

  it("explains a rejected token", () => {
    const text = explainStartupError(new Error("An invalid token was provided."));

    assert.ok(text);
    assert.match(text, /rejected the bot token/);
    assert.match(text, /Reset Token/);
    assert.match(text, /not the client secret/);
  });

  it("returns null for anything it does not recognise", () => {
    assert.equal(explainStartupError(new Error("ECONNREFUSED 127.0.0.1:2333")), null);
    assert.equal(explainStartupError(new Error("something unexpected")), null);
  });

  it("survives odd inputs without throwing", () => {
    for (const input of [null, undefined, "Used disallowed intents", { message: null }, 42]) {
      assert.doesNotThrow(() => explainStartupError(input));
    }
    // A bare string still gets matched, since it is stringified first.
    assert.match(explainStartupError("Used disallowed intents"), /MESSAGE CONTENT INTENT/);
  });
});
