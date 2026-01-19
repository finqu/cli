import { vi } from 'vitest';

/**
 * Creates a spy on console.log and restores it after test
 * @returns {Function} Function to restore the console.log
 */
export function spyOnConsole() {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => consoleSpy.mockRestore();
}

/**
 * Sets up mocking of external module dependencies
 * @param {Object} options - Configuration of module mocks
 * @returns {Object} Map of mockable modules and their mocks
 */
export async function setupModuleMocks(options = {}) {
  const mocks = {};

  if (options.express) {
    // Mock express for tokenManager tests
    const mockHandlers = {
      root: null,
      callback: null,
    };

    const mockExpressTriggers = {
      serverError: false,
      ...options.expressTriggers,
    };

    vi.mock('express', () => {
      const mockApp = {
        get: vi.fn((path, handler) => {
          if (path === '/') {
            mockHandlers.root = handler;
          } else if (path === '/callback') {
            mockHandlers.callback = handler;
          }
        }),
        listen: vi.fn().mockReturnValue({
          on: vi.fn((event, callback) => {
            if (event === 'error' && mockExpressTriggers.serverError) {
              callback(new Error('Server start failed'));
            }
          }),
        }),
      };
      const mockExpress = vi.fn(() => mockApp);
      return { default: mockExpress };
    });

    mocks.express = { handlers: mockHandlers, triggers: mockExpressTriggers };
  }

  if (options.prompts) {
    // Mock prompts for configure tests
    vi.mock('prompts', () => ({
      default: vi.fn(),
    }));

    // Import the mocked module
    import('prompts').then((module) => {
      mocks.prompts = module.default;
    });
  }

  if (options.commander) {
    vi.mock('commander', async () => {
      const Command = vi.fn();
      const mockInstance = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
        parseOptions: vi.fn().mockReturnThis(),
        opts: vi.fn().mockReturnValue({}),
        parseAsync: vi.fn().mockResolvedValue(undefined),
        _parseOptionsResult: {
          opts: {},
        },
      };

      // Make parseOptions store its result and return the instance
      mockInstance.parseOptions = vi.fn((argv) => {
        mockInstance._parseOptionsResult.opts = mockInstance.opts();
        return mockInstance;
      });

      // Make opts return the stored result from parseOptions
      mockInstance.opts = vi.fn(() => mockInstance._parseOptionsResult.opts);

      Command.mockImplementation(() => mockInstance);
      return { Command };
    });

    mocks.commander = { Command: (await import('commander')).Command };
  }

  return mocks;
}

/**
 * Safely mock process-related values for testing
 * @param {Object} options - Process values to mock
 */
export function mockProcess(options = {}) {
  // Store original values
  const originalArgv = process.argv;
  const originalCwd = process.cwd;
  const originalEnv = { ...process.env };

  // Mock process values
  if (options.argv) process.argv = options.argv;
  if (options.cwd) process.cwd = () => options.cwd;
  if (options.env) process.env = { ...process.env, ...options.env };

  // Return function to restore original values
  return () => {
    process.argv = originalArgv;
    process.cwd = originalCwd;
    process.env = originalEnv;
  };
}

/**
 * Helper to create error objects for testing error handling
 * @param {String} type - Type of error to create (e.g., 'network', 'app')
 * @param {Object} options - Error options (message, status, etc)
 * @returns {Error} The created error
 */
export function createTestError(type, options = {}) {
  const { message = 'Test error', status } = options;

  let error;
  switch (type) {
    case 'app':
      error = new Error(message);
      error.name = 'AppError';
      break;

    case 'network':
      error = new Error(message);
      error.status = status || 500;
      break;

    case 'not-found':
      error = new Error(message);
      error.status = 404;
      break;

    default:
      error = new Error(message);
  }

  return error;
}
