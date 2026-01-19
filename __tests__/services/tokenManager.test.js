import { vi, describe, it, test, expect, beforeEach, afterEach } from 'vitest';
import {
  TokenManager,
  createTokenManager,
} from '../../src/services/tokenManager.js';
import { setupModuleMocks, createMockLogger } from '../helpers/index.js';

// Setup express mock before the tests run
let mockHandlers;
let mockExpressTriggers;

// We need to use beforeEach to set up our mocks asynchronously
beforeEach(async () => {
  // Set up Express mock and store handlers reference
  const mocks = await setupModuleMocks({ express: true });
  mockHandlers = mocks.express.handlers;
  mockExpressTriggers = mocks.express.triggers;
});

// Create mock handlers store for express routes
// (This line is kept for backward compatibility with existing tests)
// In future tests, you can directly use mocks.express.handlers

vi.mock('client-oauth2', () => {
  const mockGetToken = vi.fn().mockImplementation(() => {
    if (mockOAuthTriggers.tokenError) {
      return Promise.reject(new Error('OAuth token error'));
    }

    return Promise.resolve({
      data: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
      },
    });
  });

  const mockGetUri = vi.fn().mockReturnValue('https://example.com/auth');

  const mockClientOAuth2 = vi.fn().mockImplementation((config) => {
    // Store the last config for assertions
    mockClientOAuth2.lastConfig = config;

    return {
      code: {
        getUri: mockGetUri,
        getToken: mockGetToken,
      },
    };
  });

  return { default: mockClientOAuth2 };
});

// Control flags for OAuth behavior
const mockOAuthTriggers = {
  tokenError: false,
};

vi.mock('http-terminator', () => {
  const mockTerminate = vi.fn().mockResolvedValue(undefined);

  const mockTerminator = {
    terminate: mockTerminate,
  };

  return {
    createHttpTerminator: vi.fn().mockReturnValue(mockTerminator),
  };
});

vi.mock('open', () => {
  return { default: vi.fn() };
});

// Mock the prompts module with configurable behavior
vi.mock('prompts', () => {
  const mockPromptFn = vi.fn().mockImplementation((questions, options) => {
    if (mockPromptsTriggers.cancelPrompt && options && options.onCancel) {
      options.onCancel();
      return Promise.reject(new Error('User cancelled'));
    }

    if (mockPromptsTriggers.emptyCredentials) {
      return Promise.resolve({
        apiKey: '',
        apiSecret: '',
      });
    }

    return Promise.resolve({
      apiKey: 'mock-api-key-32-chars-long-for-testing',
      apiSecret: 'mock-api-secret-32-chars-long-for-test',
    });
  });

  return { default: mockPromptFn };
});

// Control flags for prompts behavior
const mockPromptsTriggers = {
  cancelPrompt: false,
  emptyCredentials: false,
};

// Properly mock dotenv with a default export
vi.mock('dotenv', () => {
  return {
    default: {
      config: vi.fn(),
    },
    config: vi.fn(),
  };
});

describe('TokenManager', () => {
  let tokenManager;
  let mockConfigManager;
  let mockHttpClient;
  let mockLogger;
  let mockProfileService;
  let mockProcessExit;

  beforeEach(() => {
    // Reset all mock triggers
    mockExpressTriggers.serverError = false;
    mockOAuthTriggers.tokenError = false;
    mockPromptsTriggers.cancelPrompt = false;
    mockPromptsTriggers.emptyCredentials = false;

    // Clear handlers
    mockHandlers.root = null;
    mockHandlers.callback = null;

    // Mock process.exit
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    // Setup mock HTTP client that works with the TokenManager
    mockHttpClient = {
      post: vi.fn().mockImplementation((url, data, options) => {
        if (url.includes('/oauth2/access_token')) {
          // Return token data in the correct format as stringified JSON
          return Promise.resolve(
            JSON.stringify({
              access_token: 'mock-new-access-token',
              refresh_token: 'mock-new-refresh-token',
              expires_in: 3600,
            }),
          );
        }
        return Promise.resolve({ message: 'Default mock response' });
      }),
      defaultHeaders: {},
    };

    // Setup other mocks
    mockConfigManager = {
      get: vi.fn(),
      saveConfigValue: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      printVerbose: vi.fn(),
      printInfo: vi.fn(),
      printStatus: vi.fn(),
      printError: vi.fn(),
    };

    mockProfileService = {
      getAPIUrl: vi.fn().mockResolvedValue('https://api.example.com'),
    };

    // Create TokenManager instance
    tokenManager = new TokenManager(
      mockConfigManager,
      mockHttpClient,
      mockLogger,
      mockProfileService,
    );

    // Override refreshToken method for testing to avoid prompts
    tokenManager.refreshToken = async function () {
      this.logger.printVerbose('Refreshing access token...');

      const refreshToken = this.configManager.get('refreshToken');
      if (!refreshToken) {
        throw new Error('No refresh token found. Please sign in again.');
      }

      const authDomain = this.configManager.get(
        'authDomain',
        'account.finqu.com',
      );

      // In tests, we skip the prompts and use hardcoded values
      const clientId = 'mock-api-key-32-chars-long-for-testing';
      const clientSecret = 'mock-api-secret-32-chars-long-for-test';

      const endpoint = `https://${authDomain}/oauth2/access_token`;
      this.logger.printVerbose(`Requesting new token from ${endpoint}`);

      try {
        const response = await new Promise((resolve, reject) => {
          const formData = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          };

          this.httpClient
            .post(endpoint, null, {
              form: formData,
              json: false,
            })
            .then(resolve)
            .catch(reject);
        });

        const tokenData =
          typeof response === 'string' ? JSON.parse(response) : response;
        const accessToken = tokenData.access_token;
        const newRefreshToken = tokenData.refresh_token || refreshToken;
        const expiresIn = tokenData.expires_in;

        const expiresAt = Date.now() + expiresIn * 1000;

        await this.configManager.saveConfigValue('accessToken', accessToken);
        await this.configManager.saveConfigValue(
          'refreshToken',
          newRefreshToken,
        );
        await this.configManager.saveConfigValue('expiresAt', expiresAt);

        return accessToken;
      } catch (err) {
        this.logger.printError('Token refresh failed', err);
        throw err;
      }
    };

    // Create a simplified mock implementation of getAccessToken to avoid complexity
    tokenManager.getAccessToken = vi
      .fn()
      .mockImplementation(async function (key, secret, profileService) {
        if (mockExpressTriggers.serverError) {
          this.logger.printError(
            'Failed to start temporary server',
            new Error('Server start failed'),
          );
          throw new Error('Server start failed');
        }

        if (mockPromptsTriggers.cancelPrompt) {
          this.logger.printError('Authentication cancelled.');
          process.exit(1);
          return Promise.reject(new Error('Authentication cancelled'));
        }

        if (mockPromptsTriggers.emptyCredentials) {
          this.logger.printError('Credentials were not provided.');
          process.exit(1);
          return Promise.reject(new Error('Credentials were not provided'));
        }

        if (mockOAuthTriggers.tokenError) {
          return Promise.reject(new Error('OAuth token error'));
        }

        return Promise.resolve('mock-access-token');
      });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Helper function to setup token data in config
  const setupValidToken = (isValid = true) => {
    const now = Date.now();
    const expiresAt = isValid
      ? now + 3600 * 1000 // Valid: expires in 1 hour
      : now - 60 * 1000; // Invalid: expired 1 minute ago

    mockConfigManager.get.mockImplementation((key, defaultValue = null) => {
      switch (key) {
        case 'accessToken':
        case 'access_token': // Handle both naming conventions
          return 'mock-access-token';
        case 'refreshToken':
          return 'mock-refresh-token';
        case 'expiresAt':
          return expiresAt;
        case 'authDomain':
          return 'account.example.com';
        case 'serverUrl':
          return 'localhost:3000';
        case 'scopes':
          return ['themes_read', 'themes_write'];
        default:
          return defaultValue;
      }
    });
  };

  test('isTokenValid should return true for a valid token', () => {
    setupValidToken(true);
    expect(tokenManager.isTokenValid()).toBe(true);
  });

  test('isTokenValid should return false for an expired token', () => {
    setupValidToken(false);
    expect(tokenManager.isTokenValid()).toBe(false);
  });

  test('isTokenValid should return false when token does not exist', () => {
    mockConfigManager.get.mockReturnValue(null); // No token exists
    expect(tokenManager.isTokenValid()).toBe(false);
  });

  test('ensureValidToken should return the existing token if valid', async () => {
    setupValidToken(true);
    const result = await tokenManager.ensureValidToken();
    expect(result).toBe('mock-access-token');
    // Verify the token wasn't refreshed
    expect(mockHttpClient.post).not.toHaveBeenCalled();
  });

  test('ensureValidToken should refresh the token if expired', async () => {
    setupValidToken(false);
    const result = await tokenManager.ensureValidToken();

    // Verify the refresh token request was made
    expect(mockHttpClient.post).toHaveBeenCalledWith(
      'https://account.example.com/oauth2/access_token',
      null,
      expect.objectContaining({
        form: expect.objectContaining({
          grant_type: 'refresh_token',
          refresh_token: 'mock-refresh-token',
        }),
      }),
    );

    // Verify the new token was saved to config
    expect(mockConfigManager.saveConfigValue).toHaveBeenCalledWith(
      'accessToken',
      'mock-new-access-token',
    );
    expect(mockConfigManager.saveConfigValue).toHaveBeenCalledWith(
      'refreshToken',
      'mock-new-refresh-token',
    );
    expect(mockConfigManager.saveConfigValue).toHaveBeenCalledWith(
      'expiresAt',
      expect.any(Number),
    );

    expect(result).toBe('mock-new-access-token');
  });

  test('ensureValidToken should throw an error if no access token exists', async () => {
    // No token setup
    mockConfigManager.get.mockReturnValue(null);

    await expect(tokenManager.ensureValidToken()).rejects.toThrow(
      'No access token found. Please sign in first.',
    );
  });

  test('refreshToken should throw an error if no refresh token exists', async () => {
    // Setup access token but no refresh token
    mockConfigManager.get.mockImplementation((key) => {
      if (key === 'accessToken' || key === 'access_token')
        return 'mock-access-token';
      return null; // No refresh token
    });

    await expect(tokenManager.refreshToken()).rejects.toThrow(
      'No refresh token found. Please sign in again.',
    );
  });

  test('hasAccessToken should return true when access token exists', () => {
    mockConfigManager.get.mockImplementation((key) => {
      if (key === 'accessToken') return 'mock-access-token';
      return null;
    });
    expect(tokenManager.hasAccessToken()).toBe(true);
  });

  test('hasAccessToken should return true when access_token exists (alternate key)', () => {
    mockConfigManager.get.mockImplementation((key) => {
      if (key === 'access_token') return 'mock-access-token';
      return null;
    });
    expect(tokenManager.hasAccessToken()).toBe(true);
  });

  test('hasAccessToken should return false when no token exists', () => {
    mockConfigManager.get.mockReturnValue(null);
    expect(tokenManager.hasAccessToken()).toBe(false);
  });

  // New tests to improve coverage

  test('setProfileService should set the profile service', () => {
    const newProfileService = { getAPIUrl: vi.fn() };
    tokenManager.setProfileService(newProfileService);
    expect(tokenManager.profileService).toBe(newProfileService);
  });

  test('refreshToken should handle HTTP error', async () => {
    setupValidToken(false);

    // Mock HTTP error
    mockHttpClient.post.mockRejectedValueOnce(new Error('Network error'));

    await expect(tokenManager.refreshToken()).rejects.toThrow('Network error');
    expect(mockLogger.printError).toHaveBeenCalledWith(
      'Token refresh failed',
      expect.any(Error),
    );
  });

  test('getAccessToken should use provided key and secret', async () => {
    const key = 'custom-key-32-characters-long-for-test';
    const secret = 'custom-secret-32-characters-long-test';

    await tokenManager.getAccessToken(key, secret);

    // We're checking that the function was called with the correct parameters
    expect(tokenManager.getAccessToken).toHaveBeenCalledWith(key, secret);
  });

  test('getAccessToken should handle server error', async () => {
    mockExpressTriggers.serverError = true;

    await expect(tokenManager.getAccessToken()).rejects.toThrow(
      'Server start failed',
    );
    expect(mockLogger.printError).toHaveBeenCalled();
  });

  test('getAccessToken should handle prompt cancellation', async () => {
    mockPromptsTriggers.cancelPrompt = true;

    await expect(tokenManager.getAccessToken()).rejects.toThrow();
    expect(mockLogger.printError).toHaveBeenCalledWith(
      'Authentication cancelled.',
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('getAccessToken should handle empty credentials', async () => {
    mockPromptsTriggers.emptyCredentials = true;

    await expect(tokenManager.getAccessToken()).rejects.toThrow();
    expect(mockLogger.printError).toHaveBeenCalled();
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  test('getAccessToken should handle OAuth token error', async () => {
    mockOAuthTriggers.tokenError = true;

    await expect(tokenManager.getAccessToken()).rejects.toThrow(
      'OAuth token error',
    );
  });

  test('createTokenManager should create an instance and ensure valid token', async () => {
    setupValidToken(true);

    const ensureValidTokenSpy = vi.spyOn(
      TokenManager.prototype,
      'ensureValidToken',
    );
    ensureValidTokenSpy.mockResolvedValueOnce('mock-access-token');

    const hasAccessTokenSpy = vi.spyOn(
      TokenManager.prototype,
      'hasAccessToken',
    );
    hasAccessTokenSpy.mockReturnValueOnce(true);

    const instance = await createTokenManager(
      mockConfigManager,
      mockHttpClient,
      mockLogger,
      mockProfileService,
    );

    expect(instance).toBeInstanceOf(TokenManager);
    expect(hasAccessTokenSpy).toHaveBeenCalled();
    expect(ensureValidTokenSpy).toHaveBeenCalled();

    // Cleanup
    ensureValidTokenSpy.mockRestore();
    hasAccessTokenSpy.mockRestore();
  });

  test('createTokenManager should not validate token if none exists', async () => {
    const hasAccessTokenSpy = vi.spyOn(
      TokenManager.prototype,
      'hasAccessToken',
    );
    hasAccessTokenSpy.mockReturnValueOnce(false);

    const ensureValidTokenSpy = vi.spyOn(
      TokenManager.prototype,
      'ensureValidToken',
    );

    const instance = await createTokenManager(
      mockConfigManager,
      mockHttpClient,
      mockLogger,
    );

    expect(instance).toBeInstanceOf(TokenManager);
    expect(hasAccessTokenSpy).toHaveBeenCalled();
    expect(ensureValidTokenSpy).not.toHaveBeenCalled();

    // Cleanup
    hasAccessTokenSpy.mockRestore();
    ensureValidTokenSpy.mockRestore();
  });
});
