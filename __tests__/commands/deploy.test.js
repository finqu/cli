import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeployCommand,
  createDeployCommand,
} from '../../src/commands/deploy.js';
import { AppError } from '../../src/core/error.js';
import path from 'path';

describe('DeployCommand', () => {
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
      uploadAsset: vi.fn().mockResolvedValue(true),
      removeAsset: vi.fn().mockResolvedValue(undefined),
      compileAssets: vi.fn().mockResolvedValue(undefined),
      getAssets: vi.fn().mockResolvedValue([]),
      downloadAsset: vi.fn().mockResolvedValue(true),
    };

    // Create mock logger
    mockLogger = {
      printInfo: vi.fn(),
      printStatus: vi.fn(),
      printSuccess: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      printVerboseList: vi.fn(),
      suspendVerbose: vi.fn(),
      resumeVerbose: vi.fn(),
      handleError: vi.fn(),
    };

    // Create mock file system
    mockFileSystem = {
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
      }),
      getFiles: vi.fn().mockResolvedValue([]),
      checkPath: vi.fn().mockReturnValue(true),
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
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
    command = new DeployCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('deploy');
    });

    it('should have the correct description', () => {
      expect(command.description).toContain('Replaces the assets');
    });

    it('should have the correct syntax', () => {
      expect(command.syntax).toBe('deploy [sources...]');
    });

    it('should belong to the theme group', () => {
      expect(command.group).toBe('theme');
    });

    it('should have the correct options', () => {
      const options = command.options;
      expect(options).toHaveLength(5);

      expect(options).toContainEqual({
        flags: '--clean',
        description: expect.stringContaining('Remove remote'),
      });

      expect(options).toContainEqual({
        flags: '--config-push',
        description: expect.stringContaining('settings_data.json'),
      });

      expect(options).toContainEqual({
        flags: '--config-pull',
        description: expect.stringContaining('settings_data.json'),
      });

      expect(options).toContainEqual({
        flags: '--assets-pull',
        description: expect.stringContaining('public/'),
      });

      expect(options).toContainEqual({
        flags: '--no-compile',
        description: expect.stringContaining('Skip asset compilation'),
      });
    });

    it('should create command with factory function', () => {
      const factoryCommand = createDeployCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(DeployCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('execute() with specified sources', () => {
    it('should upload a single file asset', async () => {
      const source = 'templates/index.liquid';
      const fullPath = path.join('/path/to/theme', source);

      const result = await command.execute([source], {});

      expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
        source,
        fullPath,
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(mockThemeApi.compileAssets).toHaveBeenCalled();
      expect(mockLogger.printSuccess).toHaveBeenCalledWith(
        'Successfully deployed 1 files',
      );
      expect(result).toEqual({
        success: true,
        deployedCount: 1,
        removedCount: 0,
        errors: [],
      });
    });

    it('should upload multiple file assets', async () => {
      const sources = [
        'templates/index.liquid',
        'assets/theme.css',
        'snippets/header.liquid',
      ];

      const result = await command.execute(sources, {});

      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(3);
      sources.forEach((source) => {
        const fullPath = path.join('/path/to/theme', source);
        expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
          source,
          fullPath,
          mockFileSystem,
          expect.objectContaining({ quiet: true }),
        );
      });

      expect(mockThemeApi.compileAssets).toHaveBeenCalled();
      expect(mockLogger.printSuccess).toHaveBeenCalledWith(
        'Successfully deployed 3 files',
      );
      expect(result).toEqual({
        success: true,
        deployedCount: 3,
        removedCount: 0,
        errors: [],
      });
    });

    it('should process directory sources by uploading all files within them', async () => {
      const source = 'templates';
      const fullPath = path.join('/path/to/theme', source);

      // Mock directory stats
      mockFileSystem.stat.mockResolvedValueOnce({
        isFile: () => false,
        isDirectory: () => true,
      });

      // Mock files in directory
      const filesInDir = [
        '/path/to/theme/templates/index.liquid',
        '/path/to/theme/templates/product.liquid',
        '/path/to/theme/templates/collection.liquid',
      ];
      mockFileSystem.getFiles.mockResolvedValueOnce(filesInDir);

      const result = await command.execute([source], {});

      expect(mockFileSystem.getFiles).toHaveBeenCalledWith(fullPath);
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(3);
      expect(mockThemeApi.compileAssets).toHaveBeenCalled();
      expect(result.deployedCount).toBe(3);
    });

    it('should skip sensitive files by default', async () => {
      const sources = [
        'config/settings_data.json',
        '.draft/settings_data.json',
        'templates/index.liquid',
      ];

      const result = await command.execute(sources, {});

      // Only the non-sensitive file should be uploaded
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(1);
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
        'templates/index.liquid',
        path.join('/path/to/theme', 'templates/index.liquid'),
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Skipping upload of sensitive file'),
      );
      expect(result.deployedCount).toBe(1);
    });

    it('should skip excluded paths', async () => {
      const sources = [
        'node_modules/package/index.js',
        '.git/config',
        'templates/index.liquid',
      ];

      // Mock checkPath to exclude certain paths
      mockFileSystem.checkPath
        .mockReturnValueOnce(false) // node_modules path
        .mockReturnValueOnce(false) // .git path
        .mockReturnValueOnce(true); // templates path

      const result = await command.execute(sources, {});

      // Only the non-excluded file should be uploaded
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(1);
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
        'templates/index.liquid',
        path.join('/path/to/theme', 'templates/index.liquid'),
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Skipping excluded file'),
      );
      expect(result.deployedCount).toBe(1);
    });

    it('should batch upload operations for many files', async () => {
      // Create 25 sources to test batching (batch size is 10)
      const sources = Array.from(
        { length: 25 },
        (_, i) => `assets/file${i}.css`,
      );

      const result = await command.execute(sources, {});

      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(25);
      expect(result.deployedCount).toBe(25);
    });
  });

  describe('execute() with no specified sources', () => {
    it('should upload all local files when no sources are specified', async () => {
      const allLocalFiles = [
        '/path/to/theme/templates/index.liquid',
        '/path/to/theme/assets/theme.css',
        '/path/to/theme/snippets/header.liquid',
      ];
      mockFileSystem.getFiles.mockResolvedValueOnce(allLocalFiles);

      const result = await command.execute([], {});

      expect(mockFileSystem.getFiles).toHaveBeenCalledWith('/path/to/theme');
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(3);
      expect(mockThemeApi.compileAssets).toHaveBeenCalled();
      expect(result.deployedCount).toBe(3);
    });

    it('should skip sensitive files when uploading all local files', async () => {
      const allLocalFiles = [
        '/path/to/theme/templates/index.liquid',
        '/path/to/theme/config/settings_data.json',
        '/path/to/theme/.draft/test.liquid',
      ];
      mockFileSystem.getFiles.mockResolvedValueOnce(allLocalFiles);

      const result = await command.execute([], {});

      // Only one file should be uploaded
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(1);
      expect(result.deployedCount).toBe(1);
    });
  });

  describe('--clean option', () => {
    it('should remove remote assets not found locally when using --clean', async () => {
      // Set up remote assets
      const remoteAssets = [
        { type: 'file', path: 'templates/index.liquid' },
        { type: 'file', path: 'templates/old-template.liquid' }, // Not in local files
        { type: 'file', path: 'assets/old-asset.css' }, // Not in local files
        { type: 'dir', path: 'templates' }, // Directories should be ignored
      ];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);

      // Set up local files (missing some remote assets)
      const localFiles = [
        '/path/to/theme/templates/index.liquid',
        '/path/to/theme/assets/new-asset.css',
      ];
      mockFileSystem.getFiles.mockResolvedValueOnce(localFiles);

      // Execute with --clean flag
      const result = await command.execute([], { clean: true });

      // Should try to remove the assets not found locally
      expect(mockThemeApi.removeAsset).toHaveBeenCalledTimes(2);
      expect(mockThemeApi.removeAsset).toHaveBeenCalledWith(
        'templates/old-template.liquid',
        expect.objectContaining({ quiet: true }),
      );
      expect(mockThemeApi.removeAsset).toHaveBeenCalledWith(
        'assets/old-asset.css',
        expect.objectContaining({ quiet: true }),
      );
      expect(result.removedCount).toBe(2);
    });

    it('should not clean sensitive files', async () => {
      // Set up remote assets including sensitive files
      const remoteAssets = [
        { type: 'file', path: 'templates/index.liquid' },
        { type: 'file', path: 'config/settings_data.json' }, // Sensitive
        { type: 'file', path: '.draft/test.liquid' }, // Sensitive
      ];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);

      // Set up local files (missing the remote assets)
      const localFiles = ['/path/to/theme/templates/index.liquid'];
      mockFileSystem.getFiles.mockResolvedValueOnce(localFiles);

      // Execute with --clean flag
      const result = await command.execute([], { clean: true });

      // Should not try to remove sensitive files
      expect(mockThemeApi.removeAsset).not.toHaveBeenCalled();
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Skipping deletion of sensitive remote file'),
      );
      expect(result.removedCount).toBe(0);
    });

    it('should never clean remote public/ assets', async () => {
      const remoteAssets = [
        { type: 'file', path: 'templates/old.liquid' },
        { type: 'file', path: 'public/main.abc123.css' },
        { type: 'file', path: 'public/js/app.def456.js' },
      ];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);
      mockFileSystem.getFiles.mockResolvedValueOnce([
        '/path/to/theme/templates/index.liquid',
      ]);

      const result = await command.execute([], { clean: true });

      expect(mockThemeApi.removeAsset).toHaveBeenCalledTimes(1);
      expect(mockThemeApi.removeAsset).toHaveBeenCalledWith(
        'templates/old.liquid',
        expect.objectContaining({ quiet: true }),
      );
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Skipping deletion of compiled remote file'),
      );
      expect(result.removedCount).toBe(1);
    });
  });

  describe('--config-push / --config-pull / --assets-pull', () => {
    it('should pull settings before and after with --config-pull and public with --assets-pull', async () => {
      mockThemeApi.getAssets.mockResolvedValueOnce([
        { type: 'file', path: 'public/main.abc123.css' },
      ]);
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.getFiles.mockResolvedValueOnce([]);

      const result = await command.execute(['templates/index.liquid'], {
        configPull: true,
        assetsPull: true,
      });

      expect(
        mockThemeApi.downloadAsset.mock.calls.filter(
          (c) => c[0] === 'config/settings_data.json',
        ),
      ).toHaveLength(2);
      expect(mockThemeApi.compileAssets).toHaveBeenCalled();
      expect(mockThemeApi.downloadAsset).toHaveBeenCalledWith(
        'public/main.abc123.css',
        path.join('/path/to/theme', 'public/main.abc123.css'),
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(result.success).toBe(true);
    });

    it('should not pull settings or public without the flags', async () => {
      await command.execute(['templates/index.liquid'], {});

      expect(mockThemeApi.downloadAsset).not.toHaveBeenCalled();
    });

    it('should pull settings but skip public with --config-pull and --no-compile', async () => {
      await command.execute(['templates/index.liquid'], {
        configPull: true,
        assetsPull: true,
        compile: false,
      });

      expect(
        mockThemeApi.downloadAsset.mock.calls.filter(
          (c) => c[0] === 'config/settings_data.json',
        ),
      ).toHaveLength(2);
      expect(mockThemeApi.compileAssets).not.toHaveBeenCalled();
      expect(
        mockThemeApi.downloadAsset.mock.calls.some((c) =>
          String(c[0]).startsWith('public/'),
        ),
      ).toBe(false);
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('Compiled public/ pull skipped'),
      );
    });

    it('should upload settings_data.json with --config-push', async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      const result = await command.execute(['templates/index.liquid'], {
        configPush: true,
      });

      expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
        'config/settings_data.json',
        path.join('/path/to/theme', 'config/settings_data.json'),
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
        'templates/index.liquid',
        path.join('/path/to/theme', 'templates/index.liquid'),
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(result.deployedCount).toBe(2);
    });

    it('should not pre-pull settings when --config-push and --config-pull are both set', async () => {
      mockFileSystem.exists.mockResolvedValue(true);

      await command.execute(['templates/index.liquid'], {
        configPush: true,
        configPull: true,
      });

      // Only post-pull (once), not pre-pull
      expect(
        mockThemeApi.downloadAsset.mock.calls.filter(
          (c) => c[0] === 'config/settings_data.json',
        ),
      ).toHaveLength(1);
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
        'config/settings_data.json',
        expect.any(String),
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
    });

    it('should still skip .draft/ even with --config-push', async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      await command.execute(
        ['.draft/settings_data.json', 'templates/index.liquid'],
        { configPush: true },
      );

      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(1);
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledWith(
        'templates/index.liquid',
        expect.any(String),
        mockFileSystem,
        expect.objectContaining({ quiet: true }),
      );
    });
  });

  describe('--no-compile option', () => {
    it('should skip compilation with --no-compile option', async () => {
      await command.execute(['templates/index.liquid'], { compile: false });

      expect(mockThemeApi.uploadAsset).toHaveBeenCalled();
      expect(mockThemeApi.compileAssets).not.toHaveBeenCalled();
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('Asset compilation skipped'),
      );
    });

    it('should skip compilation if no assets were uploaded', async () => {
      // Mock uploadAsset to return false (skip)
      mockThemeApi.uploadAsset.mockResolvedValue(false);

      await command.execute(['templates/index.liquid'], {});

      expect(mockThemeApi.compileAssets).not.toHaveBeenCalled();
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('No assets uploaded, skipping compilation'),
      );
    });
  });

  describe('error handling', () => {
    it('should handle errors during file stat', async () => {
      const source = 'non-existent.liquid';
      mockFileSystem.stat.mockRejectedValueOnce(new Error('File not found'));

      const result = await command.execute([source], {});

      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Local source not found'),
        expect.any(String),
      );
      expect(result.deployedCount).toBe(0);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle upload errors and continue with other files', async () => {
      const sources = ['file1.liquid', 'file2.liquid', 'file3.liquid'];

      // Make second file upload fail
      mockThemeApi.uploadAsset
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockResolvedValueOnce(true);

      const result = await command.execute(sources, {});

      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to upload asset'),
        expect.any(String),
      );
      // Should still try to upload all files
      expect(mockThemeApi.uploadAsset).toHaveBeenCalledTimes(3);
      // Should have 2 successful uploads
      expect(result.deployedCount).toBe(2);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle clean errors and continue', async () => {
      // Set up remote assets
      const remoteAssets = [
        { type: 'file', path: 'file1.liquid' },
        { type: 'file', path: 'file2.liquid' },
      ];
      mockThemeApi.getAssets.mockResolvedValueOnce(remoteAssets);

      // No local files (so both would be removed)
      mockFileSystem.getFiles.mockResolvedValueOnce([]);

      // Make first removal fail
      mockThemeApi.removeAsset
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(undefined);

      const result = await command.execute([], { clean: true });

      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete remote asset'),
        expect.any(String),
      );
      // Should still try to remove both files
      expect(mockThemeApi.removeAsset).toHaveBeenCalledTimes(2);
      // Should have 1 successful removal
      expect(result.removedCount).toBe(1);
      expect(result.success).toBe(false);
    });

    it('should handle compilation errors', async () => {
      const source = 'templates/index.liquid';
      mockThemeApi.compileAssets.mockRejectedValueOnce(
        new Error('Compile failed'),
      );

      const result = await command.execute([source], {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle AppError properly', async () => {
      const error = new AppError('Test error');
      mockThemeApi.getAssets.mockRejectedValueOnce(error);

      const result = await command.execute([], { clean: true });

      expect(mockLogger.printError).toHaveBeenCalledWith(error.message);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });

    it('should handle other errors with logger', async () => {
      const error = new Error('Unexpected error');
      mockThemeApi.getAssets.mockRejectedValueOnce(error);
      mockLogger.handleError.mockImplementation(() => {});

      const result = await command.execute([], { clean: true });

      expect(mockLogger.handleError).toHaveBeenCalledWith(error);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });
  });
});
