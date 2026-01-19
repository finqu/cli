import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'; // Added beforeEach, afterEach

// Mock dependencies
vi.mock('../src/index.js', () => ({
  createFullApp: vi.fn().mockResolvedValue({
    commands: {
      registerCommands: vi.fn(),
    },
    logger: {
      handleError: vi.fn(),
      setVerbose: vi.fn(),
    },
    config: {
      get: vi.fn(),
      set: vi.fn(),
    },
  }),
}));
vi.mock('../src/core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    setVerbose: vi.fn(),
    handleError: vi.fn((err) => {
      throw err;
    }), // Re-throw to test catch block
    info: vi.fn(),
    verbose: vi.fn(),
    error: vi.fn(),
  })),
}));
vi.mock('../src/core/config.js', () => ({
  createConfigManager: vi.fn().mockResolvedValue({
    get: vi.fn((key, defaultValue) => defaultValue), // Mock basic get
    set: vi.fn(),
  }),
}));
vi.mock('../src/io/fileSystem.js', () => {
  const mockValidateDirectory = vi
    .fn()
    .mockResolvedValue({ valid: true, error: null });

  const mockFileSystem = {
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    checkPath: vi.fn().mockReturnValue(true),
    validateDirectory: mockValidateDirectory,
  };

  return {
    createFileSystem: vi.fn(() => mockFileSystem),
    FileSystem: vi.fn().mockImplementation(() => mockFileSystem),
  };
});
vi.mock('commander', async (importOriginal) => {
  const Command = vi.fn();
  const mockInstance = {
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    parseOptions: vi.fn().mockReturnThis(), // Return this for chaining
    opts: vi.fn().mockReturnValue({}), // Default empty options
    parseAsync: vi.fn().mockResolvedValue(undefined),
    _parseOptionsResult: {
      // Store result for parseOptions
      opts: {},
    },
  };

  // Make parseOptions store its result and return the instance
  mockInstance.parseOptions = vi.fn((argv) => {
    // Simulate parsing based on argv if needed, for now just store default
    mockInstance._parseOptionsResult.opts = mockInstance.opts(); // Use the result of opts()
    return mockInstance; // Return this for chaining
  });

  // Make opts return the stored result from parseOptions
  mockInstance.opts = vi.fn(() => mockInstance._parseOptionsResult.opts);

  Command.mockImplementation(() => mockInstance);

  // Add static methods if your code uses them (e.g., program.opts() before new Command())
  // For simplicity, we assume instance methods are primarily used after `new Command()`

  return { Command };
});

// Store original process.argv
const originalArgv = process.argv;
const originalCwd = process.cwd;
const originalEnv = { ...process.env };

describe('src/cli.js', () => {
  // Define mocks accessible within the describe block
  let Command;
  let mockCommandInstance;

  beforeEach(async () => {
    // Reset modules to ensure cli.js runs fresh
    vi.resetModules();

    // Reset mocks before each test
    vi.clearAllMocks();

    // Restore original process state
    process.argv = [...originalArgv];
    process.cwd = originalCwd;
    process.env = { ...originalEnv };

    // Re-import the mocked Command constructor for this test suite
    const commanderModule = await import('commander');
    Command = vi.mocked(commanderModule.Command);
    // Get the singleton mock instance created by the implementation
    // Note: This assumes Command() is called only once in cli.js main()
    // If it's called multiple times, this approach needs refinement.
    mockCommandInstance = Command(); // Get the mocked instance
    vi.clearAllMocks(); // Clear mocks again AFTER getting the instance

    // Reset the instance mocks
    mockCommandInstance.name.mockClear().mockReturnThis();
    mockCommandInstance.description.mockClear().mockReturnThis();
    mockCommandInstance.version.mockClear().mockReturnThis();
    mockCommandInstance.option.mockClear().mockReturnThis();
    mockCommandInstance.action.mockClear().mockReturnThis();
    mockCommandInstance.command.mockClear().mockReturnThis();
    mockCommandInstance.parseOptions.mockClear().mockReturnThis();
    mockCommandInstance.opts.mockClear().mockReturnValue({});
    mockCommandInstance.parseAsync.mockClear().mockResolvedValue(undefined);
    mockCommandInstance._parseOptionsResult = { opts: {} }; // Reset stored opts

    // Reset constructor mock calls
    Command.mockClear();
  });

  afterEach(() => {
    // Restore original process state after each test
    process.argv = originalArgv;
    process.cwd = originalCwd;
    process.env = originalEnv;
  });

  // Helper function to run the CLI main function
  const runCli = async () => {
    // Dynamically import cli.js to run its main function
    // vi.resetModules() in beforeEach ensures it's fresh
    await import('../src/cli.js');
  };

  it('should initialize logger', async () => {
    const { createLogger } = await import('../src/core/logger.js');
    await runCli();
    expect(createLogger).toHaveBeenCalledTimes(1);
  });

  it('should initialize file system', async () => {
    const { createFileSystem } = await import('../src/io/fileSystem.js');
    await runCli();
    expect(createFileSystem).toHaveBeenCalledTimes(1);
  });

  it('should initialize config manager with default path', async () => {
    const path = await import('path');
    const { createConfigManager } = await import('../src/core/config.js');
    const { createFileSystem } = await import('../src/io/fileSystem.js');
    const mockFs = createFileSystem();
    const expectedDefaultPath = path.join(process.cwd(), 'finqu.config.json');

    // Set default options for commander mock
    mockCommandInstance.opts.mockReturnValue({
      env: 'production',
      config: expectedDefaultPath,
    });
    mockCommandInstance._parseOptionsResult = {
      opts: { env: 'production', config: expectedDefaultPath },
    };

    await runCli();

    expect(createConfigManager).toHaveBeenCalledTimes(1);
    expect(createConfigManager).toHaveBeenCalledWith(
      mockFs,
      expectedDefaultPath, // Default config path
      { production: { verbose: undefined } }, // Initial data based on default opts
    );
  });

  it('should initialize config manager with path from --config option', async () => {
    const { createConfigManager } = await import('../src/core/config.js');
    const { createFileSystem } = await import('../src/io/fileSystem.js');
    const mockFs = createFileSystem();
    const customConfigPath = '/custom/path/config.json';

    // Mock commander's opts to return the custom path *before* runCli
    const mockOpts = { config: customConfigPath, env: 'production' };
    mockCommandInstance.opts.mockReturnValue(mockOpts);
    // Simulate parseOptions storing these opts
    mockCommandInstance._parseOptionsResult = { opts: mockOpts };

    await runCli();

    expect(createConfigManager).toHaveBeenCalledTimes(1);
    expect(createConfigManager).toHaveBeenCalledWith(
      mockFs,
      customConfigPath, // Custom config path from mocked options
      { production: { verbose: undefined } }, // Initial data based on mocked opts
    );
  });

  it('should set themeDir in config if not present', async () => {
    const { createConfigManager } = await import('../src/core/config.js');
    const mockConfigManager = {
      get: vi.fn((key) => (key === 'themeDir' ? undefined : false)), // Simulate themeDir not present
      set: vi.fn(),
    };
    vi.mocked(createConfigManager).mockResolvedValue(mockConfigManager);

    // Set default options for commander mock
    const defaultOpts = { env: 'production', config: 'default.json' };
    mockCommandInstance.opts.mockReturnValue(defaultOpts);
    mockCommandInstance._parseOptionsResult = { opts: defaultOpts };

    const currentDir = process.cwd();
    await runCli();

    expect(mockConfigManager.get).toHaveBeenCalledWith('themeDir');
    expect(mockConfigManager.set).toHaveBeenCalledWith('themeDir', currentDir);
  });

  it('should set logger verbosity based on config', async () => {
    const { createLogger } = await import('../src/core/logger.js');
    const { createConfigManager } = await import('../src/core/config.js');
    const mockLogger = { setVerbose: vi.fn(), handleError: vi.fn() };
    const mockConfigManager = {
      get: vi.fn((key, defaultValue) =>
        key === 'verbose' ? true : defaultValue,
      ), // Simulate verbose: true in config
      set: vi.fn(),
    };
    vi.mocked(createLogger).mockReturnValue(mockLogger);
    vi.mocked(createConfigManager).mockResolvedValue(mockConfigManager);

    // Set default options for commander mock
    const defaultOpts = { env: 'production', config: 'default.json' };
    mockCommandInstance.opts.mockReturnValue(defaultOpts);
    mockCommandInstance._parseOptionsResult = { opts: defaultOpts };

    await runCli();

    expect(mockConfigManager.get).toHaveBeenCalledWith('verbose', false);
    expect(mockLogger.setVerbose).toHaveBeenCalledWith(true); // Should be called with true from config
  });

  it('should initialize config manager with verbose from --verbose flag', async () => {
    const { createConfigManager } = await import('../src/core/config.js');
    const { createFileSystem } = await import('../src/io/fileSystem.js');
    const mockFs = createFileSystem();

    // Mock commander's opts to return verbose: true
    const mockOpts = {
      verbose: true,
      env: 'production',
      config: 'default.json',
    };
    mockCommandInstance.opts.mockReturnValue(mockOpts);
    // Simulate parseOptions storing these opts
    mockCommandInstance._parseOptionsResult = { opts: mockOpts };

    // Mock config manager to return verbose: false from file
    const mockConfigManager = {
      get: vi.fn((key, defaultValue) =>
        key === 'verbose' ? false : defaultValue,
      ),
      set: vi.fn(),
    };
    vi.mocked(createConfigManager).mockResolvedValue(mockConfigManager);

    await runCli();

    // Config manager should be initialized with CLI options first
    expect(createConfigManager).toHaveBeenCalledWith(
      mockFs,
      'default.json',
      { production: { verbose: true } }, // Initial data includes CLI option
    );
  });

  it('should set logger verbosity based on config even if --verbose flag is set', async () => {
    const { createLogger } = await import('../src/core/logger.js');
    const { createConfigManager } = await import('../src/core/config.js');

    const mockLogger = { setVerbose: vi.fn(), handleError: vi.fn() };
    vi.mocked(createLogger).mockReturnValue(mockLogger);

    // Mock commander's opts to return verbose: true
    const mockOpts = {
      verbose: true,
      env: 'production',
      config: 'default.json',
    };
    mockCommandInstance.opts.mockReturnValue(mockOpts);
    mockCommandInstance._parseOptionsResult = { opts: mockOpts };

    // Mock config manager to return verbose: false from file
    const mockConfigManager = {
      get: vi.fn((key, defaultValue) =>
        key === 'verbose' ? false : defaultValue,
      ),
      set: vi.fn(),
    };
    vi.mocked(createConfigManager).mockResolvedValue(mockConfigManager);

    await runCli();

    // Logger verbosity is set *after* config manager is loaded
    expect(mockConfigManager.get).toHaveBeenCalledWith('verbose', false); // Reads from config (which returns false)
    expect(mockLogger.setVerbose).toHaveBeenCalledWith(false); // Set based on config value (false)
  });

  it('should create the full app with logger and config', async () => {
    const { createFullApp } = await import('../src/index.js');
    const { createLogger } = await import('../src/core/logger.js');
    const { createConfigManager } = await import('../src/core/config.js');
    const { createFileSystem } = await import('../src/io/fileSystem.js');

    const mockLogger = createLogger();
    const mockConfigManager = await createConfigManager();
    const mockFileSystem = createFileSystem();

    // Set default options for commander mock
    const defaultOpts = { env: 'production', config: 'default.json' };
    mockCommandInstance.opts.mockReturnValue(defaultOpts);
    mockCommandInstance._parseOptionsResult = { opts: defaultOpts };

    await runCli();

    expect(createFullApp).toHaveBeenCalledTimes(1);
    expect(createFullApp).toHaveBeenCalledWith(
      { fileSystem: mockFileSystem },
      mockLogger,
      mockConfigManager,
    );
  });

  it('should register commands with commander', async () => {
    const { createFullApp } = await import('../src/index.js');
    const mockRegisterCommands = vi.fn();
    const mockApp = {
      commands: { registerCommands: mockRegisterCommands },
      logger: { handleError: vi.fn(), setVerbose: vi.fn() },
      config: { get: vi.fn(), set: vi.fn() },
    };
    vi.mocked(createFullApp).mockResolvedValue(mockApp);

    // Set default options for commander mock
    const defaultOpts = { env: 'production', config: 'default.json' };
    mockCommandInstance.opts.mockReturnValue(defaultOpts);
    mockCommandInstance._parseOptionsResult = { opts: defaultOpts };

    await runCli();

    expect(mockRegisterCommands).toHaveBeenCalledTimes(1);
    // Pass the mocked commander instance that was created inside cli.js
    expect(mockRegisterCommands).toHaveBeenCalledWith(mockCommandInstance);
  });

  it('should parse arguments', async () => {
    process.argv = ['node', 'cli.js', 'deploy']; // Example command

    // Set default options for commander mock
    const defaultOpts = { env: 'production', config: 'default.json' };
    mockCommandInstance.opts.mockReturnValue(defaultOpts);
    mockCommandInstance._parseOptionsResult = { opts: defaultOpts };

    await runCli();

    expect(mockCommandInstance.parseAsync).toHaveBeenCalledTimes(1);
    expect(mockCommandInstance.parseAsync).toHaveBeenCalledWith(process.argv);
  });

  it('should handle errors using the logger', async () => {
    const { createFullApp } = await import('../src/index.js');
    const { createLogger } = await import('../src/core/logger.js');
    const mockLogger = {
      setVerbose: vi.fn(),
      handleError: vi.fn(), // Mock handleError
      info: vi.fn(),
      verbose: vi.fn(),
      error: vi.fn(),
    };
    vi.mocked(createLogger).mockReturnValue(mockLogger);

    // Set default options for commander mock
    const defaultOpts = { env: 'production', config: 'default.json' };
    mockCommandInstance.opts.mockReturnValue(defaultOpts);
    mockCommandInstance._parseOptionsResult = { opts: defaultOpts };

    const testError = new Error('Something went wrong');
    vi.mocked(createFullApp).mockRejectedValue(testError); // Simulate error during app creation

    await runCli();

    expect(mockLogger.handleError).toHaveBeenCalledTimes(1);
    expect(mockLogger.handleError).toHaveBeenCalledWith(testError);
  });

  it('should setup basic commander options', async () => {
    // Set default options for commander mock
    const defaultOpts = { env: 'production', config: 'default.json' };
    mockCommandInstance.opts.mockReturnValue(defaultOpts);
    mockCommandInstance._parseOptionsResult = { opts: defaultOpts };

    await runCli(); // Run the CLI setup

    expect(mockCommandInstance.name).toHaveBeenCalledWith('finqu');
    expect(mockCommandInstance.description).toHaveBeenCalledWith('Finqu CLI');
    expect(mockCommandInstance.version).toHaveBeenCalled(); // Check if called, actual version might vary
    expect(mockCommandInstance.option).toHaveBeenCalledWith(
      '-v, --verbose',
      expect.any(String),
      false,
    );
    expect(mockCommandInstance.option).toHaveBeenCalledWith(
      '-e, --env <environment>',
      expect.any(String),
      'production',
    );
    expect(mockCommandInstance.option).toHaveBeenCalledWith(
      '-c, --config <path>',
      expect.any(String),
      expect.stringContaining('finqu.config.json'),
    );
  });

  it('should validate the theme directory from config', async () => {
    const { createFileSystem } = await import('../src/io/fileSystem.js');
    const { createConfigManager } = await import('../src/core/config.js');
    const mockFileSystem = createFileSystem();
    const themeDirPath = '/valid/theme/directory';

    // Mock config to return a theme directory
    const mockConfigManager = {
      get: vi.fn((key) => {
        if (key === 'themeDir') return themeDirPath;
        if (key === 'verbose') return false;
        return undefined;
      }),
      set: vi.fn(),
    };
    vi.mocked(createConfigManager).mockResolvedValue(mockConfigManager);

    // Mock the directory validation to return valid
    mockFileSystem.validateDirectory.mockResolvedValue({
      valid: true,
      error: null,
    });

    await runCli();

    // Verify directory was validated
    expect(mockFileSystem.validateDirectory).toHaveBeenCalledTimes(1);
    expect(mockFileSystem.validateDirectory).toHaveBeenCalledWith(themeDirPath);
  });

  it('should throw an error when theme directory validation fails', async () => {
    const { createFileSystem } = await import('../src/io/fileSystem.js');
    const { createConfigManager } = await import('../src/core/config.js');
    const { createLogger } = await import('../src/core/logger.js');
    const mockFileSystem = createFileSystem();
    const mockLogger = createLogger();
    const themeDirPath = '/invalid/theme/directory';

    // Mock config to return a theme directory
    const mockConfigManager = {
      get: vi.fn((key) => {
        if (key === 'themeDir') return themeDirPath;
        if (key === 'verbose') return false;
        return undefined;
      }),
      set: vi.fn(),
    };
    vi.mocked(createConfigManager).mockResolvedValue(mockConfigManager);

    // Mock the directory validation to return invalid
    const validationError =
      'Directory is not writable: /invalid/theme/directory';
    mockFileSystem.validateDirectory.mockResolvedValue({
      valid: false,
      error: validationError,
    });

    await runCli();

    // Verify error was logged and thrown
    expect(mockFileSystem.validateDirectory).toHaveBeenCalledWith(themeDirPath);
    expect(mockLogger.error).toHaveBeenCalledWith(validationError);
    expect(mockLogger.handleError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Invalid theme directory'),
      }),
    );
  });
});
