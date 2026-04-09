/**
 * Configuration module for Finqu CLI
 * Handles all configuration state and persistence using .env files
 */
import path from 'path';

/**
 * Mapping from camelCase internal keys to FINQU_ env keys.
 * Used for reading/writing .env files.
 */
const KEY_MAP = {
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
  storeMerchantId: 'FINQU_STORE_MERCHANT_ID',
  storeId: 'FINQU_STORE_ID',
  storeThemeId: 'FINQU_STORE_THEME_ID',
  storeVersionId: 'FINQU_STORE_VERSION_ID',
  storeDomain: 'FINQU_STORE_DOMAIN',
};

const REVERSE_KEY_MAP = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, k]),
);

/** Keys that are always written to disk when present */
const ALWAYS_PERSISTED = new Set(Object.keys(KEY_MAP));

/**
 * Parse .env file content into a key-value object.
 * Preserves raw string values; numeric conversion happens in get().
 * @param {string} content File content
 * @returns {Object} Parsed key-value pairs (using env key names like FINQU_*)
 */
export function parseEnvFile(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Serialize a flat key-value object to .env file content.
 * @param {Object} data Key-value pairs (using env key names like FINQU_*)
 * @returns {string} .env file content
 */
export function serializeEnvFile(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'function') continue;
    const str = String(value ?? '');
    lines.push(`${key}=${str}`);
  }
  lines.push(''); // trailing newline
  return lines.join('\n');
}

/**
 * Configuration manager class
 */
export class ConfigManager {
  /**
   * Creates a new configuration manager
   * @param {Object} fileSystem Injected file system service
   * @param {string} configFilePath Path to .env configuration file
   * @param {Object} initialData Optional initial configuration data (flat camelCase keys)
   */
  constructor(fileSystem, configFilePath, initialData = {}) {
    this.data = {};
    this.persistentKeys = new Set();
    this.fileSystem = fileSystem;
    this.configFilePath = configFilePath;

    // Merge initial data
    for (const key in initialData) {
      if (!(key in this.data)) {
        this.data[key] = initialData[key];
      }
    }
  }

  /**
   * Set configuration value
   * @param {string} key Configuration key (camelCase)
   * @param {*} value Configuration value
   * @param {boolean} persistent Whether this value should be saved to disk
   * @returns {ConfigManager} Instance for chaining
   */
  set(key, value, persistent = false) {
    // Special handling for 'store' object — flatten to individual keys
    if (key === 'store' && value && typeof value === 'object') {
      if (value.merchantId !== undefined)
        this.data.storeMerchantId = value.merchantId;
      if (value.id !== undefined) this.data.storeId = value.id;
      if (value.themeId !== undefined) this.data.storeThemeId = value.themeId;
      if (value.versionId !== undefined)
        this.data.storeVersionId = value.versionId;
      if (value.domain !== undefined) this.data.storeDomain = value.domain;
      if (persistent) {
        this.persistentKeys.add('storeMerchantId');
        this.persistentKeys.add('storeId');
        this.persistentKeys.add('storeThemeId');
        this.persistentKeys.add('storeVersionId');
        this.persistentKeys.add('storeDomain');
      }
      return this;
    }

    this.data[key] = value;

    if (persistent) {
      this.persistentKeys.add(key);
    }

    return this;
  }

  /**
   * Get configuration value
   * @param {string} key Configuration key (camelCase)
   * @param {*} defaultValue Default value
   * @returns {*} Configuration value
   */
  get(key, defaultValue = null) {
    // Special handling for 'store' — reconstruct object from flat keys
    if (key === 'store') {
      const merchantId = this.data.storeMerchantId;
      const id = this.data.storeId;
      const themeId = this.data.storeThemeId;
      const versionId = this.data.storeVersionId;
      const domain = this.data.storeDomain;

      if (
        merchantId === undefined &&
        id === undefined &&
        themeId === undefined &&
        versionId === undefined
      ) {
        return defaultValue;
      }

      return { merchantId, id, themeId, versionId, domain };
    }

    if (key in this.data) {
      return this.data[key];
    }

    return defaultValue;
  }

  /**
   * Remove configuration value
   * @param {string} key Configuration key
   * @returns {ConfigManager} Instance for chaining
   */
  remove(key) {
    delete this.data[key];
    this.persistentKeys.delete(key);
    return this;
  }

  /**
   * Get a copy of the configuration that only includes persistent keys,
   * serialized as FINQU_ env keys.
   * @returns {Object} Persistent configuration as env key-value pairs
   */
  getPersistentConfig() {
    const result = {};

    for (const [camelKey, envKey] of Object.entries(KEY_MAP)) {
      if (camelKey in this.data) {
        if (
          ALWAYS_PERSISTED.has(camelKey) ||
          this.persistentKeys.has(camelKey)
        ) {
          const value = this.data[camelKey];
          if (value !== undefined && typeof value !== 'function') {
            result[envKey] = value;
          }
        }
      }
    }

    // Also include any extra persistent keys not in KEY_MAP
    for (const key of this.persistentKeys) {
      if (!(key in KEY_MAP) && key in this.data) {
        const value = this.data[key];
        if (value !== undefined && typeof value !== 'function') {
          const envKey = `FINQU_${camelToScreamingSnake(key)}`;
          result[envKey] = value;
        }
      }
    }

    return result;
  }

  /**
   * Load configuration from .env file and merge with existing data.
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
        const envData = parseEnvFile(fileContent);

        for (const [envKey, rawValue] of Object.entries(envData)) {
          const camelKey = REVERSE_KEY_MAP[envKey];
          if (camelKey) {
            // Only set if not already present
            if (!(camelKey in this.data)) {
              this.data[camelKey] = coerceValue(rawValue);
            }
          }
          // Also keep unknown FINQU_ keys
          if (!camelKey && envKey.startsWith('FINQU_')) {
            const derivedKey = envKeyToCamel(envKey);
            if (!(derivedKey in this.data)) {
              this.data[derivedKey] = coerceValue(rawValue);
            }
          }
        }
      }
      return true;
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error(
          `Warning: Error reading configuration file ${this.configFilePath}: ${e.message}`,
        );
      }
      return false;
    }
  }

  /**
   * Save configuration to .env file
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
        serializeEnvFile(persistentConfig),
      );
      return true;
    } catch (e) {
      throw new Error(`Error writing configuration file: ${e.message}`);
    }
  }

  /**
   * Save a specific configuration value to the .env file.
   * Updates or adds the key in-place, preserving other entries.
   * @param {string} key Configuration key (camelCase)
   * @param {*} value Configuration value
   * @returns {Promise<boolean>} True if successful
   */
  async saveConfigValue(key, value) {
    if (typeof value === 'function') {
      return true;
    }

    this.data[key] = value;
    this.persistentKeys.add(key);

    const envKey = KEY_MAP[key] || `FINQU_${camelToScreamingSnake(key)}`;
    const envValue = String(value ?? '');

    try {
      const dir = path.dirname(this.configFilePath);
      if (!(await this.fileSystem.exists(dir))) {
        await this.fileSystem.mkdir(dir, { recursive: true });
      }

      // Read existing file to preserve other keys and comments
      let lines = [];
      if (await this.fileSystem.exists(this.configFilePath)) {
        try {
          const content = await this.fileSystem.readFile(
            this.configFilePath,
            'utf-8',
          );
          lines = content.split('\n');
        } catch {
          // Could not read existing file, start fresh
        }
      }

      // Find and replace the key if it exists, or append
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('#') || !trimmed) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const lineKey = trimmed.slice(0, eqIndex).trim();
        if (lineKey === envKey) {
          lines[i] = `${envKey}=${envValue}`;
          found = true;
          break;
        }
      }

      if (!found) {
        // Remove trailing empty lines, add the key, then add trailing newline
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
          lines.pop();
        }
        lines.push(`${envKey}=${envValue}`);
        lines.push('');
      }

      await this.fileSystem.writeFile(this.configFilePath, lines.join('\n'));
      return true;
    } catch (e) {
      throw new Error(
        `Error writing configuration key ${key} to file: ${e.message}`,
      );
    }
  }
}

/**
 * Convert camelCase string to SCREAMING_SNAKE_CASE
 * @param {string} str camelCase string
 * @returns {string} SCREAMING_SNAKE_CASE string
 */
function camelToScreamingSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Convert FINQU_SCREAMING_SNAKE env key to camelCase (without the FINQU_ prefix)
 * @param {string} envKey Env key like FINQU_SOME_KEY
 * @returns {string} camelCase key like someKey
 */
function envKeyToCamel(envKey) {
  const withoutPrefix = envKey.replace(/^FINQU_/, '');
  return withoutPrefix
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Coerce string values from .env to appropriate JS types.
 * Numbers become numbers, 'true'/'false' become booleans.
 * @param {string} value Raw string value
 * @returns {*} Coerced value
 */
function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '') return '';
  // Check if it's a numeric value (integer or float)
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return value;
}

/**
 * Factory function to create config manager
 * @param {Object} fileSystem File system instance
 * @param {string} configFilePath Path to .env configuration file
 * @param {Object} initialData Optional initial data (flat camelCase keys)
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
  await configManager.loadConfig();

  return configManager;
}
