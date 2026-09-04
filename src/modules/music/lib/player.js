import { ChannelType } from "discord.js";
import config from "../../../config.js";
import { CommandError, fail, requireBotPermissions, requireMemberVoice } from "./guards.js";
import { setAutoplay } from "./autoplay.js";

/** Search sources exposed to users. All of these stream directly. */
export const SEARCH_SOURCES = [
  { name: "SoundCloud", value: "scsearch" },
  { name: "Bandcamp", value: "bcsearch" },
];

const SOURCE_ALIASES = new Map([
  ["sc", "scsearch"],
  ["soundcloud", "scsearch"],
  ["bc", "bcsearch"],
  ["bandcamp", "bcsearch"],
]);

export const normaliseSource = (source) => {
  if (!source) return undefined;
  const key = String(source).toLowerCase().replace(/\s+/g, "");
  return SOURCE_ALIASES.get(key) ?? (key.endsWith("search") ? key : undefined);
};

export const isUrl = (query) => /^https?:\/\/\S+$/i.test(String(query ?? "").trim());

/** Gets the guild's player, creating and connecting one if needed. */
export async function ensurePlayer(ctx, { connect = true } = {}) {
  const existing = ctx.client.lavalink.getPlayer(ctx.guildId);
  const voiceChannel = requireMemberVoice(ctx);

  if (existing) {
    if (existing.voiceChannelId && existing.voiceChannelId !== voiceChannel.id) {
      fail(`I'm already playing in <#${existing.voiceChannelId}>.`);
    }
    if (connect && !existing.connected) await existing.connect();
    return existing;
  }

  requireBotPermissions(ctx, voiceChannel);

  if (!ctx.client.lavalink.useable) {
    fail("The audio server is still starting up. Try again in a few seconds.");
  }

  const player = ctx.client.lavalink.createPlayer({
    guildId: ctx.guildId,
    voiceChannelId: voiceChannel.id,
    textChannelId: ctx.channel.id,
    selfDeaf: true,
    selfMute: false,
    volume: config.music.defaultVolume,
    vcRegion: voiceChannel.rtcRegion ?? undefined,
  });

  setAutoplay(player, config.music.autoplayEnabledByDefault);
  // Keep the user-facing volume separate from the scaled Lavalink value.
  player.setData("displayVolume", config.music.defaultVolume);
  if (connect) await player.connect();

  // Stage channels start the bot suppressed; request to speak so audio is heard.
  if (voiceChannel.type === ChannelType.GuildStageVoice) {
    await ctx.guild.members.me?.voice?.setSuppressed(false).catch(() => {});
  }

  return player;
}

/** Runs a search and turns "nothing found" into a friendly error. */
export async function searchTracks(player, { query, source, requester }) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) fail("Give me a song name or a link.");

  if (isUrl(trimmed)) {
    const platform = unsupportedLink(trimmed);
    if (platform) {
      fail(
        `${platform} links do not work here. Just search by song name instead, like \`${config.prefix}play blinding lights the weeknd\`, and I will find it.`,
      );
    }
  }

  const payload = isUrl(trimmed)
    ? { query: trimmed }
    : { query: trimmed, source: normaliseSource(source) ?? config.music.defaultSearchPlatform };

  let result;
  try {
    result = await player.search(payload, requester);
  } catch (error) {
    throw new CommandError(`Search failed: ${error?.message ?? "unknown error"}`);
  }

  if (!result || result.loadType === "error") {
    fail(`Couldn't load that: ${result?.exception?.message ?? "the source rejected the request"}.`);
  }
  if (result.loadType === "empty" || !result.tracks?.length) {
    fail(`No results for **${trimmed.slice(0, 100)}**.`);
  }
  return result;
}

/**
 * This build streams only from sources that allow it directly. A link to a
 * closed platform can never play, so say so clearly and point at what works
 * instead of returning a bare "no results".
 */
const UNSUPPORTED_HOSTS = [
  [/(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)$/i, "YouTube"],
  [/(^|\.)(open\.)?spotify\.com$/i, "Spotify"],
  [/(^|\.)music\.apple\.com$/i, "Apple Music"],
  [/(^|\.)deezer\.com$/i, "Deezer"],
  [/(^|\.)tidal\.com$/i, "Tidal"],
  [/(^|\.)music\.amazon\./i, "Amazon Music"],
];

function unsupportedLink(query) {
  let host;
  try {
    host = new URL(query).hostname;
  } catch {
    return null;
  }
  const match = UNSUPPORTED_HOSTS.find(([pattern]) => pattern.test(host));
  return match ? match[1] : null;
}

export function assertQueueSpace(player, incoming = 1) {
  if (player.queue.tracks.length + incoming > config.music.maxQueueSize) {
    fail(`The queue is full (max ${config.music.maxQueueSize} tracks).`);
  }
}
