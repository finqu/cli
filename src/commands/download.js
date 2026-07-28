/**
 * Download command for Finqu CLI
 * Handles downloading theme assets from the server
 */
import path from 'path';
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import {
  ConcurrentProgress,
  runWithConcurrency,
} from '../core/concurrent-progress.js';

// Batch size for parallel downloads
const BATCH_SIZE = 10;

/**
 * DownloadCommand class for downloading theme assets
 */
export class DownloadCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'download';
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
    return `Replaces your local theme assets with the assets from the connected Finqu theme.`;
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
    return [];
  }

  /**
   * Execute the download command
   * @returns {Promise<Object>} Command result
   */
  async execute(sources) {
    try {
      let downloadedCount = 0;
      const errors = [];
      const downloadedPaths = [];
      const themeDir = this.config.get('themeDir');
      const downloadPaths = [];

      if (sources && sources.length) {
        for (const source of sources) {
          downloadPaths.push(source);
        }
      } else {
        this.logger.printStatus('Downloading all assets from theme...');

        try {
          const assets = await this.app.services.themeApi.getAssets();
          if (!assets || assets.length === 0) {
            this.logger.printInfo('No assets found in the theme.');
            return { success: true, downloadedCount: 0 };
          }

          for (const asset of assets) {
            if (asset.type !== 'dir') {
              downloadPaths.push(asset.path);
            } else {
              this.logger.printVerbose(
                `Ensuring local directory exists for: ${asset.path}`,
              );
              const dirPath = path.join(themeDir, asset.path);
              if (!(await this.fileSystem.exists(dirPath))) {
                await this.fileSystem.mkdir(dirPath, { recursive: true });
              }
            }
          }
        } catch (err) {
          this.logger.printError('Failed to retrieve assets', err);
          return { success: false, error: err };
        }
      }

      if (downloadPaths.length > 0) {
        const progress = new ConcurrentProgress(
          Math.min(BATCH_SIZE, downloadPaths.length),
        );

        this.logger.suspendVerbose();
        try {
          await runWithConcurrency(
            downloadPaths,
            BATCH_SIZE,
            async (assetPath, slot) => {
              try {
                const localFilePath = path.join(themeDir, assetPath);

                const dirPath = path.dirname(localFilePath);
                if (!(await this.fileSystem.exists(dirPath))) {
                  await this.fileSystem.mkdir(dirPath, { recursive: true });
                }

                const success = await this.app.services.themeApi.downloadAsset(
                  assetPath,
                  localFilePath,
                  this.fileSystem,
                  {
                    quiet: true,
                    onStatus: (msg) => progress.update(slot, msg),
                  },
                );

                if (success) {
                  downloadedCount++;
                  downloadedPaths.push(assetPath);
                }
              } catch (e) {
                if (e.status === 404) {
                  errors.push({
                    path: assetPath,
                    error: e.error || `File not found: ${assetPath}`,
                  });
                } else {
                  errors.push({
                    path: assetPath,
                    error: e.message || e.error || e,
                  });
                }
              } finally {
                progress.finish(slot);
              }
            },
          );
        } finally {
          progress.clear();
          this.logger.resumeVerbose();
        }
      }

      this.logger.printVerboseList('Downloaded files:', downloadedPaths);

      for (const err of errors) {
        this.logger.printError(
          typeof err.error === 'string' && err.error.includes(err.path)
            ? err.error
            : `Failed to download: ${err.path}`,
          typeof err.error === 'string' && err.error.includes(err.path)
            ? null
            : err.error,
        );
      }

      if (errors.length > 0) {
        this.logger.printVerboseList(
          'Failed downloads:',
          errors.map((e) => `${e.path} (${e.error})`),
        );
      }

      if (downloadedCount > 0) {
        this.logger.printSuccess(
          `Successfully downloaded ${downloadedCount} files`,
        );
      } else {
        this.logger.printInfo('No assets were downloaded.');
      }

      return {
        success: errors.length === 0,
        downloadedCount,
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
 * Factory function to create a DownloadCommand
 * @param {Object} app Application instance
 * @returns {DownloadCommand} A new command instance
 */
export function createDownloadCommand(app) {
  return new DownloadCommand(app);
}
