import { ApplicationCommandOptionType, MessageFlags } from "discord.js";

const OPT = ApplicationCommandOptionType;

/**
 * A single command implementation is driven through this wrapper so that the
 * exact same `execute(ctx)` body works for a slash command *and* for a prefix
 * message command. Everything a command needs (options, replying, deferring)
 * is normalised here.
 */
export class Ctx {
  constructor({ client, command, interaction = null, message = null, args = [] }) {
    this.client = client;
    this.command = command;
    this.interaction = interaction;
    this.message = message;
    this.rawArgs = args;

    this.deferred = false;
    this.responded = false;
    /** The message we sent as our first reply (message-command mode). */
    this.responseMessage = null;

    this._parsed = interaction ? null : this._parseArgs(args);
  }

  get isInteraction() {
    return this.interaction !== null;
  }

  get source() {
    return this.interaction ?? this.message;
  }

  get user() {
    return this.interaction ? this.interaction.user : this.message.author;
  }

  get member() {
    return this.source.member;
  }

  get guild() {
    return this.source.guild;
  }

  get guildId() {
    return this.source.guildId ?? this.guild?.id ?? null;
  }

  get channel() {
    return this.source.channel;
  }

  get me() {
    return this.guild?.members?.me ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Option access                                                       */
  /* ------------------------------------------------------------------ */

  /** Name of the invoked subcommand, or null. */
  subcommand() {
    if (this.isInteraction) return this.interaction.options.getSubcommand(false);
    return this._parsed.subcommand;
  }

  subcommandGroup() {
    if (this.isInteraction) return this.interaction.options.getSubcommandGroup(false);
    return this._parsed.subcommandGroup;
  }

  string(name, fallback = null) {
    const value = this.isInteraction
      ? this.interaction.options.getString(name)
      : this._parsed.values.get(name);
    return value ?? fallback;
  }

  integer(name, fallback = null) {
    if (this.isInteraction) return this.interaction.options.getInteger(name) ?? fallback;
    const raw = this._parsed.values.get(name);
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  number(name, fallback = null) {
    if (this.isInteraction) return this.interaction.options.getNumber(name) ?? fallback;
    const parsed = Number.parseFloat(this._parsed.values.get(name) ?? "");
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  boolean(name, fallback = null) {
    if (this.isInteraction) return this.interaction.options.getBoolean(name) ?? fallback;
    const raw = this._parsed.values.get(name);
    if (raw === undefined || raw === null) return fallback;
    return ["1", "true", "yes", "on", "enable", "enabled"].includes(raw.toLowerCase());
  }

  /** Everything the user typed after the command name (message mode only). */
  get rest() {
    return this.isInteraction ? "" : this.rawArgs.join(" ");
  }

  _optionSpecs() {
    const json = this.command.json ?? {};
    let options = json.options ?? [];
    const first = options[0];
    if (!first) return { specs: [], hasSub: false };
    if (first.type === OPT.Subcommand || first.type === OPT.SubcommandGroup) {
      return { specs: options, hasSub: true };
    }
    return { specs: options, hasSub: false };
  }

  _parseArgs(args) {
    const result = { subcommand: null, subcommandGroup: null, values: new Map() };
    const { specs, hasSub } = this._optionSpecs();
    if (!specs.length) return result;

    let cursor = [...args];
    let activeSpecs = specs;

    if (hasSub) {
      const wanted = (cursor[0] ?? "").toLowerCase();
      let match = specs.find((spec) => spec.name === wanted);
      if (match) cursor = cursor.slice(1);
      // Fall back to the first subcommand so `!loop` behaves like `!loop <mode>`.
      if (!match) match = specs.find((spec) => spec.type === OPT.Subcommand) ?? null;
      if (!match) return result;

      if (match.type === OPT.SubcommandGroup) {
        result.subcommandGroup = match.name;
        const subWanted = (cursor[0] ?? "").toLowerCase();
        const sub = (match.options ?? []).find((spec) => spec.name === subWanted);
        if (!sub) return result;
        cursor = cursor.slice(1);
        result.subcommand = sub.name;
        activeSpecs = sub.options ?? [];
      } else {
        result.subcommand = match.name;
        activeSpecs = match.options ?? [];
      }
    }

    // Flags first (`--source spotify`, `--volume=50`), then positional. The
    // option named in `command.greedy` swallows everything that is left, which
    // is what makes `!play never gonna give you up` work.
    const positional = [];
    for (let i = 0; i < cursor.length; i += 1) {
      const token = cursor[i];
      const flag = /^--([a-z0-9_-]+)(?:=(.*))?$/i.exec(token);
      if (!flag) {
        positional.push(token);
        continue;
      }
      const spec = activeSpecs.find((option) => option.name === flag[1].toLowerCase());
      if (!spec) {
        positional.push(token);
        continue;
      }
      if (flag[2] !== undefined) {
        result.values.set(spec.name, flag[2]);
      } else if (spec.type === OPT.Boolean) {
        result.values.set(spec.name, "true");
      } else {
        result.values.set(spec.name, cursor[i + 1] ?? "");
        i += 1;
      }
    }

    const greedyName = this.command.greedy ?? null;
    const remaining = [...positional];
    for (let i = 0; i < activeSpecs.length; i += 1) {
      const spec = activeSpecs[i];
      if (result.values.has(spec.name)) continue;
      if (!remaining.length) break;
      const greedy = greedyName
        ? spec.name === greedyName
        : spec.type === OPT.String && i === activeSpecs.length - 1;
      if (greedy) {
        result.values.set(spec.name, remaining.join(" "));
        remaining.length = 0;
      } else {
        result.values.set(spec.name, remaining.shift());
      }
    }

    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Responding                                                          */
  /* ------------------------------------------------------------------ */

  static normalise(payload) {
    const data = typeof payload === "string" ? { content: payload } : { ...payload };
    delete data.ephemeral;
    return data;
  }

  async defer({ ephemeral = false } = {}) {
    if (this.deferred || this.responded) return this;
    if (this.isInteraction) {
      await this.interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
    } else {
      await this.channel.sendTyping().catch(() => {});
    }
    this.deferred = true;
    return this;
  }

  async reply(payload) {
    const ephemeral = typeof payload === "object" && payload?.ephemeral === true;
    const data = Ctx.normalise(payload);

    if (this.isInteraction) {
      if (this.deferred || this.responded) {
        this.responded = true;
        return this.interaction.editReply(data);
      }
      this.responded = true;
      return this.interaction.reply({
        ...data,
        ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
        withResponse: true,
      });
    }

    if (this.responseMessage) return this.responseMessage.edit(data);
    this.responded = true;
    this.responseMessage = await this.message.reply({
      ...data,
      allowedMentions: { repliedUser: false, ...(data.allowedMentions ?? {}) },
    });
    return this.responseMessage;
  }

  async edit(payload) {
    const data = Ctx.normalise(payload);
    if (this.isInteraction) return this.interaction.editReply(data);
    if (this.responseMessage) return this.responseMessage.edit(data);
    return this.reply(data);
  }

  async followUp(payload) {
    const ephemeral = typeof payload === "object" && payload?.ephemeral === true;
    const data = Ctx.normalise(payload);
    if (this.isInteraction) {
      return this.interaction.followUp({
        ...data,
        ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
      });
    }
    return this.channel.send(data);
  }

  /** Send into the channel without replying to anything. */
  async send(payload) {
    return this.channel.send(Ctx.normalise(payload));
  }
}

export default Ctx;
