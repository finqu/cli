/**
 * App list command for Finqu CLI.
 * Lists all apps owned by the authenticated partner.
 */
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

export class AppListCommand extends BaseCommand {
  get name() {
    return 'list';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'list';
  }

  get description() {
    return 'List all your apps';
  }

  get options() {
    return [];
  }

  async execute() {
    this.logger.printStatus('Fetching apps...');

    try {
      const appApi = this.app.services.appApi;
      const apps = await appApi.listApps();

      if (!apps || apps.length === 0) {
        this.logger.printInfo('No apps found.');
        return { success: true, apps: [] };
      }

      const linkedAppId = this.config.get('appId');

      // Compute column widths
      const rows = apps.map((app) => ({
        id: String(app.id),
        name: app.name,
        handle: app.handle,
        status: app.is_published ? 'published' : 'draft',
        version: app.published_version || '-',
        linked: app.id === linkedAppId,
      }));

      const col = (key) =>
        Math.max(key.length, ...rows.map((r) => r[key].length));
      const w = {
        id: col('id'),
        name: col('name'),
        handle: col('handle'),
        status: col('status'),
        version: col('version'),
      };

      // Header
      const header = `  ${'ID'.padEnd(w.id)}  ${'Name'.padEnd(w.name)}  ${'Handle'.padEnd(w.handle)}  ${'Status'.padEnd(w.status)}  Version`;
      const separator = `  ${'─'.repeat(w.id)}  ${'─'.repeat(w.name)}  ${'─'.repeat(w.handle)}  ${'─'.repeat(w.status)}  ${'─'.repeat(7)}`;
      this.logger.print('');
      this.logger.print(header);
      this.logger.print(separator);

      for (const r of rows) {
        const linked = r.linked ? ' ●' : '';
        this.logger.print(
          `  ${r.id.padStart(w.id)}  ${r.name.padEnd(w.name)}  ${r.handle.padEnd(w.handle)}  ${r.status.padEnd(w.status)}  ${r.version}${linked}`,
        );
      }

      this.logger.print('');

      return { success: true, apps };
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

export function createAppListCommand(app) {
  return new AppListCommand(app);
}
