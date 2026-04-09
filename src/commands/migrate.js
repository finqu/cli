/**
 * Migrate command for Finqu CLI
 * Converts legacy finqu.config.json to .env format
 */
import path from 'path';
import { BaseCommand } from './base.js';

/**
 * Key mapping from legacy camelCase JSON keys to FINQU_ env keys
 */
const LEGACY_KEY_MAP = {
  themeId: 'FINQU_THEME_ID',
  themeDir: 'FINQU_THEME_DIR',
  apiVersion: 'FINQU_API_VERSION',
  endpoint: 'FINQU_ENDPOINT',
  authDomain: 'FINQU_AUTH_DOMAIN',
  accessToken: 'FINQU_ACCESS_TOKEN',
  refreshToken: 'FINQU_REFRESH_TOKEN',
  expiresAt: 'FINQU_EXPIRES_AT',
  resourceUrl: 'FINQU_RESOURCE_URL',
  merchant: 'FINQU_MERCHANT',
  appId: 'FINQU_APP_ID',
  appRealtimeUrl: 'FINQU_APP_REALTIME_URL',
  // Legacy snake_case equivalents
  theme_id: 'FINQU_THEME_ID',
  theme_dir: 'FINQU_THEME_DIR',
  api_version: 'FINQU_API_VERSION',
  auth_domain: 'FINQU_AUTH_DOMAIN',
  access_token: 'FINQU_ACCESS_TOKEN',
  refresh_token: 'FINQU_REFRESH_TOKEN',
  expires_at: 'FINQU_EXPIRES_AT',
  resource_url: 'FINQU_RESOURCE_URL',
  app_id: 'FINQU_APP_ID',
  app_realtime_url: 'FINQU_APP_REALTIME_URL',
};

/**
 * Store sub-key mapping
 */
const STORE_KEY_MAP = {
  merchantId: 'FINQU_STORE_MERCHANT_ID',
  id: 'FINQU_STORE_ID',
  themeId: 'FINQU_STORE_THEME_ID',
  versionId: 'FINQU_STORE_VERSION_ID',
  domain: 'FINQU_STORE_DOMAIN',
};

export class MigrateCommand extends BaseCommand {
  get name() {
    return 'migrate';
  }

  get description() {
    return 'Migrate legacy finqu.config.json to .env format.';
  }

  get group() {
    return null;
  }

  get options() {
    return [
      {
        flags: '--json-config <path>',
        description:
          'Path to legacy finqu.config.json (default: ./finqu.config.json)',
      },
      {
        flags: '--output <path>',
        description: 'Path to output .env file (default: ./.env)',
      },
      {
        flags: '--force',
        description: 'Overwrite existing .env file without prompting',
      },
    ];
  }

  async execute(args, options = {}) {
    const jsonPath =
      options.jsonConfig || path.join(process.cwd(), 'finqu.config.json');
    const envPath = options.output || path.join(process.cwd(), '.env');

    // Check if legacy config exists
    if (!(await this.fileSystem.exists(jsonPath))) {
      this.logger.printError(`Legacy config file not found: ${jsonPath}`);
      return { success: false };
    }

    // Check if .env already exists
    if (!options.force && (await this.fileSystem.exists(envPath))) {
      this.logger.printError(
        `.env file already exists at ${envPath}. Use --force to overwrite.`,
      );
      return { success: false };
    }

    // Read and parse legacy config
    let legacyConfig;
    try {
      const content = await this.fileSystem.readFile(jsonPath, 'utf-8');
      legacyConfig = JSON.parse(content);
    } catch (e) {
      this.logger.printError(`Failed to parse ${jsonPath}: ${e.message}`);
      return { success: false };
    }

    // Determine which environment to use
    const envNames = Object.keys(legacyConfig);
    if (envNames.length === 0) {
      this.logger.printError('No environments found in legacy config.');
      return { success: false };
    }

    // Use 'production' if available, otherwise first environment
    const primaryEnv = envNames.includes('production')
      ? 'production'
      : envNames[0];

    if (envNames.length > 1) {
      const otherEnvs = envNames.filter((e) => e !== primaryEnv).join(', ');
      this.logger.printInfo(
        `Multiple environments found. Using "${primaryEnv}". Skipping: ${otherEnvs}`,
      );
    }

    const data = legacyConfig[primaryEnv] || {};

    // Read existing .env content to preserve non-FINQU keys (like FINQU_API_CLIENT_ID)
    let existingNonFinquLines = [];
    if (await this.fileSystem.exists(envPath)) {
      try {
        const existingContent = await this.fileSystem.readFile(
          envPath,
          'utf-8',
        );
        existingNonFinquLines = existingContent.split('\n').filter((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return true;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) return true;
          const key = trimmed.slice(0, eqIdx).trim();
          // Keep lines that are NOT FINQU_ config keys (they'll be regenerated)
          return (
            !key.startsWith('FINQU_') ||
            key === 'FINQU_API_CLIENT_ID' ||
            key === 'FINQU_API_CLIENT_SECRET'
          );
        });
      } catch {
        // ignore read errors
      }
    }

    // Build env lines
    const envLines = [];
    let migratedCount = 0;

    for (const [key, value] of Object.entries(data)) {
      if (key === 'store' && value && typeof value === 'object') {
        // Flatten store object
        for (const [subKey, subValue] of Object.entries(value)) {
          const envKey = STORE_KEY_MAP[subKey];
          if (envKey) {
            envLines.push(`${envKey}=${subValue}`);
            migratedCount++;
            this.logger.printVerbose(`  ${key}.${subKey} → ${envKey}`);
          }
        }
      } else {
        const envKey = LEGACY_KEY_MAP[key];
        if (envKey) {
          envLines.push(`${envKey}=${value}`);
          migratedCount++;
          this.logger.printVerbose(`  ${key} → ${envKey}`);
        } else {
          this.logger.printVerbose(`  Skipping unknown key: ${key}`);
        }
      }
    }

    if (migratedCount === 0) {
      this.logger.printError('No recognized keys found in legacy config.');
      return { success: false };
    }

    // Combine existing non-FINQU lines with new FINQU lines
    const allLines = [...existingNonFinquLines];
    // Remove trailing empty lines from existing
    while (allLines.length > 0 && allLines[allLines.length - 1].trim() === '') {
      allLines.pop();
    }
    if (allLines.length > 0) {
      allLines.push(''); // blank separator
    }
    allLines.push(...envLines);
    allLines.push(''); // trailing newline

    // Write .env file
    try {
      await this.fileSystem.writeFile(envPath, allLines.join('\n'));
    } catch (e) {
      this.logger.printError(`Failed to write ${envPath}: ${e.message}`);
      return { success: false };
    }

    this.logger.printSuccess(
      `Migrated ${migratedCount} key(s) from ${jsonPath} to ${envPath}`,
    );
    this.logger.print('');
    this.logger.printInfo(
      `You can now delete the legacy config file: rm ${jsonPath}`,
    );

    return { success: true, migratedCount };
  }
}

export function createMigrateCommand(app) {
  return new MigrateCommand(app);
}
