import { vi } from 'vitest';

/**
 * Creates a mock logger with all common methods mocked
 * @returns {Object} Mock logger object
 */
export function createMockLogger() {
  return {
    print: vi.fn(),
    printInfo: vi.fn(),
    printStatus: vi.fn(),
    printSuccess: vi.fn(),
    printError: vi.fn(),
    printVerbose: vi.fn(),
    handleError: vi.fn(),
    setVerbose: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Creates a mock file system with common methods mocked
 * @returns {Object} Mock file system object
 */
export function createMockFileSystem() {
  return {
    exists: vi.fn().mockResolvedValue(false),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    getFiles: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
    }),
    readdir: vi.fn().mockResolvedValue([]),
    checkPath: vi.fn().mockReturnValue(true),
    validateDirectory: vi.fn().mockResolvedValue({ valid: true, error: null }),
  };
}

/**
 * Creates a mock config manager with common methods mocked
 * @param {Object} configValues - Optional key/value pairs to use for get() calls
 * @returns {Object} Mock config object
 */
export function createMockConfig(configValues = {}) {
  return {
    get: vi.fn((key, defaultValue) => {
      if (key in configValues) return configValues[key];
      return defaultValue;
    }),
    set: vi.fn(),
    remove: vi.fn(),
    saveConfig: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Creates a mock theme API service with common methods mocked
 * @returns {Object} Mock theme API object
 */
export function createMockThemeApi() {
  return {
    downloadAsset: vi.fn().mockResolvedValue(true),
    uploadAsset: vi.fn().mockResolvedValue(true),
    removeAsset: vi.fn().mockResolvedValue(undefined),
    compileAssets: vi.fn().mockResolvedValue(undefined),
    getAssets: vi.fn().mockResolvedValue([]),
    listThemes: vi.fn().mockResolvedValue([]),
    listStores: vi.fn().mockResolvedValue([]),
    listVersions: vi.fn().mockResolvedValue([]),
  };
}
