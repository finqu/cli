import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConfigureCommand,
  createConfigureCommand,
} from '../../src/commands/configure.js';
import { AppError } from '../../src/core/error.js';

// Mock prompts to simulate user interaction
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

import prompts from 'prompts';

describe('ConfigureCommand', () => {
  let command;
  let mockApp;
  let mockThemeApi;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create mock theme API service
    mockThemeApi = {
      listThemes: vi.fn(),
      listStores: vi.fn(),
      listVersions: vi.fn(),
    };

    // Create mock config manager
    mockConfig = {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      saveConfig: vi.fn().mockResolvedValue(true),
    };

    // Create mock logger
    mockLogger = {
      printInfo: vi.fn(),
      printStatus: vi.fn(),
      printSuccess: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      handleError: vi.fn(),
    };

    // Create mock file system
    const mockFileSystem = {
      exists: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    };

    // Create mock app with required services
    mockApp = {
      services: {
        themeApi: mockThemeApi,
      },
      config: mockConfig,
      logger: mockLogger,
      fileSystem: mockFileSystem,
    };

    // Create command instance for testing
    command = new ConfigureCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('configure');
    });

    it('should have the correct description', () => {
      expect(command.description).toBe('Configure Finqu theme configuration.');
    });

    it('should offer the flags that replace the prompts', () => {
      expect(command.options.map((o) => o.flags)).toEqual([
        '--channel <id>',
        '--theme <id>',
        '--version <name>',
        '--resource-url <url>',
      ]);
    });

    it('should belong to the theme group', () => {
      expect(command.group).toBe('theme');
    });

    it('should create command with factory function', () => {
      const factoryCommand = createConfigureCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(ConfigureCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('execute()', () => {
    it('should print status message on start', async () => {
      // Simulate user cancellation to short-circuit
      prompts.mockImplementationOnce(() => ({ resource: undefined }));

      await command.execute({});

      expect(mockLogger.printStatus).toHaveBeenCalledWith(
        'Configuring theme...',
      );
    });

    it('should save configuration after successful setup', async () => {
      // Mock the complete store configuration flow
      mockThemeApi.listStores.mockResolvedValueOnce([{ name: 'store-1' }]);
      prompts.mockResolvedValueOnce({ store: 'store-1' });
      mockThemeApi.listThemes.mockResolvedValueOnce([
        { id: 'theme-123', name: 'Test Theme' },
      ]);
      prompts.mockResolvedValueOnce({ theme: 'theme-123' });
      mockThemeApi.listVersions.mockResolvedValueOnce([
        { id: 'version-1', version: '1.0.0' },
      ]);
      prompts.mockResolvedValueOnce({ version: 'version-1' });

      await command.execute({});

      expect(mockConfig.saveConfig).toHaveBeenCalled();
      expect(mockLogger.printSuccess).toHaveBeenCalledWith(
        'Configuration completed successfully',
      );
    });

    it('should handle AppError properly', async () => {
      // Simulate an AppError being thrown
      const errorMessage = 'Failed to configure store';
      prompts.mockImplementationOnce(() => {
        throw new AppError(errorMessage);
      });

      const result = await command.execute({});

      expect(result).toEqual({ success: false, error: expect.any(AppError) });
      expect(mockLogger.printError).toHaveBeenCalledWith(errorMessage);
      expect(mockConfig.saveConfig).not.toHaveBeenCalled();
    });

    it('should handle other errors with logger', async () => {
      // Instead of mocking prompts to throw an error,
      // mock the promptForConfigType method itself to throw a regular Error
      // This bypasses the conversion to AppError in the promptForConfigType catch block
      const originalMethod = command.promptForConfigType;
      command.promptForConfigType = vi.fn().mockImplementation(() => {
        throw new Error('General error');
      });

      // Mock the handleError to do nothing in tests to avoid process.exit
      mockLogger.handleError.mockImplementation(() => {});

      const result = await command.execute({});

      expect(result).toEqual({ success: false, error: expect.any(Error) });
      expect(mockLogger.handleError).toHaveBeenCalledWith(expect.any(Error));
      expect(mockConfig.saveConfig).not.toHaveBeenCalled();

      // Restore the original method
      command.promptForConfigType = originalMethod;
    });
  });

  describe('promptForConfigType()', () => {
    it('should call configureForStore', async () => {
      vi.spyOn(command, 'configureForStore').mockResolvedValueOnce();

      await command.promptForConfigType({});

      expect(command.configureForStore).toHaveBeenCalledTimes(1);
    });

    it('should throw AppError if configureForStore fails', async () => {
      vi.spyOn(command, 'configureForStore').mockRejectedValueOnce(
        new Error('Store config failed'),
      );

      await expect(command.promptForConfigType({})).rejects.toThrow(AppError);
      await expect(command.promptForConfigType({})).rejects.toThrow(
        'Failed to configure store',
      );
    });
  });

  describe('configureForStore()', () => {
    const mockStore = {
      id: 'store-123',
      merchant_name: 'Test Merchant',
      name: 'Test Store',
      urls: [{ base: 'https://test-store.com' }],
    };

    beforeEach(() => {
      // Setup mocks for the multi-step store configuration
      mockThemeApi.listStores.mockResolvedValue([mockStore]);
      mockThemeApi.listThemes.mockResolvedValue([
        { id: 'theme-123', name: 'Store Theme' },
      ]);
      mockThemeApi.listVersions.mockResolvedValue([
        { id: 'version-123', comment: 'Test Version' },
      ]);

      // Mock three consecutive prompts (store, theme, version)
      prompts
        .mockResolvedValueOnce({ store: mockStore }) // 1. Select store
        .mockResolvedValueOnce({ theme: 'theme-123' }) // 2. Select theme
        .mockResolvedValueOnce({ version: 'version-123' }); // 3. Select version
    });

    it('should guide through the store configuration process', async () => {
      mockConfig.get.mockImplementation((key) => {
        if (key === 'merchant') return 'merchant-123';
        return undefined;
      });

      await command.configureForStore({});

      expect(mockThemeApi.listStores).toHaveBeenCalledTimes(1);
      expect(mockThemeApi.listStores).toHaveBeenCalledWith('merchant-123');
      expect(mockThemeApi.listThemes).toHaveBeenCalledTimes(1);
      expect(mockThemeApi.listThemes).toHaveBeenCalledWith(
        'merchant-123',
        mockStore,
      );
      expect(mockThemeApi.listVersions).toHaveBeenCalledTimes(1);
      expect(mockThemeApi.listVersions).toHaveBeenCalledWith(
        'merchant-123',
        mockStore,
        'theme-123',
      );

      // Verify prompts were called 3 times
      expect(prompts).toHaveBeenCalledTimes(3);
    });

    it('should set store config', async () => {
      mockConfig.get.mockImplementation((key) => {
        if (key === 'merchant') return 'merchant-123';
        return undefined;
      });

      await command.configureForStore({});

      expect(mockConfig.set).toHaveBeenCalledWith(
        'store',
        {
          merchantId: 'merchant-123',
          id: 'store-123',
          themeId: 'theme-123',
          versionId: 'version-123',
          domain: 'test-store.com',
        },
        true,
      );
    });

    it('should throw AppError if no stores found', async () => {
      // Force the API to return empty array to trigger the error condition
      mockThemeApi.listStores.mockReset();
      mockThemeApi.listStores.mockResolvedValueOnce([]);

      // Using try-catch instead of expect().rejects because the implementation
      // might be using exit() which would prevent the rejection from propagating
      let error;
      try {
        await command.configureForStore({});
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toContain('Failed to configure store');
    });

    it('should throw AppError if no themes found for selected store', async () => {
      mockThemeApi.listStores.mockResolvedValueOnce([mockStore]);
      prompts.mockResolvedValueOnce({ store: mockStore });
      mockThemeApi.listThemes.mockResolvedValueOnce([]);

      await expect(command.configureForStore({})).rejects.toThrow(AppError);
      // The exact error message is wrapped by the implementation
      await expect(command.configureForStore({})).rejects.toThrow(
        'Failed to configure store',
      );
    });

    it('should throw AppError if no versions found for selected theme', async () => {
      mockThemeApi.listStores.mockResolvedValueOnce([mockStore]);
      prompts.mockResolvedValueOnce({ store: mockStore });
      mockThemeApi.listThemes.mockResolvedValueOnce([
        { id: 'theme-123', name: 'Store Theme' },
      ]);
      prompts.mockResolvedValueOnce({ theme: 'theme-123' });
      mockThemeApi.listVersions.mockResolvedValueOnce([]);

      await expect(command.configureForStore({})).rejects.toThrow(AppError);
      // The exact error message is wrapped by the implementation
      await expect(command.configureForStore({})).rejects.toThrow(
        'Failed to configure store',
      );
    });
  });
  describe('execute() with flags', () => {
    const flags = { channel: '12', theme: '34', version: 'release-1' };
    let values;

    beforeEach(() => {
      values = { merchant: 'merchant-1' };
      mockConfig.get.mockImplementation((key, fallback = null) =>
        key in values ? values[key] : fallback,
      );
      mockThemeApi.listVersions.mockResolvedValue([
        { id: 'release-0' },
        { id: 'release-1' },
      ]);
    });

    it('stores the target without prompting or listing stores', async () => {
      const result = await command.execute(flags);

      expect(prompts).not.toHaveBeenCalled();
      expect(mockThemeApi.listStores).not.toHaveBeenCalled();
      expect(mockThemeApi.listThemes).not.toHaveBeenCalled();
      expect(mockThemeApi.listVersions).toHaveBeenCalledWith(
        'merchant-1',
        { id: '12' },
        '34',
      );
      expect(mockConfig.set).toHaveBeenCalledWith(
        'store',
        {
          merchantId: 'merchant-1',
          id: '12',
          themeId: '34',
          versionId: 'release-1',
        },
        true,
      );
      expect(mockConfig.saveConfig).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it('refuses a version the theme does not have and saves nothing', async () => {
      const result = await command.execute({ ...flags, version: 'release-9' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNKNOWN_VERSION');
      expect(result.error.message).toContain('release-9');
      expect(mockConfig.set).not.toHaveBeenCalled();
      expect(mockConfig.saveConfig).not.toHaveBeenCalled();
    });

    it('refuses when the API lists no versions', async () => {
      mockThemeApi.listVersions.mockResolvedValue(undefined);

      const result = await command.execute(flags);

      expect(result.error.code).toBe('UNKNOWN_VERSION');
      expect(mockConfig.saveConfig).not.toHaveBeenCalled();
    });

    describe('paging through versions', () => {
      const page = (from, count) =>
        Array.from({ length: count }, (_, i) => ({ id: `release-${from + i}` }));

      it('finds a version that is past the first 50', async () => {
        mockThemeApi.listVersions
          .mockResolvedValueOnce(page(1, 50))
          .mockResolvedValueOnce(page(51, 50))
          .mockResolvedValueOnce(page(101, 20));

        const result = await command.execute({ ...flags, version: 'release-115' });

        expect(result.success).toBe(true);
        expect(mockThemeApi.listVersions).toHaveBeenCalledTimes(3);
        expect(mockThemeApi.listVersions).toHaveBeenNthCalledWith(
          2,
          'merchant-1',
          { id: '12' },
          '34',
          { page: 2 },
        );
        expect(mockThemeApi.listVersions).toHaveBeenNthCalledWith(
          3,
          'merchant-1',
          { id: '12' },
          '34',
          { page: 3 },
        );
        expect(mockConfig.saveConfig).toHaveBeenCalledTimes(1);
      });

      it('stops at the first page that has the version', async () => {
        mockThemeApi.listVersions.mockResolvedValueOnce(page(1, 50));

        const result = await command.execute({ ...flags, version: 'release-3' });

        expect(result.success).toBe(true);
        expect(mockThemeApi.listVersions).toHaveBeenCalledTimes(1);
      });

      it('refuses an unknown version after the last short page', async () => {
        mockThemeApi.listVersions
          .mockResolvedValueOnce(page(1, 50))
          .mockResolvedValueOnce(page(51, 10));

        const result = await command.execute({ ...flags, version: 'release-999' });

        expect(result.error.code).toBe('UNKNOWN_VERSION');
        expect(mockThemeApi.listVersions).toHaveBeenCalledTimes(2);
        expect(mockConfig.saveConfig).not.toHaveBeenCalled();
      });

      it('stops when the API answers a page past the end with the first page again', async () => {
        mockThemeApi.listVersions.mockResolvedValue(page(1, 50));

        const result = await command.execute({ ...flags, version: 'release-999' });

        expect(result.error.code).toBe('UNKNOWN_VERSION');
        expect(mockThemeApi.listVersions).toHaveBeenCalledTimes(2);
      });

      it('fails and saves nothing when a later page cannot be listed', async () => {
        mockThemeApi.listVersions
          .mockResolvedValueOnce(page(1, 50))
          .mockRejectedValueOnce({ status: 500, error: 'boom' });

        const result = await command.execute({ ...flags, version: 'release-60' });

        expect(result.error.code).toBe('CONFIG_ERROR');
        expect(mockConfig.saveConfig).not.toHaveBeenCalled();
      });
    });

    it('matches numeric version ids by their string form', async () => {
      mockThemeApi.listVersions.mockResolvedValue([{ id: 5 }]);

      const result = await command.execute({ ...flags, version: '5' });

      expect(result.success).toBe(true);
    });

    it('fails and saves nothing when the versions cannot be listed', async () => {
      mockThemeApi.listVersions.mockRejectedValue({ status: 404, error: 'Not found' });

      const result = await command.execute(flags);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONFIG_ERROR');
      expect(mockConfig.saveConfig).not.toHaveBeenCalled();
    });

    it.each([
      [{ channel: '12' }, '--theme, --version'],
      [{ theme: '34', version: 'release-1' }, '--channel'],
    ])('rejects partial flags %j without prompting', async (partial, missing) => {
      const result = await command.execute(partial);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('USAGE_ERROR');
      expect(result.error.message).toContain(missing);
      expect(prompts).not.toHaveBeenCalled();
      expect(mockThemeApi.listStores).not.toHaveBeenCalled();
    });

    it.each([['../x'], ['a/b'], ['..'], ['a b']])(
      'rejects the id %s before calling the API',
      async (id) => {
        const bad = await command.execute({ ...flags, channel: id });
        const badTheme = await command.execute({ ...flags, theme: id });

        expect(bad.error.code).toBe('USAGE_ERROR');
        expect(badTheme.error.code).toBe('USAGE_ERROR');
        expect(mockThemeApi.listVersions).not.toHaveBeenCalled();
      },
    );

    it('clears the stored domain when the channel changes', async () => {
      values.store = { id: '99', themeId: '1', versionId: 'v', domain: 'old.example.test' };

      await command.execute(flags);

      expect(mockConfig.remove).toHaveBeenCalledWith('storeDomain');
    });

    it('keeps the stored domain when the channel is the same', async () => {
      values.store = { id: 12, themeId: '1', versionId: 'v', domain: 'shop.example.test' };

      await command.execute(flags);

      expect(mockConfig.remove).not.toHaveBeenCalled();
    });

    describe('in non-interactive mode', () => {
      beforeEach(() => {
        values.nonInteractive = true;
      });

      it('never prompts and reports a usage error when no flag is given', async () => {
        const result = await command.execute({});

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('USAGE_ERROR');
        expect(prompts).not.toHaveBeenCalled();
        expect(mockThemeApi.listStores).not.toHaveBeenCalled();
      });

      it('configures from the flags', async () => {
        const result = await command.execute(flags);

        expect(result.success).toBe(true);
        expect(prompts).not.toHaveBeenCalled();
      });
    });

    describe('--resource-url', () => {
      it('stores the host without a trailing slash', async () => {
        await command.execute({ ...flags, resourceUrl: 'https://api.example.test/' });

        expect(mockConfig.set).toHaveBeenCalledWith('resourceUrl', 'https://api.example.test', true);
      });

      it.each([
        ['not a url'],
        ['ftp://api.example.test'],
        ['https://user:pass@api.example.test'],
      ])('rejects %s', async (url) => {
        const result = await command.execute({ ...flags, resourceUrl: url });

        expect(result.error.code).toBe('USAGE_ERROR');
        expect(mockConfig.set).not.toHaveBeenCalled();
        expect(mockThemeApi.listVersions).not.toHaveBeenCalled();
      });

      it('does not leak the credentials of a rejected URL into the message', async () => {
        const result = await command.execute({
          ...flags,
          resourceUrl: 'https://user:secret-pass@api.example.test',
        });

        expect(result.error.message).not.toContain('secret-pass');
      });
    });
  });
});
