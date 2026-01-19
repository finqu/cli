import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../src/core/app.js', () => ({
  createApp: vi.fn().mockResolvedValue({
    // Mocked app object structure
    config: { get: vi.fn(), set: vi.fn() },
    logger: { info: vi.fn(), error: vi.fn(), verbose: vi.fn() },
    // Add other necessary mocked app properties/methods
  }),
}));

vi.mock('../src/commands/index.js', () => ({
  createCommandRegistry: vi.fn(() => ({
    setApp: vi.fn(),
    registerCommands: vi.fn(), // Mock if needed, though not directly used by createFullApp
    // Mock other registry methods if necessary
  })),
}));

// Mock other dependencies if createFullApp uses them directly (unlikely based on code)
// vi.mock('../src/core/logger.js');
// vi.mock('../src/core/config.js');

describe('src/index.js', () => {
  let createFullApp;
  let createApp;
  let createCommandRegistry;
  let mockLogger;
  let mockConfigManager;
  let mockAppInstance;
  let mockCommandRegistryInstance;

  beforeEach(async () => {
    // Clear mocks before each test
    vi.clearAllMocks();

    // Import the mocked functions
    const appModule = await import('../src/core/app.js');
    createApp = vi.mocked(appModule.createApp);

    const commandsModule = await import('../src/commands/index.js');
    createCommandRegistry = vi.mocked(commandsModule.createCommandRegistry);

    // Import the function to test
    const indexModule = await import('../src/index.js');
    createFullApp = indexModule.createFullApp;

    // Setup mock return values
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      verbose: vi.fn(),
      setVerbose: vi.fn(),
      handleError: vi.fn(),
    };
    mockConfigManager = { get: vi.fn(), set: vi.fn() };
    mockAppInstance = {
      // Simulate the object returned by createApp
      config: mockConfigManager,
      logger: mockLogger,
      someService: vi.fn(), // Example service
    };
    mockCommandRegistryInstance = {
      // Simulate the object returned by createCommandRegistry
      setApp: vi.fn(),
      registerCommands: vi.fn(),
    };

    createApp.mockResolvedValue(mockAppInstance);
    createCommandRegistry.mockReturnValue(mockCommandRegistryInstance);
  });

  it('should create the core app using createApp', async () => {
    const options = { fileSystem: 'mockFs' };
    await createFullApp(options, mockLogger, mockConfigManager);

    expect(createApp).toHaveBeenCalledTimes(1);
    expect(createApp).toHaveBeenCalledWith(
      options,
      mockConfigManager,
      mockLogger,
    );
  });

  it('should create the command registry', async () => {
    await createFullApp({}, mockLogger, mockConfigManager);

    expect(createCommandRegistry).toHaveBeenCalledTimes(1);
  });

  it('should set the created app instance on the command registry', async () => {
    await createFullApp({}, mockLogger, mockConfigManager);

    expect(mockCommandRegistryInstance.setApp).toHaveBeenCalledTimes(1);
    expect(mockCommandRegistryInstance.setApp).toHaveBeenCalledWith(
      mockAppInstance,
    ); // Ensure the app from createApp is passed
  });

  it('should return an object containing the app instance and the command registry', async () => {
    const result = await createFullApp({}, mockLogger, mockConfigManager);

    expect(result).toBeDefined();
    // Check if properties from the mocked app instance are present
    expect(result.config).toBe(mockConfigManager);
    expect(result.logger).toBe(mockLogger);
    expect(result.someService).toBeDefined();
    // Check if the commands property holds the command registry instance
    expect(result.commands).toBe(mockCommandRegistryInstance);
  });

  it('should pass options to createApp', async () => {
    const options = { customOption: 'value', fileSystem: 'mockFs' };
    await createFullApp(options, mockLogger, mockConfigManager);

    expect(createApp).toHaveBeenCalledWith(
      options,
      mockConfigManager,
      mockLogger,
    );
  });
});

// Optional: Test exports if needed, though usually not necessary
describe('src/index.js exports', () => {
  it('should export expected core components', async () => {
    const indexModule = await import('../src/index.js');
    expect(indexModule.createApp).toBeDefined();
    expect(indexModule.createConfigManager).toBeDefined();
    expect(indexModule.createLogger).toBeDefined();
    expect(indexModule.AppError).toBeDefined();
  });

  it('should export expected IO components', async () => {
    const indexModule = await import('../src/index.js');
    expect(indexModule.createFileSystem).toBeDefined();
  });

  it('should export expected service components', async () => {
    const indexModule = await import('../src/index.js');
    expect(indexModule.createHttpClient).toBeDefined();
    expect(indexModule.createTokenManager).toBeDefined();
    expect(indexModule.createThemeApi).toBeDefined();
    expect(indexModule.createProfileService).toBeDefined();
  });

  it('should export expected command components', async () => {
    const indexModule = await import('../src/index.js');
    expect(indexModule.BaseCommand).toBeDefined();
    expect(indexModule.createConfigureCommand).toBeDefined();
    expect(indexModule.createCommandRegistry).toBeDefined(); // Also exported here
  });
});
