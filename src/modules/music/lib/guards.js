import { ChannelType, PermissionFlagsBits } from "discord.js";
import config from "../../../config.js";
import { fail } from "../../../core/errors.js";
import { requesterId } from "./format.js";

export { CommandError, fail } from "../../../core/errors.js";

export function requireGuild(ctx) {
  if (!ctx.guild) fail("Music commands only work inside a server.");
  return ctx.guild;
}

export function requireMemberVoice(ctx) {
  requireGuild(ctx);
  const channel = ctx.member?.voice?.channel;
  if (!channel) fail("Join a voice channel first.");
  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
    fail("That channel type can't be used for music.");
  }
  return channel;
}

export function requireBotPermissions(ctx, channel) {
  const me = ctx.guild.members.me;
  const perms = channel.permissionsFor(me);
  const missing = [];
  if (!perms?.has(PermissionFlagsBits.ViewChannel)) missing.push("View Channel");
  if (!perms?.has(PermissionFlagsBits.Connect)) missing.push("Connect");
  if (!perms?.has(PermissionFlagsBits.Speak)) missing.push("Speak");
  if (missing.length) fail(`I need these permissions in ${channel}: **${missing.join(", ")}**.`);

  if (channel.userLimit > 0 && channel.members.size >= channel.userLimit && !perms.has(PermissionFlagsBits.MoveMembers)) {
    fail(`${channel} is full.`);
  }
  return channel;
}

export function getPlayer(ctx, { required = true, playing = false } = {}) {
  const player = ctx.client.lavalink.getPlayer(ctx.guildId);
  if (!player && required) fail("Nothing is playing right now.");
  if (player && playing && !player.queue.current) fail("Nothing is playing right now.");
  return player ?? null;
}

/** The user must be in the same voice channel as the bot. */
export function requireSameVoice(ctx, player) {
  const channel = requireMemberVoice(ctx);
  if (player?.voiceChannelId && player.voiceChannelId !== channel.id) {
    fail(`You need to be in <#${player.voiceChannelId}> to control the music.`);
  }
  return channel;
}

/** Count real humans listening, used for both DJ checks and auto-leave. */
export function listenerCount(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return 0;
  return channel.members.filter((member) => !member.user.bot).size;
}

/**
 * Destructive actions (skip / stop / clear / remove) are allowed when the server
 * runs in free-for-all mode, when the user is alone with the bot, when they
 * queued the current track, or when they hold the DJ role / Manage Server.
 */
export function requireDJ(ctx, player) {
  if (config.music.freeForAll) return true;
  const member = ctx.member;
  if (!member) fail("Couldn't verify your permissions.");
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (ctx.client.isOwner(member.id)) return true;

  const djRole = ctx.guild.roles.cache.find(
    (role) => role.name.toLowerCase() === config.music.djRoleName.toLowerCase(),
  );
  if (djRole && member.roles.cache.has(djRole.id)) return true;

  if (player) {
    if (listenerCount(ctx.guild, player.voiceChannelId) <= 1) return true;
    if (requesterId(player.queue.current?.requester) === member.id) return true;
  }

  fail(`You need the **${config.music.djRoleName}** role (or Manage Server) to do that.`);
  return false;
}
