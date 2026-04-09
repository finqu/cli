/**
 * App info command for Finqu CLI.
 * Shows full details of a linked or specified app.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';

export class AppInfoCommand extends BaseCommand {
  get name() {
    return 'info';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'info';
  }

  get description() {
    return 'Show app details';
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

      this.logger.printStatus('Fetching app details...');
      const app = await appApi.getApp(appId);

      this.logger.print(`\n  Name:       ${app.name}`);
      this.logger.print(`  Handle:     ${app.handle}`);
      this.logger.print(`  ID:         ${app.id}`);
      this.logger.print(
        `  Status:     ${app.is_published ? 'published' : 'draft'}`,
      );
      this.logger.print(`  Version:    ${app.published_version || '-'}`);

      if (app.client_id !== undefined) {
        this.logger.print(`  Client ID:  ${app.client_id}`);
      }
      if (app.redirect_uri) {
        const uris = app.redirect_uri.split('|');
        if (uris.length === 1) {
          this.logger.print(`  Redirect:   ${uris[0]}`);
        } else {
          this.logger.print(`  Redirects:`);
          for (const uri of uris) {
            this.logger.print(`    - ${uri}`);
          }
        }
      }

      if (app.configuration?.http?.base_uri) {
        this.logger.print(`  Base URI:   ${app.configuration.http.base_uri}`);
      }

      if (app.version_history && app.version_history.length > 0) {
        this.logger.print(`\n  Version history:`);
        for (const v of app.version_history) {
          const changelog = v.changelog ? ` — ${v.changelog}` : '';
          this.logger.print(`    ${v.version}${changelog} (${v.created_at})`);
        }
      }

      this.logger.print('');
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

export function createAppInfoCommand(app) {
  return new AppInfoCommand(app);
}
