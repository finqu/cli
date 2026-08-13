import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListCommand, createListCommand } from '../../src/commands/list.js';
import { AppError } from '../../src/core/error.js';

describe('ListCommand', () => {
  let command;
  let mockApp;
  let mockThemeApi;
  let mockLogger;

  const sampleAssets = [
    { type: 'dir', path: 'templates' },
    { type: 'file', path: 'templates/index.liquid' },
    { type: 'file', path: 'templates/product.liquid' },
    { type: 'dir', path: 'public' },
    { type: 'dir', path: 'public/js' },
    { type: 'file', path: 'public/js/app.js' },
    { type: 'file', path: 'layout/theme.liquid' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockThemeApi = {
      getAssets: vi.fn().mockResolvedValue([]),
    };

    mockLogger = {
      print: vi.fn(),
      printInfo: vi.fn(),
      printStatus: vi.fn(),
      printError: vi.fn(),
      handleError: vi.fn(),
    };

    mockApp = {
      services: {
        themeApi: mockThemeApi,
      },
      logger: mockLogger,
      fileSystem: {},
      config: { get: vi.fn() },
    };

    command = new ListCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('list');
    });

    it('should belong to the theme group', () => {
      expect(command.group).toBe('theme');
    });

    it('should have the correct syntax', () => {
      expect(command.syntax).toBe('list [dir]');
    });

    it('should have no options', () => {
      expect(command.options).toEqual([]);
    });
  });

  describe('execute', () => {
    it('should list all assets sorted with trailing slash on dirs', async () => {
      mockThemeApi.getAssets.mockResolvedValue(sampleAssets);

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(mockThemeApi.getAssets).toHaveBeenCalledWith();

      const printed = mockLogger.print.mock.calls.map((call) => call[0]);
      expect(printed).toEqual([
        'layout/theme.liquid',
        'public/',
        'public/js/',
        'public/js/app.js',
        'templates/',
        'templates/index.liquid',
        'templates/product.liquid',
      ]);
    });

    it('should filter assets by the given directory', async () => {
      mockThemeApi.getAssets.mockResolvedValue(sampleAssets);

      const result = await command.execute('templates');

      expect(result.success).toBe(true);
      const printed = mockLogger.print.mock.calls.map((call) => call[0]);
      expect(printed).toEqual([
        'templates/',
        'templates/index.liquid',
        'templates/product.liquid',
      ]);
    });

    it('should accept a directory with a trailing slash', async () => {
      mockThemeApi.getAssets.mockResolvedValue(sampleAssets);

      const result = await command.execute('public/');

      expect(result.success).toBe(true);
      const printed = mockLogger.print.mock.calls.map((call) => call[0]);
      expect(printed).toEqual(['public/', 'public/js/', 'public/js/app.js']);
    });

    it('should list nested assets recursively for a directory', async () => {
      mockThemeApi.getAssets.mockResolvedValue(sampleAssets);

      await command.execute('public');

      const printed = mockLogger.print.mock.calls.map((call) => call[0]);
      expect(printed).toContain('public/js/app.js');
    });

    it('should print info when the theme has no assets', async () => {
      mockThemeApi.getAssets.mockResolvedValue([]);

      const result = await command.execute();

      expect(result).toEqual({ success: true, assets: [] });
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        'No assets found in the theme.',
      );
      expect(mockLogger.print).not.toHaveBeenCalled();
    });

    it('should print info when no assets match the directory', async () => {
      mockThemeApi.getAssets.mockResolvedValue(sampleAssets);

      const result = await command.execute('snippets');

      expect(result).toEqual({ success: true, assets: [] });
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        "No assets found under 'snippets'.",
      );
      expect(mockLogger.print).not.toHaveBeenCalled();
    });

    it('should handle AppError from the API', async () => {
      const error = new AppError('API unavailable');
      mockThemeApi.getAssets.mockRejectedValue(error);

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockLogger.printError).toHaveBeenCalledWith('API unavailable');
    });

    it('should delegate unexpected errors to the logger', async () => {
      const error = new Error('network down');
      mockThemeApi.getAssets.mockRejectedValue(error);

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(mockLogger.handleError).toHaveBeenCalledWith(error);
    });
  });

  describe('createListCommand', () => {
    it('should create a ListCommand instance', () => {
      const created = createListCommand(mockApp);
      expect(created).toBeInstanceOf(ListCommand);
    });
  });
});
