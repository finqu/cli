/**
 * App create command for Finqu CLI.
 * Creates a new draft app, scaffolds a project directory, and stores credentials.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

/**
 * Convert a display name to a URL/directory-friendly slug.
 * @param {string} name Display name
 * @returns {string} Handleized name
 */
export function handleize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class AppCreateCommand extends BaseCommand {
  get name() {
    return 'create';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'create [name]';
  }

  get description() {
    return 'Create a new app';
  }

  get options() {
    return [
      {
        flags: '--name <name>',
        description: 'App display name',
      },
      {
        flags: '--base-uri <uri>',
        description: 'HTTP base URI (default: http://localhost:3000)',
      },
      {
        flags: '--install-endpoint <path>',
        description: 'Install endpoint path (default: /api/install)',
      },
      {
        flags: '--redirect-uri <uri>',
        description:
          'OAuth redirect URI (default: http://localhost:3000/api/install/callback)',
      },
    ];
  }

  async execute(nameArg, options = {}) {
    const onCancel = () => {
      this.logger.printError('Cancelled');
      process.exit(1);
    };

    // Resolve app name: flag > positional arg > prompt
    let appName = options.name || nameArg;
    if (!appName) {
      const response = await prompts(
        {
          type: 'text',
          name: 'appName',
          message: 'App name:',
          initial: 'My App',
          validate: (v) => (v ? true : 'App name is required'),
        },
        { onCancel },
      );
      appName = response.appName;
    }

    // Resolve base URI
    let baseUri = options.baseUri;
    if (!baseUri) {
      const response = await prompts(
        {
          type: 'text',
          name: 'baseUri',
          message: 'Base URI:',
          initial: 'http://localhost:3000',
          validate: (v) => (v ? true : 'Base URI is required'),
        },
        { onCancel },
      );
      baseUri = response.baseUri;
    }

    // Resolve install endpoint
    let installEndpoint = options.installEndpoint;
    if (!installEndpoint) {
      const response = await prompts(
        {
          type: 'text',
          name: 'installEndpoint',
          message: 'Install endpoint:',
          initial: '/api/install',
          validate: (v) => (v ? true : 'Install endpoint is required'),
        },
        { onCancel },
      );
      installEndpoint = response.installEndpoint;
    }

    // Resolve redirect URI
    let redirectUri = options.redirectUri;
    if (!redirectUri) {
      const response = await prompts(
        {
          type: 'text',
          name: 'redirectUri',
          message: 'Redirect URI:',
          initial: 'http://localhost:3000/api/install/callback',
          validate: (v) => (v ? true : 'Redirect URI is required'),
        },
        { onCancel },
      );
      redirectUri = response.redirectUri;
    }

    this.logger.printStatus(`Creating app "${appName}"...`);

    try {
      const appApi = this.app.services.appApi;

      const configuration = {
        redirect_uri: redirectUri,
        http: { base_uri: baseUri },
        endpoints: { install: installEndpoint },
      };

      // Create the app with name + configuration (includes redirect_uri)
      const app = await appApi.createApp(appName, configuration);

      // Scaffold project directory
      const dirName = handleize(appName);
      const targetDir = path.resolve(process.cwd(), dirName);

      try {
        await fs.access(targetDir);
        this.logger.printError(`Directory "${dirName}" already exists.`);
        return { success: false };
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      await fs.mkdir(targetDir, { recursive: true });

      // Write .env with app config and client credentials
      const envLines = [
        `FINQU_APP_ID=${app.id}`,
        `FINQU_API_CLIENT_ID=${app.handle}`,
        `FINQU_API_CLIENT_SECRET=${app.client_secret}`,
        '',
      ];
      await fs.writeFile(
        path.join(targetDir, '.env'),
        envLines.join('\n'),
        'utf-8',
      );

      this.logger.printSuccess(`App ${appName} created successfully.`);
      this.logger.print('\n  Next steps:');
      this.logger.print(`    cd ${dirName}`);
      this.logger.print('    finqu sign-in');
      this.logger.print('');

      return { success: true, app, dirName };
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

export function createAppCreateCommand(app) {
  return new AppCreateCommand(app);
}
