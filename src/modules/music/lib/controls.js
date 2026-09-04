import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { isAutoplayEnabled } from "./autoplay.js";
import { displayVolume } from "./volume.js";

export const BUTTON_PREFIX = "music";

/**
 * Buttons are plain words rather than symbols.
 *
 * Discord only accepts a Unicode emoji or a custom emoji ID on a button; there
 * is no way to point one at an image or an SVG. Given that choice, a written
 * label beats a pictogram: "Skip" needs no interpreting, and it reads correctly
 * on mobile, on desktop and to a screen reader.
 *
 * Colour carries the meaning instead: blue for the main action, red for the one
 * that ends playback, green for a setting that is currently switched on.
 */
const button = (id, label, style, { disabled = false } = {}) =>
  new ButtonBuilder()
    .setCustomId(`${BUTTON_PREFIX}:${id}`)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

const LOOP_LABEL = { off: "Loop: Off", track: "Loop: Song", queue: "Loop: Queue" };

/** The button panel attached to the now-playing message. */
export function buildControlRows(player) {
  if (!player?.queue?.current) return [];

  const hasPrevious = player.queue.previous.length > 0;
  const hasNext = player.queue.tracks.length > 0 || isAutoplayEnabled(player);
  const looping = player.repeatMode !== "off";

  const row1 = new ActionRowBuilder().addComponents(
    button("previous", "Previous", ButtonStyle.Secondary, { disabled: !hasPrevious }),
    button("playpause", player.paused ? "Resume" : "Pause", ButtonStyle.Primary),
    button("skip", "Skip", ButtonStyle.Secondary, { disabled: !hasNext }),
    button("stop", "Stop", ButtonStyle.Danger),
  );

  // Discord allows five buttons per row. Queue lives on its own command, since
  // the panel already shows what is playing and what is next.
  const row2 = new ActionRowBuilder().addComponents(
    button("loop", LOOP_LABEL[player.repeatMode] ?? LOOP_LABEL.off, looping ? ButtonStyle.Success : ButtonStyle.Secondary),
    button("shuffle", "Shuffle", ButtonStyle.Secondary, { disabled: player.queue.tracks.length < 2 }),
    button(
      "autoplay",
      isAutoplayEnabled(player) ? "Autoplay: On" : "Autoplay: Off",
      isAutoplayEnabled(player) ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
    button("voldown", "Vol -", ButtonStyle.Secondary, { disabled: displayVolume(player) <= 0 }),
    button("volup", "Vol +", ButtonStyle.Secondary),
  );

  return [row1, row2];
}

/** Pagination row used by /queue. */
export function buildQueueRows(page, pages) {
  if (pages <= 1) return [];
  return [
    new ActionRowBuilder().addComponents(
      button("queuepage:1", "First", ButtonStyle.Secondary, { disabled: page <= 1 }),
      button(`queuepage:${page - 1}`, "Back", ButtonStyle.Secondary, { disabled: page <= 1 }),
      button("queuepage:noop", `Page ${page} of ${pages}`, ButtonStyle.Secondary, { disabled: true }),
      button(`queuepage:${page + 1}`, "Next", ButtonStyle.Secondary, { disabled: page >= pages }),
      button(`queuepage:${pages}`, "Last", ButtonStyle.Secondary, { disabled: page >= pages }),
    ),
  ];
}
