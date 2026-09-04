import config from "../../../config.js";
import { createLogger } from "../../../core/logger.js";

const log = createLogger("fallback");

/** Maps a Lavalink source name to the search prefix that would find it again. */
const SOURCE_PREFIX = {
  youtube: "ytsearch",
  youtubemusic: "ytmsearch",
  soundcloud: "scsearch",
  bandcamp: "bcsearch",
};

/**
 * When a track fails to play, look for the same song on another platform rather
 * than just skipping it.
 *
 * This is what keeps the bot usable without babysitting: YouTube periodically
 * refuses to serve a datacentre IP, and when it does the music simply continues
 * from SoundCloud instead of stopping dead.
 */
export async function findFallbackTrack(player, failedTrack) {
  const source = config.music.fallbackSearchPlatform;
  if (!source || !failedTrack?.info) return null;

  // Never fall back onto the platform that just refused us.
  const failedFrom = SOURCE_PREFIX[String(failedTrack.info.sourceName ?? "").toLowerCase()];
  if (failedFrom === source) return null;

  const { title, author } = failedTrack.info;
  const query = [author, title].filter(Boolean).join(" ").trim();
  if (!query) return null;

  const result = await player.search({ query, source }, failedTrack.requester).catch((error) => {
    log.debug(`Fallback search failed for "${query}":`, error?.message ?? error);
    return null;
  });

  const candidate = (result?.tracks ?? []).find((track) => !track.info.isStream);
  if (!candidate) {
    log.debug(`No fallback found for "${query}" on ${source}.`);
    return null;
  }

  candidate.userData = { ...(candidate.userData ?? {}), fallbackFor: failedTrack.info.identifier };
  return candidate;
}
