import { createLavalink } from "../../src/core/lavalink.js";

/**
 * The tests run the *real* lavalink-client Player, Queue and FilterManager.
 * Only the transport is faked: `node.request` answers with the JSON shapes a
 * real Lavalink v4 server returns, and the socket is reported as open. That way
 * queue maths, filter state, volume scaling and the player state machine are all
 * genuinely exercised rather than simulated.
 */

let trackCounter = 0;

export function makeRawTrack({
  title = `Track ${++trackCounter}`,
  author = "Test Artist",
  length = 210_000,
  identifier = `id-${trackCounter}`,
  uri = `https://www.youtube.com/watch?v=${identifier}`,
  sourceName = "youtube",
  isStream = false,
  isSeekable = true,
  isrc = null,
} = {}) {
  return {
    encoded: Buffer.from(`${identifier}:${title}`).toString("base64"),
    info: {
      identifier,
      isSeekable,
      author,
      length,
      isStream,
      position: 0,
      title,
      uri,
      artworkUrl: `https://img.example/${identifier}.jpg`,
      isrc,
      sourceName,
    },
    pluginInfo: {},
    userData: {},
  };
}

export const searchResponse = (tracks) => ({ loadType: "search", data: tracks });
export const trackResponse = (track) => ({ loadType: "track", data: track });
export const emptyResponse = () => ({ loadType: "empty", data: {} });
export const errorResponse = (message) => ({
  loadType: "error",
  data: { message, severity: "common", cause: "TestException" },
});
export const playlistResponse = (name, tracks, selectedTrack = -1) => ({
  loadType: "playlist",
  data: { info: { name, selectedTrack }, pluginInfo: {}, tracks },
});

const DEFAULT_SOURCE_MANAGERS = [
  "youtube",
  "soundcloud",
  "bandcamp",
  "twitch",
  "vimeo",
  "nico",
  "http",
  "spotify",
  "applemusic",
];

/**
 * Attaches a stubbed Lavalink node to a client and returns handles for the test
 * to steer search results and inspect the REST calls the bot made.
 */
export function attachLavalink(client, { sourceManagers = DEFAULT_SOURCE_MANAGERS } = {}) {
  const manager = createLavalink(client);
  const node = [...manager.nodeManager.nodes.values()][0];

  Object.defineProperty(node, "connected", { get: () => true, configurable: true });
  node.sessionId = "test-session";
  node.info = {
    version: { semver: "4.2.2", major: 4, minor: 2, patch: 2 },
    sourceManagers,
    filters: ["volume", "equalizer", "timescale", "karaoke", "rotation", "tremolo", "vibrato", "lowPass"],
    plugins: [
      { name: "youtube-plugin", version: "1.18.2" },
      { name: "lavasrc-plugin", version: "4.8.3" },
      { name: "lavalyrics-plugin", version: "1.1.0" },
    ],
  };
  node.stats = {
    players: 0,
    playingPlayers: 0,
    uptime: 60_000,
    memory: { used: 100 * 1024 * 1024, free: 0, allocated: 0, reservable: 0 },
    cpu: { cores: 2, systemLoad: 0.1, lavalinkLoad: 0.05 },
  };

  const calls = [];
  /** Queue of canned responses for the next searches, or a resolver function. */
  const searchQueue = [];
  let searchResolver = null;
  let lyricsResult = null;

  node.request = async (endpoint, modify) => {
    const options = { path: endpoint, method: "GET", headers: {} };
    if (typeof modify === "function") modify(options);
    calls.push({ endpoint, method: options.method, body: options.body });

    if (endpoint.startsWith("/loadtracks")) {
      const identifier = decodeURIComponent(new URLSearchParams(endpoint.split("?")[1]).get("identifier") ?? "");
      if (searchResolver) return searchResolver(identifier);
      return searchQueue.length ? searchQueue.shift() : emptyResponse();
    }

    if (options.method === "DELETE") return undefined;

    // PATCH /sessions/:id/players/:guildId — a real server echoes the player
    // back; the client only reads `voice` from it, which we deliberately omit.
    return { guildId: "stub", track: null, volume: 100, paused: false };
  };

  node.lyrics = {
    async getCurrent() {
      return lyricsResult;
    },
    async get() {
      return lyricsResult;
    },
  };

  return {
    manager,
    node,
    calls,
    /** Queue up the next search response(s). */
    queueSearch(...responses) {
      searchQueue.push(...responses);
    },
    /** Answer every search with a function of the raw identifier. */
    onSearch(resolver) {
      searchResolver = resolver;
    },
    clearSearch() {
      searchQueue.length = 0;
      searchResolver = null;
    },
    setLyrics(result) {
      lyricsResult = result;
    },
    /** REST calls that changed player state, for asserting side effects. */
    patches: () => calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body ?? "{}")),
    lastPatch() {
      const patches = calls.filter((call) => call.method === "PATCH");
      return patches.length ? JSON.parse(patches[patches.length - 1].body ?? "{}") : null;
    },
  };
}
