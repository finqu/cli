/**
 * App publish command for Finqu CLI.
 * Publishes an app to the app store.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppPublishCommand extends BaseCommand {
  get name() {
    return 'publish';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'publish';
  }

  get description() {
    return 'Publish the app';
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

      this.logger.printStatus(`Publishing app ${appId}...`);
      await appApi.publishApp(appId);

      this.logger.printSuccess('App published successfully.');
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

export function createAppPublishCommand(app) {
  return new AppPublishCommand(app);
}
