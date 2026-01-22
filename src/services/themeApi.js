import path from 'path';
import mime from 'mime-types';
/**
 * Theme API service for Finqu Theme Kit
 * Handles all theme-related API operations
 */

/**
 * ThemeAPI class for managing theme operations
 */
export class ThemeApi {
  /**
   * Create a new ThemeAPI service
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
    this.apiRoot = config.get('resourceUrl');
    // Get API version from config or use default
    this.apiVersion = config.get('apiVersion', '1.2');

    if (!this.apiRoot) {
      logger.printError('API root URL not configured');
      throw new AppError(
        'API root URL not configured. Please sign in first with `finqu sign-in`',
      );
    }

    if (this.config.get('store')) {
      this.apiAssetPath = [
        this.apiRoot,
        this.apiVersion,
        'merchants',
        this.config.get('store').merchantId,
        'channels',
        this.config.get('store').id,
        'themes',
        this.config.get('store').themeId,
        'versions',
        this.config.get('store').versionId,
      ].join('/');
    }
  }

  /**
   * Sets the API asset path for theme operations
   * @param {string} apiAssetPath New API asset path
   */
  setApiAssetPath(apiAssetPath) {
    this.apiAssetPath = apiAssetPath;
    this.logger.printVerbose(`API asset path set to: ${apiAssetPath}`);
  }

  /**
   * Sets the API root URL
   * @param {string} apiRoot New API root URL
   */
  setApiRoot(apiRoot) {
    this.apiRoot = apiRoot;
    this.logger.printVerbose(`API root set to: ${apiRoot}`);
  }

  /**
   * Sets the API version
   * @param {string} apiVersion New API version
   */
  setApiVersion(apiVersion) {
    this.apiVersion = apiVersion;
    this.logger.printVerbose(`API version set to: ${apiVersion}`);
  }

  /**
   * Get the full API base URL including version
   * @returns {string} The full API base URL
   */
  getApiBase() {
    return `${this.apiRoot}/${this.apiVersion}`;
  }

  /**
   * Lists themes for a specific store
   * @param {string} merchantId Merchant ID
   * @param {Object} store Store object
   * @returns {Promise<Array>} List of themes
   */
  async listThemes(merchantId, store) {
    if (!store) {
      throw new Error('Store is required to list themes');
    }

    const endpoint = `${this.getApiBase()}/merchants/${merchantId}/channels/${store.id}/themes`;
    this.logger.printVerbose(`Fetching store themes from ${endpoint}`);

    try {
      return await this.httpClient.get(endpoint);
    } catch (err) {
      this.logger.printError('Failed to list themes', err);
      throw err;
    }
  }

  /**
   * Lists available versions for a specific theme within a store
   * @param {string} merchantId Merchant ID
   * @param {Object} store Store object
   * @param {string} themeId Theme ID
   * @returns {Promise<Array>} List of theme versions
   */
  async listVersions(merchantId, store, themeId) {
    const endpoint = `${this.getApiBase()}/merchants/${merchantId}/channels/${store.id}/themes/${themeId}/versions`;
    this.logger.printVerbose(`Fetching theme versions from ${endpoint}`);

    try {
      return await this.httpClient.get(endpoint);
    } catch (err) {
      this.logger.printError('Failed to list theme versions', err);
      throw err;
    }
  }

  /**
   * Lists stores accessible by the developer
   * @param {string} merchantId Merchant ID
   * @returns {Promise<Array>} List of stores
   */
  async listStores(merchantId) {
    const endpoint = `${this.getApiBase()}/merchants/${merchantId}/channels`;
    this.logger.printVerbose(`Fetching accessible stores from ${endpoint}`);

    try {
      return await this.httpClient.get(endpoint);
    } catch (err) {
      this.logger.printError('Failed to list stores', err);
      throw err;
    }
  }

  /**
   * Gets a list of assets, optionally filtered by a key/prefix
   * @param {string|null} assetKey Optional asset key or prefix
   * @returns {Promise<Array|Object>} List of assets or single asset content
   */
  async getAssets(assetKey = null) {
    if (!this.apiAssetPath) {
      throw new Error('API asset path is not set');
    }

    let endpoint = `${this.apiAssetPath}/assets`;

    if (assetKey) {
      const assetKeyParam = encodeURIComponent(`${assetKey}`);
      endpoint += `?asset[key]=${assetKeyParam}`;
      this.logger.printVerbose(
        `Fetching asset list for key '${assetKey}' from ${endpoint}`,
      );
    } else {
      this.logger.printVerbose(`Fetching full asset list from ${endpoint}`);
    }

    try {
      const response = await this.httpClient.get(endpoint, {
        forever: true,
        timeout: 12000,
        gzip: true,
      });

      return response;
    } catch (err) {
      // For specific asset requests that fail, format the error message to be more user-friendly
      if (assetKey) {
        const errorMessage =
          err.error ||
          (err.status === 404
            ? `File not found: ${assetKey}`
            : 'Failed to retrieve asset');

        // Use a single error message instead of logging multiple errors
        throw {
          status: err.status || 500,
          error: errorMessage,
        };
      } else {
        throw err; // For general asset listing, just pass through the error
      }
    }
  }

  /**
   * Triggers the asset compilation process on the server
   * @returns {Promise<void>} Promise that resolves when compilation is done
   */
  async compileAssets() {
    if (!this.apiAssetPath) {
      throw new Error('API asset path not set');
    }

    // apiAssetPath already includes the API version
    const endpoint = `${this.apiAssetPath}/assets/compile`;
    this.logger.printVerbose(`Triggering asset compilation at ${endpoint}`);

    try {
      await this.httpClient.put(endpoint, {});
      this.logger.printVerbose('Compile request successful');
    } catch (err) {
      this.logger.printError('Failed to trigger asset compilation', err);
      throw err;
    }
  }

  /**
   * Removes an asset from the server
   * @param {string} assetKey Asset key
   * @param {boolean} silent Whether to ignore errors
   * @returns {Promise<void>} Promise that resolves when asset is removed
   */
  async removeAsset(assetKey, silent = false) {
    if (!this.apiAssetPath) {
      throw new Error('API asset path not set');
    }

    // apiAssetPath already includes the API version
    const url = `${this.apiAssetPath}/assets?asset[key]=${encodeURIComponent(
      assetKey,
    )}`;
    this.logger.printVerbose(`Removing asset '${assetKey}' from ${url}`);

    try {
      await this.httpClient.delete(url);
      this.logger.printVerbose(`Asset '${assetKey}' removal complete`);
    } catch (err) {
      this.logger.printVerbose(`Asset '${assetKey}' removal error!`);

      if (!silent) {
        this.logger.printError(`Failed to remove asset '${assetKey}'`);
        this.logger.printVerbose(
          `Error details: ${err.message || JSON.stringify(err)}`,
        );
        throw err;
      } else {
        // If silent is true, we just log the error but don't reject
        this.logger.printVerbose(
          `Silently ignoring error for '${assetKey}': ${
            err.message || JSON.stringify(err)
          }`,
        );
      }
    }
  }

  /**
   * Downloads an asset from the server
   * @param {string} assetName Asset name
   * @param {string} filePath Local file path
   * @param {Object} fileSystem File system instance
   * @returns {Promise<boolean>} True if download was successful
   */
  async downloadAsset(assetName, filePath, fileSystem) {
    if (!this.apiAssetPath) {
      throw new Error('API asset path not set');
    }

    this.logger.printStatus(`Downloading asset: ${assetName}`);
    this.logger.printVerbose(`Asset content will be written to ${filePath}`);

    // Ensure directory exists
    const dirname = path.dirname(filePath);
    if (!(await fileSystem.exists(dirname))) {
      this.logger.printStatus(`Creating directory: ${dirname}`);
      await fileSystem.mkdir(dirname, { recursive: true });
    }

    if (await fileSystem.exists(filePath)) {
      const stats = await fileSystem.stat(filePath);

      if (!stats.isFile()) {
        this.logger.printVerbose(
          `Asset ${assetName} is directory, skipping sync`,
        );
        return false;
      }
    }

    try {
      return new Promise((resolve, reject) => {
        const file = fileSystem.createWriteStream(filePath);

        file.on('open', () => {
          const requestUrl = `${
            this.apiAssetPath
          }/assets?asset[key]=${encodeURIComponent(assetName)}`;

          // Use specific headers for downloading assets (match old-cli behavior)
          const assetHeaders = {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=0',
            Connection: 'keep-alive',
          };

          // Use httpClient.request with streaming option
          this.httpClient
            .request({
              url: requestUrl,
              method: 'GET',
              json: false, // Important: Set to false to get raw data
              encoding: null, // Get binary data
              stream: true, // Enable streaming
              headers: assetHeaders, // Pass the defined headers
              gzip: true, // Enable gzip compression
              forever: true, // Keep connections alive
            })
            .then((stream) => {
              stream
                .pipe(file)
                .on('finish', () => {
                  this.logger.printSuccess(`Downloaded asset: ${assetName}`);
                  this.logger.printVerbose(`Asset ${assetName} fetch complete`);
                  resolve(true);
                })
                .on('error', (error) => {
                  // Clean up the file if piping fails
                  file.destroy();
                  this.logger.printError(
                    `Failed to write asset to file: ${assetName}`,
                    error,
                  );
                  this.logger.printVerbose(`Asset ${assetName} write error!`);
                  reject(error);
                });

              stream.on('error', (error) => {
                // Clean up the file if the request stream errors
                file.destroy();
                this.logger.printError(
                  `Request stream failed for asset: ${assetName}`,
                  error,
                );
                reject(error);
              });
            })
            .catch((error) => {
              // Clean up the file if the initial request promise fails
              file.destroy();
              this.logger.printError(
                `HTTP request failed for asset: ${assetName}`,
                error,
              );
              reject(error);
            });
        });

        file.on('error', (error) => {
          this.logger.printError(
            `Failed to create write stream for: ${filePath}`,
            error,
          );
          reject(error);
        });
      });
    } catch (err) {
      this.logger.printError('An error occurred while downloading asset', err);
      throw err;
    }
  }

  /**
   * Uploads an asset to the server
   * @param {string} assetName Asset name
   * @param {string} filePath Local file path
   * @param {Object} fileSystem File system instance
   * @returns {Promise<boolean>} True if upload was successful
   */
  async uploadAsset(assetName, filePath, fileSystem) {
    if (!this.apiAssetPath) {
      throw new Error('API asset path not set');
    }

    this.logger.printStatus(`Uploading file: ${assetName}`);
    this.logger.printVerbose(`Reading file ${assetName} from ${filePath}`);

    try {
      // Check if file exists and is a file
      const stats = await fileSystem.stat(filePath);
      if (!stats.isFile()) {
        this.logger.printVerbose(
          `Asset ${assetName} is directory, skipping sync`,
        );
        return false;
      }
      // File size check (e.g., 10MB limit)
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      if (stats.size > MAX_SIZE) {
        this.logger.printError(
          `File ${assetName} is too large to upload (${(stats.size / 1024 / 1024).toFixed(2)} MB). Skipping.`,
        );
        return false;
      }
    } catch (err) {
      this.logger.printError(`File not found: ${filePath}`, err);
      throw err;
    }

    // Detect the MIME types, fallback for text-like files
    let mimeType = mime.lookup(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = [
      '.liquid',
      '.md',
      '.txt',
      '.json',
      '.xml',
      '.csv',
      '.js',
      '.css',
      '.scss',
      '.sass',
      '.html',
      '.htm',
      '.yml',
      '.yaml',
      '.ts',
    ];
    if (!mimeType || textExtensions.includes(ext)) {
      mimeType = 'text/plain';
      this.logger.printVerbose(`Falling back to text/plain for ${assetName}`);
    }

    this.logger.printVerbose(
      `Asset ${assetName} MIME-type detected as ${mimeType}`,
    );

    let body = {};
    try {
      // Handle text files and binary files differently
      if (
        mimeType.indexOf('text/') === 0 ||
        mimeType === 'inode/x-empty' ||
        mimeType.indexOf('application/json') === 0 ||
        mimeType.indexOf('application/xml') === 0
      ) {
        this.logger.printInfo(`Uploading ${assetName} as a plain text file`);

        const fileContent = await fileSystem.readFile(filePath, 'utf-8');
        body = {
          asset: {
            key: assetName,
            value: fileContent,
          },
        };
      } else {
        this.logger.printInfo(`Uploading ${assetName} as a binary file`);

        const binaryContent = await fileSystem.readFile(filePath, {
          encoding: 'base64',
        });
        body = {
          asset: {
            key: assetName,
            attachment: binaryContent,
          },
        };
      }

      this.logger.printVerbose(
        `Uploading asset ${assetName} to ${this.apiAssetPath}/assets`,
      );
      await this.httpClient.put(`${this.apiAssetPath}/assets`, body);
      this.logger.printSuccess(`Uploaded asset: ${assetName}`);
      this.logger.printVerbose(`Asset ${assetName} upload complete`);

      return true;
    } catch (err) {
      this.logger.printError(`Failed to upload asset: ${assetName}`, err);
      this.logger.printVerbose(`Asset ${assetName} upload error!`);
      throw err;
    }
  }
}

/**
 * Factory function to create a ThemeAPI serviceng asset ${assetName} to ${this.apiAssetPath}/assets`,
 * @param {Object} httpClient HTTP client );
 * @param {Object} tokenManager Token manager
 * @param {Object} logger Logger instance     await this.httpClient.put(`${this.apiAssetPath}/assets`, body);
 * @param {Object} config Configuration object      this.logger.printSuccess(`Uploaded asset: ${assetName}`);
 * @param {string} apiRoot API root URL   this.logger.printVerbose(`Asset ${assetName} upload complete`);
 * @param {string|null} apiAssetPath API asset path (optional)
 * @returns {ThemeApi} A new ThemeAPI instance
 */
export function createThemeApi(httpClient, tokenManager, logger, config) {
  return new ThemeApi(httpClient, tokenManager, logger, config);
}
