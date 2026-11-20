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
