import config from "../../../config.js";
import { createLogger } from "../../../core/logger.js";
import { rankTracks } from "./ranking.js";

const log = createLogger("autoplay");

const HISTORY_LIMIT = 200;

export const isAutoplayEnabled = (player) => Boolean(player?.getData("autoplay"));

export function setAutoplay(player, enabled) {
  player.setData("autoplay", Boolean(enabled));
  return Boolean(enabled);
}

function rememberPlayed(player, track) {
  const history = player.getData("autoplayHistory") ?? [];
  const next = [track.info.identifier, ...history.filter((id) => id !== track.info.identifier)];
  player.setData("autoplayHistory", next.slice(0, HISTORY_LIMIT));
}

/**
 * Ways to find "something like this", best signal first.
 *
 * SoundCloud exposes related tracks on a `/recommended` URL, which is the
 * closest thing to a radio station. When that is unavailable the artist's other
 * work is the next best guess, and a title search is the last resort.
 */
function buildAttempts(track) {
  const { uri, author, title } = track.info;
  const source = config.music.defaultSearchPlatform;
  const attempts = [];

  if (uri && /soundcloud\.com/i.test(uri)) attempts.push({ query: `${uri}/recommended` });
  if (author) attempts.push({ query: author, source });
  if (title) {
    // Drop bracketed noise like "(Official Video)" so the search is about the song.
    const cleaned = title.replace(/[([].*?[)\]]/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned && cleaned !== title) attempts.push({ query: cleaned, source });
    attempts.push({ query: title, source });
  }
  return attempts;
}

/**
 * Runs when the queue empties. Adding a track keeps the music going; adding
 * nothing lets the normal "queue finished" flow happen.
 */
export async function autoPlayFunction(player, lastPlayedTrack) {
  if (!isAutoplayEnabled(player)) return;
  const seed = lastPlayedTrack ?? player.queue.previous[0];
  if (!seed?.info) return;

  const history = new Set(player.getData("autoplayHistory") ?? []);
  const known = new Set(
    [player.queue.current, ...player.queue.tracks, ...player.queue.previous.slice(0, 25)]
      .filter(Boolean)
      .map((track) => track.info.identifier),
  );

  const isFresh = (track) =>
    track?.info &&
    !track.info.isStream &&
    track.info.identifier !== seed.info.identifier &&
    !history.has(track.info.identifier) &&
    !known.has(track.info.identifier);

  for (const attempt of buildAttempts(seed)) {
    const result = await player.search(attempt, seed.requester).catch((error) => {
      log.debug(`Autoplay lookup failed for ${JSON.stringify(attempt)}:`, error?.message ?? error);
      return null;
    });

    const fresh = (result?.tracks ?? []).filter(isFresh);
    if (!fresh.length) continue;

    // Rank first, so autoplay does not fill the queue with slowed and reverb
    // edits, then pick from the strongest handful so a long session varies.
    const candidates = rankTracks(fresh, attempt.query);
    const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 8))];
    pick.userData = { ...(pick.userData ?? {}), autoplay: true };
    rememberPlayed(player, pick);
    await player.queue.add(pick);
    log.debug(`Autoplay queued "${pick.info.title}" in guild ${player.guildId}.`);
    return;
  }

  log.debug(`Autoplay found nothing similar to "${seed.info.title}".`);
}

export default autoPlayFunction;
