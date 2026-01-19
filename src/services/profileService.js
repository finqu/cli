/**
 * Profile Service for Finqu Theme Kit
 * Handles user profile and merchant information
 */

/**
 * ProfileService class for OAuth resource operations
 */
export class ProfileService {
  /**
   * Create a new ProfileService
   * @param {Object} httpClient HTTP client
   * @param {Object} configManager Configuration manager
   * @param {Object} logger Logger instance
   */
  constructor(httpClient, configManager, logger) {
    this.httpClient = httpClient;
    this.configManager = configManager;
    this.logger = logger;
    this.selectedMerchant = null;
  }

  /**
   * Gets the OAuth resource information containing merchant and API endpoint details
   * @returns {Promise<Object>} Promise that resolves with profile data
   */
  async getProfile() {
    // Use the authDomain for OAuth resource endpoint
    const authDomain = this.configManager.get(
      'authDomain',
      'account.finqu.com',
    );
    const endpoint = `https://${authDomain}/oauth2/resource`;
    this.logger.printVerbose(
      `Fetching OAuth resource information from ${endpoint}`,
    );

    try {
      const response = await this.httpClient.get(endpoint);
      this.logger.printVerbose('OAuth resource fetch complete');
      return response;
    } catch (err) {
      this.logger.printVerbose('Failed to fetch resource endpoint information');
      throw err;
    }
  }

  /**
   * Gets the API URL from OAuth resource response
   * @param {string} configurationFile Path to the configuration file
   * @returns {Promise<string>} Promise that resolves with the API URL
   */
  async getAPIUrl() {
    // First check for resource URL saved during OAuth sign-in
    const resourceUrl = this.configManager.get('resourceUrl');
    if (resourceUrl) {
      this.logger.printVerbose(
        `Using resourceUrl from configuration: ${resourceUrl}`,
      );
      return resourceUrl;
    }

    // Otherwise try to get merchant endpoint from cached profile
    if (this.selectedMerchant) {
      this.logger.printVerbose(
        `Using API endpoint from cached merchant: ${this.selectedMerchant.endpoints.api}`,
      );
      return this.selectedMerchant.endpoints.api;
    }

    try {
      const profile = await this.getProfile();

      if (profile.merchant) {
        this.selectedMerchant = profile.merchant;

        // Save merchant ID to configuration
        this.configManager.set('merchant', this.selectedMerchant.id);

        // If we have the endpoints.api, also save it as resourceUrl for future use
        if (
          this.selectedMerchant.endpoints &&
          this.selectedMerchant.endpoints.api
        ) {
          this.configManager.set(
            'resourceUrl',
            this.selectedMerchant.endpoints.api,
          );

          await this.configManager.saveConfig();
        }

        this.logger.printVerbose(
          `Using API endpoint from merchant profile: ${this.selectedMerchant.endpoints.api}`,
        );
        return this.selectedMerchant.endpoints.api;
      } else {
        throw new Error('No merchant account found in OAuth resource response');
      }
    } catch (err) {
      this.logger.printError('Failed to get API URL', err);
      throw err;
    }
  }
}

/**
 * Factory function to create a ProfileService
 * @param {Object} httpClient HTTP client
 * @param {Object} configManager Configuration manager
 * @param {Object} logger Logger instance
 * @returns {ProfileService} A new ProfileService instance
 */
export function createProfileService(httpClient, configManager, logger) {
  return new ProfileService(httpClient, configManager, logger);
}
