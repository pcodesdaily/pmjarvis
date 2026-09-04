// Imported first by every test file so that src/config.js sees a deterministic
// environment when it is evaluated. ESM evaluates imports in order, so keeping
// this at the top of a test file is enough.
process.env.DISCORD_TOKEN ??= "test.token.value";
process.env.CLIENT_ID ??= "111111111111111111";
process.env.LOG_LEVEL ??= "silent";
process.env.PREFIX ??= "pm!";
process.env.ENABLE_MESSAGE_COMMANDS ??= "true";
process.env.DEFAULT_VOLUME ??= "100";
process.env.MAX_VOLUME ??= "150";
process.env.VOLUME_DECREMENTER ??= "0.85";
process.env.LEAVE_ON_EMPTY_MS ??= "60000";
process.env.LEAVE_ON_END_MS ??= "120000";
process.env.DJ_FREE_FOR_ALL ??= "true";
