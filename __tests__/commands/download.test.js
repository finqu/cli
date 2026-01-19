import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DownloadCommand,
  createDownloadCommand,
} from '../../src/commands/download.js';
import { AppError } from '../../src/core/error.js';
import path from 'path';

describe('DownloadCommand', () => {
  let command;
  let mockApp;
  let mockThemeApi;
  let mockLogger;
  let mockFileSystem;
  let mockConfig;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create mock theme API service
    mockThemeApi = {
      downloadAsset: vi.fn().mockResolvedValue(true),
      getAssets: vi.fn().mockResolvedValue([]),
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
    mockFileSystem = {
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock config
    mockConfig = {
      get: vi.fn().mockReturnValue('/path/to/theme'),
    };

    // Create mock app with required services
    mockApp = {
      services: {
        themeApi: mockThemeApi,
      },
      logger: mockLogger,
      fileSystem: mockFileSystem,
      config: mockConfig,
    };

    // Create command instance for testing
    command = new DownloadCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('download');
    });

    it('should have the correct description', () => {
      expect(command.description).toContain('Replaces your local theme assets');
    });

    it('should have the correct syntax', () => {
      expect(command.syntax).toBe('download [sources...]');
    });

    it('should belong to the theme group', () => {
      expect(command.group).toBe('theme');
    });

    it('should have empty options array', () => {
      expect(command.options).toEqual([]);
    });

    it('should create command with factory function', () => {
      const factoryCommand = createDownloadCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(DownloadCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('execute() with specified sources', () => {
    it('should download a single asset', async () => {
      const source = 'templates/index.liquid';
      const localPath = path.join('/path/to/theme', source);

      const result = await command.execute([source]);

      expect(mockThemeApi.downloadAsset).toHaveBeenCalledWith(
        source,
        localPath,
        mockFileSystem,
      );
      expect(mockLogger.printSuccess).toHaveBeenCalledWith(
        expect.stringContaining('1 assets downloaded'),
      );
      expect(result).toEqual({
        success: true,
        downloadedCount: 1,
      });
    });

    it('should download multiple assets', async () => {
      const sources = [
        'templates/index.liquid',
        'assets/theme.css',
        'snippets/header.liquid',
      ];

      const result = await command.execute(sources);

      expect(mockThemeApi.downloadAsset).toHaveBeenCalledTimes(3);
      sources.forEach((source) => {
        const localPath = path.join('/path/to/theme', source);
        expect(mockThemeApi.downloadAsset).toHaveBeenCalledWith(
          source,
          localPath,
          mockFileSystem,
        );
      });

      expect(mockLogger.printSuccess).toHaveBeenCalledWith(
        expect.stringContaining('3 assets downloaded'),
      );
      expect(result).toEqual({
        success: true,
        downloadedCount: 3,
      });
    });

    it('should create parent directories if they do not exist', async () => {
      const source = 'nested/path/to/file.liquid';
      const dirPath = path.dirname(path.join('/path/to/theme', source));

      await command.execute([source]);

      expect(mockFileSystem.exists).toHaveBeenCalledWith(dirPath);
      expect(mockFileSystem.mkdir).toHaveBeenCalledWith(dirPath, {
        recursive: true,
      });
    });

    it('should handle 404 errors gracefully', async () => {
      const source = 'non-existent.liquid';
      const error = new Error('Not found');
      error.status = 404;
      mockThemeApi.downloadAsset.mockRejectedValueOnce(error);

      const result = await command.execute([source]);

      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringMatching(/file not found/i),
      );
      expect(result.downloadedCount).toBe(0);
    });

    it('should handle other download errors and continue', async () => {
      const sources = ['file1.liquid', 'file2.liquid', 'file3.liquid'];

      // Make the second file fail to download
      const error = new Error('Download failed');
      mockThemeApi.downloadAsset
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(true);

      const result = await command.execute(sources);

      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to download'),
        error,
      );
      // Should have tried to download all files
      expect(mockThemeApi.downloadAsset).toHaveBeenCalledTimes(3);
      // Should have 2 successful downloads
      expect(result.downloadedCount).toBe(2);
    });
  });

  describe('execute() with no specified sources', () => {
    it('should download all theme assets when no sources are specified', async () => {
      const remoteAssets = [
        { type: 'file', path: 'templates/index.liquid' },
        { type: 'file', path: 'assets/theme.css' },
        { type: 'file', path: 'snippets/header.liquid' },
      ];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);

      const result = await command.execute();

      expect(mockThemeApi.getAssets).toHaveBeenCalled();
      expect(mockThemeApi.downloadAsset).toHaveBeenCalledTimes(3);
      expect(mockLogger.printStatus).toHaveBeenCalledWith(
        expect.stringContaining('Downloading all assets'),
      );
      expect(result.downloadedCount).toBe(3);
    });

    it('should create directories for directory assets', async () => {
      const remoteAssets = [
        { type: 'dir', path: 'templates' },
        { type: 'file', path: 'templates/index.liquid' },
      ];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);

      await command.execute();

      // Should create the directory
      const dirPath = path.join('/path/to/theme', 'templates');
      expect(mockFileSystem.exists).toHaveBeenCalledWith(dirPath);
      expect(mockFileSystem.mkdir).toHaveBeenCalledWith(dirPath, {
        recursive: true,
      });
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Ensuring local directory exists'),
      );

      // Should download the file too
      expect(mockThemeApi.downloadAsset).toHaveBeenCalledTimes(1);
    });

    it('should handle empty theme case', async () => {
      mockThemeApi.getAssets.mockResolvedValueOnce([]);

      const result = await command.execute();

      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        'No assets found in the theme.',
      );
      expect(mockThemeApi.downloadAsset).not.toHaveBeenCalled();
      expect(result.downloadedCount).toBe(0);
    });

    it('should batch download operations for many files', async () => {
      // Create 25 assets to test batching (batch size is 10)
      const remoteAssets = Array.from({ length: 25 }, (_, i) => ({
        type: 'file',
        path: `assets/file${i}.css`,
      }));
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);

      const result = await command.execute();

      expect(mockThemeApi.downloadAsset).toHaveBeenCalledTimes(25);
      expect(result.downloadedCount).toBe(25);
    });

    it('should handle errors when retrieving assets list', async () => {
      const error = new Error('Failed to fetch assets');
      mockThemeApi.getAssets.mockRejectedValueOnce(error);

      const result = await command.execute();

      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to retrieve assets'),
        error,
      );
      expect(result).toEqual({
        success: false,
        error,
      });
    });

    it('should report when no assets are downloaded', async () => {
      // Assets list exists but download fails for all
      const remoteAssets = [{ type: 'file', path: 'file.liquid' }];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);
      mockThemeApi.downloadAsset.mockResolvedValueOnce(false);

      const result = await command.execute();

      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        'No assets were downloaded.',
      );
      expect(result.downloadedCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle errors in batch processing', async () => {
      const remoteAssets = [
        { type: 'file', path: 'file1.liquid' },
        { type: 'file', path: 'file2.liquid' },
        { type: 'file', path: 'file3.liquid' },
      ];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);

      // Make one batch item fail
      mockThemeApi.downloadAsset
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Download failed'))
        .mockResolvedValueOnce(true);

      const result = await command.execute();

      expect(mockLogger.printError).toHaveBeenCalled();
      expect(result.downloadedCount).toBe(2);
    });

    it('should handle AppError properly', async () => {
      const error = new AppError('Test error');
      command.config.get = vi.fn().mockImplementation(() => {
        throw error;
      });

      const result = await command.execute();

      expect(mockLogger.printError).toHaveBeenCalledWith(error.message);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });

    it('should handle other errors with logger', async () => {
      const error = new Error('Unexpected error');
      command.config.get = vi.fn().mockImplementation(() => {
        throw error;
      });

      mockLogger.handleError.mockImplementation(() => {}); // Prevent actual error handling

      const result = await command.execute();

      expect(mockLogger.handleError).toHaveBeenCalledWith(error);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });
  });
});
