import "./helpers/env.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import YAML from "yaml";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const lavalinkYml = YAML.parse(read("lavalink/application.yml"));
const compose = YAML.parse(read("docker-compose.yml"));
const envExample = read(".env.example");

const DEFAULT_MAVEN = "https://maven.lavalink.dev/releases";

/** Turns "group.id:artifact:1.2.3" into its path under a Maven repository. */
function jarPath(dependency) {
  const [group, artifact, version] = dependency.split(":");
  return `${group.replaceAll(".", "/")}/${artifact}/${version}/${artifact}-${version}.jar`;
}

const online = async () => {
  try {
    const response = await fetch(DEFAULT_MAVEN, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return response.status < 500;
  } catch {
    return false;
  }
};

describe("Lavalink configuration", () => {
  it("parses and enables the sources the bot advertises", () => {
    const server = lavalinkYml.lavalink.server;
    assert.equal(server.sources.youtube, false, "the deprecated built-in source must stay off");
    for (const source of ["soundcloud", "bandcamp", "twitch", "vimeo", "http"]) {
      assert.equal(server.sources[source], true, `${source} should be enabled`);
    }
  });

  it("keeps the audio-quality settings we document", () => {
    const server = lavalinkYml.lavalink.server;
    assert.equal(server.opusEncodingQuality, 10);
    assert.equal(server.resamplingQuality, "HIGH");
    // These are env placeholders now, so check the defaults baked into them.
    assert.match(String(server.bufferDurationMs), /LAVALINK_BUFFER_MS:500/);
    assert.match(String(server.frameBufferDurationMs), /LAVALINK_FRAME_BUFFER_MS:10000/);
    assert.equal(server.useSeekGhosting, true);
  });

  it("loads no plugins at all", () => {
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

});

describe("environment wiring", () => {
  // Strip comment lines first: prose that mentions a ${NAME} placeholder
  // is documentation, not configuration.
  const yamlBody = read("lavalink/application.yml").replace(/^[ 	]*#.*$/gm, "");
  const placeholders = [...yamlBody.matchAll(/\$\{([A-Z0-9_]+)(?::[^}]*)?\}/g)].map((match) => match[1]);

  it("passes every application.yml placeholder through docker-compose", () => {
    const provided = new Set(Object.keys(compose.services.lavalink.environment ?? {}));
    const missing = [...new Set(placeholders)].filter((name) => !provided.has(name));
    assert.deepEqual(missing, [], `application.yml reads env vars compose never sets: ${missing.join(", ")}`);
  });

  it("asks for no credentials of any kind", () => {
    const text = read(".env.example");
    for (const name of ["YOUTUBE_OAUTH", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_PO_TOKEN", "SPOTIFY_CLIENT"]) {
      assert.ok(!text.includes(name), name + " should be gone: the bot needs no logins");
    }
  });

  it("documents every optional variable in .env.example", () => {
    const documented = new Set(
      [...envExample.matchAll(/^#?\s*([A-Z0-9_]+)=/gm)].map((match) => match[1]),
    );
    // SERVER_PORT and LAVALINK_PASSWORD are compose-internal wiring.
    const internal = new Set(["SERVER_PORT"]);
    const missing = [...new Set(placeholders)].filter(
      (name) => !documented.has(name) && !internal.has(name),
    );
    assert.deepEqual(missing, [], `undocumented variables: ${missing.join(", ")}`);
  });

  it("has the bot and Lavalink agreeing on the password variable", () => {
    assert.match(compose.services.bot.environment.LAVALINK_PASSWORD, /LAVALINK_PASSWORD/);
    assert.match(compose.services.lavalink.environment.LAVALINK_PASSWORD, /LAVALINK_PASSWORD/);
    assert.equal(compose.services.bot.environment.LAVALINK_HOST, "lavalink");
  });

  it("starts the bot alongside Lavalink rather than gating on health", () => {
    // lavalink-client retries the node connection on its own, so a healthcheck
    // that is wrong must never be able to stop the whole stack from starting.
    assert.equal(compose.services.bot.depends_on.lavalink.condition, "service_started");
  });

  it("authenticates its healthcheck", () => {
    // Every Lavalink v4 REST endpoint needs the Authorization header; without
    // it the probe gets a 401 and the container is marked unhealthy forever.
    const probe = compose.services.lavalink.healthcheck.test.join(" ");
    assert.match(probe, /Authorization/);
    assert.match(probe, /LAVALINK_PASSWORD/);
    assert.match(probe, /\/v4\/info/);
  });

  it("never publishes the Lavalink port to the host", () => {
    assert.equal(compose.services.lavalink.ports, undefined, "Lavalink must stay on the internal network");
  });

  it("reads the same defaults in config.js as .env.example advertises", async () => {
    const config = (await import("../src/config.js")).default;
    const declared = Object.fromEntries(
      [...envExample.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)].map((match) => [match[1], match[2]]),
    );
    assert.equal(String(config.music.defaultVolume), declared.DEFAULT_VOLUME);
    assert.equal(String(config.music.maxVolume), declared.MAX_VOLUME);
    assert.equal(String(config.music.volumeDecrementer), declared.VOLUME_DECREMENTER);
    assert.equal(config.music.defaultSearchPlatform, declared.DEFAULT_SEARCH_PLATFORM);
  });
});

describe("plugin artifacts", { concurrency: false }, () => {
  it("every pinned plugin JAR actually exists in its repository", async (t) => {
    if (!(await online())) {
      t.skip("no network access to maven.lavalink.dev");
      return;
    }

    const failures = [];
    for (const plugin of lavalinkYml.lavalink.plugins) {
      const repository = plugin.repository ?? DEFAULT_MAVEN;
      const url = `${repository.replace(/\/$/, "")}/${jarPath(plugin.dependency)}`;
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) }).catch(
        (error) => ({ status: `error: ${error.message}` }),
      );
      if (response.status !== 200) failures.push(`${plugin.dependency} -> ${response.status} at ${url}`);
    }

    assert.deepEqual(failures, [], `Lavalink would fail to load:\n${failures.join("\n")}`);
  });
});

describe("footprint", () => {
  const dockerfile = read("Dockerfile");
  const pkg = JSON.parse(read("package.json"));

  it("ships only the two dependencies it actually needs", () => {
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["discord.js", "lavalink-client"]);
    // .env is read by Node itself, so no dotenv dependency is carried.
    assert.match(pkg.scripts.start, /--env-file-if-exists/);
  });

  it("strips build-time-only files from the runtime image", () => {
    assert.match(dockerfile, /npm ci --omit=dev/);
    for (const pattern of ["*.d.ts", "*.map", "*.md"]) {
      assert.ok(dockerfile.includes(pattern), `the prune step should remove ${pattern}`);
    }
    // Dependency licence texts must survive the prune.
    assert.doesNotMatch(dockerfile, /-name 'LICENSE/);
  });

  it("keeps tests and docs out of the build context", () => {
    const ignored = read(".dockerignore").split(/\r?\n/).map((line) => line.trim());
    for (const entry of ["tests", "node_modules", ".git", "*.md"]) {
      assert.ok(ignored.includes(entry), `.dockerignore should list ${entry}`);
    }
  });

  it("never writes Lavalink log files to disk", () => {
    // Docker already captures stdout; a second rotating copy just grew the disk.
    assert.equal(lavalinkYml.logging.file, undefined);
  });

  it("caps container log growth", () => {
    for (const name of ["lavalink", "bot"]) {
      const options = compose.services[name].logging.options;
      assert.ok(options["max-size"], `${name} needs a log size cap`);
      assert.ok(Number(options["max-file"]) <= 3, `${name} keeps too many log files`);
    }
  });

  it("gives both services a hard memory ceiling", () => {
    assert.match(compose.services.lavalink.mem_limit, /LAVALINK_MEM_LIMIT/);
    assert.match(compose.services.bot.mem_limit, /BOT_MEM_LIMIT/);
    assert.match(String(compose.services.lavalink.environment._JAVA_OPTIONS), /-Xmx/);
    assert.match(dockerfile, /max-old-space-size/);
  });

  it("loads no plugin the bot does not use", () => {
    const dependencies = lavalinkYml.lavalink.plugins.map((plugin) => plugin.dependency).join(" ");
    // SponsorBlock was removed: nothing in src/ ever calls setSponsorBlock().
    assert.doesNotMatch(dependencies, /sponsorblock/i);
  });

  it("declares no named volumes at all", () => {
    // A named volume on /opt/Lavalink/plugins is created root-owned, which the
    // non-root Lavalink user cannot write to; it crashed the server at startup.
    // The only bind mount is the read-only config file.
    assert.equal(compose.volumes, undefined);
    const mounts = compose.services.lavalink.volumes;
    assert.deepEqual(mounts, ["./lavalink/application.yml:/opt/Lavalink/application.yml:ro"]);
  });
});
