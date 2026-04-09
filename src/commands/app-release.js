/**
 * App release command for Finqu CLI.
 * Releases a new version of the app.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppReleaseCommand extends BaseCommand {
  get name() {
    return 'release';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'release';
  }

  get description() {
    return 'Release a new app version';
  }

  get options() {
    return [
      {
        flags: '--app-id <id>',
        description: 'App ID (uses linked app if omitted)',
      },
      {
        flags: '--version <version>',
        description: 'Explicit version in MAJOR.MINOR.PATCH format',
      },
      {
        flags: '--type <type>',
        description: 'Bump type: major, minor, or patch',
      },
      {
        flags: '--changelog <text>',
        description: 'Release notes',
      },
    ];
  }

  async execute(options = {}) {
    try {
      const appId = resolveAppId(options, this.config);
      const appApi = this.app.services.appApi;

      const versionOpts = {};
      if (options.version) {
        versionOpts.version = options.version;
      }
      if (options.type) {
        versionOpts.type = options.type;
      }
      if (options.changelog) {
        versionOpts.changelog = options.changelog;
      }

      this.logger.printStatus(`Releasing new version for app ${appId}...`);
      const result = await appApi.releaseVersion(appId, versionOpts);

      this.logger.printSuccess(`Version ${result.version} released.`);
      if (result.changelog) {
        this.logger.print(`\n  Changelog: ${result.changelog}`);
      }
      this.logger.print(`  Created:   ${result.created_at}\n`);

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

export function createAppReleaseCommand(app) {
  return new AppReleaseCommand(app);
}
