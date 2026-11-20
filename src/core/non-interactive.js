/**
 * Non-interactive mode for Finqu CLI
 *
 * Automation (a sandboxed coder, CI) runs a small subset of theme commands
 * with no prompts, a strict command allowlist, a reliable exit code and an
 * optional single-line JSON result on stdout.
 */
import { AppError, formatErrorMessage } from './error.js';

/** Exit codes of a non-interactive or `--json` run */
export const EXIT_CODES = Object.freeze({
  /** Everything succeeded */
  OK: 0,
  /** The command ran and failed, or a file was failed or skipped */
  FAILED: 1,
  /** The command was refused or called with missing or invalid flags */
  REFUSED: 2,
});

/** Commands that may run with --non-interactive or --json */
export const MACHINE_COMMANDS = Object.freeze([
  'theme download',
  'theme deploy',
  'theme delete',
  'theme configure',
]);

/**
 * Whether the environment enables non-interactive mode
 * @param {Object} [env] Environment variables
 * @returns {boolean} True when FINQU_NON_INTERACTIVE is 1 or true
 */
export function isNonInteractiveEnv(env = process.env) {
  const value = String(env.FINQU_NON_INTERACTIVE ?? '')
    .trim()
    .toLowerCase();
  return value === '1' || value === 'true';
}

/**
 * Build the allowlist key of a command
 * @param {string|null} group Command group, or null for a top-level command
 * @param {string} name Command name
 * @returns {string} Key such as `theme deploy` or `sign-in`
 */
export function commandKey(group, name) {
  return group ? `${group} ${name}` : name;
}

/**
 * Derive the allowlist key from the operands Commander found before
 * the command's own arguments are parsed.
 * @param {string[]} operands User operands, without node and script paths
 * @returns {string} Key made of the first two operands
 */
export function keyFromOperands(operands) {
  return operands.slice(0, 2).join(' ');
}

/**
 * Decide whether a command must be refused
 * @param {string} key Command key
 * @param {Object} modes
 * @param {boolean} modes.nonInteractive Non-interactive mode is on
 * @param {boolean} modes.json --json was passed
 * @returns {string|null} Refusal message, or null when the command may run
 */
export function refusalMessage(key, { nonInteractive, json }) {
  if (MACHINE_COMMANDS.includes(key)) {
    return null;
  }
  const allowed = MACHINE_COMMANDS.join(', ');
  if (nonInteractive) {
    return `"${key}" is not available in non-interactive mode. Allowed commands: ${allowed}.`;
  }
  if (json) {
    return `--json is not supported by "${key}". Supported commands: ${allowed}.`;
  }
  return null;
}

/**
 * Error for missing or invalid flags in a non-interactive run
 */
export class UsageError extends AppError {
  /**
   * @param {string} message What is wrong with the invocation
   */
  constructor(message) {
    super(message, 'USAGE_ERROR');
    this.name = 'UsageError';
  }
}

/**
 * Normalize a failure entry for the JSON output
 * @param {Object} entry Failure entry with a path and an error
 * @param {string} defaultAction Action to report when the entry has none
 * @returns {{path: string|null, action: string, error: string}} Failure
 */
function toFailure(entry, defaultAction) {
  return {
    path: entry.path ?? null,
    action: entry.action || defaultAction,
    error: formatErrorMessage(entry.error, { compact: true }) || 'Unknown error',
  };
}

/**
 * Normalize the compile outcome for the JSON output
 * @param {Object|undefined} compile Compile outcome from a command
 * @returns {{attempted: boolean, ok: boolean|null, error: string|null}}
 */
function toCompile(compile) {
  return {
    attempted: !!compile?.attempted,
    ok: compile?.attempted ? !!compile.ok : null,
    error: compile?.error
      ? formatErrorMessage(compile.error, { compact: true })
      : null,
  };
}

/**
 * Command-specific part of the JSON output
 * @param {string} key Command key
 * @param {Object} result Command result
 * @returns {Object|null} Summary, or null when the command returned nothing
 */
function summarize(key, result) {
  if (!result) {
    return null;
  }
  switch (key) {
    case 'theme deploy':
      return {
        deployedCount: result.deployedCount ?? 0,
        removedCount: result.removedCount ?? 0,
        uploaded: result.uploaded ?? [],
        failed: (result.errors ?? []).map((e) => toFailure(e, 'upload')),
        skipped: result.skipped ?? [],
        compile: toCompile(result.compile),
      };
    case 'theme delete':
      return {
        deletedCount: result.deletedCount ?? 0,
        deleted: result.deleted ?? [],
        failed: (result.errors ?? []).map((e) => toFailure(e, 'delete')),
        compile: toCompile(result.compile),
      };
    case 'theme download':
      return {
        downloadedCount: result.downloadedCount ?? 0,
        downloaded: result.downloaded ?? [],
        failed: (result.errors ?? []).map((e) => toFailure(e, 'download')),
        skipped: result.skipped ?? [],
      };
    case 'theme configure':
      return result.store ?? null;
    default:
      return null;
  }
}

/**
 * Whether a command result counts as a failure in machine mode.
 * A skipped file or a failed compile is a failure even when the command
 * itself reports no error.
 * @param {Object|undefined} result Command result
 * @returns {boolean} True when the run must exit non-zero
 */
export function isFailedResult(result) {
  if (!result || result.success === false) {
    return true;
  }
  if (result.skipped?.length > 0 || result.errors?.length > 0) {
    return true;
  }
  return result.compile?.attempted === true && result.compile.ok === false;
}

/**
 * Pick the exit code for a command result or a thrown error
 * @param {Object|undefined} result Command result
 * @param {Error} [thrown] Error thrown by the command
 * @returns {number} Exit code
 */
export function exitCodeFor(result, thrown) {
  const error = thrown ?? result?.error;
  if (error instanceof UsageError) {
    return EXIT_CODES.REFUSED;
  }
  return thrown || isFailedResult(result) ? EXIT_CODES.FAILED : EXIT_CODES.OK;
}

/**
 * Describe why a run failed
 * @param {Object|undefined} result Command result
 * @param {Error} [thrown] Error thrown by the command
 * @returns {{code: string, message: string}|null} Error, or null on success
 */
function describeError(result, thrown) {
  const error = thrown ?? result?.error;
  if (error) {
    const message = formatErrorMessage(error, { compact: true });
    const cause = error.details
      ? formatErrorMessage(error.details, { compact: true })
      : '';
    return {
      code: error.code || 'COMMAND_FAILED',
      message: cause && !message.includes(cause) ? `${message}: ${cause}` : message,
    };
  }
  if (!isFailedResult(result)) {
    return null;
  }
  const failed = result?.errors?.length ?? 0;
  const skipped = result?.skipped?.length ?? 0;
  const parts = [];
  if (failed) parts.push(`${failed} failed`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (result?.compile?.attempted && result.compile.ok === false) {
    parts.push('compile failed');
  }
  return {
    code: 'INCOMPLETE',
    message: parts.join(', ') || 'Command reported failure',
  };
}

/**
 * Build the JSON document printed with --json
 * @param {string} key Command key
 * @param {Object|undefined} result Command result
 * @param {Error} [thrown] Error thrown by the command
 * @returns {{ok: boolean, command: string, exitCode: number, error: Object|null, result: Object|null}}
 */
export function buildEnvelope(key, result, thrown) {
  const exitCode = exitCodeFor(result, thrown);
  return {
    ok: exitCode === EXIT_CODES.OK,
    command: key,
    exitCode,
    error: describeError(result, thrown),
    result: summarize(key, result),
  };
}

/**
 * Write the JSON document as one line on stdout
 * @param {Object} envelope Document from buildEnvelope()
 */
export function printEnvelope(envelope) {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}
