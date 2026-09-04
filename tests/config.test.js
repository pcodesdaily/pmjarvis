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
    assert.equal(server.bufferDurationMs, 400);
    assert.equal(server.frameBufferDurationMs, 5000);
    assert.equal(server.useSeekGhosting, true);
  });

  it("prefers Opus-capable YouTube clients", () => {
    const clients = lavalinkYml.plugins.youtube.clients;
    const VALID = [
      "MUSIC",
      "WEB",
      "MWEB",
      "WEBEMBEDDED",
      "ANDROID",
      "ANDROID_MUSIC",
      "ANDROID_VR",
      "IOS",
      "TV",
      "TVHTML5_SIMPLY",
    ];
    for (const client of clients) assert.ok(VALID.includes(client), `unknown YouTube client "${client}"`);
    const opusCapable = ["WEB", "MWEB", "ANDROID_VR", "TV", "TVHTML5_SIMPLY"];
    assert.ok(clients.some((client) => opusCapable.includes(client)), "at least one Opus client is required");
  });

  it("carries exactly one plugin — the YouTube source", () => {
    const dependencies = lavalinkYml.lavalink.plugins.map((plugin) => plugin.dependency);
    assert.deepEqual(dependencies, ["dev.lavalink.youtube:youtube-plugin:1.18.2"]);
    assert.deepEqual(Object.keys(lavalinkYml.plugins), ["youtube"]);
  });

  it("offers only search sources the audio server can actually stream", async () => {
    const { SEARCH_SOURCES } = await import("../src/modules/music/lib/player.js");
    const enabled = lavalinkYml.lavalink.server.sources;
    // Every advertised source must map to something Lavalink has switched on.
    // youtube is served by the plugin rather than the built-in source manager.
    const backing = {
      ytmsearch: "youtube",
      ytsearch: "youtube",
      scsearch: "soundcloud",
      bcsearch: "bandcamp",
    };
    for (const { value } of SEARCH_SOURCES) {
      const source = backing[value];
      assert.ok(source, `no backing source recorded for ${value}`);
      if (source !== "youtube") {
        assert.equal(enabled[source], true, `${value} needs lavalink.server.sources.${source}`);
      }
    }
    assert.equal(lavalinkYml.plugins.youtube.enabled, true);
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

  it("waits for Lavalink to be healthy before starting the bot", () => {
    assert.equal(compose.services.bot.depends_on.lavalink.condition, "service_healthy");
    assert.ok(compose.services.lavalink.healthcheck.test.join(" ").includes("/version"));
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

  it("keeps only one Lavalink volume", () => {
    assert.deepEqual(Object.keys(compose.volumes), ["lavalink-plugins"]);
  });
});
