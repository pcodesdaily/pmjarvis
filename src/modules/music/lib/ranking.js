/**
 * Re-orders search results so the original recording wins.
 *
 * SoundCloud is full of fan re-uploads: slowed + reverb edits, nightcore, lofi
 * flips, hour-long loops and DJ mashups. They often rank above the real track
 * because their titles are stuffed with keywords. Left alone, asking for a song
 * gets you a remix most of the time.
 *
 * The rule is simple: a marker only counts against a result if the user did not
 * ask for it. Search "tum hi ho" and a slowed edit is demoted; search
 * "tum hi ho slowed reverb" and it is exactly what you wanted.
 */

/** Words that signal an edited or derivative upload rather than the original. */
const EDIT_MARKERS = [
  ["slowed", /\bslow(ed)?\b/i],
  ["reverb", /\breverb\b/i],
  ["nightcore", /\bnightcore\b/i],
  ["lofi", /\blo-?fi\b/i],
  ["8d", /\b8\s?d\b/i],
  ["bass boosted", /\bbass\s*boost(ed)?\b/i],
  ["sped up", /\bsped\s*up\b|\bspeed\s*up\b/i],
  ["remix", /\bremix\b/i],
  ["mashup", /\bmash-?up\b/i],
  ["cover", /\bcover\b/i],
  ["karaoke", /\bkaraoke\b/i],
  ["instrumental", /\binstrumental\b/i],
  ["loop", /\bloop(ed)?\b/i],
  ["mix", /\bmix(tape)?\b/i],
  ["ringtone", /\bringtone\b/i],
  ["acapella", /\bac[ae]pella\b/i],
  ["live", /\blive\b/i],
  ["mashup", /\bnon-?stop\b/i],
];

/** A normal song. Anything far outside this is a loop, a mix or a snippet. */
const IDEAL_MIN_MS = 60_000;
const IDEAL_MAX_MS = 600_000;
const HARD_MIN_MS = 45_000;
const HARD_MAX_MS = 900_000;

const words = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

export function scoreTrack(track, query) {
  const info = track?.info;
  if (!info) return -Infinity;

  const title = String(info.title ?? "");
  const asked = String(query ?? "").toLowerCase();
  let score = 0;

  // Penalise edit markers the user did not ask for.
  for (const [name, pattern] of EDIT_MARKERS) {
    if (pattern.test(title) && !asked.includes(name)) score -= 12;
  }

  // Length sanity. A 12 minute "loop" is not the song you asked for.
  const duration = info.duration ?? info.length ?? 0;
  if (info.isStream) score -= 20;
  else if (duration < HARD_MIN_MS || duration > HARD_MAX_MS) score -= 15;
  else if (duration < IDEAL_MIN_MS || duration > IDEAL_MAX_MS) score -= 6;

  // Reward covering what was actually typed.
  const queryWords = words(asked);
  const haystack = new Set([...words(title), ...words(info.author)]);
  const matched = queryWords.filter((word) => haystack.has(word)).length;
  if (queryWords.length) score += (matched / queryWords.length) * 10;

  // A title that is mostly the query, rather than the query plus a paragraph of
  // keywords, is more likely to be the real upload.
  const titleWordCount = words(title).length;
  if (titleWordCount > queryWords.length * 3 + 4) score -= 4;

  return score;
}

/**
 * Stable sort by score: equal scores keep the platform's own ordering, so this
 * only ever moves clearly worse results down.
 */
export function rankTracks(tracks, query) {
  return tracks
    .map((track, index) => ({ track, index, score: scoreTrack(track, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.track);
}
