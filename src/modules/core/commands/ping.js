import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import config from "../../../config.js";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check the bot and audio server latency"),
  aliases: ["latency"],
  category: "General",

  async execute(ctx) {
    const player = ctx.guildId ? ctx.client.lavalink.getPlayer(ctx.guildId) : null;
    const nodes = [...ctx.client.lavalink.nodeManager.nodes.values()];

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Pong")
      .addFields(
        { name: "Gateway", value: `${Math.round(ctx.client.ws.ping)} ms`, inline: true },
        {
          name: "Audio server",
          value: player ? `${player.ping.lavalink} ms` : nodes.some((n) => n.connected) ? "connected" : "offline",
          inline: true,
        },
        { name: "Uptime", value: `<t:${Math.floor((Date.now() - ctx.client.uptime) / 1000)}:R>`, inline: true },
      );

    return ctx.reply({ embeds: [embed] });
  },
};
