import { Events, MessageFlags } from "discord.js";
import Ctx from "../../../core/context.js";
import { createLogger } from "../../../core/logger.js";
import { replyComponentError, runCommand } from "../../../core/runner.js";
import { handleMusicButton } from "../../music/lib/buttons.js";

const log = createLogger("interaction");

export default {
  name: Events.InteractionCreate,
  emitter: "client",

  async execute(client, interaction) {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction).catch((error) => log.debug("Autocomplete failed:", error));
      return;
    }

    if (interaction.isButton()) {
      if (!interaction.customId.startsWith("music:")) return;
      try {
        await handleMusicButton(interaction);
      } catch (error) {
        await replyComponentError(interaction, error);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({ content: "That command no longer exists.", flags: MessageFlags.Ephemeral });
    }
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Commands only work inside a server.", flags: MessageFlags.Ephemeral });
    }

    await runCommand(command, new Ctx({ client, command, interaction }));
  },
};
