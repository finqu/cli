import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager, createConfigManager } from '../../src/core/config.js';
import path from 'path';

describe('ConfigManager', () => {
  let configManager;
  let mockFileSystem;
  const testConfigPath = '/test/config.json';

  beforeEach(() => {
    // Create a mock file system
    mockFileSystem = {
      exists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    };

    // Mock simple existence check
    mockFileSystem.exists.mockResolvedValue(false);
    // Default ConfigManager setup
    configManager = new ConfigManager(mockFileSystem, testConfigPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(configManager.environments).toEqual({});
      expect(configManager.environment).toBe('production');
      expect(configManager.persistentKeys).toBeInstanceOf(Set);
      expect(configManager.persistentKeys.size).toBe(0);
      expect(configManager.fileSystem).toBe(mockFileSystem);
      expect(configManager.configFilePath).toBe(testConfigPath);
    });

    test('should merge initial data', () => {
      const initialData = {
        production: {
          themeId: 'theme123',
          store: 'teststore',
        },
        development: {
          themeId: 'devtheme',
        },
      };

      configManager = new ConfigManager(
        mockFileSystem,
        testConfigPath,
        initialData,
      );

      expect(configManager.environments).toEqual(initialData);
    });
  });

  describe('mergeData', () => {
    test('should merge data without overwriting existing values', () => {
      // Set up initial state
      configManager.environments = {
        production: {
          themeId: 'original-theme',
          endpoint: 'original-endpoint',
        },
      };

      // Merge new data
      configManager.mergeData({
        production: {
          themeId: 'new-theme', // Should be ignored because key already exists
          store: 'new-store', // Should be added because key doesn't exist
        },
        development: {
          // Should create new environment
          themeId: 'dev-theme',
        },
      });

      // Check that new data was merged correctly
      expect(configManager.environments).toEqual({
        production: {
          themeId: 'original-theme', // Preserved
          endpoint: 'original-endpoint', // Preserved
          store: 'new-store', // Added
        },
        development: {
          themeId: 'dev-theme', // Added
        },
      });
    });

    test('should handle empty data', () => {
      configManager.environments = {
        production: { themeId: 'test' },
      };

      configManager.mergeData({});

      expect(configManager.environments).toEqual({
        production: { themeId: 'test' },
      });
    });
  });

  describe('env', () => {
    test('should change the active environment', () => {
      expect(configManager.environment).toBe('production');

      configManager.env('development');

      expect(configManager.environment).toBe('development');
    });

    test('should return the config manager instance for chaining', () => {
      const result = configManager.env('staging');

      expect(result).toBe(configManager);
    });
  });

  describe('set', () => {
    test('should set a configuration value in the current environment', () => {
      configManager.set('themeId', 'theme123');

      expect(configManager.environments.production.themeId).toBe('theme123');
    });

    test('should create environment if it does not exist', () => {
      // Switch to a non-existent environment
      configManager.env('staging');

      configManager.set('themeId', 'staging-theme');

      expect(configManager.environments.staging.themeId).toBe('staging-theme');
    });

    test('should mark a value as persistent when specified', () => {
      configManager.set('themeId', 'theme123', true);

      expect(configManager.persistentKeys.has('themeId')).toBe(true);
    });

    test('should not mark a value as persistent by default', () => {
      configManager.set('themeId', 'theme123');

      expect(configManager.persistentKeys.has('themeId')).toBe(false);
    });

    test('should return the config manager instance for chaining', () => {
      const result = configManager.set('themeId', 'theme123');

      expect(result).toBe(configManager);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      configManager.environments = {
        production: {
          camelCaseKey: 'camel',
          snake_case_key: 'snake',
          normalKey: 'normal',
        },
      };
    });

    test('should get a configuration value by key', () => {
      const value = configManager.get('normalKey');

      expect(value).toBe('normal');
    });

    test('should return the default value if the key does not exist', () => {
      const value = configManager.get('nonexistentKey', 'default');

      expect(value).toBe('default');
    });

    test('should handle snake_case to camelCase conversion', () => {
      const value = configManager.get('snake_case_key');

      expect(value).toBe('snake');
    });

    test('should handle camelCase to snake_case conversion', () => {
      // This tests getting a snake_case key using camelCase
      const value = configManager.get('snakeCaseKey');

      expect(value).toBe('snake');
    });

    test('should return null as default value if not specified', () => {
      const value = configManager.get('nonexistentKey');

      expect(value).toBe(null);
    });

    test('should handle missing environment', () => {
      configManager.env('nonexistent');
      const value = configManager.get('someKey', 'default');

      expect(value).toBe('default');
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      configManager.environments = {
        production: {
          themeId: 'theme123',
          store: 'teststore',
        },
      };
      configManager.persistentKeys.add('themeId');
    });

    test('should remove a configuration value', () => {
      configManager.remove('themeId');

      expect('themeId' in configManager.environments.production).toBe(false);
    });

    test('should remove the key from persistentKeys', () => {
      configManager.remove('themeId');

      expect(configManager.persistentKeys.has('themeId')).toBe(false);
    });

    test('should handle missing environment gracefully', () => {
      configManager.env('nonexistent');

      expect(() => configManager.remove('someKey')).not.toThrow();
    });

    test('should return the config manager instance for chaining', () => {
      const result = configManager.remove('themeId');

      expect(result).toBe(configManager);
    });
  });

  describe('getPersistentConfig', () => {
    beforeEach(() => {
      configManager.environments = {
        production: {
          themeId: 'prod-theme',
          store: 'prodstore',
          apiKey: 'prod-api-key',
          tempValue: 'temp',
        },
        development: {
          themeId: 'dev-theme',
          apiKey: 'dev-api-key',
          debug: true,
        },
      };

      // Mark some keys as persistent
      configManager.persistentKeys.add('apiKey');
    });

    test('should return only persistent and always-persisted keys', () => {
      const persistentConfig = configManager.getPersistentConfig();

      expect(persistentConfig).toEqual({
        production: {
          themeId: 'prod-theme',
          store: 'prodstore',
          apiKey: 'prod-api-key',
        },
        development: {
          themeId: 'dev-theme',
          apiKey: 'dev-api-key',
        },
      });

      // tempValue and debug should be excluded as they're not persistent
      expect(persistentConfig.production.tempValue).toBeUndefined();
      expect(persistentConfig.development.debug).toBeUndefined();
    });

    test('should include common always-persisted keys', () => {
      configManager.environments.staging = {
        endpoint: 'staging-endpoint',
        resourceUrl: 'resource-url',
        refreshToken: 'refresh-token',
      };

      const persistentConfig = configManager.getPersistentConfig();

      expect(persistentConfig.staging).toEqual({
        endpoint: 'staging-endpoint',
        resourceUrl: 'resource-url',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('loadConfig', () => {
    test('should load and merge configuration from file', async () => {
      // Setup existing config
      configManager.environments = {
        production: {
          existingKey: 'existing-value',
        },
      };

      // Mock file existing
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(
        JSON.stringify({
          production: {
            themeId: 'file-theme-id',
            newKey: 'new-value',
          },
          development: {
            themeId: 'dev-theme',
          },
        }),
      );

      await configManager.loadConfig();

      // Existing values should be preserved, new values should be added
      expect(configManager.environments).toEqual({
        production: {
          existingKey: 'existing-value',
          themeId: 'file-theme-id',
          newKey: 'new-value',
        },
        development: {
          themeId: 'dev-theme',
        },
      });
    });

    test('should handle file not existing', async () => {
      // Mock file not existing
      mockFileSystem.exists.mockResolvedValue(false);

      const result = await configManager.loadConfig();

      expect(result).toBe(true);
      expect(mockFileSystem.readFile).not.toHaveBeenCalled();
    });

    test('should handle JSON parsing errors', async () => {
      // Mock file existing but with invalid JSON
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('invalid json');

      // Spy on console.error
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await configManager.loadConfig();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should handle read errors other than file not found', async () => {
      // Mock file read error
      mockFileSystem.exists.mockResolvedValue(true);
      const error = new Error('Read error');
      error.code = 'EIO';
      mockFileSystem.readFile.mockRejectedValue(error);

      // Spy on console.error
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await configManager.loadConfig();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('saveConfig', () => {
    test('should save persistent configuration to file', async () => {
      // Setup config with both persistent and non-persistent values
      configManager.environments = {
        production: {
          themeId: 'theme123',
          store: 'teststore',
          tempValue: 'not-saved',
        },
      };

      // Mark themeId as persistent (store is always persistent)
      configManager.persistentKeys.add('tempValue');

      await configManager.saveConfig();

      // Verify directory was created
      expect(mockFileSystem.exists).toHaveBeenCalledWith(
        path.dirname(testConfigPath),
      );
      expect(mockFileSystem.mkdir).toHaveBeenCalled();

      // Verify file was written with only persistent config
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.any(String),
      );

      // Parse the written JSON to check its content
      const writtenContent = JSON.parse(
        mockFileSystem.writeFile.mock.calls[0][1],
      );
      expect(writtenContent).toEqual({
        production: {
          themeId: 'theme123',
          store: 'teststore',
          tempValue: 'not-saved',
        },
      });
    });

    test('should create directory if it does not exist', async () => {
      mockFileSystem.exists.mockResolvedValueOnce(false);

      await configManager.saveConfig();

      expect(mockFileSystem.mkdir).toHaveBeenCalledWith(
        path.dirname(testConfigPath),
        { recursive: true },
      );
    });

    test('should throw error on file write error', async () => {
      mockFileSystem.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(configManager.saveConfig()).rejects.toThrow(
        'Error writing configuration file',
      );
    });
  });

  describe('saveConfigValue', () => {
    beforeEach(() => {
      // Setup initial config
      configManager.environments = {
        production: {
          existingKey: 'existing-value',
        },
      };
    });

    test('should save a single configuration value', async () => {
      await configManager.saveConfigValue('newKey', 'new-value');

      // Check that the value was set in memory
      expect(configManager.environments.production.newKey).toBe('new-value');
      expect(configManager.persistentKeys.has('newKey')).toBe(true);

      // Verify file write operation
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.any(String),
      );
    });

    test('should save to specified environment', async () => {
      await configManager.saveConfigValue('newKey', 'new-value', 'development');

      // Check that the value was set in memory
      expect(configManager.environments.development.newKey).toBe('new-value');
      expect(configManager.persistentKeys.has('newKey')).toBe(true);

      // Verify file write operation
      const writtenContent = JSON.parse(
        mockFileSystem.writeFile.mock.calls[0][1],
      );
      expect(writtenContent).toEqual({
        development: {
          newKey: 'new-value',
        },
      });
    });

    test('should skip saving function values', async () => {
      const result = await configManager.saveConfigValue(
        'functionKey',
        () => {},
      );

      expect(result).toBe(true);
      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });

    test('should merge with existing config file', async () => {
      // Mock file existence check
      mockFileSystem.exists.mockResolvedValueOnce(true); // For directory check
      mockFileSystem.exists.mockResolvedValueOnce(true); // For file check

      // Mock file read to return existing config
      mockFileSystem.readFile.mockResolvedValueOnce(
        JSON.stringify({
          production: {
            existingFileKey: 'existing-file-value',
          },
          development: {
            devKey: 'dev-value',
          },
        }),
      );

      await configManager.saveConfigValue('newKey', 'new-value');

      // Check the content that was written
      expect(mockFileSystem.writeFile).toHaveBeenCalled();
      const writtenContent = JSON.parse(
        mockFileSystem.writeFile.mock.calls[0][1],
      );

      // The implementation should preserve the development environment
      // and merge the new key with existing keys in the production environment
      expect(writtenContent).toEqual({
        production: {
          existingFileKey: 'existing-file-value',
          newKey: 'new-value',
        },
        development: {
          devKey: 'dev-value',
        },
      });
    });

    test('should handle invalid existing config file', async () => {
      // Mock existing but invalid config file
      mockFileSystem.exists.mockResolvedValueOnce(true);
      mockFileSystem.readFile.mockResolvedValueOnce('invalid json');

      await configManager.saveConfigValue('newKey', 'new-value');

      // Should still write new config
      const writtenContent = JSON.parse(
        mockFileSystem.writeFile.mock.calls[0][1],
      );
      expect(writtenContent).toEqual({
        production: {
          newKey: 'new-value',
        },
      });
    });

    test('should throw error on file write error', async () => {
      mockFileSystem.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(
        configManager.saveConfigValue('key', 'value'),
      ).rejects.toThrow('Error writing configuration key key to file');
    });
  });

  describe('createConfigManager factory function', () => {
    test('should create and initialize a ConfigManager instance', async () => {
      const initialData = {
        production: {
          themeId: 'theme123',
        },
      };

      mockFileSystem.exists.mockResolvedValue(false);

      const manager = await createConfigManager(
        mockFileSystem,
        testConfigPath,
        initialData,
      );

      expect(manager).toBeInstanceOf(ConfigManager);
      expect(manager.environments.production.themeId).toBe('theme123');
    });

    test('should load configuration from file', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(
        JSON.stringify({
          production: {
            themeId: 'file-theme',
          },
        }),
      );

      const manager = await createConfigManager(mockFileSystem, testConfigPath);

      expect(manager.environments.production.themeId).toBe('file-theme');
    });
  });

  // Add edge case tests
  describe('edge cases', () => {
    describe('unusual keys and values', () => {
      test('should handle special characters in keys', () => {
        // Special characters in keys
        configManager.set('key-with-dash', 'dash-value');
        configManager.set('key.with.dots', 'dot-value');
        configManager.set('key_with_underscore', 'underscore-value');

        expect(configManager.get('key-with-dash')).toBe('dash-value');
        expect(configManager.get('key.with.dots')).toBe('dot-value');
        expect(configManager.get('key_with_underscore')).toBe(
          'underscore-value',
        );
      });

      test('should handle emoji in keys and values', () => {
        configManager.set('emoji-key-😀', 'regular-value');
        configManager.set('regular-key', 'emoji-value-🚀');

        expect(configManager.get('emoji-key-😀')).toBe('regular-value');
        expect(configManager.get('regular-key')).toBe('emoji-value-🚀');
      });

      test('should handle null and undefined values', () => {
        configManager.set('null-value-key', null);
        configManager.set('undefined-value-key', undefined);

        expect(configManager.get('null-value-key')).toBe(null);
        // The undefined value actually stays as undefined in the in-memory object,
        // but would become null when serialized to JSON
        expect(configManager.get('undefined-value-key')).toBe(undefined);
      });

      test('should handle numeric keys', () => {
        configManager.set('123', 'numeric-key');
        configManager.set(456, 'numeric-key-as-number'); // Should convert to string

        expect(configManager.get('123')).toBe('numeric-key');
        expect(configManager.get('456')).toBe('numeric-key-as-number');
      });

      test('should handle object and array values', () => {
        const objectValue = { nested: { key: 'value' }, array: [1, 2, 3] };
        const arrayValue = ['a', 'b', { nested: 'c' }];

        configManager.set('object-value', objectValue);
        configManager.set('array-value', arrayValue);

        expect(configManager.get('object-value')).toEqual(objectValue);
        expect(configManager.get('array-value')).toEqual(arrayValue);
      });

      test('should handle extremely long values', () => {
        const longString = 'a'.repeat(10000);
        configManager.set('long-string', longString);

        expect(configManager.get('long-string')).toBe(longString);
      });
    });

    describe('environment edge cases', () => {
      test('should handle empty environment name', () => {
        // Empty string as environment name
        configManager.env('');
        configManager.set('key', 'value');

        expect(configManager.environments['']).toEqual({ key: 'value' });
        expect(configManager.get('key')).toBe('value');
      });

      test('should handle special characters in environment names', () => {
        // Environment with special characters
        configManager.env('dev.staging');
        configManager.set('key1', 'value1');

        configManager.env('prod-env');
        configManager.set('key2', 'value2');

        configManager.env('test_env');
        configManager.set('key3', 'value3');

        expect(configManager.environments['dev.staging'].key1).toBe('value1');
        expect(configManager.environments['prod-env'].key2).toBe('value2');
        expect(configManager.environments['test_env'].key3).toBe('value3');
      });

      test('should handle switching between environments', () => {
        // Set values in production
        configManager.env('production');
        configManager.set('shared-key', 'prod-value');

        // Switch to dev and set values
        configManager.env('development');
        configManager.set('shared-key', 'dev-value');
        configManager.set('dev-only-key', 'dev-only-value');

        // Switch back to production and verify
        configManager.env('production');
        expect(configManager.get('shared-key')).toBe('prod-value');
        expect(configManager.get('dev-only-key')).toBe(null);

        // Switch to dev again and verify
        configManager.env('development');
        expect(configManager.get('shared-key')).toBe('dev-value');
        expect(configManager.get('dev-only-key')).toBe('dev-only-value');
      });
    });

    describe('file system edge cases', () => {
      test('should handle permission denied errors when saving', async () => {
        // Mock a permission denied error
        mockFileSystem.writeFile.mockRejectedValue(
          new Error('EACCES: permission denied'),
        );

        await expect(configManager.saveConfig()).rejects.toThrow(
          'Error writing configuration file',
        );
      });

      test('should handle permission denied errors when reading', async () => {
        // Mock file exists but can't be read due to permissions
        mockFileSystem.exists.mockResolvedValue(true);
        mockFileSystem.readFile.mockRejectedValue(
          new Error('EACCES: permission denied'),
        );

        const consoleErrorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await configManager.loadConfig();

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      test('should handle extremely long paths', async () => {
        // Create a very long path
        const longPathComponent = 'a'.repeat(100);
        const longPath = `/${longPathComponent}/${longPathComponent}/${longPathComponent}/config.json`;

        // Create a new ConfigManager with the long path
        const longPathConfigManager = new ConfigManager(
          mockFileSystem,
          longPath,
        );

        // Should not throw when saving to a long path
        await longPathConfigManager.set('key', 'value').saveConfig();

        // Verify the correct path was used
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          longPath,
          expect.any(String),
        );
      });
    });

    describe('security concerns', () => {
      test('should handle circular references', async () => {
        // Create an object with circular reference
        const circularObj = { name: 'circular' };
        circularObj.self = circularObj;

        configManager.set('circular', circularObj);

        // Should not throw when saving
        await configManager.saveConfig();

        // Should have been called with a string (JSON)
        expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
          testConfigPath,
          expect.any(String),
        );
      });

      test('should handle prototype pollution attempts', () => {
        // Try to set __proto__ key
        configManager.set('__proto__', { malicious: true });

        // Try to set constructor key
        configManager.set('constructor', { malicious: true });

        // Should not affect object prototype
        const testObj = {};
        expect(testObj.malicious).toBeUndefined();
      });
    });

    describe('data migration edge cases', () => {
      test('should handle migration from snake_case to camelCase', () => {
        // Setup config with snake_case keys
        configManager.environments = {
          production: {
            api_key: 'secret',
            refresh_token: 'token',
            theme_id: '123',
          },
        };

        // Should be able to get with camelCase
        expect(configManager.get('apiKey')).toBe('secret');
        expect(configManager.get('refreshToken')).toBe('token');
        expect(configManager.get('themeId')).toBe('123');

        // And still get with snake_case
        expect(configManager.get('api_key')).toBe('secret');
        expect(configManager.get('refresh_token')).toBe('token');
        expect(configManager.get('theme_id')).toBe('123');
      });

      test('should handle mixed case keys', () => {
        // Set with various mixed-case keys
        configManager.set('mixedCase', 'value1');
        configManager.set('MixedCase', 'value2'); // Capital first letter
        configManager.set('mixed_case', 'value3'); // Snake case

        // Get should find the right key regardless of format
        expect(configManager.get('mixedCase')).toBe('value1');
        expect(configManager.get('MixedCase')).toBe('value2');
        expect(configManager.get('mixed_case')).toBe('value3');

        // Should be able to get snake_case key with camelCase
        expect(configManager.get('mixedCase')).toBe('value1');
      });
    });

    describe('boundary conditions', () => {
      test('should handle empty config', () => {
        configManager = new ConfigManager(mockFileSystem, testConfigPath, {});

        expect(configManager.environments).toEqual({});
        expect(() => configManager.get('anyKey')).not.toThrow();
        expect(configManager.get('anyKey')).toBe(null);
      });

      test('should handle many environments and keys', () => {
        // Create 100 environments with 10 keys each
        const largeConfig = {};
        for (let i = 0; i < 100; i++) {
          const envName = `env-${i}`;
          largeConfig[envName] = {};
          for (let j = 0; j < 10; j++) {
            largeConfig[envName][`key-${j}`] = `value-${i}-${j}`;
          }
        }

        configManager = new ConfigManager(
          mockFileSystem,
          testConfigPath,
          largeConfig,
        );

        // Check a few random values
        expect(configManager.env('env-42').get('key-7')).toBe('value-42-7');
        expect(configManager.env('env-99').get('key-0')).toBe('value-99-0');
        expect(configManager.env('env-0').get('key-9')).toBe('value-0-9');
      });
    });
  });
});
