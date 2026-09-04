import { Client, Collection, GatewayIntentBits, Options, Partials } from "discord.js";
import config from "../config.js";
import logger from "./logger.js";

export class BotClient extends Client {
  constructor() {
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
    ];
    // MESSAGE CONTENT is a privileged intent: enable it in the Developer Portal
    // (Bot -> Privileged Gateway Intents) or set ENABLE_MESSAGE_COMMANDS=false.
    if (config.enableMessageCommands) intents.push(GatewayIntentBits.MessageContent);

    super({
      intents,
      partials: [Partials.Channel],
      allowedMentions: { parse: ["users"], repliedUser: false },
      // A music bot never needs a message cache; keeping it small keeps a small
      // VPS happy even with hundreds of guilds.
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 10,
        PresenceManager: 0,
        GuildMemberManager: { maxSize: 200, keepOverLimit: (member) => member.id === member.client.user.id },
        ReactionManager: 0,
      }),
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: { interval: 300, lifetime: 600 },
      },
    });

    /** name -> command */
    this.commands = new Collection();
    /** alias -> name */
    this.aliases = new Collection();
    /** guildId -> { messageId, channelId } of the live now-playing panel */
    this.nowPlayingMessages = new Collection();
    /** guildId -> Timeout for the "everyone left the voice channel" grace period */
    this.emptyChannelTimers = new Collection();

    this.eventCount = 0;
    this.logger = logger;
    this.config = config;
    /** Set in src/core/lavalink.js */
    this.lavalink = null;
  }

  isOwner(userId) {
    return config.owners.includes(userId);
  }
}

export default BotClient;
