/**
 * App share command for Finqu CLI.
 * Gets or creates a share link for the app.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppShareCommand extends BaseCommand {
  get name() {
    return 'share';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'share';
  }

  get description() {
    return 'Get or create a share link for the app';
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

      this.logger.printStatus('Fetching share link...');
      const result = await appApi.getShareLink(appId);

      this.logger.printSuccess('Share link:');
      this.logger.print(`\n  ${result.share_url}\n`);

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

export function createAppShareCommand(app) {
  return new AppShareCommand(app);
}
