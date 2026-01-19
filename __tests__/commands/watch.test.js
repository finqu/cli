// filepath: /Users/miikka/Finqu/theme-kit/__tests__/commands/watch.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WatchCommand, createWatchCommand } from '../../src/commands/watch.js';
import { ThemeWatcher } from '../../src/core/theme-watcher.js';
import { AppError } from '../../src/core/error.js';

vi.mock(import('../../src/core/theme-watcher.js'), () => {
  const ThemeWatcher = vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    _processQueuesDebounced: vi.fn(),
    _processQueues: vi.fn(),
    uploadQueue: new Set(),
    deleteQueue: new Set(),
  }));
  return { ThemeWatcher };
});

describe('WatchCommand', () => {
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
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
      }),
      getFiles: vi.fn().mockResolvedValue([]),
      checkPath: vi.fn().mockReturnValue(true),
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
    command = new WatchCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('watch');
    });

    it('should have the correct description', () => {
      expect(command.description).toContain('Watch for file changes');
    });

    it('should belong to the theme group', () => {
      expect(command.group).toBe('theme');
    });

    it('should have the correct options', () => {
      const options = command.options;
      expect(options).toHaveLength(1);
      expect(options[0]).toEqual({
        flags: '--ignore <patterns...>',
        description: 'Patterns to ignore (in addition to default ignores)',
      });
    });

    it('should create command with factory function', () => {
      const factoryCommand = createWatchCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(WatchCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('execute()', () => {
    it('should get theme directory from config', async () => {
      await command.execute({});

      expect(mockConfig.get).toHaveBeenCalledWith('themeDir');
    });

    it('should create and start a ThemeWatcher instance', async () => {
      const themeDirPath = '/path/to/theme';
      mockConfig.get.mockReturnValue(themeDirPath);

      const result = await command.execute({});
      expect(result).toEqual({ success: true });
      expect(ThemeWatcher).toHaveBeenCalledWith(
        themeDirPath,
        mockApp.services.themeApi,
        mockFileSystem,
        mockLogger,
        1000,
      );

      const watcherInstance = ThemeWatcher.mock.results[0].value;
      expect(watcherInstance.start).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle custom ignore patterns if provided', async () => {
      // This test is a placeholder since the current implementation
      // doesn't handle ignore patterns directly in the command
      // When implemented, this should test that ignore patterns are passed to the watcher
      await command.execute({ ignore: ['*.tmp', '*.bak'] });

      // Eventually this would test the ignore patterns are passed correctly
      expect(ThemeWatcher).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle AppError properly', async () => {
      const error = new AppError('Theme directory not found');
      mockConfig.get.mockImplementation(() => {
        throw error;
      });

      const result = await command.execute({});

      expect(mockLogger.printError).toHaveBeenCalledWith(error.message);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });

    it('should handle other errors with logger', async () => {
      const error = new Error('Unexpected error');
      mockConfig.get.mockImplementation(() => {
        throw error;
      });

      const result = await command.execute({});

      expect(mockLogger.handleError).toHaveBeenCalledWith(error);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });

    it('should handle ThemeWatcher creation errors', async () => {
      ThemeWatcher.mockImplementationOnce(() => {
        throw new Error('Failed to create watcher');
      });

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockLogger.handleError).toHaveBeenCalled();
    });

    it('should handle ThemeWatcher start errors', async () => {
      // Mock ThemeWatcher with a failing start method
      ThemeWatcher.mockImplementationOnce(() => {
        return {
          start: vi.fn().mockImplementation(() => {
            throw new Error('Failed to start watcher');
          }),
        };
      });

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockLogger.handleError).toHaveBeenCalled();
    });
  });
});
