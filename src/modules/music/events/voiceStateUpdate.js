import { ChannelType, Events } from "discord.js";
import config from "../../../config.js";
import { createLogger } from "../../../core/logger.js";
import { info } from "../lib/embeds.js";
import { listenerCount } from "../lib/guards.js";
import { destroyPanel } from "../lib/panel.js";

const log = createLogger("voice");

async function leaveEmptyChannel(client, player) {
  const channel = await client.channels.fetch(player.textChannelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel
      .send({ embeds: [info("Everyone left the voice channel, so I stopped playing.")] })
      .catch(() => {});
  }
  await destroyPanel(client, player.guildId);
  await player.destroy("Voice channel empty", true);
}

export default {
  name: Events.VoiceStateUpdate,
  emitter: "client",

  async execute(client, oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    const player = client.lavalink.getPlayer(guild.id);
    if (!player) return;

    if (newState.id === client.user.id) {
      // Kicked from voice: tear the player down rather than leaving it stuck.
      if (oldState.channelId && !newState.channelId) {
        log.debug(`Disconnected from voice in ${guild.id}.`);
        await destroyPanel(client, guild.id);
        await player.destroy("Disconnected from the voice channel", false).catch(() => {});
        return;
      }
      // Moved into a stage channel: ask to speak again.
      if (newState.suppress && newState.channel?.type === ChannelType.GuildStageVoice) {
        await newState.setSuppressed(false).catch(() => {});
      }
    }

    if (!player.voiceChannelId) return;
    if (![oldState.channelId, newState.channelId].includes(player.voiceChannelId)) return;

    const timers = client.emptyChannelTimers;
    const listeners = listenerCount(guild, player.voiceChannelId);

    if (listeners > 0) {
      // Someone came back before the grace period ran out.
      const timer = timers.get(guild.id);
      if (timer) {
        clearTimeout(timer);
        timers.delete(guild.id);
      }
      if (player.getData("pausedBecauseEmpty")) {
        player.deleteData("pausedBecauseEmpty");
        if (player.paused) await player.resume().catch(() => {});
      }
      return;
    }

    if (config.music.leaveOnEmptyMs <= 0) return;
    if (timers.has(guild.id)) return;

    // Pause straight away so nothing is missed, then leave if nobody returns.
    if (player.playing && !player.paused) {
      player.setData("pausedBecauseEmpty", true);
      await player.pause().catch(() => {});
    }

    const timeout = setTimeout(() => {
      timers.delete(guild.id);
      const current = client.lavalink.getPlayer(guild.id);
      if (!current || listenerCount(guild, current.voiceChannelId) > 0) return;
      leaveEmptyChannel(client, current).catch((error) => log.debug(error));
    }, config.music.leaveOnEmptyMs);
    timeout.unref?.();
    timers.set(guild.id, timeout);
  },
};
