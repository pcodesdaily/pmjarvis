export function formatDuration(ms, { stream = false } = {}) {
  if (stream) return "LIVE";
  if (!Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Accepts "1:23", "83", "1h2m3s", "90s" and returns milliseconds. */
export function parseDuration(input) {
  if (!input) return null;
  const text = String(input).trim().toLowerCase();

  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number.parseFloat(text) * 1000);

  if (text.includes(":")) {
    const parts = text.split(":").map((part) => Number.parseFloat(part));
    if (parts.some((part) => !Number.isFinite(part))) return null;
    return parts.reduce((total, part) => total * 60 + part, 0) * 1000;
  }

  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!match || !match.slice(1).some(Boolean)) return null;
  const [, h = 0, m = 0, s = 0] = match;
  return (Number(h) * 3600 + Number(m) * 60 + Number.parseFloat(s || 0)) * 1000;
}

export function progressBar(position, length, size = 18) {
  if (!Number.isFinite(length) || length <= 0) return "🔴 ".concat("▬".repeat(size));
  const ratio = Math.min(Math.max(position / length, 0), 1);
  const index = Math.min(Math.round(ratio * size), size - 1);
  return `${"▬".repeat(index)}🔘${"▬".repeat(size - index - 1)}`;
}

const SOURCE_LABELS = {
  youtube: "YouTube",
  youtubemusic: "YouTube Music",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  applemusic: "Apple Music",
  deezer: "Deezer",
  bandcamp: "Bandcamp",
  twitch: "Twitch",
  vimeo: "Vimeo",
  yandexmusic: "Yandex Music",
  jiosaavn: "JioSaavn",
  tidal: "Tidal",
  http: "Direct stream",
  local: "Local file",
};

export const sourceLabel = (name) => SOURCE_LABELS[String(name ?? "").toLowerCase()] ?? name ?? "Unknown";

export function truncate(text, max = 60) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Escapes markdown so track titles can't break the embed layout. */
export const escapeMd = (text) => String(text ?? "").replace(/([*_`~\\|[\]()])/g, "\\$1");

export function trackLink(track, max = 55) {
  const title = escapeMd(truncate(track?.info?.title ?? "Unknown track", max));
  const uri = track?.info?.uri;
  return uri ? `[${title}](${uri})` : title;
}

export const totalDuration = (tracks) =>
  tracks.reduce((sum, track) => sum + (track?.info?.isStream ? 0 : (track?.info?.duration ?? track?.info?.length ?? 0)), 0);

export const trackLength = (track) => track?.info?.duration ?? track?.info?.length ?? 0;

export const requesterId = (requester) =>
  typeof requester === "string" ? requester : (requester?.id ?? null);

export const requesterMention = (requester) => {
  const id = requesterId(requester);
  return id ? `<@${id}>` : "Unknown";
};
