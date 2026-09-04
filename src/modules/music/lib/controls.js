import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { displayVolume } from "./volume.js";

export const BUTTON_PREFIX = "music";

const button = (id, emoji, style, { disabled = false, label } = {}) => {
  const b = new ButtonBuilder()
    .setCustomId(`${BUTTON_PREFIX}:${id}`)
    .setStyle(style)
    .setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  if (label) b.setLabel(label);
  return b;
};

const REPEAT_EMOJI = { off: "➡️", track: "🔂", queue: "🔁" };

/** The button panel attached to the now-playing message. */
export function buildControlRows(player) {
  if (!player?.queue?.current) return [];
  const hasPrevious = player.queue.previous.length > 0;
  const hasNext = player.queue.tracks.length > 0;

  const row1 = new ActionRowBuilder().addComponents(
    button("previous", "⏮️", ButtonStyle.Secondary, { disabled: !hasPrevious }),
    button("playpause", player.paused ? "▶️" : "⏸️", ButtonStyle.Primary),
    button("skip", "⏭️", ButtonStyle.Secondary, { disabled: !hasNext }),
    button("stop", "⏹️", ButtonStyle.Danger),
    button("loop", REPEAT_EMOJI[player.repeatMode] ?? "➡️", ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    button("shuffle", "🔀", ButtonStyle.Secondary, { disabled: player.queue.tracks.length < 2 }),
    button("voldown", "🔉", ButtonStyle.Secondary, { disabled: displayVolume(player) <= 0 }),
    button("volup", "🔊", ButtonStyle.Secondary),
    button("queue", "📃", ButtonStyle.Secondary),
  );

  return [row1, row2];
}

/** Pagination row used by /queue. */
export function buildQueueRows(page, pages) {
  if (pages <= 1) return [];
  return [
    new ActionRowBuilder().addComponents(
      button(`queuepage:1`, "⏪", ButtonStyle.Secondary, { disabled: page <= 1 }),
      button(`queuepage:${page - 1}`, "◀️", ButtonStyle.Secondary, { disabled: page <= 1 }),
      button("queuepage:noop", null, ButtonStyle.Secondary, { disabled: true, label: `${page} / ${pages}` }),
      button(`queuepage:${page + 1}`, "▶️", ButtonStyle.Secondary, { disabled: page >= pages }),
      button(`queuepage:${pages}`, "⏩", ButtonStyle.Secondary, { disabled: page >= pages }),
    ),
  ];
}
