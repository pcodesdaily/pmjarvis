import { ChannelType, Collection, PermissionsBitField } from "discord.js";
import BotClient from "../../src/core/client.js";

/**
 * Minimal but faithful stand-ins for the discord.js objects the bot touches.
 * Everything the commands actually call is implemented; anything they do not
 * call is deliberately absent so a test fails loudly if usage drifts.
 */

let idCounter = 1000n;
export const nextId = () => String(++idCounter);

export function makeUser({ id = nextId(), username = "tester", bot = false } = {}) {
  const user = {
    id,
    username,
    displayName: username,
    globalName: username,
    tag: `${username}#0001`,
    bot,
    dmChannel: { sent: [] },
    /** Set to true to simulate a user with DMs closed. */
    dmsBlocked: false,
    async send(payload) {
      if (user.dmsBlocked) throw new Error("Cannot send messages to this user");
      user.dmChannel.sent.push(payload);
      return { id: nextId(), ...payload };
    },
  };
  return user;
}

export function makeTextChannel({
  id = nextId(),
  guild,
  rawPosition = 0,
  permissions = ["ViewChannel", "SendMessages", "EmbedLinks"],
} = {}) {
  const channel = {
    id,
    type: ChannelType.GuildText,
    guild,
    rawPosition,
    sent: [],
    typingCount: 0,
    isTextBased: () => true,
    isVoiceBased: () => false,
    permissionsFor: () => new PermissionsBitField(permissions.map((name) => PermissionsBitField.Flags[name])),
    async send(payload) {
      const message = makeSentMessage(payload, channel);
      channel.sent.push(message);
      return message;
    },
    async sendTyping() {
      channel.typingCount += 1;
    },
    messages: {
      cache: new Collection(),
      async fetch(messageId) {
        const found = channel.sent.find((message) => message.id === messageId);
        if (!found) throw new Error("Unknown Message");
        return found;
      },
    },
  };
  return channel;
}

function makeSentMessage(payload, channel) {
  const message = {
    id: nextId(),
    channel,
    channelId: channel.id,
    deleted: false,
    edits: [],
    ...payload,
    async edit(next) {
      message.edits.push(next);
      Object.assign(message, next);
      return message;
    },
    async delete() {
      message.deleted = true;
      channel.sent = channel.sent.filter((entry) => entry.id !== message.id);
      return message;
    },
    async awaitMessageComponent() {
      throw new Error("awaitMessageComponent was not stubbed for this test");
    },
  };
  return message;
}

export function makeVoiceChannel({
  id = nextId(),
  guild,
  type = ChannelType.GuildVoice,
  userLimit = 0,
  permissions = ["ViewChannel", "Connect", "Speak"],
} = {}) {
  const channel = {
    id,
    type,
    guild,
    userLimit,
    rtcRegion: null,
    members: new Collection(),
    isTextBased: () => false,
    isVoiceBased: () => true,
    permissionsFor: () => new PermissionsBitField(permissions.map((name) => PermissionsBitField.Flags[name])),
  };
  return channel;
}

export function makeGuild({ id = nextId(), name = "Test Guild" } = {}) {
  const guild = {
    id,
    name,
    channels: { cache: new Collection() },
    roles: { cache: new Collection() },
    members: { cache: new Collection(), me: null },
    shard: { send: () => {} },
  };
  return guild;
}

export function makeMember({
  guild,
  user = makeUser(),
  voiceChannel = null,
  permissions = [],
  roles = [],
  bot = false,
} = {}) {
  const member = {
    id: user.id,
    user: { ...user, bot },
    displayName: user.username,
    guild,
    permissions: new PermissionsBitField(permissions.map((name) => PermissionsBitField.Flags[name])),
    roles: { cache: new Collection(roles.map((role) => [role.id, role])) },
    voice: {
      channel: voiceChannel,
      channelId: voiceChannel?.id ?? null,
      suppress: false,
      async setSuppressed(value) {
        member.voice.suppress = value;
      },
    },
  };
  guild.members.cache.set(member.id, member);
  if (voiceChannel) voiceChannel.members.set(member.id, member);
  return member;
}

/**
 * Builds a whole test world: a client, a guild with a text and voice channel,
 * the bot's own member, and one human member sitting in the voice channel.
 */
export function makeWorld({ botInVoice = true, userInVoice = true, permissions } = {}) {
  const client = new BotClient();
  const guild = makeGuild();

  const botUser = makeUser({ username: "PMJARVIS", bot: true });
  client.user = {
    id: botUser.id,
    username: botUser.username,
    tag: botUser.tag,
    displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
  };

  const voiceChannel = makeVoiceChannel({ guild, ...(permissions ? { permissions } : {}) });
  const textChannel = makeTextChannel({ guild });
  guild.systemChannel = textChannel;
  guild.channels.cache.set(voiceChannel.id, voiceChannel);
  guild.channels.cache.set(textChannel.id, textChannel);

  const botMember = makeMember({
    guild,
    user: botUser,
    bot: true,
    voiceChannel: botInVoice ? voiceChannel : null,
  });
  guild.members.me = botMember;

  const user = makeUser({ username: "listener" });
  const member = makeMember({ guild, user, voiceChannel: userInVoice ? voiceChannel : null });

  client.guilds.cache.set(guild.id, guild);
  // Channel lookups must resolve locally instead of hitting the REST API.
  client.channels.fetch = async (channelId) => guild.channels.cache.get(channelId) ?? null;

  return { client, guild, voiceChannel, textChannel, user, member, botMember, botUser };
}

/** Adds another human to the voice channel (used for the DJ-permission tests). */
export function addListener(world, options = {}) {
  const user = makeUser({ username: options.username ?? "bystander" });
  return makeMember({ guild: world.guild, user, voiceChannel: world.voiceChannel, ...options });
}

/* -------------------------------------------------------------------------- */
/* Interactions and messages                                                   */
/* -------------------------------------------------------------------------- */

export function makeInteraction(world, { options = {}, subcommand = null, focused = null } = {}) {
  const get = (name) => (name in options ? options[name] : null);

  const interaction = {
    client: world.client,
    user: world.user,
    member: world.member,
    guild: world.guild,
    guildId: world.guild.id,
    channel: world.textChannel,
    channelId: world.textChannel.id,
    commandName: null,
    deferred: false,
    replied: false,
    /** Everything the command sent, in order. */
    responses: [],
    inGuild: () => true,
    isChatInputCommand: () => true,
    isButton: () => false,
    isAutocomplete: () => false,
    options: {
      getString: (name) => (get(name) === null ? null : String(get(name))),
      getInteger: (name) => (get(name) === null ? null : Number.parseInt(get(name), 10)),
      getNumber: (name) => (get(name) === null ? null : Number(get(name))),
      getBoolean: (name) => (get(name) === null ? null : Boolean(get(name))),
      getSubcommand: () => subcommand,
      getSubcommandGroup: () => null,
      getFocused: () => focused,
    },
    async deferReply(payload = {}) {
      if (interaction.deferred || interaction.replied) throw new Error("Already deferred or replied");
      interaction.deferred = true;
      interaction.responses.push({ kind: "defer", payload });
    },
    async reply(payload) {
      if (interaction.replied) throw new Error("Already replied");
      interaction.replied = true;
      interaction.responses.push({ kind: "reply", payload });
      return makeSentMessage(payload, world.textChannel);
    },
    async editReply(payload) {
      if (!interaction.deferred && !interaction.replied) throw new Error("Cannot edit before replying");
      interaction.replied = true;
      interaction.responses.push({ kind: "edit", payload });
      return makeSentMessage(payload, world.textChannel);
    },
    async followUp(payload) {
      interaction.responses.push({ kind: "followUp", payload });
      return makeSentMessage(payload, world.textChannel);
    },
    async fetchReply() {
      const last = [...interaction.responses].reverse().find((entry) => entry.kind !== "defer");
      return makeSentMessage(last?.payload ?? {}, world.textChannel);
    },
    async respond(choices) {
      interaction.autocompleteChoices = choices;
      return choices;
    },
  };
  return interaction;
}

export function makeMessage(world, content) {
  const message = {
    client: world.client,
    author: world.user,
    member: world.member,
    guild: world.guild,
    guildId: world.guild.id,
    channel: world.textChannel,
    channelId: world.textChannel.id,
    content,
    responses: [],
    inGuild: () => true,
    async reply(payload) {
      message.responses.push({ kind: "reply", payload });
      return makeSentMessage(payload, world.textChannel);
    },
  };
  return message;
}

export function makeButtonInteraction(world, customId) {
  const interaction = {
    client: world.client,
    customId,
    user: world.user,
    member: world.member,
    guild: world.guild,
    guildId: world.guild.id,
    channel: world.textChannel,
    deferred: false,
    replied: false,
    responses: [],
    isButton: () => true,
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    async update(payload) {
      interaction.responses.push({ kind: "update", payload });
      interaction.replied = true;
    },
    async deferUpdate() {
      interaction.responses.push({ kind: "deferUpdate" });
      interaction.deferred = true;
    },
    async reply(payload) {
      interaction.responses.push({ kind: "reply", payload });
      interaction.replied = true;
    },
    async followUp(payload) {
      interaction.responses.push({ kind: "followUp", payload });
    },
  };
  return interaction;
}

/* -------------------------------------------------------------------------- */
/* Assertion helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Flattens every reply a command produced into readable text. */
export function responseText(target) {
  const entries = target.responses ?? [];
  return entries
    .flatMap((entry) => {
      const payload = entry.payload ?? {};
      if (typeof payload === "string") return [payload];
      const parts = [];
      if (payload.content) parts.push(payload.content);
      for (const embed of payload.embeds ?? []) {
        const data = embed.data ?? embed;
        if (data.title) parts.push(data.title);
        if (data.description) parts.push(data.description);
        if (data.author?.name) parts.push(data.author.name);
        for (const field of data.fields ?? []) parts.push(`${field.name}: ${field.value}`);
        if (data.footer?.text) parts.push(data.footer.text);
      }
      return parts;
    })
    .join("\n");
}

export const lastPayload = (target) => {
  const entries = (target.responses ?? []).filter((entry) => entry.kind !== "defer");
  return entries[entries.length - 1]?.payload ?? null;
};
