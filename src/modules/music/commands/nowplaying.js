import { SlashCommandBuilder } from "discord.js";
import { buildControlRows } from "../lib/controls.js";
import { nowPlayingEmbed } from "../lib/embeds.js";
import { getPlayer } from "../lib/guards.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show what is playing right now, with playback controls"),

  aliases: ["np", "current", "song"],
  category: "Music",

  async execute(ctx) {
    const player = getPlayer(ctx, { playing: true });
    const message = await ctx.reply({
      embeds: [nowPlayingEmbed(player)],
      components: buildControlRows(player),
    });

    // The freshest panel becomes the live one that events keep updating.
    const id = ctx.isInteraction ? (await ctx.interaction.fetchReply()).id : message.id;
    ctx.client.nowPlayingMessages.set(ctx.guildId, { channelId: ctx.channel.id, messageId: id });
  },
};
