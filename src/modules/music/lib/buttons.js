import { MessageFlags } from "discord.js";
import config from "../../../config.js";
import { buildControlRows, buildQueueRows } from "./controls.js";
import { nowPlayingEmbed, QUEUE_PAGE_SIZE, queueEmbed } from "./embeds.js";
import { requireDJ } from "./guards.js";
import { displayVolume, setDisplayVolume } from "./volume.js";

const VOLUME_STEP = 10;

/** Buttons should feel instant, so most of them just re-render the panel. */
async function refreshPanel(interaction, player) {
  await interaction.update({
    embeds: [nowPlayingEmbed(player)],
    components: buildControlRows(player),
  });
}

const ephemeral = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

export async function handleMusicButton(interaction) {
  const [, action, argument] = interaction.customId.split(":");

  if (action === "queuepage") {
    const player = interaction.client.lavalink.getPlayer(interaction.guildId);
    if (!player) return ephemeral(interaction, "Nothing is playing right now.");
    if (argument === "noop") return interaction.deferUpdate();

    const pages = Math.max(Math.ceil(player.queue.tracks.length / QUEUE_PAGE_SIZE), 1);
    const page = Math.min(Math.max(Number.parseInt(argument, 10) || 1, 1), pages);
    return interaction.update({ embeds: [queueEmbed(player, page)], components: buildQueueRows(page, pages) });
  }

  const player = interaction.client.lavalink.getPlayer(interaction.guildId);
  if (!player?.queue?.current) return ephemeral(interaction, "Nothing is playing right now.");

  const voiceChannelId = interaction.member?.voice?.channelId;
  if (!voiceChannelId) return ephemeral(interaction, "Join a voice channel first.");
  if (voiceChannelId !== player.voiceChannelId) {
    return ephemeral(interaction, `You need to be in <#${player.voiceChannelId}> to use these controls.`);
  }

  // The button panel mirrors the same DJ rules as the slash commands.
  const ctxLike = {
    member: interaction.member,
    guild: interaction.guild,
    client: interaction.client,
  };
  const destructive = ["skip", "stop", "previous", "shuffle"].includes(action);
  if (destructive) requireDJ(ctxLike, player);

  switch (action) {
    case "playpause": {
      if (player.paused) await player.resume();
      else await player.pause();
      return refreshPanel(interaction, player);
    }

    case "skip": {
      if (!player.queue.tracks.length) {
        await interaction.deferUpdate();
        return player.stopPlaying(true, false);
      }
      await interaction.deferUpdate();
      return player.skip(0, false);
    }

    case "previous": {
      const previous = await player.queue.shiftPrevious();
      if (!previous) return ephemeral(interaction, "There is no previous track.");
      if (player.queue.current) await player.queue.add(player.queue.current, 0);
      await interaction.deferUpdate();
      return player.play({ clientTrack: previous });
    }

    case "stop": {
      // Same behaviour as /stop: clear everything and leave the channel.
      await interaction.deferUpdate();
      return player.destroy("Stopped from the panel", true);
    }

    case "loop": {
      const order = ["off", "track", "queue"];
      await player.setRepeatMode(order[(order.indexOf(player.repeatMode) + 1) % order.length]);
      return refreshPanel(interaction, player);
    }

    case "shuffle": {
      if (player.queue.tracks.length < 2) return ephemeral(interaction, "Not enough tracks to shuffle.");
      await player.queue.shuffle();
      return refreshPanel(interaction, player);
    }

    case "volup":
    case "voldown": {
      const current = displayVolume(player);
      const delta = action === "volup" ? VOLUME_STEP : -VOLUME_STEP;
      const next = Math.min(Math.max(current + delta, 0), config.music.maxVolume);
      if (next === current) return ephemeral(interaction, `Volume is already at **${current}%**.`);
      await setDisplayVolume(player, next);
      return refreshPanel(interaction, player);
    }

    case "queue": {
      const pages = Math.max(Math.ceil(player.queue.tracks.length / QUEUE_PAGE_SIZE), 1);
      return interaction.reply({
        embeds: [queueEmbed(player, 1)],
        components: buildQueueRows(1, pages),
        flags: MessageFlags.Ephemeral,
      });
    }

    default:
      return interaction.deferUpdate();
  }
}
