import { vi } from 'vitest';
import path from 'path';
import { createMockApp } from './testSetup.js';

/**
 * Creates a mock response object for API operations
 * @param {Object} data - Response data
 * @param {Number} status - HTTP status code
 * @returns {Object} Mock response
 */
export function createMockResponse(data = {}, status = 200) {
  return {
    data,
    status,
    ok: status >= 200 && status < 300,
  };
}

/**
 * Utility to test file operations in commands
 * @param {Object} mockFileSystem - The mock file system to set up
 * @param {Object} options - Configuration options
 * @param {Boolean} options.dirExists - Whether directories should exist
 * @param {Boolean} options.fileExists - Whether files should exist
 * @param {Object} options.files - File contents by path
 */
export function setupFileSystemMocks(mockFileSystem, options = {}) {
  const { dirExists = true, fileExists = true, files = {} } = options;

  // Setup exists mocking
  mockFileSystem.exists.mockImplementation(async (path) => {
    if (path in files) return true;
    return path.endsWith('/') ? dirExists : fileExists;
  });

  // Setup stat mocking
  mockFileSystem.stat.mockImplementation(async (path) => {
    const isDir = path.endsWith('/');
    return {
      isFile: () => !isDir,
      isDirectory: () => isDir,
    };
  });

  // Setup readFile mocking
  mockFileSystem.readFile.mockImplementation(async (filePath) => {
    if (filePath in files) {
      return files[filePath];
    }
    return '{}'; // Default content
  });

  // Setup getFiles mocking
  if (Object.keys(files).length > 0) {
    mockFileSystem.getFiles.mockResolvedValue(Object.keys(files));
  }
}

/**
 * Sets up common mocks for deploy/download command tests
 * @param {Object} mockApp - The mock app to set up
 * @param {Object} options - Configuration options
 */
export function setupThemeApiMocks(mockApp, options = {}) {
  const { themeDir = '/path/to/theme', assetResponses = {} } = options;

  // Setup config mock to return theme directory
  mockApp.config.get.mockImplementation((key) => {
    if (key === 'themeDir') return themeDir;
    return undefined;
  });

  // Setup asset download/upload responses
  if (Object.keys(assetResponses).length > 0) {
    mockApp.services.themeApi.downloadAsset.mockImplementation(
      async (source) => assetResponses[source] ?? true,
    );

    mockApp.services.themeApi.uploadAsset.mockImplementation(
      async (source) => assetResponses[source] ?? true,
    );
  }
}

/**
 * Sets up path resolution for consistent path handling in tests
 * @param {String} source - Source path
 * @param {String} themeDir - Base theme directory
 * @returns {String} Full path
 */
export function resolvePath(source, themeDir = '/path/to/theme') {
  return path.join(themeDir, source);
}

/**
 * Batch operation test helper - for testing multiple file operations
 * @param {Function} mockFn - The mock function to test batching on
 * @param {Number} totalCalls - Total calls expected
 * @param {Array} results - Results to return for each call
 */
export function setupBatchOperationMock(mockFn, totalCalls, results = []) {
  // Clear previous mock implementations
  mockFn.mockReset();

  // If results array provided, use it for sequential responses
  if (results.length > 0) {
    results.forEach((result, index) => {
      mockFn.mockResolvedValueOnce(result);
    });

    // Fill remaining calls with default success
    if (results.length < totalCalls) {
      mockFn.mockResolvedValue(true);
    }
  } else {
    // Default all calls to succeed
    mockFn.mockResolvedValue(true);
  }
}
