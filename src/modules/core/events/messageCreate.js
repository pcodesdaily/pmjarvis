import { Events } from "discord.js";
import config from "../../../config.js";
import Ctx from "../../../core/context.js";
import { runCommand } from "../../../core/runner.js";

export default {
  name: Events.MessageCreate,
  emitter: "client",

  async execute(client, message) {
    if (!config.enableMessageCommands) return;
    if (message.author.bot || !message.inGuild()) return;

    // Mentioning the bot works as a prefix too, so it is usable even if someone
    // forgets what the server prefix is.
    const mention = new RegExp(`^<@!?${client.user.id}>\\s*`);
    const prefix = message.content.match(mention)?.[0] ?? config.prefix;
    if (!message.content.startsWith(prefix)) return;

    const [name, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    if (!name) {
      if (mention.test(message.content)) {
        await message.reply(`My prefix here is \`${config.prefix}\`. Try \`${config.prefix}help\`.`);
      }
      return;
    }

    const lookup = name.toLowerCase();
    const commandName = client.commands.has(lookup) ? lookup : client.aliases.get(lookup);
    const command = commandName ? client.commands.get(commandName) : null;
    if (!command) return;

    await runCommand(command, new Ctx({ client, command, message, args }));
  },
};
