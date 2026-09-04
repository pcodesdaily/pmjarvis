import { EmbedBuilder } from "discord.js";
import config from "../config.js";

const base = (color) => new EmbedBuilder().setColor(color);

export const info = (description, title) => {
  const embed = base(config.colors.primary).setDescription(description);
  return title ? embed.setTitle(title) : embed;
};

export const success = (description) => base(config.colors.success).setDescription(`✅ ${description}`);
export const warn = (description) => base(config.colors.warn).setDescription(`⚠️ ${description}`);
export const error = (description) => base(config.colors.error).setDescription(`❌ ${description}`);

export { base };
