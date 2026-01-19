/**
 * Download command for Finqu Theme Kit
 * Handles downloading theme assets from the server
 */
import path from 'path';
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

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
      let queue = [];
      const themeDir = this.config.get('themeDir');

      // Helper function to process a single asset
      const processAsset = async (assetPath) => {
        try {
          this.logger.printVerbose(`Processing asset: ${assetPath}`);
          const localFilePath = path.join(themeDir, assetPath);

          // Ensure directory exists
          const dirPath = path.dirname(localFilePath);
          if (!(await this.fileSystem.exists(dirPath))) {
            await this.fileSystem.mkdir(dirPath, { recursive: true });
          }

          // Use the ThemeApi service to download the asset
          const success = await this.app.services.themeApi.downloadAsset(
            assetPath,
            localFilePath,
            this.fileSystem,
          );

          if (success) {
            downloadedCount++;
          }
        } catch (e) {
          // Don't log an error here, let the main error handling take care of it
          throw e;
        }
      };

      if (sources && sources.length) {
        for (let source of sources) {
          try {
            await processAsset(source);
          } catch (err) {
            if (err.status === 404) {
              // For 404 errors, show a clean, concise message
              this.logger.printError(err.error || `File not found: ${source}`);
            } else {
              this.logger.printError(`Failed to download: ${source}`, err);
            }
            // Continue with other sources even if one fails
          }
        }
      } else {
        this.logger.printStatus('Downloading all assets from theme...');

        try {
          const assets = await this.app.services.themeApi.getAssets();
          if (!assets || assets.length === 0) {
            this.logger.printInfo('No assets found in the theme.');
            return { success: true, downloadedCount: 0 };
          }

          for (let asset of assets) {
            if (asset.type !== 'dir') {
              // Only download files
              if (queue.length >= BATCH_SIZE) {
                await Promise.all(queue.map((p) => processAsset(p)));
                queue = [];
              }
              queue.push(asset.path);
            } else {
              // Ensure local directory exists
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
          // Handle general asset listing errors
          this.logger.printError('Failed to retrieve assets', err);
          return { success: false, error: err };
        }
      }

      // Process remaining queue
      if (queue.length > 0) {
        try {
          await Promise.all(queue.map((p) => processAsset(p)));
        } catch (err) {
          // Individual asset errors were already logged in processAsset
          this.logger.printError('Some assets failed to download');
        }
      }

      if (downloadedCount > 0) {
        this.logger.printSuccess(
          `Download complete. ${downloadedCount} assets downloaded.`,
        );
      } else {
        this.logger.printInfo('No assets were downloaded.');
      }

      return { success: true, downloadedCount };
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
