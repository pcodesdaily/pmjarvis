import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import config from "../../../config.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List every command, or explain one of them")
    .addStringOption((option) =>
      option.setName("command").setDescription("Command to explain").setAutocomplete(true),
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

    if (wanted) {
      const name = ctx.client.commands.has(wanted) ? wanted : ctx.client.aliases.get(wanted);
      const command = name ? ctx.client.commands.get(name) : null;
      if (!command) {
        return ctx.reply({ content: `There is no command called \`${wanted}\`.`, ephemeral: true });
      }

      const options = (command.json.options ?? [])
        .map(
          (option) =>
            `\`${option.required ? "<" : "["}${option.name}${option.required ? ">" : "]"}\`: ${option.description}`,
        )
        .join("\n");

      return ctx.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`${prefix}${command.name}`)
            .setDescription(command.json.description)
            .addFields(
              { name: "How to type it", value: `\`${prefix}${command.name}\` or \`/${command.name}\`` },
              ...(command.aliases.length
                ? [{ name: "Other names", value: command.aliases.map((alias) => `\`${alias}\``).join(", ") }]
                : []),
              ...(options ? [{ name: "Options", value: options }] : []),
            )
            .setFooter({ text: "Anything in <angle brackets> is required. [square brackets] are optional." }),
        ],
      });
    }

    const grouped = new Map();
    for (const command of ctx.client.commands.values()) {
      const category = command.category ?? "Other";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(command.name);
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`${config.brand.name} commands`)
      .setDescription(
        [
          `Every command works two ways. Type \`${prefix}play\` or use the slash command \`/play\`. Both do the same thing.`,
          "",
          "**New here?**",
          "1. Join a voice channel",
          `2. Type \`${prefix}join\``,
          `3. Type \`${prefix}play song name\``,
        ].join("\n"),
      )
      .setFooter({
        text: `Prefix: ${prefix}  ·  Type ${prefix}help <command> to learn about one command`,
      });

    for (const [category, names] of [...grouped].sort()) {
      embed.addFields({
        name: `${category} (${names.length})`,
        value: names
          .sort()
          .map((name) => `\`${name}\``)
          .join(" "),
      });
    }

    return ctx.reply({ embeds: [embed] });
  },
};
