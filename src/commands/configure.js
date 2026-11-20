/**
 * Configure command for Finqu CLI
 * Handles theme configuration setup
 */
import prompts from 'prompts';
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { UsageError } from '../core/non-interactive.js';

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Derive a storefront domain hostname from channel urls[].base.
 * @param {Array<{base?: string}>|undefined} urls Channel URL entries
 * @returns {string|null} Hostname or null when unavailable
 */
function channelDomainFromUrls(urls) {
  const base = Array.isArray(urls) && urls[0] ? urls[0].base : null;
  if (!base || typeof base !== 'string') {
    return null;
  }

  try {
    return new URL(base).hostname || null;
  } catch {
    // Accept bare hostnames without a scheme
    const trimmed = base.replace(/^\/\//, '').split('/')[0];
    return trimmed || null;
  }
}

/**
 * ConfigureCommand class for setting up theme configuration
 */
export class ConfigureCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'configure';
  }

  /**
   * Get command group
   * @returns {string} Command group
   */
  get group() {
    return 'theme';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  get description() {
    return 'Configure Finqu theme configuration.';
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [
      {
        flags: '--channel <id>',
        description: 'Sales channel id (skips the prompts, needs --theme and --version)',
      },
      {
        flags: '--theme <id>',
        description: 'Theme id (skips the prompts, needs --channel and --version)',
      },
      {
        flags: '--version <name>',
        description:
          'Theme version (release name); must exist on the theme (skips the prompts)',
      },
      {
        flags: '--resource-url <url>',
        description: 'API host to use instead of the one stored by sign-in',
      },
    ];
  }

  /**
   * Execute the configure command
   * @param {Object} options Command options
   * @param {string} [options.channel] Sales channel id
   * @param {string} [options.theme] Theme id
   * @param {string} [options.version] Theme version (release name)
   * @param {string} [options.resourceUrl] API host
   * @returns {Promise<Object>} Command result
   */
  async execute(options = {}) {
    this.logger.printStatus('Configuring theme...');

    try {
      if (options.resourceUrl !== undefined) {
        this.config.set('resourceUrl', this.parseResourceUrl(options.resourceUrl), true);
      }

      const usesFlags = ['channel', 'theme', 'version'].some(
        (key) => options[key] !== undefined,
      );

      if (usesFlags || this.isNonInteractive()) {
        await this.configureFromFlags(options);
      } else {
        await this.promptForConfigType(options);
      }

      await this.config.saveConfig();

      this.logger.printSuccess('Configuration completed successfully');
      const store = this.config.get('store');
      return {
        success: true,
        store: store
          ? {
              channelId: store.id,
              themeId: store.themeId,
              version: store.versionId,
              resourceUrl: this.config.get('resourceUrl'),
            }
          : undefined,
      };
    } catch (err) {
      if (err instanceof AppError) {
        this.logger.printError(err.message);
        return { success: false, error: err };
      }

      this.logger.handleError(err);
      return { success: false, error: err };
    }
  }

  /**
   * Validate and normalize an API host given with --resource-url
   * @param {string} value Raw flag value
   * @returns {string} URL without a trailing slash
   * @throws {UsageError} When the value is not a plain http(s) URL
   * @private
   */
  parseResourceUrl(value) {
    let url;
    try {
      url = new URL(String(value));
    } catch {
      throw new UsageError('--resource-url is not a valid URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new UsageError(
        '--resource-url must be an http(s) URL without credentials',
      );
    }
    return url.href.replace(/\/+$/, '');
  }

  /**
   * Configure from --channel, --theme and --version without any prompt.
   * The version must be one the API lists for the theme, so a typo or a
   * release the caller may not use is refused before anything is saved.
   * @param {Object} options Command options
   * @returns {Promise<void>}
   * @throws {UsageError} When a flag is missing or malformed
   * @throws {AppError} When the version is unknown or cannot be checked
   * @private
   */
  async configureFromFlags(options) {
    const required = [
      ['channel', '--channel'],
      ['theme', '--theme'],
      ['version', '--version'],
    ];
    const missing = required
      .filter(([key]) => !options[key])
      .map(([, flag]) => flag);
    if (missing.length > 0) {
      throw new UsageError(
        `Missing ${missing.join(', ')}. Without prompts, theme configure needs --channel, --theme and --version.`,
      );
    }

    const channel = String(options.channel);
    const theme = String(options.theme);
    const version = String(options.version);

    // Both ids are placed into API paths, so only plain identifiers pass.
    for (const [flag, value] of [
      ['--channel', channel],
      ['--theme', theme],
    ]) {
      if (!ID_PATTERN.test(value) || /^\.+$/.test(value)) {
        throw new UsageError(`${flag} is not a valid id: ${value}`);
      }
    }

    const merchantId = this.config.get('merchant');
    const previous = this.config.get('store');

    let versions;
    try {
      versions = await this.app.services.themeApi.listVersions(
        merchantId,
        { id: channel },
        theme,
      );
    } catch (err) {
      throw AppError.configError(
        `Could not list versions of theme ${theme} on channel ${channel}`,
        err,
      );
    }

    if (!Array.isArray(versions) || !versions.some((v) => String(v.id) === version)) {
      throw new AppError(
        `Unknown version "${version}" for theme ${theme} on channel ${channel}`,
        'UNKNOWN_VERSION',
      );
    }

    // The stored domain belongs to the previous channel.
    if (previous?.id !== undefined && String(previous.id) !== channel) {
      this.config.remove('storeDomain');
    }

    this.config.set(
      'store',
      {
        merchantId: merchantId ?? previous?.merchantId,
        id: channel,
        themeId: theme,
        versionId: version,
      },
      true,
    );
  }

  /**
   * Prompt user to configure store theme
   * @param {Object} options Command options
   * @returns {Promise<void>}
   * @private
   */
  async promptForConfigType(options) {
    try {
      await this.configureForStore(options);
    } catch (err) {
      throw AppError.configError('Failed to configure store', err);
    }
  }

  /**
   * Configure for Store theme
   * @param {Object} options Command options
   * @param {string} apiRoot API root URL
   * @returns {Promise<void>}
   * @private
   */
  async configureForStore(options) {
    try {
      let selectedStore = null;
      let selectedTheme = null;
      let selectedVersion = null;

      // Step 1: Select a store
      // Get merchantId from config - set during sign-in from profile service
      const merchantId = this.config.get('merchant');
      const stores = await this.app.services.themeApi.listStores(merchantId);

      if (!stores || !stores.length) {
        throw AppError.configError('No stores found');
      }

      let response = await prompts(
        [
          {
            type: 'select',
            name: 'store',
            message: 'Which store would you like to setup?',
            choices: stores.map((store) => ({
              title: `${store.name}`,
              value: store,
            })),
          },
        ],
        {
          onCancel: () => {
            this.logger.printError('Configuration cancelled');
            process.exit(1);
          },
        },
      );

      selectedStore = response.store;

      if (!selectedStore) {
        throw AppError.configError('No store selected');
      }

      // Step 2: Select a theme for this store
      const themes = await this.app.services.themeApi.listThemes(
        merchantId,
        selectedStore,
      );

      if (!themes || !themes.length) {
        throw AppError.configError('No themes found for selected store');
      }

      response = await prompts(
        [
          {
            type: 'select',
            name: 'theme',
            message: 'On which theme would you like to work with?',
            choices: themes.map((theme) => ({
              title: theme.name,
              value: theme.id,
            })),
          },
        ],
        {
          onCancel: () => {
            this.logger.printError('Configuration cancelled');
            process.exit(1);
          },
        },
      );

      selectedTheme = response.theme;

      if (!selectedTheme) {
        throw AppError.configError('No theme selected');
      }

      // Step 3: Select a version for this theme
      const versions = await this.app.services.themeApi.listVersions(
        merchantId,
        selectedStore,
        selectedTheme,
      );

      if (!versions || !versions.length) {
        throw AppError.configError('No versions found for selected theme');
      }

      response = await prompts(
        [
          {
            type: 'select',
            name: 'version',
            message: 'On which version would you like to work with?',
            choices: versions.map((version) => ({
              title: [version.id, version.comment].join(' - '),
              value: version.id,
            })),
          },
        ],
        {
          onCancel: () => {
            this.logger.printError('Configuration cancelled');
            process.exit(1);
          },
        },
      );

      selectedVersion = response.version;

      if (!selectedVersion) {
        throw AppError.configError('No version selected');
      }

      // Set store configuration
      this.config.set(
        'store',
        {
          merchantId: merchantId,
          id: selectedStore.id,
          themeId: selectedTheme,
          versionId: selectedVersion,
          domain: channelDomainFromUrls(selectedStore.urls),
        },
        true,
      );
    } catch (err) {
      throw AppError.configError('Failed to configure store', err);
    }
  }
}

/**
 * Factory function to create a ConfigureCommand
 * @param {Object} app Application instance
 * @returns {ConfigureCommand} A new command instance
 */
export function createConfigureCommand(app) {
  return new ConfigureCommand(app);
}
