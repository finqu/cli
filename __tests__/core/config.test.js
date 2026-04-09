import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  ConfigManager,
  createConfigManager,
  parseEnvFile,
  serializeEnvFile,
} from '../../src/core/config.js';
import path from 'path';

describe('ConfigManager', () => {
  let configManager;
  let mockFileSystem;
  const testConfigPath = '/test/.env';

  beforeEach(() => {
    mockFileSystem = {
      exists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    };

    mockFileSystem.exists.mockResolvedValue(false);
    configManager = new ConfigManager(mockFileSystem, testConfigPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseEnvFile', () => {
    test('should parse KEY=value lines', () => {
      const result = parseEnvFile(
        'FINQU_ACCESS_TOKEN=abc123\nFINQU_MERCHANT=42\n',
      );
      expect(result).toEqual({
        FINQU_ACCESS_TOKEN: 'abc123',
        FINQU_MERCHANT: '42',
      });
    });

    test('should skip comments and empty lines', () => {
      const result = parseEnvFile(
        '# This is a comment\n\nFINQU_APP_ID=7\n\n# Another comment\n',
      );
      expect(result).toEqual({ FINQU_APP_ID: '7' });
    });

    test('should strip surrounding quotes', () => {
      const result = parseEnvFile(
        'FINQU_ACCESS_TOKEN="quoted-value"\nFINQU_RESOURCE_URL=\'single-quoted\'\n',
      );
      expect(result).toEqual({
        FINQU_ACCESS_TOKEN: 'quoted-value',
        FINQU_RESOURCE_URL: 'single-quoted',
      });
    });

    test('should handle values containing = signs', () => {
      const result = parseEnvFile('FINQU_ACCESS_TOKEN=abc=def=ghi\n');
      expect(result).toEqual({ FINQU_ACCESS_TOKEN: 'abc=def=ghi' });
    });

    test('should handle empty values', () => {
      const result = parseEnvFile('FINQU_ENDPOINT=\n');
      expect(result).toEqual({ FINQU_ENDPOINT: '' });
    });
  });

  describe('serializeEnvFile', () => {
    test('should serialize key-value pairs to env format', () => {
      const result = serializeEnvFile({
        FINQU_ACCESS_TOKEN: 'abc123',
        FINQU_MERCHANT: 42,
      });
      expect(result).toBe('FINQU_ACCESS_TOKEN=abc123\nFINQU_MERCHANT=42\n');
    });

    test('should skip function values', () => {
      const result = serializeEnvFile({
        FINQU_APP_ID: 7,
        badKey: () => {},
      });
      expect(result).toBe('FINQU_APP_ID=7\n');
    });

    test('should handle null/undefined as empty string', () => {
      const result = serializeEnvFile({
        FINQU_ENDPOINT: null,
        FINQU_AUTH_DOMAIN: undefined,
      });
      expect(result).toBe('FINQU_ENDPOINT=\nFINQU_AUTH_DOMAIN=\n');
    });
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(configManager.data).toEqual({});
      expect(configManager.persistentKeys).toBeInstanceOf(Set);
      expect(configManager.persistentKeys.size).toBe(0);
      expect(configManager.fileSystem).toBe(mockFileSystem);
      expect(configManager.configFilePath).toBe(testConfigPath);
    });

    test('should merge initial data', () => {
      configManager = new ConfigManager(mockFileSystem, testConfigPath, {
        themeDir: '/my/path',
        verbose: true,
      });

      expect(configManager.data).toEqual({
        themeDir: '/my/path',
        verbose: true,
      });
    });

    test('should not overwrite existing keys with initial data', () => {
      const cm = new ConfigManager(mockFileSystem, testConfigPath, {
        themeDir: '/first',
      });
      // Constructor only sets if not already present, so first wins
      expect(cm.data.themeDir).toBe('/first');
    });
  });

  describe('set', () => {
    test('should set a configuration value', () => {
      configManager.set('themeDir', '/test/path');
      expect(configManager.data.themeDir).toBe('/test/path');
    });

    test('should mark a value as persistent when specified', () => {
      configManager.set('themeDir', '/test/path', true);
      expect(configManager.persistentKeys.has('themeDir')).toBe(true);
    });

    test('should not mark as persistent by default', () => {
      configManager.set('themeDir', '/test/path');
      expect(configManager.persistentKeys.has('themeDir')).toBe(false);
    });

    test('should return the config manager for chaining', () => {
      const result = configManager.set('key', 'value');
      expect(result).toBe(configManager);
    });

    test('should flatten store object into individual keys', () => {
      configManager.set(
        'store',
        {
          merchantId: 100,
          id: 200,
          themeId: 300,
          versionId: 400,
          domain: 'test.example.com',
        },
        true,
      );

      expect(configManager.data.storeMerchantId).toBe(100);
      expect(configManager.data.storeId).toBe(200);
      expect(configManager.data.storeThemeId).toBe(300);
      expect(configManager.data.storeVersionId).toBe(400);
      expect(configManager.data.storeDomain).toBe('test.example.com');
      expect(configManager.data.store).toBeUndefined();
      expect(configManager.persistentKeys.has('storeMerchantId')).toBe(true);
      expect(configManager.persistentKeys.has('storeId')).toBe(true);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      configManager.data = {
        themeDir: '/test/path',
        merchant: 42,
      };
    });

    test('should get a configuration value by key', () => {
      expect(configManager.get('themeDir')).toBe('/test/path');
    });

    test('should return default value if key does not exist', () => {
      expect(configManager.get('nonexistent', 'fallback')).toBe('fallback');
    });

    test('should return null as default if not specified', () => {
      expect(configManager.get('nonexistent')).toBe(null);
    });

    test('should reconstruct store object from flat keys', () => {
      configManager.data = {
        storeMerchantId: 100,
        storeId: 200,
        storeThemeId: 300,
        storeVersionId: 400,
        storeDomain: 'test.example.com',
      };

      const store = configManager.get('store');
      expect(store).toEqual({
        merchantId: 100,
        id: 200,
        themeId: 300,
        versionId: 400,
        domain: 'test.example.com',
      });
    });

    test('should return default for store when no store keys exist', () => {
      configManager.data = { themeDir: '/test' };
      expect(configManager.get('store')).toBe(null);
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      configManager.data = { themeDir: '/test', merchant: 42 };
      configManager.persistentKeys.add('themeDir');
    });

    test('should remove a configuration value', () => {
      configManager.remove('themeDir');
      expect('themeDir' in configManager.data).toBe(false);
    });

    test('should remove the key from persistentKeys', () => {
      configManager.remove('themeDir');
      expect(configManager.persistentKeys.has('themeDir')).toBe(false);
    });

    test('should return the config manager for chaining', () => {
      const result = configManager.remove('themeDir');
      expect(result).toBe(configManager);
    });
  });

  describe('getPersistentConfig', () => {
    test('should return only persistent and always-persisted keys as env keys', () => {
      configManager.data = {
        accessToken: 'tok123',
        merchant: 42,
        resourceUrl: 'https://api.example.com',
        verbose: true, // not persistent, not in always-persisted
      };

      const result = configManager.getPersistentConfig();
      expect(result).toEqual({
        FINQU_ACCESS_TOKEN: 'tok123',
        FINQU_MERCHANT: 42,
        FINQU_RESOURCE_URL: 'https://api.example.com',
      });
      expect(result.verbose).toBeUndefined();
    });

    test('should include store flat keys', () => {
      configManager.data = {
        storeMerchantId: 100,
        storeId: 200,
        storeThemeId: 300,
        storeVersionId: 400,
        storeDomain: 'test.example.com',
      };

      const result = configManager.getPersistentConfig();
      expect(result).toEqual({
        FINQU_STORE_MERCHANT_ID: 100,
        FINQU_STORE_ID: 200,
        FINQU_STORE_THEME_ID: 300,
        FINQU_STORE_VERSION_ID: 400,
        FINQU_STORE_DOMAIN: 'test.example.com',
      });
    });
  });

  describe('loadConfig', () => {
    test('should load and parse .env file', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(
        'FINQU_ACCESS_TOKEN=abc123\nFINQU_MERCHANT=42\nFINQU_RESOURCE_URL=https://api.example.com\n',
      );

      await configManager.loadConfig();

      expect(configManager.data.accessToken).toBe('abc123');
      expect(configManager.data.merchant).toBe(42);
      expect(configManager.data.resourceUrl).toBe('https://api.example.com');
    });

    test('should not overwrite existing data from initial config', async () => {
      configManager.data = { accessToken: 'initial-token' };

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(
        'FINQU_ACCESS_TOKEN=file-token\nFINQU_MERCHANT=42\n',
      );

      await configManager.loadConfig();

      expect(configManager.data.accessToken).toBe('initial-token');
      expect(configManager.data.merchant).toBe(42);
    });

    test('should handle file not existing', async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      const result = await configManager.loadConfig();

      expect(result).toBe(true);
      expect(mockFileSystem.readFile).not.toHaveBeenCalled();
    });

    test('should handle read errors gracefully', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      const error = new Error('Read error');
      error.code = 'EIO';
      mockFileSystem.readFile.mockRejectedValue(error);

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await configManager.loadConfig();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should coerce numeric values from .env', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(
        'FINQU_MERCHANT=42\nFINQU_EXPIRES_AT=1791380679313\n',
      );

      await configManager.loadConfig();

      expect(configManager.data.merchant).toBe(42);
      expect(configManager.data.expiresAt).toBe(1791380679313);
    });

    test('should coerce boolean values from .env', async () => {
      // Note: verbose is not in KEY_MAP so it would be loaded via FINQU_ prefix fallback
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('FINQU_VERBOSE=true\n');

      await configManager.loadConfig();

      // Unknown FINQU_ keys get derived camelCase key
      expect(configManager.data.verbose).toBe(true);
    });
  });

  describe('saveConfig', () => {
    test('should save persistent configuration to .env format', async () => {
      configManager.data = {
        accessToken: 'tok123',
        merchant: 42,
        verbose: true, // not persistent
      };

      await configManager.saveConfig();

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.stringContaining('FINQU_ACCESS_TOKEN=tok123'),
      );
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.stringContaining('FINQU_MERCHANT=42'),
      );
      // verbose should NOT be in output
      const written = mockFileSystem.writeFile.mock.calls[0][1];
      expect(written).not.toContain('verbose');
    });

    test('should create directory if it does not exist', async () => {
      mockFileSystem.exists.mockResolvedValueOnce(false);

      await configManager.saveConfig();

      expect(mockFileSystem.mkdir).toHaveBeenCalledWith(
        path.dirname(testConfigPath),
        { recursive: true },
      );
    });

    test('should throw error on write failure', async () => {
      mockFileSystem.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(configManager.saveConfig()).rejects.toThrow(
        'Error writing configuration file',
      );
    });
  });

  describe('saveConfigValue', () => {
    test('should save a single key to .env file', async () => {
      await configManager.saveConfigValue('merchant', 42);

      expect(configManager.data.merchant).toBe(42);
      expect(configManager.persistentKeys.has('merchant')).toBe(true);
      expect(mockFileSystem.writeFile).toHaveBeenCalled();
      const written = mockFileSystem.writeFile.mock.calls[0][1];
      expect(written).toContain('FINQU_MERCHANT=42');
    });

    test('should update existing key in .env file', async () => {
      mockFileSystem.exists.mockResolvedValueOnce(true); // dir
      mockFileSystem.exists.mockResolvedValueOnce(true); // file
      mockFileSystem.readFile.mockResolvedValueOnce(
        'FINQU_MERCHANT=42\nFINQU_APP_ID=7\n',
      );

      await configManager.saveConfigValue('merchant', 99);

      const written = mockFileSystem.writeFile.mock.calls[0][1];
      expect(written).toContain('FINQU_MERCHANT=99');
      expect(written).toContain('FINQU_APP_ID=7');
    });

    test('should append new key to .env file', async () => {
      mockFileSystem.exists.mockResolvedValueOnce(true); // dir
      mockFileSystem.exists.mockResolvedValueOnce(true); // file
      mockFileSystem.readFile.mockResolvedValueOnce('FINQU_MERCHANT=42\n');

      await configManager.saveConfigValue('appId', 7);

      const written = mockFileSystem.writeFile.mock.calls[0][1];
      expect(written).toContain('FINQU_MERCHANT=42');
      expect(written).toContain('FINQU_APP_ID=7');
    });

    test('should skip function values', async () => {
      const result = await configManager.saveConfigValue(
        'functionKey',
        () => {},
      );

      expect(result).toBe(true);
      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });

    test('should throw error on write failure', async () => {
      mockFileSystem.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(
        configManager.saveConfigValue('key', 'value'),
      ).rejects.toThrow('Error writing configuration key key to file');
    });

    test('should preserve comments in .env file', async () => {
      mockFileSystem.exists.mockResolvedValueOnce(true);
      mockFileSystem.exists.mockResolvedValueOnce(true);
      mockFileSystem.readFile.mockResolvedValueOnce(
        '# My config\nFINQU_MERCHANT=42\n',
      );

      await configManager.saveConfigValue('merchant', 99);

      const written = mockFileSystem.writeFile.mock.calls[0][1];
      expect(written).toContain('# My config');
      expect(written).toContain('FINQU_MERCHANT=99');
    });
  });

  describe('createConfigManager factory function', () => {
    test('should create and initialize a ConfigManager instance', async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      const manager = await createConfigManager(
        mockFileSystem,
        testConfigPath,
        { themeDir: '/test/path' },
      );

      expect(manager).toBeInstanceOf(ConfigManager);
      expect(manager.data.themeDir).toBe('/test/path');
    });

    test('should load configuration from .env file', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(
        'FINQU_MERCHANT=42\nFINQU_ACCESS_TOKEN=tok123\n',
      );

      const manager = await createConfigManager(mockFileSystem, testConfigPath);

      expect(manager.data.merchant).toBe(42);
      expect(manager.data.accessToken).toBe('tok123');
    });
  });

  describe('store roundtrip', () => {
    test('should roundtrip store set/get through flat keys', () => {
      configManager.set(
        'store',
        {
          merchantId: 100,
          id: 200,
          themeId: 300,
          versionId: 400,
          domain: 'test.example.com',
        },
        true,
      );

      const store = configManager.get('store');
      expect(store).toEqual({
        merchantId: 100,
        id: 200,
        themeId: 300,
        versionId: 400,
        domain: 'test.example.com',
      });
    });

    test('should roundtrip through .env save/load', async () => {
      configManager.set(
        'store',
        {
          merchantId: 100,
          id: 200,
          themeId: 300,
          versionId: 400,
          domain: 'test.example.com',
        },
        true,
      );

      // Save
      await configManager.saveConfig();

      const written = mockFileSystem.writeFile.mock.calls[0][1];

      // Create a new manager and load the saved content
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(written);

      const newManager = new ConfigManager(mockFileSystem, testConfigPath);
      await newManager.loadConfig();

      const store = newManager.get('store');
      expect(store).toEqual({
        merchantId: 100,
        id: 200,
        themeId: 300,
        versionId: 400,
        domain: 'test.example.com',
      });
    });
  });
});
