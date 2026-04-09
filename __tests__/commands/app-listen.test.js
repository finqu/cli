import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppListenCommand,
  createAppListenCommand,
} from '../../src/commands/app-listen.js';

describe('AppListenCommand', () => {
  let command;
  let mockApp;
  let mockTokenManager;
  let mockProfile;
  let mockListener;
  let mockLogger;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTokenManager = {
      hasAccessToken: vi.fn().mockReturnValue(true),
      ensureValidToken: vi.fn().mockResolvedValue('existing-token'),
      getAccessToken: vi.fn().mockResolvedValue('new-token'),
    };

    mockProfile = {
      getProfile: vi.fn().mockResolvedValue({
        endpoints: {
          realtime: 'https://realtime.example.com',
        },
      }),
    };

    mockListener = {
      resolveRealtimeUrl: vi
        .fn()
        .mockReturnValue('wss://realtime.example.com/ws/webhooks'),
      listen: vi.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      saveConfigValue: vi.fn().mockResolvedValue(true),
    };

    mockLogger = {
      printStatus: vi.fn(),
      printInfo: vi.fn(),
      printSuccess: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      handleError: vi.fn(),
    };

    mockApp = {
      config: mockConfig,
      logger: mockLogger,
      services: {
        tokenManager: mockTokenManager,
        profile: mockProfile,
        appWebhookListener: mockListener,
      },
    };

    command = new AppListenCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have expected command metadata', () => {
    expect(command.name).toBe('listen');
    expect(command.group).toBe('app');
    expect(command.syntax).toBe('listen');
    expect(command.description).toContain('Listen for app webhook events');
  });

  it('should create command using factory', () => {
    const factoryCommand = createAppListenCommand(mockApp);
    expect(factoryCommand).toBeInstanceOf(AppListenCommand);
  });

  it('should start listener using existing token by default', async () => {
    const result = await command.execute({});

    expect(mockTokenManager.ensureValidToken).toHaveBeenCalledTimes(1);
    expect(mockTokenManager.getAccessToken).not.toHaveBeenCalled();
    expect(mockConfig.saveConfigValue).toHaveBeenCalledWith(
      'appRealtimeUrl',
      'wss://realtime.example.com/ws/webhooks',
    );
    expect(mockListener.listen).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'existing-token',
        realtimeUrl: 'wss://realtime.example.com/ws/webhooks',
        localUrl: 'http://localhost:3000/webhooks',
        topics: [],
      }),
    );
    expect(result).toEqual({ success: true });
  });

  it('should support topic filters and custom local URL', async () => {
    await command.execute({
      url: 'http://localhost:4000/hooks',
      topic: ['orders/create,products/update', 'orders/activate'],
    });

    expect(mockListener.listen).toHaveBeenCalledWith(
      expect.objectContaining({
        localUrl: 'http://localhost:4000/hooks',
        topics: ['orders/create', 'products/update', 'orders/activate'],
      }),
    );
  });

  it('should fail if not signed in', async () => {
    mockTokenManager.hasAccessToken.mockReturnValue(false);

    const result = await command.execute({});

    expect(mockTokenManager.ensureValidToken).not.toHaveBeenCalled();
    expect(mockListener.listen).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('Not signed in'),
    );
  });

  it('should fail if realtime URL cannot be resolved', async () => {
    mockListener.resolveRealtimeUrl.mockReturnValue(null);

    const result = await command.execute({});

    expect(mockListener.listen).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('Realtime websocket URL could not be resolved'),
    );
  });
});
