/**
 * App unpublish command for Finqu CLI.
 * Unpublishes an app from the app store.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppUnpublishCommand extends BaseCommand {
  get name() {
    return 'unpublish';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'unpublish';
  }

  get description() {
    return 'Unpublish the app';
  }

  get options() {
    return [
      {
        flags: '--app-id <id>',
        description: 'App ID (uses linked app if omitted)',
      },
    ];
  }

  async execute(options = {}) {
    try {
      const appId = resolveAppId(options, this.config);
      const appApi = this.app.services.appApi;

      this.logger.printStatus(`Unpublishing app ${appId}...`);
      await appApi.unpublishApp(appId);

      this.logger.printSuccess('App unpublished successfully.');
      return { success: true };
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

export function createAppUnpublishCommand(app) {
  return new AppUnpublishCommand(app);
}
