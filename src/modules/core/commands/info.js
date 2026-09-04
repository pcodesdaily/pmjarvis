import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import config from "../../../config.js";

/**
 * Written for someone who has never used a Discord bot before: short lines,
 * plain words, and a numbered list they can follow without asking anyone.
 */
export default {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("About this bot and who made it"),

  aliases: ["about", "botinfo"],
  category: "General",

  async execute(ctx) {
    const { brand, prefix } = config;
    const { developer } = brand;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setAuthor({
        name: brand.name,
        iconURL: ctx.client.user.displayAvatarURL(),
      })
      .setTitle(brand.tagline)
      .setDescription(brand.description)
      .setThumbnail(ctx.client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        {
          name: "How to use it",
          value: [
            "1. Join a voice channel",
            `2. Type \`${prefix}join\` so the bot joins you`,
            `3. Type \`${prefix}play song name\` to start the music`,
            "",
            `Every command also works as a slash command, so \`/play\` does the same thing as \`${prefix}play\`.`,
          ].join("\n"),
        },
        {
          name: "Where the music comes from",
          value: "YouTube, YouTube Music, SoundCloud, Bandcamp, Twitch, Vimeo and direct audio links.",
        },
        {
          name: "Developer",
          value: `**${developer.name}**\n${developer.role}`,
          inline: true,
        },
        {
          name: "Find me here",
          value: `[LinkedIn](${developer.linkedin})\n[Instagram](${developer.instagram})`,
          inline: true,
        },
      )
      .setFooter({ text: `Type ${prefix}help to see every command` });

    return ctx.reply({ embeds: [embed] });
  },
};
