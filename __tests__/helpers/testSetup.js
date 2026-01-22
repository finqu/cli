import { vi } from 'vitest';
import {
  createMockLogger,
  createMockFileSystem,
  createMockConfig,
  createMockThemeApi,
} from './mockServices.js';

/**
 * Creates a mock app with all standard services
 * @param {Object} options - Optional configuration for the mock app
 * @param {Object} options.logger - Custom logger mock
 * @param {Object} options.fileSystem - Custom fileSystem mock
 * @param {Object} options.config - Custom config mock or config values
 * @param {Object} options.themeApi - Custom themeApi mock
 * @returns {Object} Mock app instance
 */
export function createMockApp(options = {}) {
  // Create default mocks, or use provided ones
  const logger = options.logger || createMockLogger();
  const fileSystem = options.fileSystem || createMockFileSystem();
  const config =
    options.config instanceof Function
      ? options.config
      : typeof options.config === 'object' && options.config !== null
        ? createMockConfig(options.config)
        : createMockConfig();
  const themeApi = options.themeApi || createMockThemeApi();

  // Create and return the mock app
  return {
    logger,
    fileSystem,
    config,
    services: {
      themeApi,
      // Add other services as needed
    },
  };
}

/**
 * Standard before/after hooks for command tests
 * @param {Object} options - Configuration for the hooks
 * @param {Function} options.commandFactory - Factory function to create the command
 * @param {Object} options.appOptions - Options passed to createMockApp
 * @param {Function} options.beforeEachCallback - Additional beforeEach logic
 * @param {Function} options.afterEachCallback - Additional afterEach logic
 * @returns {Object} Hooks and test context
 */
export function setupCommandTest(options = {}) {
  const context = {
    command: null,
    mockApp: null,
    // Add shortcuts to common mocks for convenience
    get mockLogger() {
      return this.mockApp?.logger;
    },
    get mockFileSystem() {
      return this.mockApp?.fileSystem;
    },
    get mockConfig() {
      return this.mockApp?.config;
    },
    get mockThemeApi() {
      return this.mockApp?.services?.themeApi;
    },
  };

  const beforeEachHook = async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock app
    context.mockApp = createMockApp(options.appOptions || {});

    // Create command instance if factory provided
    if (options.commandFactory) {
      context.command = options.commandFactory(context.mockApp);
    }

    // Run additional setup if provided
    if (options.beforeEachCallback) {
      await options.beforeEachCallback(context);
    }
  };

  const afterEachHook = async () => {
    // Reset all mocks
    vi.resetAllMocks();

    // Run additional cleanup if provided
    if (options.afterEachCallback) {
      await options.afterEachCallback(context);
    }
  };

  return {
    beforeEachHook,
    afterEachHook,
    context,
  };
}

/**
 * Creates test data for common test scenarios
 * @param {String} type - Type of test data to generate
 * @returns {Object} Test data appropriate for the requested type
 */
export function createTestData(type) {
  switch (type) {
    case 'themes':
      return [
        { id: 'theme-123', name: 'Test Theme' },
        { id: 'theme-456', name: 'Another Theme' },
      ];
    case 'stores':
      return [
        {
          id: 'store-123',
          merchant_name: 'Test Merchant',
          name: 'Test Store',
          technical_domain: 'test-store.com',
        },
        {
          id: 'store-456',
          merchant_name: 'Another Merchant',
          name: 'Another Store',
          technical_domain: 'another-store.com',
        },
      ];
    case 'assets':
      return [
        { type: 'file', path: 'templates/index.liquid' },
        { type: 'file', path: 'assets/theme.css' },
        { type: 'dir', path: 'snippets' },
        { type: 'file', path: 'snippets/header.liquid' },
      ];
    default:
      return {};
  }
}
