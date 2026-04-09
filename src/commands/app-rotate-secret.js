/**
 * App rotate-secret command for Finqu CLI.
 * Rotates the OAuth client secret for an app.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppRotateSecretCommand extends BaseCommand {
  get name() {
    return 'rotate-secret';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'rotate-secret';
  }

  get description() {
    return 'Rotate the OAuth client secret';
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

      this.logger.printStatus(`Rotating client secret for app ${appId}...`);
      const result = await appApi.rotateSecret(appId);

      this.logger.printSuccess('Client secret rotated.');
      this.logger.print(`\n  New Secret:  ${result.client_secret}`);
      this.logger.print(`  Created At:  ${result.client_secret_created_at}\n`);
      this.logger.printInfo(
        'Update FINQU_CLIENT_SECRET in your app environment and restart the service.',
      );

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

export function createAppRotateSecretCommand(app) {
  return new AppRotateSecretCommand(app);
}
