/**
 * App link command for Finqu CLI.
 * Links the current project to a Finqu app by storing its ID in config.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

export class AppLinkCommand extends BaseCommand {
  get name() {
    return 'link';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'link <appId>';
  }

  get description() {
    return 'Link this project to an existing app';
  }

  get options() {
    return [];
  }

  async execute(appId) {
    this.logger.printStatus('Linking project to app...');

    try {
      const appApi = this.app.services.appApi;
      const app = await appApi.getApp(appId);

      await this.config.saveConfigValue('appId', Number(appId));

      this.logger.printSuccess(`Linked to app "${app.name}" (${app.handle})`);

      return { success: true, app };
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

export function createAppLinkCommand(app) {
  return new AppLinkCommand(app);
}
