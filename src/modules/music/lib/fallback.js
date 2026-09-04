import config from "../../../config.js";
import { createLogger } from "../../../core/logger.js";
import { rankTracks } from "./ranking.js";

const log = createLogger("fallback");

/** How many replacements to try for one request before giving up. */
const MAX_ATTEMPTS = 3;

/**
 * When a track refuses to play, find another upload of the same song.
 *
 * SoundCloud serves some tracks only as HLS, which Lavaplayer cannot probe
 * ("Unknown file format"). Those uploads are simply broken for us, while other
 * uploads of the same song play fine. So the answer is not to skip, it is to
 * try the next best result for what the user actually asked for.
 *
 * Everything already attempted is remembered on the player, so a song whose
 * every upload is broken fails quickly instead of looping.
 */
export async function findFallbackTrack(player, failedTrack) {
  if (!config.music.fallbackSearchPlatform || !failedTrack?.info) return null;

  const tried = new Set(player.getData("failedTrackIds") ?? []);
  tried.add(failedTrack.info.identifier);
  player.setData("failedTrackIds", [...tried].slice(-50));

  if (tried.size > MAX_ATTEMPTS) {
    log.debug(`Giving up after ${tried.size} failed attempts in guild ${player.guildId}.`);
    return null;
  }

  const { title, author } = failedTrack.info;
  const query = [author, title].filter(Boolean).join(" ").trim();
  if (!query) return null;

  const result = await player
    .search({ query, source: config.music.fallbackSearchPlatform }, failedTrack.requester)
    .catch((error) => {
      log.debug(`Fallback search failed for "${query}":`, error?.message ?? error);
      return null;
    });

  const candidates = rankTracks(
    (result?.tracks ?? []).filter(
      (track) => track?.info && !track.info.isStream && !tried.has(track.info.identifier),
    ),
    query,
  );

  const replacement = candidates[0];
  if (!replacement) {
    log.debug(`No other upload of "${query}" to try.`);
    return null;
  }

  replacement.userData = { ...(replacement.userData ?? {}), fallbackFor: failedTrack.info.identifier };
  return replacement;
}

/** Called once a track plays successfully, so the next failure starts fresh. */
export function clearFallbackHistory(player) {
  player.deleteData("failedTrackIds");
}
