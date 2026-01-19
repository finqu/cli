import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  ProfileService,
  createProfileService,
} from '../../src/services/profileService.js';

describe('ProfileService', () => {
  let profileService;
  let mockHttpClient;
  let mockConfigManager;
  let mockLogger;

  beforeEach(() => {
    // Create mock dependencies
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mockConfigManager = {
      get: vi.fn(),
      set: vi.fn(),
      saveConfig: vi.fn(),
    };

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
    };

    // Create instance to test
    profileService = new ProfileService(
      mockHttpClient,
      mockConfigManager,
      mockLogger,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with the provided dependencies', () => {
      expect(profileService.httpClient).toBe(mockHttpClient);
      expect(profileService.configManager).toBe(mockConfigManager);
      expect(profileService.logger).toBe(mockLogger);
      expect(profileService.selectedMerchant).toBeNull();
    });
  });

  describe('getProfile', () => {
    test('should fetch OAuth resource information using the default auth domain', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue('account.finqu.com');
      mockHttpClient.get.mockResolvedValue({
        merchant: { id: 'mock-merchant' },
      });

      // Execute
      const result = await profileService.getProfile();

      // Verify
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://account.finqu.com/oauth2/resource',
      );
      expect(result).toEqual({ merchant: { id: 'mock-merchant' } });
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Fetching OAuth resource'),
      );
    });

    test('should use custom auth domain if configured', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue('custom-domain.example.com');
      mockHttpClient.get.mockResolvedValue({
        merchant: { id: 'mock-merchant' },
      });

      // Execute
      await profileService.getProfile();

      // Verify
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://custom-domain.example.com/oauth2/resource',
      );
    });

    test('should handle HTTP errors properly', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue('account.finqu.com');
      const mockError = new Error('Network error');
      mockHttpClient.get.mockRejectedValue(mockError);

      // Execute & Verify
      await expect(profileService.getProfile()).rejects.toThrow(
        'Network error',
      );
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        'Failed to fetch resource endpoint information',
      );
    });
  });

  describe('getAPIUrl', () => {
    test('should return resourceUrl from configuration if available', async () => {
      // Setup
      mockConfigManager.get.mockImplementation((key) => {
        if (key === 'resourceUrl') return 'https://api.example.com';
        return null;
      });

      // Execute
      const result = await profileService.getAPIUrl();

      // Verify
      expect(result).toBe('https://api.example.com');
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Using resourceUrl from configuration'),
      );
      expect(mockHttpClient.get).not.toHaveBeenCalled(); // Should not make HTTP request
    });

    test('should return API URL from selectedMerchant if available', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue(null); // No resourceUrl in config
      profileService.selectedMerchant = {
        id: 'mock-merchant',
        endpoints: { api: 'https://merchant-api.example.com' },
      };

      // Execute
      const result = await profileService.getAPIUrl();

      // Verify
      expect(result).toBe('https://merchant-api.example.com');
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        expect.stringContaining('Using API endpoint from cached merchant'),
      );
      expect(mockHttpClient.get).not.toHaveBeenCalled(); // Should not make HTTP request
    });

    test('should fetch profile if no cached data is available', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue(null); // No resourceUrl in config
      const mockMerchantData = {
        merchant: {
          id: 'fetched-merchant',
          endpoints: { api: 'https://fetched-api.example.com' },
        },
      };
      mockHttpClient.get.mockResolvedValue(mockMerchantData);

      // Execute
      const result = await profileService.getAPIUrl();

      // Verify
      expect(result).toBe('https://fetched-api.example.com');
      expect(mockHttpClient.get).toHaveBeenCalled();
      expect(profileService.selectedMerchant).toBe(mockMerchantData.merchant);
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'merchant',
        'fetched-merchant',
      );
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'resourceUrl',
        'https://fetched-api.example.com',
      );
      expect(mockConfigManager.saveConfig).toHaveBeenCalled();
    });

    test('should throw if no merchant is found in profile response', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue(null); // No resourceUrl in config
      mockHttpClient.get.mockResolvedValue({}); // Empty response with no merchant

      // Execute & Verify
      await expect(profileService.getAPIUrl()).rejects.toThrow(
        'No merchant account found',
      );
    });

    test('should handle HTTP errors during profile fetch', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue(null); // No resourceUrl in config
      const mockError = new Error('Authentication failed');
      mockHttpClient.get.mockRejectedValue(mockError);

      // Execute & Verify
      await expect(profileService.getAPIUrl()).rejects.toThrow(
        'Authentication failed',
      );
      expect(mockLogger.printError).toHaveBeenCalledWith(
        'Failed to get API URL',
        mockError,
      );
    });

    test('should handle merchant without endpoints', async () => {
      // Setup
      mockConfigManager.get.mockReturnValue(null);
      const mockMerchantData = {
        merchant: {
          id: 'merchant-without-endpoints',
        },
      };
      mockHttpClient.get.mockResolvedValue(mockMerchantData);

      // Execute & Verify
      await expect(profileService.getAPIUrl()).rejects.toThrow();
      expect(mockConfigManager.set).toHaveBeenCalledWith(
        'merchant',
        'merchant-without-endpoints',
      );
      expect(mockConfigManager.saveConfig).not.toHaveBeenCalled(); // Should not save incomplete data
    });
  });

  describe('createProfileService factory function', () => {
    test('should create and return a ProfileService instance', () => {
      const service = createProfileService(
        mockHttpClient,
        mockConfigManager,
        mockLogger,
      );

      expect(service).toBeInstanceOf(ProfileService);
      expect(service.httpClient).toBe(mockHttpClient);
      expect(service.configManager).toBe(mockConfigManager);
      expect(service.logger).toBe(mockLogger);
    });
  });
});
