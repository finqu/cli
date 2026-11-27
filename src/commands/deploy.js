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
import { PATH_VERDICT, loadThemeIgnore } from '../io/themeIgnore.js';
import {
  SETTINGS_DATA_PATH,
  pullSettingsData,
  syncPublicAssets,
} from '../services/themeSync.js';

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
        flags: '--config-push',
        description: 'Upload local config/settings_data.json to the theme',
      },
      {
        flags: '--config-pull',
        description:
          'Download remote config/settings_data.json before and after deploy',
      },
      {
        flags: '--assets-pull',
        description:
          'After compile, download compiled public/ assets to local',
      },
      {
        flags: '--no-compile',
        description: 'Skip asset compilation after upload',
      },
    ];
  }

  /**
   * Whether a path is the configuration file the CLI loaded and writes
   * tokens into. It can have any name when -c or FINQU_CONFIG points at it.
   * @param {string} relativePath Path relative to the theme directory
   * @returns {boolean}
   * @private
   */
  _isConfigFile(relativePath) {
    const configFile = this.config.configFilePath;
    if (!configFile) {
      return false;
    }
    const themeDir = this.config.get('themeDir');
    return (
      path.resolve(themeDir, relativePath) === path.resolve(configFile)
    );
  }

  /**
   * Why a relative path is not uploaded
   * @param {string} relativePath
   * @param {Object} options
   * @param {import('../io/themeIgnore.js').ThemeIgnore} themeIgnore
   * @returns {'excluded'|'ignored'|null} `excluded` for the built-in safety
   *   list and the CLI's own rules, `ignored` for `.finquignore`, or null
   *   when the file may be uploaded
   * @private
   */
  _skipReason(relativePath, options, themeIgnore) {
    if (this._isConfigFile(relativePath)) {
      this.logger.printVerbose(
        `Skipping upload of CLI configuration file: ${relativePath}`,
      );
      return 'excluded';
    }
    const verdict = themeIgnore.classify(relativePath);
    if (verdict === PATH_VERDICT.EXCLUDED) {
      this.logger.printVerbose(`Skipping excluded file: ${relativePath}`);
      return 'excluded';
    }
    if (verdict === PATH_VERDICT.IGNORED) {
      this.logger.printVerbose(`Skipping ignored file: ${relativePath}`);
      return 'ignored';
    }
    if (relativePath.startsWith('.draft/')) {
      this.logger.printVerbose(
        `Skipping upload of sensitive file: ${relativePath}`,
      );
      return 'excluded';
    }
    if (
      relativePath === SETTINGS_DATA_PATH &&
      !options.configPush
    ) {
      this.logger.printVerbose(
        `Skipping upload of sensitive file: ${relativePath}`,
      );
      return 'excluded';
    }
    return null;
  }

  /**
   * Whether a remote path should be skipped during --clean
   * @param {string} assetPath
   * @returns {boolean}
   * @private
   */
  _shouldSkipClean(assetPath) {
    if (assetPath === 'public' || assetPath.startsWith('public/')) {
      this.logger.printVerbose(
        `Skipping deletion of compiled remote file: ${assetPath}`,
      );
      return true;
    }
    if (
      assetPath === SETTINGS_DATA_PATH ||
      assetPath.startsWith('.draft/')
    ) {
      this.logger.printVerbose(
        `Skipping deletion of sensitive remote file: ${assetPath}`,
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
      let compiled = false;
      let compileError = null;
      const errors = [];
      const skipped = [];
      const ignored = [];
      const themeDir = this.config.get('themeDir');
      const themeApi = this.app.services.themeApi;
      const themeIgnore = await loadThemeIgnore(this.fileSystem, themeDir);

      // --- Pre-pull settings (if --config-pull without --config-push) ---
      // Skip pre-pull when pushing so local settings are not overwritten first.
      if (options.configPull && !options.configPush) {
        await pullSettingsData({
          themeApi,
          fileSystem: this.fileSystem,
          themeDir,
          logger: this.logger,
          themeIgnore,
        });
      }

      // --- Clean Phase (if --clean) ---
      if (options.clean) {
        this.logger.printStatus(
          'Checking for remote theme assets to remove (--clean)...',
        );

        const remoteAssets = await themeApi.getAssets();
        const localFiles = await this.fileSystem.getFiles(themeDir);
        const localRelativeFiles = new Set(
          localFiles
            .map((f) => path.relative(themeDir, f))
            .filter((f) => this.fileSystem.checkPath(f)),
        );

        const toDelete = [];
        for (const asset of remoteAssets) {
          if (asset.type === 'file' && !localRelativeFiles.has(asset.path)) {
            if (this._shouldSkipClean(asset.path)) {
              continue;
            }
            if (themeIgnore.classify(asset.path) !== PATH_VERDICT.ALLOWED) {
              this.logger.printVerbose(
                `Skipping deletion of ignored remote file: ${asset.path}`,
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
            this.progressOptions(),
          );
          this.logger.suspendVerbose();
          try {
            await runWithConcurrency(
              toDelete,
              BATCH_SIZE,
              async (relativePath, slot) => {
                try {
                  await themeApi.removeAsset(relativePath, {
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
          let linkStats;

          try {
            linkStats = await this.fileSystem.lstat(fullPath);
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

          if (linkStats.isSymbolicLink()) {
            skipped.push({ path: source, reason: 'symlink' });
          } else if (stats.isFile()) {
            const reason = this._skipReason(source, options, themeIgnore);
            if (!reason) {
              uploadPaths.push(source);
            } else if (reason === 'ignored') {
              ignored.push(source);
            } else {
              // A file named on the command line that the safety list or the
              // CLI refuses must be visible to automation; excluded files
              // found by a directory walk are ordinary exclusions and stay
              // silent.
              skipped.push({ path: source, reason });
            }
          } else if (stats.isDirectory()) {
            const dirFiles = await this.fileSystem.getFiles(fullPath);
            for (const file of dirFiles) {
              const relativePath = path.relative(themeDir, file);
              const reason = this._skipReason(relativePath, options, themeIgnore);
              if (!reason) {
                uploadPaths.push(relativePath);
              } else if (reason === 'ignored') {
                ignored.push(relativePath);
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
          const reason = this._skipReason(relativePath, options, themeIgnore);
          if (!reason) {
            uploadPaths.push(relativePath);
          } else if (reason === 'ignored') {
            ignored.push(relativePath);
          }
        }
      }

      // With --config-push, always include settings_data when present locally
      if (options.configPush && !uploadPaths.includes(SETTINGS_DATA_PATH)) {
        const settingsPath = path.join(themeDir, SETTINGS_DATA_PATH);
        if (await this.fileSystem.exists(settingsPath)) {
          if (
            themeIgnore.classify(SETTINGS_DATA_PATH) === PATH_VERDICT.IGNORED
          ) {
            if (!ignored.includes(SETTINGS_DATA_PATH)) {
              ignored.push(SETTINGS_DATA_PATH);
            }
            this.logger.printVerbose(
              `Not pushing ${SETTINGS_DATA_PATH}: ignored by .finquignore`,
            );
          } else {
            uploadPaths.push(SETTINGS_DATA_PATH);
            this.logger.printVerbose(
              `Including ${SETTINGS_DATA_PATH} (--config-push)`,
            );
          }
        } else {
          this.logger.printInfo(
            `Local ${SETTINGS_DATA_PATH} not found; nothing to push.`,
          );
        }
      }

      // --- Upload Phase ---
      const uploadedPaths = [];
      if (uploadPaths.length > 0) {
        const uploadProgress = new ConcurrentProgress(
          Math.min(BATCH_SIZE, uploadPaths.length),
          this.progressOptions(),
        );
        this.logger.suspendVerbose();
        try {
          await runWithConcurrency(
            uploadPaths,
            BATCH_SIZE,
            async (relativePath, slot) => {
              try {
                const filePath = path.join(themeDir, relativePath);

                let skipReason = 'not_uploaded';
                const success = await themeApi.uploadAsset(
                  relativePath,
                  filePath,
                  this.fileSystem,
                  {
                    rootDir: themeDir,
                    quiet: true,
                    onStatus: (msg) => uploadProgress.update(slot, msg),
                    onSkip: ({ reason }) => {
                      skipReason = reason;
                    },
                  },
                );

                if (success !== false) {
                  deployedCount++;
                  uploadedPaths.push(relativePath);
                } else {
                  skipped.push({ path: relativePath, reason: skipReason });
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

      if (this.isMachineMode()) {
        for (const entry of skipped) {
          this.logger.printError(
            `Skipped asset: ${entry.path} (${entry.reason})`,
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
        try {
          await themeApi.compileAssets();
          this.logger.printSuccess('Asset compilation triggered.');
          compiled = true;
        } catch (e) {
          // Interactive runs keep aborting on a failed compile. A
          // non-interactive run reports it in the result instead, so the
          // uploaded files stay visible to the caller.
          if (!this.isNonInteractive()) {
            throw e;
          }
          compileError = e;
        }
      } else if (shouldCompile && deployedCount === 0) {
        this.logger.printInfo('No assets uploaded, skipping compilation.');
      } else {
        this.logger.printInfo('Asset compilation skipped (--no-compile).');
      }

      // --- Post-pull settings (if --config-pull) ---
      if (options.configPull) {
        const pulled = await pullSettingsData({
          themeApi,
          fileSystem: this.fileSystem,
          themeDir,
          logger: this.logger,
          themeIgnore,
        });
        if (pulled?.ignored && !ignored.includes(SETTINGS_DATA_PATH)) {
          ignored.push(SETTINGS_DATA_PATH);
        }
      }

      // --- Pull compiled assets (if --assets-pull and compiled) ---
      if (options.assetsPull && compiled) {
        const syncResult = await syncPublicAssets({
          themeApi,
          fileSystem: this.fileSystem,
          themeDir,
          logger: this.logger,
          themeIgnore,
        });
        for (const assetPath of syncResult.ignored ?? []) {
          if (!ignored.includes(assetPath)) {
            ignored.push(assetPath);
          }
        }
        for (const err of syncResult.errors) {
          errors.push({
            path: err.path,
            error: err.error,
            action: 'sync',
          });
        }
      } else if (options.assetsPull && !compiled) {
        this.logger.printInfo(
          'Compiled public/ pull skipped (assets were not compiled).',
        );
      }

      if (ignored.length > 0) {
        this.logger.printInfo(
          `Ignored ${ignored.length} file(s) matched by .finquignore.`,
        );
        this.logger.printVerboseList('Ignored files:', ignored);
      }

      this.logger.printSuccess(
        `Successfully deployed ${deployedCount} files`,
      );

      return {
        success: errors.length === 0 && !compileError,
        deployedCount,
        removedCount,
        errors,
        skipped,
        ignored,
        uploaded: uploadedPaths,
        compile: {
          attempted: shouldCompile && deployedCount > 0,
          ok: compiled,
          error: compileError,
        },
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
