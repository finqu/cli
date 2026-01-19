/**
 * Watch command for Finqu Theme Kit
 * Watches for file changes and automatically deploys them to the server
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { ThemeWatcher } from '../core/theme-watcher.js'; // Import the new watcher

/**
 * WatchCommand class for watching file changes and deploying them
 */
export class WatchCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'watch';
  }

  /**
   * Get command group
   * @returns {string} Command group
   */
  get group() {
    return 'theme';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  get description() {
    return 'Watch for file changes and automatically deploy them';
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [
      {
        flags: '--ignore <patterns...>',
        description: 'Patterns to ignore (in addition to default ignores)',
      },
    ];
  }

  /**
   * Execute the watch command
   * @param {Object} options Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(options) {
    try {
      const themeDir = this.config.get('themeDir');
      // Instantiate the watcher with dependencies
      const watcher = new ThemeWatcher(
        themeDir,
        this.app.services.themeApi,
        this.fileSystem, // Pass the fileSystem instance from BaseCommand
        this.logger,
        1000, // Debounce delay in ms
      );

      // Start the watcher
      watcher.start();

      // Indicate successful setup. The watcher runs indefinitely in the background.
      return { success: true };
    } catch (err) {
      // Handle setup errors
      if (err instanceof AppError) {
        this.logger.printError(err.message);
        return { success: false, error: err };
      }

      this.logger.handleError(err);
      return { success: false, error: err };
    }
  }
}

/**
 * Factory function to create a WatchCommand
 * @param {Object} app Application instance
 * @returns {WatchCommand} A new command instance
 */
export function createWatchCommand(app) {
  return new WatchCommand(app);
}
