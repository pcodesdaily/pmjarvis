import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import config from "../../../config.js";

/**
 * How the command list is laid out. Grouping by what someone is trying to do
 * reads far better than one alphabetical wall, and the order is the order a new
 * user meets them in.
 *
 * Anything loaded but not listed here still appears, under "More", so a new
 * command is never silently missing from the help page.
 */
const GROUPS = [
  ["Play music", ["join", "play", "search", "nowplaying"]],
  ["Controls", ["pause", "resume", "skip", "previous", "seek", "stop"]],
  ["The queue", ["queue", "shuffle", "loop", "autoplay", "remove", "clear"]],
  ["Everything else", ["volume", "help", "info", "ping"]],
];

/** Turns a command's options into `<required>` and `[optional]` hints. */
function usageFor(command) {
  const parts = (command.json.options ?? [])
    .filter((option) => option.required)
    .map((option) => `<${option.name}>`);
  return `${config.prefix}${command.name}${parts.length ? ` ${parts.join(" ")}` : ""}`;
}

const line = (command) => `\`${usageFor(command)}\`\n${command.json.description}`;

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show every command and how to use it")
    .addStringOption((option) =>
      option.setName("command").setDescription("Explain just one command").setAutocomplete(true),
    ),

  aliases: ["commands", "h"],
  greedy: "command",
  category: "General",

  async autocomplete(interaction) {
    const focused = (interaction.options.getFocused() ?? "").toLowerCase();
    const names = [...interaction.client.commands.keys()]
      .filter((name) => name.includes(focused))
      .slice(0, 25);
    return interaction.respond(names.map((name) => ({ name, value: name })));
  },

  async execute(ctx) {
    const { prefix } = config;
    const wanted = (ctx.string("command") ?? "").toLowerCase().replace(/^\//, "");

    /* ---------------- one command in detail ---------------- */
    if (wanted) {
      const name = ctx.client.commands.has(wanted) ? wanted : ctx.client.aliases.get(wanted);
      const command = name ? ctx.client.commands.get(name) : null;
      if (!command) {
        return ctx.reply({
          content: `There is no command called \`${wanted}\`. Type \`${prefix}help\` to see them all.`,
          ephemeral: true,
        });
      }

      const options = (command.json.options ?? [])
        .map((option) => `\`${option.required ? "<" : "["}${option.name}${option.required ? ">" : "]"}\` ${option.description}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`${prefix}${command.name}`)
        .setDescription(command.json.description)
        .addFields({ name: "How to type it", value: `\`${usageFor(command)}\`\nor \`/${command.name}\`` });

      if (options) embed.addFields({ name: "Options", value: options });
      if (command.aliases.length) {
        embed.addFields({
          name: "Short forms",
          value: command.aliases.map((alias) => `\`${prefix}${alias}\``).join(", "),
        });
      }
      embed.setFooter({ text: "<angle brackets> are required, [square brackets] are optional" });

      return ctx.reply({ embeds: [embed] });
    }

    /* ---------------- the full list ---------------- */
    const remaining = new Map(ctx.client.commands);
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`${config.brand.name} commands`)
      .setDescription(
        [
          "**How to play a song**",
          "1. Join a voice channel",
          `2. Type \`${prefix}join\` so the bot joins you`,
          `3. Type \`${prefix}play\` and the song name, for example:`,
          `\`\`\`${prefix}play tum hi ho arijit singh\`\`\``,
          "The bot starts playing. Ask for another song at any time and it goes",
          "into the queue behind the current one.",
          "",
          `Every command also works as a slash command, so \`/play\` is the same as \`${prefix}play\`.`,
        ].join("\n"),
      );

    for (const [title, names] of GROUPS) {
      const commands = names.map((name) => remaining.get(name)).filter(Boolean);
      for (const command of commands) remaining.delete(command.name);
      if (commands.length) embed.addFields({ name: title, value: commands.map(line).join("\n\n") });
    }

    // Anything new that has not been placed in a group yet.
    if (remaining.size) {
      embed.addFields({ name: "More", value: [...remaining.values()].map(line).join("\n\n") });
    }

    embed.setFooter({ text: `Type ${prefix}help <command> to learn about one command` });
    return ctx.reply({ embeds: [embed] });
  },
};
