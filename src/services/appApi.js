/**
 * App API service for Finqu CLI
 * Handles all app management API operations
 */
import { AppError } from '../core/error.js';

const DEFAULT_AUTH_DOMAIN = 'account.finqu.com';

/**
 * AppApi class for managing app operations
 */
export class AppApi {
  /**
   * Create a new AppApi service
   * @param {Object} httpClient HTTP client
   * @param {Object} tokenManager Token manager
   * @param {Object} logger Logger instance
   * @param {Object} config Configuration object
   */
  constructor(httpClient, tokenManager, logger, config) {
    this.httpClient = httpClient;
    this.tokenManager = tokenManager;
    this.logger = logger;
    this.config = config;

    const authDomain = config.get('authDomain', DEFAULT_AUTH_DOMAIN);
    this.baseUrl = `https://${authDomain}/api/external/v1/developer/apps`;
  }

  /**
   * Ensure a valid access token is available before making API calls
   * @returns {Promise<string>} Valid access token
   */
  async _ensureAuth() {
    return this.tokenManager.ensureValidToken();
  }

  /**
   * Make a GET request to the app API
   * @param {string} path URL path relative to base
   * @returns {Promise<Object>} Response data
   */
  async _get(path) {
    await this._ensureAuth();
    const url = `${this.baseUrl}${path}`;
    this.logger.printVerbose(`GET ${url}`);
    return this.httpClient.get(url);
  }

  /**
   * Make a POST request with form-encoded body
   * @param {string} path URL path relative to base
   * @param {Object} data Form data
   * @returns {Promise<Object>} Response data
   */
  async _post(path, data = {}) {
    await this._ensureAuth();
    const url = `${this.baseUrl}${path}`;
    this.logger.printVerbose(`POST ${url}`);
    return this.httpClient.request({
      url,
      method: 'POST',
      form: data,
    });
  }

  /**
   * Make a PUT request with form-encoded body
   * @param {string} path URL path relative to base
   * @param {Object} data Form data
   * @returns {Promise<Object>} Response data
   */
  async _put(path, data = {}) {
    await this._ensureAuth();
    const url = `${this.baseUrl}${path}`;
    this.logger.printVerbose(`PUT ${url}`);
    return this.httpClient.request({
      url,
      method: 'PUT',
      form: data,
    });
  }

  /**
   * Make a DELETE request
   * @param {string} path URL path relative to base
   * @returns {Promise<Object>} Response data
   */
  async _delete(path) {
    await this._ensureAuth();
    const url = `${this.baseUrl}${path}`;
    this.logger.printVerbose(`DELETE ${url}`);
    return this.httpClient.delete(url);
  }

  /**
   * List all apps owned by the authenticated partner
   * @returns {Promise<Array>} Array of app objects
   */
  async listApps() {
    return this._get('');
  }

  /**
   * Get full app details
   * @param {number|string} appId App ID
   * @returns {Promise<Object>} App details
   */
  async getApp(appId) {
    return this._get(`/${appId}`);
  }

  /**
   * Create a new draft app
   * @param {string} name App display name
   * @param {Object} [configuration] Optional initial configuration
   * @returns {Promise<Object>} Created app with id
   */
  async createApp(name, configuration) {
    const data = { name };
    if (configuration) {
      data.configuration = JSON.stringify(configuration);
    }
    return this._post('', data);
  }

  /**
   * Update an existing app
   * @param {number|string} appId App ID
   * @param {Object} data Update data
   * @param {string} [data.configuration] Configuration JSON string
   * @param {Object} [data.listing] Listing data keyed by locale
   * @param {string} [data.redirect_uri] OAuth redirect URI
   * @param {Array|null} [data.locations] Country codes or null for all
   * @returns {Promise<void>}
   */
  async updateApp(appId, data) {
    const formData = {};
    if (data.configuration) {
      formData.configuration =
        typeof data.configuration === 'string'
          ? data.configuration
          : JSON.stringify(data.configuration);
    }
    if (data.listing) {
      formData.listing =
        typeof data.listing === 'string'
          ? data.listing
          : JSON.stringify(data.listing);
    }
    if (data.redirect_uri !== undefined) {
      formData.redirect_uri = data.redirect_uri;
    }
    if (data.locations !== undefined) {
      formData.locations =
        data.locations === null ? null : JSON.stringify(data.locations);
    }
    return this._put(`/${appId}`, formData);
  }

  /**
   * Delete an app
   * @param {number|string} appId App ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteApp(appId) {
    return this._delete(`/${appId}`);
  }

  /**
   * Get or create a share link for the app
   * @param {number|string} appId App ID
   * @returns {Promise<Object>} Share token and URL
   */
  async getShareLink(appId) {
    return this._get(`/${appId}/share-token`);
  }

  /**
   * Publish an app
   * @param {number|string} appId App ID
   * @returns {Promise<void>}
   */
  async publishApp(appId) {
    return this._post(`/${appId}/publish`);
  }

  /**
   * Unpublish an app
   * @param {number|string} appId App ID
   * @returns {Promise<void>}
   */
  async unpublishApp(appId) {
    return this._post(`/${appId}/unpublish`);
  }

  /**
   * Release a new version
   * @param {number|string} appId App ID
   * @param {Object} options Version options
   * @param {string} [options.version] Explicit version (MAJOR.MINOR.PATCH)
   * @param {string} [options.type] Bump type: major, minor, or patch
   * @param {string} [options.changelog] Release notes
   * @returns {Promise<Object>} Version info
   */
  async releaseVersion(appId, options = {}) {
    const data = {};
    if (options.version) {
      data.version = options.version;
    }
    if (options.type) {
      data.type = options.type;
    }
    if (options.changelog) {
      data.changelog = options.changelog;
    }
    return this._post(`/${appId}/versions`, data);
  }

  /**
   * Rotate the OAuth client secret
   * @param {number|string} appId App ID
   * @returns {Promise<Object>} New secret and creation timestamp
   */
  async rotateSecret(appId) {
    return this._post(`/${appId}/rotate-secret`);
  }
}

/**
 * Factory function to create an AppApi service
 * @param {Object} httpClient HTTP client
 * @param {Object} tokenManager Token manager
 * @param {Object} logger Logger instance
 * @param {Object} config Configuration object
 * @returns {AppApi} A new AppApi instance
 */
export function createAppApi(httpClient, tokenManager, logger, config) {
  return new AppApi(httpClient, tokenManager, logger, config);
}
