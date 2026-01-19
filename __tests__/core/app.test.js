import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/core/app.js';
import { AppError } from '../../src/core/error.js';

// Hoist mocks to ensure they are available before imports and vi.mock calls
const {
  mockFileSystem,
  mockHttpClient,
  mockTokenManager,
  mockProfileService,
  mockThemeApi,
} = vi.hoisted(() => {
  return {
    mockFileSystem: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      exists: vi.fn(),
    },
    mockHttpClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    mockTokenManager: {
      getAccessToken: vi.fn(),
      refreshTokenIfNeeded: vi.fn(),
    },
    mockProfileService: {
      getProfile: vi.fn(),
      getUserInfo: vi.fn(),
    },
    mockThemeApi: {
      listThemes: vi.fn(),
      getTheme: vi.fn(),
      createTheme: vi.fn(),
    },
  };
});

// Mock dependencies using the hoisted mocks
vi.mock('../../src/io/fileSystem.js', () => ({
  createFileSystem: vi.fn(() => mockFileSystem),
}));
vi.mock('../../src/services/http.js', () => ({
  createHttpClient: vi.fn(() => mockHttpClient),
}));
vi.mock('../../src/services/themeApi.js', () => ({
  createThemeApi: vi.fn(() => mockThemeApi),
}));
vi.mock('../../src/services/tokenManager.js', () => ({
  createTokenManager: vi.fn(async () => mockTokenManager),
}));
vi.mock('../../src/services/profileService.js', () => ({
  createProfileService: vi.fn(() => mockProfileService),
}));

// Import the factory functions to check if they were called
import { createFileSystem } from '../../src/io/fileSystem.js';
import { createHttpClient } from '../../src/services/http.js';
import { createThemeApi } from '../../src/services/themeApi.js';
import { createTokenManager } from '../../src/services/tokenManager.js';
import { createProfileService } from '../../src/services/profileService.js';

describe('createApp', () => {
  let mockConfigManager;
  let mockLogger;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Setup mock config manager
    mockConfigManager = {
      get: vi.fn((key, defaultValue) => {
        // Provide default values for common config keys
        if (key === 'accessToken' || key === 'access_token') return 'test-token';
        if (key === 'resourceUrl') return 'https://api.example.com';
        if (key === 'apiVersion') return '1.2';
        return defaultValue !== undefined ? defaultValue : null;
      }),
      set: vi.fn(),
      env: vi.fn(),
      saveConfig: vi.fn(),
    };

    // Setup mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      printInfo: vi.fn(),
      printWarning: vi.fn(),
      printError: vi.fn(),
      printSuccess: vi.fn(),
      printVerbose: vi.fn(),
      printStatus: vi.fn(),
    };

    // Ensure mocked factory functions return the hoisted mocks
    vi.mocked(createFileSystem).mockReturnValue(mockFileSystem);
    vi.mocked(createHttpClient).mockReturnValue(mockHttpClient);
    vi.mocked(createThemeApi).mockReturnValue(mockThemeApi);
    vi.mocked(createTokenManager).mockResolvedValue(mockTokenManager); // Use mockResolvedValue for async factory
    vi.mocked(createProfileService).mockReturnValue(mockProfileService);
  });

  afterEach(() => {
    // Optional: Restore mocks if needed, though resetAllMocks in beforeEach is usually sufficient
    // vi.restoreAllMocks();
  });

  test('should throw error if logger is not provided', async () => {
    await expect(createApp({}, mockConfigManager)).rejects.toThrow(
      'Logger instance must be provided to createApp',
    );
  });

  test('should throw error if configManager is not provided', async () => {
    await expect(createApp({}, null, mockLogger)).rejects.toThrow(
      'ConfigManager instance must be provided to createApp',
    );
  });

  test('should create app with core services initialized', async () => {
    const app = await createApp({}, mockConfigManager, mockLogger);

    expect(app.config).toBe(mockConfigManager);
    expect(app.logger).toBe(mockLogger);
    expect(app.fileSystem).toBe(mockFileSystem);
    expect(createFileSystem).toHaveBeenCalledTimes(1);
  });

  test('should create app with dependent services initialized', async () => {
    const app = await createApp({}, mockConfigManager, mockLogger);

    // Verify HTTP client creation
    expect(createHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHeaders: expect.any(Function),
        logger: mockLogger,
      }),
    );
    expect(app.services.http).toBe(mockHttpClient);

    // Verify Profile service creation
    expect(createProfileService).toHaveBeenCalledWith(
      mockHttpClient,
      mockConfigManager,
      mockLogger,
    );
    expect(app.services.profile).toBe(mockProfileService);

    // Verify Token Manager creation
    expect(createTokenManager).toHaveBeenCalledWith(
      mockConfigManager,
      mockHttpClient,
      mockLogger,
      mockProfileService,
    );
    // Wait for the async token manager creation if necessary
    await vi.waitFor(async () => {
        expect(app.services.tokenManager).toBe(mockTokenManager);
    });
  });


  test('should initialize themeApi lazily on first access', async () => {
    const app = await createApp({}, mockConfigManager, mockLogger);

    // ThemeApi should NOT be created yet
    expect(createThemeApi).not.toHaveBeenCalled();

    // Access themeApi - should trigger lazy initialization
    const themeApiInstance = app.services.themeApi;

    // Verify themeApi was created AFTER access
    expect(createThemeApi).toHaveBeenCalledWith(
      mockHttpClient,
      mockTokenManager, // Ensure the resolved token manager is passed
      mockLogger, // Use app.logger for consistency if preferred
      mockConfigManager, // Use app.config for consistency if preferred
    );
    expect(createThemeApi).toHaveBeenCalledTimes(1);
    expect(themeApiInstance).toBe(mockThemeApi);

    // Accessing again should not re-initialize
    const themeApiInstanceAgain = app.services.themeApi;
    expect(createThemeApi).toHaveBeenCalledTimes(1);
    expect(themeApiInstanceAgain).toBe(mockThemeApi);
  });

  test('should throw AppError when accessing themeApi without resourceUrl configured', async () => {
    // Arrange: Configure mockConfigManager to return null for resourceUrl
    vi.mocked(mockConfigManager.get).mockImplementation((key) => {
      if (key === 'resourceUrl') return null;
      if (key === 'accessToken' || key === 'access_token') return 'test-token';
      return null;
    });

    const app = await createApp({}, mockConfigManager, mockLogger);

    // Act & Assert: Accessing themeApi should throw
    expect(() => app.services.themeApi).toThrow(AppError);
    expect(() => app.services.themeApi).toThrow('API root URL not configured');

    // Assert: Check if the error was logged (optional, depends on AppError implementation)
    // This assumes AppError logs the message upon creation or the calling code logs it.
    // Adjust based on actual error handling logic.
    // If AppError itself logs, this might be redundant.
    // If createApp logs before throwing, this is valid.
    expect(mockLogger.printError).toHaveBeenCalledWith(
      'API root URL not configured',
    );
    // Ensure themeApi factory was not called because config was missing
    expect(createThemeApi).not.toHaveBeenCalled();
  });

  test('should use custom fileSystem if provided in options', async () => {
    const customFileSystem = { readFile: vi.fn(), writeFile: vi.fn(), exists: vi.fn() };
    const app = await createApp(
      { fileSystem: customFileSystem }, // Provide custom instance
      mockConfigManager,
      mockLogger,
    );

    // Assert: Custom fileSystem is used
    expect(app.fileSystem).toBe(customFileSystem);
    // Assert: Default factory was NOT called
    expect(createFileSystem).not.toHaveBeenCalled();
  });
});
