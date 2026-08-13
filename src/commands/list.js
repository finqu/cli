/**
 * List command for Finqu CLI.
 * Lists remote theme assets, optionally filtered to a directory.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

export class ListCommand extends BaseCommand {
  get name() {
    return 'list';
  }

  get group() {
    return 'theme';
  }

  get description() {
    return 'List files in the connected Finqu theme';
  }

  get syntax() {
    return `${this.name} [dir]`;
  }

  get options() {
    return [];
  }

  /**
   * Execute the list command
   * @param {string} [dir] Optional directory to list (recursive)
   * @returns {Promise<Object>} Command result
   */
  async execute(dir) {
    try {
      const assets = await this.app.services.themeApi.getAssets();

      if (!assets || assets.length === 0) {
        this.logger.printInfo('No assets found in the theme.');
        return { success: true, assets: [] };
      }

      const normalizedDir =
        typeof dir === 'string' ? dir.replace(/\/+$/, '') : null;

      const matches = assets.filter((asset) => {
        if (typeof asset.path !== 'string') {
          return false;
        }
        if (!normalizedDir) {
          return true;
        }
        return (
          asset.path === normalizedDir ||
          asset.path.startsWith(`${normalizedDir}/`)
        );
      });

      if (matches.length === 0) {
        this.logger.printInfo(`No assets found under '${normalizedDir}'.`);
        return { success: true, assets: [] };
      }

      const paths = matches
        .map((asset) => (asset.type === 'dir' ? `${asset.path}/` : asset.path))
        .sort();

      for (const assetPath of paths) {
        this.logger.print(assetPath);
      }

      return { success: true, assets: matches };
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

export function createListCommand(app) {
  return new ListCommand(app);
}
