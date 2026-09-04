// .env is loaded by Node itself via --env-file-if-exists (see the npm
// scripts and the Dockerfile), so this file needs no dependency at all.

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on", "y"].includes(String(value).trim().toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  // Leave empty to register commands globally (takes up to an hour the first time).
  devGuildId: process.env.DEV_GUILD_ID || "",
  autoDeployCommands: bool(process.env.AUTO_DEPLOY_COMMANDS, true),

  prefix: process.env.PREFIX || "pm!",
  enableMessageCommands: bool(process.env.ENABLE_MESSAGE_COMMANDS, true),
  owners: list(process.env.OWNER_IDS),

  logLevel: process.env.LOG_LEVEL || "info",
  activity: process.env.ACTIVITY || "music in {guilds} servers",

  // Branding shown by /info and by the welcome message. Static on purpose:
  // these are not things a server owner should need to configure.
  brand: {
    name: "PMJARVIS",
    tagline: "A free music bot for your Discord server.",
    description:
      "Play any song in your voice channel. Search by name or paste a link. " +
      "There is no premium version, no time limit and no paywall. Everything is free, always.",
    developer: {
      name: "Piyush Manna",
      role: "AI Engineer",
      linkedin: "https://www.linkedin.com/in/pcodesdaily/",
      instagram: "https://www.instagram.com/piyushiitm/",
    },
  },

  colors: {
    primary: Number.parseInt((process.env.COLOR_PRIMARY || "5865F2").replace("#", ""), 16),
    success: 0x57f287,
    warn: 0xfee75c,
    error: 0xed4245,
  },

  music: {
    defaultVolume: Math.min(int(process.env.DEFAULT_VOLUME, 100), 200),
    maxVolume: Math.min(int(process.env.MAX_VOLUME, 150), 500),
    // Lavalink output is scaled down by this amount so that boosted EQ presets
    // do not clip. Display volume stays 1:1 for the user.
    volumeDecrementer: Number.parseFloat(process.env.VOLUME_DECREMENTER || "0.85"),
    defaultSearchPlatform: process.env.DEFAULT_SEARCH_PLATFORM || "ytmsearch",
    // Milliseconds of silence before the bot leaves an empty queue. 0 = never leave.
    leaveOnEndMs: int(process.env.LEAVE_ON_END_MS, 120_000),
    // Milliseconds before leaving a voice channel with no human listeners. 0 = never leave.
    leaveOnEmptyMs: int(process.env.LEAVE_ON_EMPTY_MS, 60_000),
    maxQueueSize: int(process.env.MAX_QUEUE_SIZE, 5000),
    maxPlaylistSize: int(process.env.MAX_PLAYLIST_SIZE, 1000),
    djRoleName: process.env.DJ_ROLE_NAME || "DJ",
    // When true, anyone can use destructive controls; when false a DJ role /
    // Manage Server permission is required once more than one listener is present.
    freeForAll: bool(process.env.DJ_FREE_FOR_ALL, true),
  },

  lavalink: {
    nodes: [
      {
        id: process.env.LAVALINK_ID || "main",
        host: process.env.LAVALINK_HOST || "lavalink",
        port: int(process.env.LAVALINK_PORT, 2333),
        authorization: process.env.LAVALINK_PASSWORD || "youshallnotpass",
        secure: bool(process.env.LAVALINK_SECURE, false),
        retryAmount: 20,
        retryDelay: 10_000,
      },
    ],
  },
};

export function assertConfig() {
  const missing = [];
  if (!config.token) missing.push("DISCORD_TOKEN");
  if (!config.clientId) missing.push("CLIENT_ID");
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`,
    );
  }
}

export default config;
