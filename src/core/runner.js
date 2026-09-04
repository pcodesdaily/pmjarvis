import { MessageFlags } from "discord.js";
import { CommandError } from "./errors.js";
import { error as errorEmbed } from "./ui.js";
import { createLogger } from "./logger.js";

const log = createLogger("command");

/** Runs a command and turns any thrown error into a readable reply. */
export async function runCommand(command, ctx) {
  try {
    await command.execute(ctx);
  } catch (err) {
    const expected = err instanceof CommandError;
    if (!expected) log.error(`/${command.name} failed:`, err);

    const embed = errorEmbed(
      expected ? err.message : "Something went wrong running that command. It has been logged.",
    );

    await ctx
      .reply({ embeds: [embed], ephemeral: true })
      .catch(() => ctx.followUp({ embeds: [embed], ephemeral: true }).catch(() => {}));
  }
}

/** Same handling for component (button / select) interactions. */
export async function replyComponentError(interaction, err) {
  const expected = err instanceof CommandError;
  if (!expected) createLogger("component").error(err);

  const payload = {
    embeds: [errorEmbed(expected ? err.message : "Something went wrong.")],
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}
