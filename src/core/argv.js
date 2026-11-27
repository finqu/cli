/**
 * Argument helpers for the Finqu CLI entry point
 */

/** Root options that take a value, so the next token is not a command */
const ROOT_OPTIONS_WITH_VALUE = new Set(['-c', '--config']);

/**
 * Index of the first command word in the user arguments, skipping root
 * options and their values.
 * @param {string[]} args User arguments, without node and script paths
 * @returns {number} Index of the command word, or -1 when there is none
 */
export function commandWordIndex(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      return i + 1 < args.length ? i + 1 : -1;
    }
    if (ROOT_OPTIONS_WITH_VALUE.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith('-')) {
      return i;
    }
  }
  return -1;
}

/**
 * Whether `--version` asks for the CLI version. After a command word it
 * belongs to that command, as in `theme configure --version <name>`.
 * Commander would otherwise treat it as the root version flag wherever
 * it appears.
 * @param {string[]} args User arguments, without node and script paths
 * @returns {boolean} True when the CLI version was requested
 */
export function isCliVersionRequest(args) {
  const commandIndex = commandWordIndex(args);
  const end = commandIndex === -1 ? args.length : commandIndex;
  return args.slice(0, end).includes('--version');
}

/**
 * Whether machine mode was requested on the command line, found without
 * Commander so it is known even when Commander fails while parsing. Tokens
 * after `--` are operands and never flags.
 * @param {string[]} args User arguments, without node and script paths
 * @returns {{json: boolean, nonInteractive: boolean}} Flags found
 */
export function machineFlagsIn(args) {
  const end = args.indexOf('--');
  const flags = end === -1 ? args : args.slice(0, end);
  return {
    json: flags.includes('--json'),
    nonInteractive: flags.includes('--non-interactive'),
  };
}

/**
 * Make Commander throw instead of exiting the process, on the command and
 * on every subcommand below it. Settings are only inherited by commands
 * created with `.command()`, so groups added with `addCommand()` need this.
 * @param {import('commander').Command} command Root command, after all
 *   subcommands are registered
 */
export function exitOverrideAll(command) {
  command.exitOverride();
  for (const sub of command.commands) {
    exitOverrideAll(sub);
  }
}

/**
 * Whether an error was thrown by Commander in place of exiting, as it does
 * for a usage error, `--help` and `--version` after exitOverride().
 * @param {*} err Caught value
 * @returns {boolean} True for a Commander exit
 */
export function isCommanderExit(err) {
  return typeof err?.code === 'string' && err.code.startsWith('commander.');
}

/**
 * Message of a Commander usage error without its `error: ` prefix
 * @param {Error} err Commander error
 * @returns {string} Message
 */
export function usageMessage(err) {
  return String(err.message).replace(/^error:\s*/, '');
}
