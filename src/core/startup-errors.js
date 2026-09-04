/**
 * Discord's startup failures arrive as bare gateway errors with a stack trace
 * that says nothing about how to fix them. These two account for almost every
 * failed first deploy, so answer them in plain words instead.
 */
export function explainStartupError(error) {
  const message = String(error?.message ?? error);

  if (/disallowed intents/i.test(message)) {
    return [
      "Discord refused the connection: a privileged intent is not enabled for this bot.",
      "",
      "Fix it in one of these two ways:",
      "",
      "  1. Turn the intent on (recommended, keeps pm! text commands working):",
      "     https://discord.com/developers/applications",
      "     -> your application -> Bot -> Privileged Gateway Intents",
      "     -> enable MESSAGE CONTENT INTENT -> Save Changes",
      "     then run: docker compose restart bot",
      "",
      "  2. Or turn text commands off and use slash commands only:",
      "     set ENABLE_MESSAGE_COMMANDS=false in .env",
      "     then run: docker compose up -d bot",
    ].join("\n");
  }

  if (/invalid token|token.*invalid|unauthorized/i.test(message)) {
    return [
      "Discord rejected the bot token.",
      "",
      "Check DISCORD_TOKEN in .env. It must be the Bot token, not the",
      "Application ID and not the client secret. Get a fresh one from",
      "https://discord.com/developers/applications -> your app -> Bot -> Reset Token,",
      "then run: docker compose up -d bot",
    ].join("\n");
  }

  return null;
}
