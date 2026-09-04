import { createLogger } from "../../../core/logger.js";
import { buildControlRows } from "./controls.js";
import { nowPlayingEmbed } from "./embeds.js";

const log = createLogger("panel");

/** Guilds whose panel edit is currently in flight, to avoid stacking API calls. */
const pending = new Set();

async function fetchPanel(client, guildId) {
  const ref = client.nowPlayingMessages.get(guildId);
  if (!ref) return null;
  const channel = await client.channels.fetch(ref.channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.messages.fetch(ref.messageId).catch(() => null);
}

/**
 * Keeps one live "now playing" message per guild. A new track re-posts it at the
 * bottom of the channel; every other state change edits in place.
 */
export async function updatePanel(client, player, { repost = false } = {}) {
  if (!player?.textChannelId) return null;
  if (pending.has(player.guildId)) return null;
  pending.add(player.guildId);

  try {
    if (!player.queue.current) return await destroyPanel(client, player.guildId);

    const payload = { embeds: [nowPlayingEmbed(player)], components: buildControlRows(player) };
    const existing = await fetchPanel(client, player.guildId);

    if (existing && !repost) return await existing.edit(payload);
    if (existing) await existing.delete().catch(() => {});

    const channel = await client.channels.fetch(player.textChannelId).catch(() => null);
    if (!channel?.isTextBased()) return null;

    const sent = await channel.send(payload);
    client.nowPlayingMessages.set(player.guildId, { channelId: channel.id, messageId: sent.id });
    return sent;
  } catch (error) {
    log.debug(`Panel update failed for guild ${player.guildId}:`, error?.message ?? error);
    return null;
  } finally {
    pending.delete(player.guildId);
  }
}

/** Removes the buttons (or the whole message) when playback ends. */
export async function destroyPanel(client, guildId, { deleteMessage = true } = {}) {
  const message = await fetchPanel(client, guildId);
  client.nowPlayingMessages.delete(guildId);
  if (!message) return null;
  if (deleteMessage) return message.delete().catch(() => null);
  return message.edit({ components: [] }).catch(() => null);
}
