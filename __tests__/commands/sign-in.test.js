import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SignInCommand,
  createSignInCommand,
} from '../../src/commands/sign-in.js';
import { AppError } from '../../src/core/error.js';

describe('SignInCommand', () => {
  let command;
  let mockApp;
  let mockLogger;
  let mockTokenManager;
  let mockProfileService;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create mock token manager
    mockTokenManager = {
      getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    };

    // Create mock profile service
    mockProfileService = {
      saveProfile: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock logger
    mockLogger = {
      print: vi.fn(),
      printInfo: vi.fn(),
      printStatus: vi.fn(),
      printSuccess: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      handleError: vi.fn(),
    };

    // Create mock app with required services
    mockApp = {
      services: {
        tokenManager: mockTokenManager,
        profile: mockProfileService,
      },
      logger: mockLogger,
    };

    // Create command instance for testing
    command = new SignInCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('sign-in');
    });

    it('should have the correct description', () => {
      expect(command.description).toBe('Sign in to the Finqu API');
    });

    it('should have correct options', () => {
      const options = command.options;
      expect(options).toHaveLength(2);

      // Check key option
      expect(options).toContainEqual({
        flags: '--key <key>',
        description: expect.stringContaining('API key'),
      });

      // Check secret option
      expect(options).toContainEqual({
        flags: '--secret <secret>',
        description: expect.stringContaining('API secret'),
      });
    });

    it('should be a top-level command (no group)', () => {
      expect(command.group).toBeNull();
    });

    it('should create command with factory function', () => {
      const factoryCommand = createSignInCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(SignInCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('execute()', () => {
    it('should sign in successfully with provided credentials', async () => {
      const options = {
        key: 'test-api-key',
        secret: 'test-api-secret',
      };

      const result = await command.execute(options);

      expect(mockTokenManager.getAccessToken).toHaveBeenCalledWith(
        options.key,
        options.secret,
        mockProfileService,
      );
      expect(mockLogger.printStatus).toHaveBeenCalledWith(
        expect.stringContaining('Signing in'),
      );
      expect(mockLogger.printSuccess).toHaveBeenCalledWith(
        expect.stringContaining('successful'),
      );
      expect(result).toEqual({
        success: true,
      });
    });

    it('should sign in without explicit credentials (using stored values)', async () => {
      const options = {};

      const result = await command.execute(options);

      expect(mockTokenManager.getAccessToken).toHaveBeenCalledWith(
        undefined,
        undefined,
        mockProfileService,
      );
      expect(mockLogger.printSuccess).toHaveBeenCalledWith(
        expect.stringContaining('successful'),
      );
      expect(result).toEqual({
        success: true,
      });
    });

    it('should handle authentication errors gracefully', async () => {
      const error = new AppError('Invalid credentials');
      mockTokenManager.getAccessToken.mockRejectedValueOnce(error);

      const result = await command.execute({});

      expect(mockLogger.printError).toHaveBeenCalledWith(error.message);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });

    it('should handle other errors properly', async () => {
      const error = new Error('Network error');
      mockTokenManager.getAccessToken.mockRejectedValueOnce(error);

      const result = await command.execute({});

      expect(mockLogger.handleError).toHaveBeenCalledWith(error);
      expect(result).toEqual({
        success: false,
        error: error,
      });
    });
  });
});
