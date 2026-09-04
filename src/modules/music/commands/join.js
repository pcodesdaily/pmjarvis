import { SlashCommandBuilder } from "discord.js";
import { success } from "../lib/embeds.js";
import { ensurePlayer } from "../lib/player.js";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Bring the bot into your voice channel"),

  aliases: ["summon", "connect", "j"],
  category: "Music",

  async execute(ctx) {
    const player = await ensurePlayer(ctx);
    return ctx.reply({
      embeds: [
        success(
          `Joined <#${player.voiceChannelId}>. Now send me a song with \`${ctx.client.config.prefix}play <song name>\`.`,
        ),
      ],
    });
  },
};
