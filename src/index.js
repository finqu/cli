/**
 * Finqu Theme Kit
 * Main entry point for the refactored codebase
 */

import { createApp } from './core/app.js';
import { createCommandRegistry } from './commands/index.js';

// Core exports
export { createApp } from './core/app.js';
export { ConfigManager, createConfigManager } from './core/config.js';
export { Logger, createLogger } from './core/logger.js';
export { AppError } from './core/error.js';

// IO exports
export { FileSystem, createFileSystem } from './io/fileSystem.js';

// Service exports
export { HttpClient, createHttpClient } from './services/http.js';
export { TokenManager, createTokenManager } from './services/tokenManager.js';
export { ThemeApi, createThemeApi } from './services/themeApi.js';
export {
  ProfileService,
  createProfileService,
} from './services/profileService.js';

// Command exports
export { BaseCommand } from './commands/base.js';
export {
  ConfigureCommand,
  createConfigureCommand,
} from './commands/configure.js';
export { CommandRegistry, createCommandRegistry } from './commands/index.js';

/**
 * Creates a complete application with services and command registry
 * @param {Object} options Application options (like fileSystem)
 * @param {Logger} logger Pre-initialized logger instance
 * @param {ConfigManager} configManager Pre-initialized config manager instance
 * @returns {Object} Complete application with commands
 */
export async function createFullApp(options = {}, logger, configManager) {
  // Create the core application using pre-initialized logger and config
  const app = await createApp(options, configManager, logger);

  // Create command registry
  const commandRegistry = createCommandRegistry();

  // Set the app in the command registry
  commandRegistry.setApp(app);

  return {
    ...app,
    commands: commandRegistry,
  };
}
