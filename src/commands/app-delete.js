/**
 * App delete command for Finqu CLI.
 * Deletes an app (immediately for drafts, scheduled for published).
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppDeleteCommand extends BaseCommand {
  get name() {
    return 'delete';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'delete';
  }

  get description() {
    return 'Delete an app';
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

      this.logger.printStatus(`Deleting app ${appId}...`);
      const result = await appApi.deleteApp(appId);

      if (result.deleted) {
        this.logger.printSuccess('App deleted immediately.');
      } else {
        this.logger.printInfo(
          `App deletion scheduled for ${result.delete_requested_at}. Notification emails have been sent.`,
        );
      }

      return { success: true, result };
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

export function createAppDeleteCommand(app) {
  return new AppDeleteCommand(app);
}
