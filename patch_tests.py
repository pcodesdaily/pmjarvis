import io

BT = chr(96)  # backtick


def edit(path, pairs, required=True):
    with io.open(path, encoding="utf-8") as fh:
        s = fh.read()
    for old, new in pairs:
        if old not in s:
            if required:
                raise SystemExit("NOT FOUND in %s:\n%s" % (path, old[:120]))
            continue
        s = s.replace(old, new)
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(s)


# ---------------- config.test.js ----------------
p = "tests/config.test.js"
s = io.open(p, encoding="utf-8").read()
start = s.index('  it("prefers Opus-capable YouTube clients"')
end = s.index('});\n\ndescribe("environment wiring"')
s = s[:start] + '''  it("loads no plugins at all", () => {
    // SoundCloud, Bandcamp, Twitch, Vimeo and HTTP are built into Lavalink.
    // Nothing downloads at boot, nothing to sign in to, nothing that expires.
    assert.deepEqual(lavalinkYml.lavalink.plugins, []);
    assert.equal(lavalinkYml.plugins, undefined);
  });

  it("keeps YouTube switched off", () => {
    assert.equal(lavalinkYml.lavalink.server.sources.youtube, false);
  });

  it("offers only search sources the audio server can actually stream", async () => {
    const { SEARCH_SOURCES } = await import("../src/modules/music/lib/player.js");
    const enabled = lavalinkYml.lavalink.server.sources;
    const backing = { scsearch: "soundcloud", bcsearch: "bandcamp" };
    for (const { value } of SEARCH_SOURCES) {
      const source = backing[value];
      assert.ok(source, "no backing source recorded for " + value);
      assert.equal(enabled[source], true);
    }
  });

''' + s[end:]
s = s.replace(
    '  it("documents every optional variable in .env.example", () => {',
    '''  it("asks for no credentials of any kind", () => {
    const text = read(".env.example");
    for (const name of ["YOUTUBE_OAUTH", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_PO_TOKEN", "SPOTIFY_CLIENT"]) {
      assert.ok(!text.includes(name), name + " should be gone: the bot needs no logins");
    }
  });

  it("documents every optional variable in .env.example", () => {''',
)
io.open(p, "w", encoding="utf-8").write(s)

# ---------------- playback.test.js ----------------
edit("tests/playback.test.js", [
    ('assert.equal(seen, "ytmsearch:lofi beats");', 'assert.equal(seen, "scsearch:lofi beats");'),
    ('const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";',
     'const url = "https://soundcloud.com/artist/some-track";'),
    ('return trackResponse(makeRawTrack({ uri: url, sourceName: "youtube" }));',
     'return trackResponse(makeRawTrack({ uri: url, sourceName: "soundcloud" }));'),
    ('await bot.slash("play", { query: "https://youtube.com/playlist?list=abc" });',
     'await bot.slash("play", { query: "https://soundcloud.com/user/sets/road-trip" });'),
    ('await bot.slash("play", { query: "https://youtube.com/playlist?list=big", shuffle: true });',
     'await bot.slash("play", { query: "https://soundcloud.com/user/sets/big", shuffle: true });'),
    ('''    for (const [url, platform] of [
      ["https://open.spotify.com/track/abc", "Spotify"],''',
     '''    for (const [url, platform] of [
      ["https://www.youtube.com/watch?v=abc", "YouTube"],
      ["https://open.spotify.com/track/abc", "Spotify"],'''),
    ('assert.match(text, /Search by song name instead/);',
     'assert.match(text, /search by song name instead/i);'),
    ('''  it("skipping the last track stops cleanly instead of erroring", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: tracks(1) });

    const { text } = await bot.slash("skip");
    assert.match(text, /queue is now empty/);
    assert.doesNotMatch(text, /Something went wrong/);
  });''',
     '''  it("skipping the last track stops cleanly when autoplay is off", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(1) });
    player.setData("autoplay", false);

    const { text } = await bot.slash("skip");
    assert.match(text, /queue is now empty/);
    assert.doesNotMatch(text, /Something went wrong/);
  });

  it("skipping the last track with autoplay on does not error", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    const player = await seedPlayer(bot, { tracks: tracks(1) });
    assert.equal(player.getData("autoplay"), true, "autoplay is on by default");

    const { text } = await bot.slash("skip");
    assert.doesNotMatch(text, /Something went wrong/);
  });'''),
])

# ---------------- queue.test.js ----------------
edit("tests/queue.test.js", [
    ('''      "music:loop",
      "music:shuffle",
      "music:voldown",
      "music:volup",
      "music:queue",
    ]);''',
     '''      "music:loop",
      "music:shuffle",
      "music:autoplay",
      "music:voldown",
      "music:volup",
    ]);'''),
    (r'''  it("shows a progress bar for a normal track and LIVE for a stream", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    await seedPlayer(bot, { tracks: [makeRawTrack({ length: 200_000 })] });
    const normal = await bot.slash("nowplaying");
    assert.match(normal.text, /\u{1F518}/u);

    await seedPlayer(bot, { tracks: [makeRawTrack({ isStream: true })] });
    const live = await bot.slash("nowplaying");
    assert.match(live.text, /Live stream/);
  });''',
     r'''  it("shows the length, and never a progress bar", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());

    await seedPlayer(bot, { tracks: [makeRawTrack({ length: 200_000 })] });
    const normal = await bot.slash("nowplaying");
    // A bar in a static embed freezes at whatever position it was posted at.
    assert.doesNotMatch(normal.text, /\u{1F518}|\u25AC/u);
    assert.match(normal.text, /Length/);
    assert.match(normal.text, /3:20/);

    await seedPlayer(bot, { tracks: [makeRawTrack({ isStream: true })] });
    const live = await bot.slash("nowplaying");
    assert.match(live.text, /Live stream/);
  });

  it("does not show volume or source", async (t) => {
    const bot = await bootBot();
    t.after(() => bot.teardown());
    await seedPlayer(bot, { tracks: [makeRawTrack()] });

    const { text } = await bot.slash("nowplaying");
    assert.doesNotMatch(text, /Volume/);
    assert.doesNotMatch(text, /Source/);
    assert.match(text, /Requested by/);
    assert.match(text, /In queue/);
  });'''),
])

# ---------------- robustness.test.js ----------------
edit("tests/robustness.test.js", [
    ('await bot.slash("play", { query: "https://youtube.com/playlist?list=huge" });',
     'await bot.slash("play", { query: "https://soundcloud.com/u/sets/huge" });'),
    ('await bot.slash("play", { query: "https://youtube.com/playlist?list=capped" });',
     'await bot.slash("play", { query: "https://soundcloud.com/u/sets/capped" });'),
    ('''      "clear",
      "help",''',
     '''      "autoplay",
      "clear",
      "help",'''),
    ("assert.ok(stub.commands.size >= 19);", "assert.ok(stub.commands.size >= 20);"),
])

# ---------------- onboarding.test.js ----------------
edit("tests/onboarding.test.js", [
    ('''      "Loop: Off",
      "Shuffle",
      "Vol -",
      "Vol +",
      "Queue",
    ]);''',
     '''      "Loop: Off",
      "Shuffle",
      "Autoplay: On",
      "Vol -",
      "Vol +",
    ]);'''),
])

# ---------------- text-commands.test.js ----------------
edit("tests/text-commands.test.js", [
    ('assert.equal(seen, "ytmsearch:the sound of silence disturbed cover");',
     'assert.equal(seen, "scsearch:the sound of silence disturbed cover");'),
    ("play bohemian rhapsody --source scsearch", "play bohemian rhapsody --source bcsearch"),
    ('assert.equal(seen, "scsearch:bohemian rhapsody");', 'assert.equal(seen, "bcsearch:bohemian rhapsody");'),
    ("play https://youtube.com/playlist?list=x --shuffle", "play https://soundcloud.com/u/sets/x --shuffle"),
    ('args: ["https://youtube.com/playlist?list=x", "--shuffle"],',
     'args: ["https://soundcloud.com/u/sets/x", "--shuffle"],'),
    ('assert.equal(ctx.string("query"), "https://youtube.com/playlist?list=x");',
     'assert.equal(ctx.string("query"), "https://soundcloud.com/u/sets/x");'),
    ('''    "clear",
    "join",''',
     '''    "clear",
    "autoplay",
    "join",'''),
])

# ---------------- smoke.test.js ----------------
edit("tests/smoke.test.js", [
    ("assert.ok(bot.client.commands.size >= 19,", "assert.ok(bot.client.commands.size >= 20,"),
])

print("tests patched")
