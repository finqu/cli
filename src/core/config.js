/**
 * Configuration module for Finqu Theme Kit
 * Handles all configuration state and persistence with improved testability
 */
import path from 'path';

/**
 * Configuration manager class
 */
export class ConfigManager {
  /**
   * Creates a new configuration manager
   * @param {Object} fileSystem Injected file system service
   * @param {string} configFilePath Path to configuration file
   * @param {Object} initialData Optional initial configuration data to merge
   */
  constructor(fileSystem, configFilePath, initialData = {}) {
    this.environments = {}; // Start with empty environments
    this.environment = 'production';
    this.persistentKeys = new Set();
    this.fileSystem = fileSystem;
    this.configFilePath = configFilePath;

    // Merge initial data (e.g., from CLI options)
    this.mergeData(initialData);
  }

  /**
   * Merges new data into the current configuration, prioritizing existing values.
   * @param {Object} data Data to merge (typically environments object)
   */
  mergeData(data) {
    for (const env in data) {
      if (!this.environments[env]) {
        this.environments[env] = {};
      }
      for (const key in data[env]) {
        // Only set if the key doesn't already exist in the current environment
        if (!(key in this.environments[env])) {
          this.environments[env][key] = data[env][key];
        }
      }
    }
  }

  /**
   * Set environment
   * @param {string} env Environment name
   * @returns {ConfigManager} Instance for chaining
   */
  env(env) {
    this.environment = env;
    return this;
  }

  /**
   * Set configuration value
   * @param {string} key Configuration key
   * @param {*} value Configuration value
   * @param {boolean} persistent Whether this value should be saved to disk
   * @returns {ConfigManager} Instance for chaining
   */
  set(key, value, persistent = false) {
    if (!this.environments[this.environment]) {
      this.environments[this.environment] = {};
    }

    this.environments[this.environment][key] = value;

    if (persistent) {
      this.persistentKeys.add(key);
    }

    return this;
  }

  /**
   * Get configuration value
   * @param {string} key Configuration key
   * @param {*} defaultValue Default value
   * @returns {*} Configuration value
   */
  get(key, defaultValue = null) {
    if (!this.environments[this.environment]) {
      return defaultValue;
    }

    // Check for camelCase first (new format)
    if (key in this.environments[this.environment]) {
      return this.environments[this.environment][key];
    }

    // Check for snake_case (backwards compatibility)
    const snakeCaseKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (snakeCaseKey in this.environments[this.environment]) {
      return this.environments[this.environment][snakeCaseKey];
    }

    // Check for camelCase conversion from snake_case input
    const camelCaseKey = key.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase());
    if (camelCaseKey in this.environments[this.environment]) {
      return this.environments[this.environment][camelCaseKey];
    }

    return defaultValue;
  }

  /**
   * Remove configuration value
   * @param {string} key Configuration key
   * @returns {ConfigManager} Instance for chaining
   */
  remove(key) {
    if (!this.environments[this.environment]) {
      return this;
    }

    delete this.environments[this.environment][key];
    this.persistentKeys.delete(key);
    return this;
  }

  /**
   * Get a copy of the configuration that only includes persistent keys
   * @returns {Object} Persistent configuration object
   */
  getPersistentConfig() {
    const result = {};

    for (const env in this.environments) {
      result[env] = {};

      for (const key in this.environments[env]) {
        // Only include persistent keys or keys that should always be persisted
        if (
          this.persistentKeys.has(key) ||
          [
            'themeId',
            'themeDir',
            'apiVersion',
            'endpoint',
            'authDomain',
            'store',
            'accessToken',
            'refreshToken',
            'expiresAt',
            'resourceUrl',
            'merchant',
          ].includes(key)
        ) {
          result[env][key] = this.environments[env][key];
        }
      }
    }

    return result;
  }

  /**
   * Load configuration from file and merge it with existing data.
   * Existing data (like initialData from constructor) takes precedence.
   * @returns {Promise<boolean>} True if successful
   */
  async loadConfig() {
    try {
      if (await this.fileSystem.exists(this.configFilePath)) {
        const fileContent = await this.fileSystem.readFile(
          this.configFilePath,
          'utf-8',
        );
        const loadedData = JSON.parse(fileContent);

        // Merge loaded data, ensuring existing values are not overwritten
        for (const env in loadedData) {
          if (!this.environments[env]) {
            this.environments[env] = {};
          }
          for (const key in loadedData[env]) {
            // Only add if the key doesn't already exist for this environment
            if (!(key in this.environments[env])) {
              this.environments[env][key] = loadedData[env][key];
            }
          }
        }
      } else {
        // Config file doesn't exist, no data to load/merge
        // Keep existing data (initialData)
      }
      return true;
    } catch (e) {
      // Don't throw if the file is just missing or empty, but log if parsing fails
      if (e instanceof SyntaxError) {
        console.error(
          `Warning: Error parsing configuration file ${this.configFilePath}: ${e.message}`,
        );
      } else if (e.code !== 'ENOENT') {
        // Log other read errors
        console.error(
          `Warning: Error reading configuration file ${this.configFilePath}: ${e.message}`,
        );
      }
      // Continue even if loading fails, using defaults/initialData
      return false;
    }
  }

  /**
   * Save configuration to file
   * @returns {Promise<boolean>} True if successful
   */
  async saveConfig() {
    try {
      const dir = path.dirname(this.configFilePath);
      if (!(await this.fileSystem.exists(dir))) {
        await this.fileSystem.mkdir(dir, { recursive: true });
      }

      const persistentConfig = this.getPersistentConfig();
      await this.fileSystem.writeFile(
        this.configFilePath,
        JSON.stringify(persistentConfig, null, 2),
      );
      return true;
    } catch (e) {
      throw new Error(`Error writing configuration file: ${e.message}`);
    }
  }

  /**
   * Save a specific configuration value to file
   * @param {string} key Configuration key
   * @param {*} value Configuration value
   * @param {string} environment Optional environment name
   * @returns {Promise<boolean>} True if successful
   */
  async saveConfigValue(key, value, environment = null) {
    // Skip saving functions
    if (typeof value === 'function') {
      return true;
    }

    // Use specified environment or current one
    const env = environment || this.environment;

    // Set the value in the config manager as persistent
    if (!this.environments[env]) {
      this.environments[env] = {};
    }
    this.environments[env][key] = value;
    this.persistentKeys.add(key);

    try {
      const dir = path.dirname(this.configFilePath);
      if (!(await this.fileSystem.exists(dir))) {
        await this.fileSystem.mkdir(dir, { recursive: true });
      }

      // Read existing config file if it exists
      let existingConfig = {};
      if (await this.fileSystem.exists(this.configFilePath)) {
        try {
          const fileContent = await this.fileSystem.readFile(
            this.configFilePath,
            'utf-8',
          );
          existingConfig = JSON.parse(fileContent);
        } catch (readError) {
          // Could not read existing config, create new one
        }
      }

      // Make sure the environment exists in the config
      if (!existingConfig[env]) {
        existingConfig[env] = {};
      }

      // Update only the specific key
      existingConfig[env][key] = value;

      // Filter out any function properties from the entire config
      const filteredConfig = {};
      for (const e in existingConfig) {
        filteredConfig[e] = {};
        for (const k in existingConfig[e]) {
          if (typeof existingConfig[e][k] !== 'function') {
            filteredConfig[e][k] = existingConfig[e][k];
          }
        }
      }

      await this.fileSystem.writeFile(
        this.configFilePath,
        JSON.stringify(filteredConfig, null, 2),
      );
      return true;
    } catch (e) {
      throw new Error(
        `Error writing configuration key ${key} to file: ${e.message}`,
      );
    }
  }
}

/**
 * Factory function to create config manager
 * @param {Object} fileSystem File system instance
 * @param {string} configFilePath Path to configuration file
 * @param {Object} initialData Optional initial data
 * @returns {Promise<ConfigManager>} New config manager instance
 */
export async function createConfigManager(
  fileSystem,
  configFilePath,
  initialData = {},
) {
  const configManager = new ConfigManager(
    fileSystem,
    configFilePath,
    initialData,
  );
  // Load config after initializing with initialData
  await configManager.loadConfig();

  return configManager;
}
