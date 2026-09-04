import { ActionRowBuilder, ComponentType, StringSelectMenuBuilder } from "discord.js";
import { info, warn } from "./embeds.js";
import { formatDuration, sourceLabel, trackLength, truncate } from "./format.js";

export const PICKER_ID = "music:trackpick";

/**
 * Shows the search results and waits for the person who asked to choose.
 *
 * SoundCloud is full of fan re-uploads, and no ranking gets the right one every
 * single time. Letting someone glance at the options and pick beats guessing on
 * their behalf and being wrong.
 *
 * Returns the chosen tracks, or null if they ran out of time.
 */
export async function promptTrackChoice(ctx, tracks, { max = 5, title = "Choose a song" } = {}) {
  const options = tracks.slice(0, 25);

  // A menu that allows more than one choice makes Discord wait for you to click
  // away before it submits. With a single choice it fires the moment you tap the
  // song, which is what people expect, so /play uses max: 1.
  const limit = Math.max(1, Math.min(max, options.length));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PICKER_ID)
    .setPlaceholder(limit === 1 ? "Tap a song to play it" : `Pick up to ${limit}, then click away`)
    .setMinValues(1)
    .setMaxValues(limit)
    .addOptions(
      options.map((track, index) => ({
        label: truncate(track.info.title, 100),
        description: truncate(
          `${track.info.author ?? "Unknown"} · ${formatDuration(trackLength(track), { stream: track.info.isStream })} · ${sourceLabel(track.info.sourceName)}`,
          100,
        ),
        value: String(index),
      })),
    );

  const sent = await ctx.reply({
    embeds: [
      info(
        limit === 1
          ? `Found **${options.length}** results. Tap the one you want.`
          : `Found **${options.length}** results. Pick up to ${limit}, then click away to confirm.`,
        title,
      ),
    ],
    components: [new ActionRowBuilder().addComponents(menu)],
  });

  const message = ctx.isInteraction ? await ctx.interaction.fetchReply() : sent;

  let selection;
  try {
    selection = await message.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 60_000,
      filter: (interaction) => interaction.user.id === ctx.user.id,
    });
  } catch {
    await ctx.edit({ embeds: [warn("You did not pick anything, so I stopped waiting.")], components: [] });
    return null;
  }

  const chosen = selection.values.map((value) => options[Number(value)]).filter(Boolean);
  return { chosen, selection };
}
