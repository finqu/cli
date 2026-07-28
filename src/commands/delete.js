/**
 * Delete command for Finqu CLI
 * Handles deleting theme assets from the server
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import {
  ConcurrentProgress,
  runWithConcurrency,
} from '../core/concurrent-progress.js';

// Batch size for parallel operations
const BATCH_SIZE = 10;

/**
 * DeleteCommand class for removing theme assets from server
 */
export class DeleteCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'delete';
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
    return 'Delete file from server';
  }

  /**
   * Get command syntax
   * @returns {string} Command syntax with arguments
   */
  get syntax() {
    return `${this.name} [sources...]`;
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [
      {
        flags: '--no-compile',
        description: 'Skip asset compilation after deletion',
      },
    ];
  }

  /**
   * Execute the delete command
   * @param {Array<string>} sources Sources to delete
   * @param {Object} options Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(sources, options) {
    if (!sources || sources.length === 0) {
      throw new AppError(
        'No sources specified. Use "delete path/to/asset"',
        'validation_error',
      );
    }

    try {
      let deletedCount = 0;
      const errors = [];
      const deletedPaths = [];

      const progress = new ConcurrentProgress(
        Math.min(BATCH_SIZE, sources.length),
      );

      this.logger.suspendVerbose();
      try {
        await runWithConcurrency(sources, BATCH_SIZE, async (source, slot) => {
          try {
            await this.app.services.themeApi.removeAsset(source, {
              quiet: true,
              onStatus: (msg) => progress.update(slot, msg),
            });
            deletedCount++;
            deletedPaths.push(source);
          } catch (e) {
            errors.push({
              path: source,
              error: e.message || e,
            });
          } finally {
            progress.finish(slot);
          }
        });
      } finally {
        progress.clear();
        this.logger.resumeVerbose();
      }

      this.logger.printVerboseList('Deleted files:', deletedPaths);

      for (const err of errors) {
        this.logger.printError(
          `Failed to remove asset '${err.path}'`,
          err.error,
        );
      }

      if (errors.length > 0) {
        this.logger.printVerboseList(
          'Failed deletions:',
          errors.map((e) => `${e.path} (${e.error})`),
        );
      }

      const shouldCompile = options.compile !== false;

      if (shouldCompile && deletedCount > 0) {
        this.logger.printStatus('Compiling assets on theme...');
        await this.app.services.themeApi.compileAssets();
        this.logger.printSuccess('Asset compilation triggered.');
      } else if (shouldCompile && deletedCount === 0) {
        this.logger.printInfo('No assets deleted, skipping compilation.');
      } else {
        this.logger.printInfo('Asset compilation skipped (--no-compile).');
      }

      this.logger.printSuccess(`Successfully deleted ${deletedCount} files`);
      return { success: errors.length === 0, deletedCount, errors };
    } catch (err) {
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
 * Factory function to create a DeleteCommand
 * @param {Object} app Application instance
 * @returns {DeleteCommand} A new command instance
 */
export function createDeleteCommand(app) {
  return new DeleteCommand(app);
}
