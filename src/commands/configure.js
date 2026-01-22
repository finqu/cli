/**
 * Configure command for Finqu Theme Kit
 * Handles theme configuration setup
 */
import prompts from 'prompts';
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';

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
    // No command-line options for configure, it's always interactive
    return [];
  }

  /**
   * Execute the configure command
   * @param {Object} options Command options
   * @param {string} options.configPath Path to the configuration file (optional)
   * @returns {Promise<Object>} Command result
   */
  async execute(options) {
    // configPath validation removed as it's provided by default in CLI
    this.logger.printStatus('Configuring theme...');

    try {
      // Prompt for store or theme configuration
      await this.promptForConfigType(options);

      // Save configuration
      await this.config.saveConfig();

      this.logger.printSuccess('Configuration completed successfully');
      return { success: true };
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
          domain: selectedStore.technical_domain,
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
