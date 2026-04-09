/**
 * App update command for Finqu CLI.
 * Updates configuration, listing, redirect URI, or locations for an app.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppUpdateCommand extends BaseCommand {
  get name() {
    return 'update';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'update';
  }

  get description() {
    return 'Update app configuration or listing';
  }

  get options() {
    return [
      {
        flags: '--app-id <id>',
        description: 'App ID (uses linked app if omitted)',
      },
      {
        flags: '--configuration <json>',
        description: 'Configuration as JSON string',
      },
      {
        flags: '--listing <json>',
        description: 'Listing data as JSON string',
      },
      {
        flags: '--redirect-uri <uri>',
        description: 'OAuth redirect URI (use | separator for multiple)',
      },
      {
        flags: '--locations <codes...>',
        description:
          'ISO country codes to restrict availability (omit for all)',
      },
    ];
  }

  async execute(options = {}) {
    try {
      const appId = resolveAppId(options, this.config);
      const appApi = this.app.services.appApi;

      const data = {};
      if (options.configuration) {
        data.configuration = JSON.parse(options.configuration);
      }
      if (options.listing) {
        data.listing = JSON.parse(options.listing);
      }
      if (options.redirectUri) {
        data.redirect_uri = options.redirectUri;
      }
      if (options.locations) {
        data.locations = options.locations;
      }

      if (Object.keys(data).length === 0) {
        this.logger.printError(
          'No update fields specified. Use --configuration, --listing, --redirect-uri, or --locations.',
        );
        return { success: false };
      }

      this.logger.printStatus(`Updating app ${appId}...`);
      await appApi.updateApp(appId, data);

      this.logger.printSuccess('App updated successfully.');
      return { success: true };
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.logger.printError(
          'Invalid JSON in --configuration or --listing flag.',
        );
        return { success: false, error: err };
      }

      if (err instanceof AppError) {
        this.logger.printError(err.message);
        return { success: false, error: err };
      }

      this.logger.handleError(err);
      return { success: false, error: err };
    }
  }
}

export function createAppUpdateCommand(app) {
  return new AppUpdateCommand(app);
}
