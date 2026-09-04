import config from "../../../config.js";
import { base, error, info, success, warn } from "../../../core/ui.js";
import {
  escapeMd,
  formatDuration,
  progressBar,
  requesterMention,
  sourceLabel,
  totalDuration,
  trackLength,
  trackLink,
  truncate,
} from "./format.js";
import { displayVolume } from "./volume.js";

// Re-exported so music code has a single place to import UI helpers from.
export { error, info, success, warn };

const REPEAT_LABEL = { off: "Off", track: "🔂 Track", queue: "🔁 Queue" };

export function nowPlayingEmbed(player, { compact = false } = {}) {
  const track = player.queue.current;
  if (!track) return info("Nothing is playing right now.");

  const length = trackLength(track);
  const position = Math.min(player.position, length || player.position);
  const bar = track.info.isStream
    ? "🔴 **Live stream**"
    : `${progressBar(position, length)}\n\`${formatDuration(position)} / ${formatDuration(length)}\``;

  const embed = base(config.colors.primary)
    .setAuthor({ name: player.paused ? "Paused" : "Now playing" })
    .setTitle(truncate(track.info.title, 90))
    .setURL(track.info.uri ?? null)
    .setDescription(`by **${escapeMd(truncate(track.info.author ?? "Unknown", 60))}**\n\n${bar}`)
    .setThumbnail(track.info.artworkUrl ?? null);

  if (!compact) {
    const upNext = player.queue.tracks[0];
    embed.addFields(
      { name: "Requested by", value: requesterMention(track.requester), inline: true },
      { name: "Volume", value: `${displayVolume(player)}%`, inline: true },
      { name: "Loop", value: REPEAT_LABEL[player.repeatMode] ?? "Off", inline: true },
      { name: "Source", value: sourceLabel(track.info.sourceName), inline: true },
      { name: "In queue", value: `${player.queue.tracks.length} track(s)`, inline: true },
    );
    if (upNext) embed.addFields({ name: "Up next", value: trackLink(upNext) });
  }

  return embed;
}

export function addedTrackEmbed(track, { position, player }) {
  const embed = base(config.colors.success)
    .setAuthor({ name: "Added to queue" })
    .setTitle(truncate(track.info.title, 90))
    .setURL(track.info.uri ?? null)
    .setThumbnail(track.info.artworkUrl ?? null)
    .addFields(
      { name: "Duration", value: formatDuration(trackLength(track), { stream: track.info.isStream }), inline: true },
      { name: "Position", value: position === 0 ? "Playing now" : `#${position}`, inline: true },
      { name: "Source", value: sourceLabel(track.info.sourceName), inline: true },
    );

  if (position > 0 && player) {
    const ahead = player.queue.tracks.slice(0, Math.max(position - 1, 0));
    const eta = Math.max(trackLength(player.queue.current) - player.position, 0) + totalDuration(ahead);
    embed.addFields({ name: "Plays in", value: `~${formatDuration(eta)}`, inline: true });
  }
  return embed;
}

export function addedPlaylistEmbed(playlist, tracks, source) {
  return base(config.colors.success)
    .setAuthor({ name: "Playlist added to queue" })
    .setTitle(truncate(playlist?.name ?? "Playlist", 90))
    .setURL(playlist?.uri ?? null)
    .setThumbnail(playlist?.thumbnail ?? tracks[0]?.info?.artworkUrl ?? null)
    .addFields(
      { name: "Tracks", value: `${tracks.length}`, inline: true },
      { name: "Duration", value: formatDuration(totalDuration(tracks)), inline: true },
      { name: "Source", value: sourceLabel(source ?? tracks[0]?.info?.sourceName), inline: true },
    );
}

export const QUEUE_PAGE_SIZE = 10;

export function queueEmbed(player, page = 1) {
  const tracks = player.queue.tracks;
  const pages = Math.max(Math.ceil(tracks.length / QUEUE_PAGE_SIZE), 1);
  const current = Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * QUEUE_PAGE_SIZE;
  const slice = tracks.slice(start, start + QUEUE_PAGE_SIZE);

  const lines = slice.length
    ? slice.map((track, index) => {
        const number = String(start + index + 1).padStart(2, " ");
        return `\`${number}.\` ${trackLink(track)} \`${formatDuration(trackLength(track), { stream: track.info.isStream })}\` · ${requesterMention(track.requester)}`;
      })
    : [`*Nothing queued yet. Add a song with \`${config.prefix}play\`.*`];

  const nowPlaying = player.queue.current
    ? `${trackLink(player.queue.current)} \`${formatDuration(player.position)} / ${formatDuration(trackLength(player.queue.current), { stream: player.queue.current.info.isStream })}\``
    : "*Nothing*";

  return base(config.colors.primary)
    .setTitle("Queue")
    .setDescription(`**Now playing**\n${nowPlaying}\n\n**Up next**\n${lines.join("\n")}`)
    .setFooter({
      text: [
        `Page ${current}/${pages}`,
        `${tracks.length} track(s)`,
        `${formatDuration(totalDuration(tracks))} remaining`,
        `Loop: ${REPEAT_LABEL[player.repeatMode] ?? "Off"}`,
      ].join(" • "),
    });
}

export default { info, success, warn, error, nowPlayingEmbed, queueEmbed };
