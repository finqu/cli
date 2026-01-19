/**
 * Delete command for Finqu Theme Kit
 * Handles deleting theme assets from the server
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

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
      // Batch size for parallel operations
      const BATCH_SIZE = 10;
      let queue = [];
      let deletedCount = 0;

      try {
        for (let source of sources) {
          this.logger.printStatus(`Deleting asset '${source}'...`);

          if (queue.length === BATCH_SIZE) {
            await Promise.all(queue);
            queue = [];
          }

          queue.push(
            this.app.services.themeApi.removeAsset(source).then(() => {
              deletedCount++;
            }),
          );
        }

        if (queue.length) {
          await Promise.all(queue);
        }

        // Default to true if options.compile is not explicitly false
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

        this.logger.printSuccess(
          `Delete complete. ${deletedCount} assets deleted.`,
        );
        return { success: true, deletedCount };
      } catch (err) {
        return { success: false, error: err };
      }
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
