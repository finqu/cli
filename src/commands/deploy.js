/**
 * Deploy command for Finqu Theme Kit
 * Handles uploading theme assets to the server
 */
import path from 'path';
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

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
   * Execute the deploy command
   * @param {Array<string>} sources Array of source paths to deploy
   * @param {Object} options Command options
   * @param {string} options.configPath Path to the configuration file (optional)
   * @param {string} options.version Version to deploy
   * @returns {Promise<Object>} Command result
   */
  async execute(sources, options) {
    this.logger.printStatus('Uploading assets to theme...');

    try {
      let deployedCount = 0;
      let removedCount = 0;
      let uploadQueue = [];
      let deleteQueue = [];
      const themeDir = this.config.get('themeDir');

      // Helper function to process an upload
      const processUpload = async (relativePath) => {
        try {
          this.logger.printVerbose(`Processing upload: ${relativePath}`);
          const filePath = path.join(themeDir, relativePath);

          // Use ThemeApi service to upload the asset
          const success = await this.app.services.themeApi.uploadAsset(
            relativePath,
            filePath,
            this.fileSystem,
          );

          if (success !== false) {
            // uploadAsset returns false if skipped
            deployedCount++;
          }
        } catch (e) {
          this.logger.printError(
            `Failed to upload asset: ${relativePath}`,
            e.message || e,
          );
          // Continue with other uploads even if one fails
        }
      };

      // Helper function to process a delete
      const processDelete = async (relativePath) => {
        try {
          this.logger.printVerbose(`Processing delete: ${relativePath}`);

          // Use ThemeApi service to remove the asset
          await this.app.services.themeApi.removeAsset(relativePath, true);
          removedCount++;
        } catch (e) {
          this.logger.printError(
            `Failed to delete remote asset: ${relativePath}`,
            e.message || e,
          );
          // Continue with other deletions even if one fails
        }
      };

      // --- Clean Phase (if --clean) ---
      if (options.clean) {
        this.logger.printStatus(
          'Checking for remote theme assets to remove (--clean)...',
        );

        // Use ThemeApi service to get all remote assets
        const remoteAssets = await this.app.services.themeApi.getAssets();
        const localFiles = await this.fileSystem.getFiles(themeDir); // Use fileSystem
        const localRelativeFiles = new Set(
          localFiles
            .map((f) => path.relative(themeDir, f))
            .filter((f) => this.fileSystem.checkPath(f)), // Use fileSystem
        );

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
            if (deleteQueue.length >= BATCH_SIZE) {
              await Promise.all(deleteQueue.map((p) => processDelete(p)));
              deleteQueue = [];
            }
            deleteQueue.push(asset.path);
          }
        }

        // Process remaining delete queue
        if (deleteQueue.length > 0) {
          await Promise.all(deleteQueue.map((p) => processDelete(p)));
        }

        if (removedCount > 0) {
          this.logger.printInfo(
            `Removed ${removedCount} remote theme assets not found locally.`,
          );
        } else {
          this.logger.printInfo('No remote theme assets needed removal.');
        }
      }

      // --- Upload Phase ---
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
            continue; // Skip this source
          }

          if (stats.isFile()) {
            if (!this.fileSystem.checkPath(source)) {
              this.logger.printVerbose(`Skipping excluded file: ${source}`);
              continue;
            }
            if (
              !options.force &&
              (source === 'config/settings_data.json' ||
                source.startsWith('.draft/'))
            ) {
              this.logger.printVerbose(
                `Skipping upload of sensitive file: ${source}`,
              );
              continue;
            }
            if (uploadQueue.length >= BATCH_SIZE) {
              await Promise.all(uploadQueue.map((p) => processUpload(p)));
              uploadQueue = [];
            }
            uploadQueue.push(source); // Use relative path
          } else if (stats.isDirectory()) {
            const dirFiles = await this.fileSystem.getFiles(fullPath); // Use fileSystem
            for (const file of dirFiles) {
              const relativePath = path.relative(themeDir, file);
              if (!this.fileSystem.checkPath(relativePath)) {
                this.logger.printVerbose(
                  `Skipping excluded file: ${relativePath}`,
                );
                continue;
              }
              if (
                !options.force &&
                (relativePath === 'config/settings_data.json' ||
                  relativePath.startsWith('.draft/'))
              ) {
                this.logger.printVerbose(
                  `Skipping upload of sensitive file: ${relativePath}`,
                );
                continue;
              }
              if (uploadQueue.length >= BATCH_SIZE) {
                await Promise.all(uploadQueue.map((p) => processUpload(p)));
                uploadQueue = [];
              }
              uploadQueue.push(relativePath);
            }
          }
        }
      } else {
        this.logger.printStatus(
          'Uploading all assets from local theme directory...',
        );

        const allLocalFiles = await this.fileSystem.getFiles(themeDir); // Use fileSystem
        for (const file of allLocalFiles) {
          const relativePath = path.relative(themeDir, file);
          if (!this.fileSystem.checkPath(relativePath)) {
            this.logger.printVerbose(`Skipping excluded file: ${relativePath}`);
            continue;
          }
          if (
            !options.force &&
            (relativePath === 'config/settings_data.json' ||
              relativePath.startsWith('.draft/'))
          ) {
            this.logger.printVerbose(
              `Skipping upload of sensitive file: ${relativePath}`,
            );
            continue;
          }
          if (uploadQueue.length >= BATCH_SIZE) {
            await Promise.all(uploadQueue.map((p) => processUpload(p)));
            uploadQueue = [];
          }
          uploadQueue.push(relativePath);
        }
      }

      // Process remaining upload queue
      if (uploadQueue.length > 0) {
        await Promise.all(uploadQueue.map((p) => processUpload(p)));
      }

      // --- Compile Phase ---
      // Default to true if options.compile is not explicitly false
      const shouldCompile = options.compile !== false;
      if (shouldCompile && deployedCount > 0) {
        // Only compile if something was uploaded
        this.logger.printStatus('Compiling assets on theme...');
        // Use ThemeApi service to compile assets
        await this.app.services.themeApi.compileAssets();
        this.logger.printSuccess('Asset compilation triggered.');
      } else if (shouldCompile && deployedCount === 0) {
        this.logger.printInfo('No assets uploaded, skipping compilation.');
      } else {
        this.logger.printInfo('Asset compilation skipped (--no-compile).');
      }

      this.logger.printSuccess(
        `Upload complete. ${deployedCount} assets uploaded.`,
      );
      return {
        success: true,
        deployedCount,
        removedCount,
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
