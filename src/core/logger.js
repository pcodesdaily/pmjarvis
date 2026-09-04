import config from "../config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const COLORS = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" };
const RESET = "\x1b[0m";

const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function write(level, scope, args) {
  if (LEVELS[level] < threshold) return;
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
  const prefix = scope ? `\x1b[35m[${scope}]${RESET}` : "";
  const stream = level === "error" || level === "warn" ? console.error : console.log;
  stream(`\x1b[90m${stamp}${RESET} ${tag} ${prefix}`, ...args);
}

export function createLogger(scope = "") {
  return {
    debug: (...args) => write("debug", scope, args),
    info: (...args) => write("info", scope, args),
    warn: (...args) => write("warn", scope, args),
    error: (...args) => write("error", scope, args),
    child: (childScope) => createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
}

export const logger = createLogger("bot");
export default logger;
