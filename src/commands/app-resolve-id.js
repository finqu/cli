/**
 * Shared helper for resolving app ID from options or config.
 */
import { AppError } from '../core/error.js';

/**
 * Resolve the app ID from command options or config
 * @param {Object} options Command options (may contain appId)
 * @param {Object} config ConfigManager instance
 * @returns {number} Resolved app ID
 * @throws {AppError} If no app ID can be resolved
 */
export function resolveAppId(options, config) {
  const appId = options.appId || config.get('appId');

  if (!appId) {
    throw AppError.configError(
      'No app ID specified. Use --app-id <id> or link a project first with `finqu app link <id>`.',
    );
  }

  return Number(appId);
}
