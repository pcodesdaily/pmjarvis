import { ChannelType, EmbedBuilder, Events, PermissionFlagsBits } from "discord.js";
import config from "../../../config.js";
import { createLogger } from "../../../core/logger.js";

const log = createLogger("guild");

/**
 * Picks somewhere the welcome message will actually be seen: the server's
 * system channel if the bot can post there, otherwise the first text channel it
 * has permission to write in.
 */
function findWelcomeChannel(guild) {
  const me = guild.members.me;
  const canPost = (channel) =>
    channel?.type === ChannelType.GuildText &&
    channel.permissionsFor(me)?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ]);

  if (canPost(guild.systemChannel)) return guild.systemChannel;
  return guild.channels.cache.filter(canPost).sort((a, b) => a.rawPosition - b.rawPosition).first() ?? null;
}

export default {
  name: Events.GuildCreate,
  emitter: "client",

  async execute(client, guild) {
    log.info(`Joined "${guild.name}" (${guild.id}). Now in ${client.guilds.cache.size} server(s).`);

    const channel = findWelcomeChannel(guild);
    if (!channel) {
      log.debug(`No channel in "${guild.name}" where I can post a welcome message.`);
      return;
    }

    const { brand, prefix } = config;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Thank you for inviting me!")
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .setDescription(
        [
          `**${brand.name} is a free music bot.**`,
          brand.description,
          "",
          "**Getting started**",
          "1. Join a voice channel",
          `2. Type \`${prefix}join\` so I join you`,
          `3. Type \`${prefix}play song name\` to start the music`,
          "",
          `That is all you need. When you are done, type \`${prefix}stop\` and I will leave the channel.`,
        ].join("\n"),
      )
      .addFields({
        name: "Useful commands",
        value: [
          `\`${prefix}play\` play a song, a link or a playlist`,
          `\`${prefix}skip\` play the next song`,
          `\`${prefix}queue\` see what is coming up`,
          `\`${prefix}help\` see every command`,
          `\`${prefix}info\` learn more about this bot`,
        ].join("\n"),
      })
      .setFooter({ text: `Slash commands work too, so /play does the same as ${prefix}play` });

    await channel.send({ embeds: [embed] }).catch((error) => {
      log.debug(`Could not send the welcome message in "${guild.name}":`, error?.message ?? error);
    });
  },
};
