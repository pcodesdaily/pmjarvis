/**
 * Thrown by guards and commands when the problem is the user's to fix.
 * The command runner turns these into a friendly reply instead of logging a
 * stack trace, so throwing one is the normal way to bail out of a command.
 */
export class CommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandError";
  }
}

export const fail = (message) => {
  throw new CommandError(message);
};
