/**
 * Deploy command for Finqu CLI
 * Handles uploading theme assets to the server
 */
import path from 'path';
import { BaseCommand } from './base.js';
import { AppError, formatErrorMessage } from '../core/error.js';
import {
  ConcurrentProgress,
  runWithConcurrency,
} from '../core/concurrent-progress.js';

// Batch size for parallel operations
const BATCH_SIZE = 10;

/**
 * DeployCommand class for uploading theme assets
 */
export class DeployCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'deploy';
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
    return `Replaces the assets in the connected Finqu theme with the assets from your local theme directory.`;
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
        flags: '--clean',
        description: 'Remove remote theme assets not found locally',
      },
      {
        flags: '--force',
        description: 'Include restricted paths like config/ and .draft',
      },
      {
        flags: '--no-compile',
        description: 'Skip asset compilation after upload',
      },
    ];
  }

  /**
   * Whether a relative path should be skipped for upload
   * @param {string} relativePath
   * @param {Object} options
   * @returns {boolean}
   * @private
   */
  _shouldSkipUpload(relativePath, options) {
    if (!this.fileSystem.checkPath(relativePath)) {
      this.logger.printVerbose(`Skipping excluded file: ${relativePath}`);
      return true;
    }
    if (
      !options.force &&
      (relativePath === 'config/settings_data.json' ||
        relativePath.startsWith('.draft/'))
    ) {
      this.logger.printVerbose(
        `Skipping upload of sensitive file: ${relativePath}`,
      );
      return true;
    }
    return false;
  }

  /**
   * Execute the deploy command
   * @param {Array<string>} sources Array of source paths to deploy
   * @param {Object} options Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(sources, options) {
    this.logger.printStatus('Uploading assets to theme...');

    try {
      let deployedCount = 0;
      let removedCount = 0;
      const errors = [];
      const themeDir = this.config.get('themeDir');

      // --- Clean Phase (if --clean) ---
      if (options.clean) {
        this.logger.printStatus(
          'Checking for remote theme assets to remove (--clean)...',
        );

        const remoteAssets = await this.app.services.themeApi.getAssets();
        const localFiles = await this.fileSystem.getFiles(themeDir);
        const localRelativeFiles = new Set(
          localFiles
            .map((f) => path.relative(themeDir, f))
            .filter((f) => this.fileSystem.checkPath(f)),
        );

        const toDelete = [];
        for (const asset of remoteAssets) {
          if (asset.type === 'file' && !localRelativeFiles.has(asset.path)) {
            if (
              !options.force &&
              (asset.path === 'config/settings_data.json' ||
                asset.path.startsWith('.draft/'))
            ) {
              this.logger.printVerbose(
                `Skipping deletion of sensitive remote file: ${asset.path}`,
              );
              continue;
            }
            toDelete.push(asset.path);
          }
        }

        if (toDelete.length > 0) {
          const deletedPaths = [];
          const deleteProgress = new ConcurrentProgress(
            Math.min(BATCH_SIZE, toDelete.length),
          );
          this.logger.suspendVerbose();
          try {
            await runWithConcurrency(
              toDelete,
              BATCH_SIZE,
              async (relativePath, slot) => {
                try {
                  await this.app.services.themeApi.removeAsset(relativePath, {
                    quiet: true,
                    onStatus: (msg) => deleteProgress.update(slot, msg),
                  });
                  removedCount++;
                  deletedPaths.push(relativePath);
                } catch (e) {
                  errors.push({
                    path: relativePath,
                    error: e.message || e,
                    action: 'delete',
                  });
                } finally {
                  deleteProgress.finish(slot);
                }
              },
            );
          } finally {
            deleteProgress.clear();
            this.logger.resumeVerbose();
          }
          this.logger.printVerboseList('Removed remote assets:', deletedPaths);
        }

        if (removedCount > 0) {
          this.logger.printInfo(
            `Removed ${removedCount} remote theme assets not found locally.`,
          );
        } else {
          this.logger.printInfo('No remote theme assets needed removal.');
        }
      }

      // --- Collect upload paths ---
      const uploadPaths = [];

      if (sources && sources.length) {
        this.logger.printStatus(
          `Uploading specified assets: ${sources.join(', ')}`,
        );

        for (let source of sources) {
          const fullPath = path.join(themeDir, source);
          let stats;

          try {
            stats = await this.fileSystem.stat(fullPath);
          } catch (e) {
            this.logger.printError(
              `Local source not found: ${fullPath}`,
              e.message || e,
            );
            errors.push({
              path: source,
              error: e.message || e,
              action: 'upload',
            });
            continue;
          }

          if (stats.isFile()) {
            if (!this._shouldSkipUpload(source, options)) {
              uploadPaths.push(source);
            }
          } else if (stats.isDirectory()) {
            const dirFiles = await this.fileSystem.getFiles(fullPath);
            for (const file of dirFiles) {
              const relativePath = path.relative(themeDir, file);
              if (!this._shouldSkipUpload(relativePath, options)) {
                uploadPaths.push(relativePath);
              }
            }
          }
        }
      } else {
        this.logger.printStatus(
          'Uploading all assets from local theme directory...',
        );

        const allLocalFiles = await this.fileSystem.getFiles(themeDir);
        for (const file of allLocalFiles) {
          const relativePath = path.relative(themeDir, file);
          if (!this._shouldSkipUpload(relativePath, options)) {
            uploadPaths.push(relativePath);
          }
        }
      }

      // --- Upload Phase ---
      const uploadedPaths = [];
      if (uploadPaths.length > 0) {
        const uploadProgress = new ConcurrentProgress(
          Math.min(BATCH_SIZE, uploadPaths.length),
        );
        this.logger.suspendVerbose();
        try {
          await runWithConcurrency(
            uploadPaths,
            BATCH_SIZE,
            async (relativePath, slot) => {
              try {
                const filePath = path.join(themeDir, relativePath);

                const success = await this.app.services.themeApi.uploadAsset(
                  relativePath,
                  filePath,
                  this.fileSystem,
                  {
                    quiet: true,
                    onStatus: (msg) => uploadProgress.update(slot, msg),
                  },
                );

                if (success !== false) {
                  deployedCount++;
                  uploadedPaths.push(relativePath);
                }
              } catch (e) {
                errors.push({
                  path: relativePath,
                  error: e.message || e,
                  action: 'upload',
                });
              } finally {
                uploadProgress.finish(slot);
              }
            },
          );
        } finally {
          uploadProgress.clear();
          this.logger.resumeVerbose();
        }
      }

      this.logger.printVerboseList('Uploaded files:', uploadedPaths);

      // Report transfer errors before compile / final summary
      for (const err of errors) {
        if (err.action === 'delete') {
          this.logger.printError(
            `Failed to delete remote asset: ${err.path}`,
            err.error,
          );
        } else {
          this.logger.printError(
            `Failed to upload asset: ${err.path}`,
            err.error,
          );
        }
      }

      if (errors.length > 0) {
        this.logger.printVerboseList(
          'Failed transfers:',
          errors.map((e) => {
            const detail = formatErrorMessage(e.error, { compact: true });
            return detail ? `${e.path} (${detail})` : e.path;
          }),
        );
      }

      // --- Compile Phase ---
      const shouldCompile = options.compile !== false;
      if (shouldCompile && deployedCount > 0) {
        this.logger.printStatus('Compiling assets on theme...');
        await this.app.services.themeApi.compileAssets();
        this.logger.printSuccess('Asset compilation triggered.');
      } else if (shouldCompile && deployedCount === 0) {
        this.logger.printInfo('No assets uploaded, skipping compilation.');
      } else {
        this.logger.printInfo('Asset compilation skipped (--no-compile).');
      }

      this.logger.printSuccess(
        `Successfully deployed ${deployedCount} files`,
      );

      return {
        success: errors.length === 0,
        deployedCount,
        removedCount,
        errors,
      };
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
 * Factory function to create a DeployCommand
 * @param {Object} app Application instance
 * @returns {DeployCommand} A new command instance
 */
export function createDeployCommand(app) {
  return new DeployCommand(app);
}
