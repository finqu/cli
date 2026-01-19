import {
  promises as fs,
  existsSync,
  createWriteStream,
  createReadStream,
} from 'fs';
import path from 'path';

/**
 * FileSystem abstraction layer
 * Provides standardized methods for file operations to improve testability
 */
export class FileSystem {
  /**
   * Checks if a file or directory exists
   * @param {string} filePath Path to check
   * @returns {boolean} True if exists
   */
  async exists(filePath) {
    return existsSync(filePath);
  }

  /**
   * Reads a file from disk
   * @param {string} filePath Path to read
   * @param {string} encoding File encoding
   * @returns {Promise<string>} File contents
   */
  async readFile(filePath, encoding) {
    return fs.readFile(filePath, encoding);
  }

  /**
   * Writes data to a file
   * @param {string} filePath Path to write
   * @param {string|Buffer} data Data to write
   * @returns {Promise<void>} Promise that resolves when complete
   */
  async writeFile(filePath, data) {
    return fs.writeFile(filePath, data);
  }

  /**
   * Creates a directory
   * @param {string} dirPath Directory to create
   * @param {Object} options Options for mkdir
   * @returns {Promise<void>} Promise that resolves when complete
   */
  async mkdir(dirPath, options) {
    return fs.mkdir(dirPath, options);
  }

  /**
   * Lists directory contents
   * @param {string} dirPath Directory to list
   * @param {Object} options Options for readdir
   * @returns {Promise<string[]>} Array of directory contents
   */
  async readdir(dirPath, options) {
    return fs.readdir(dirPath, options);
  }

  /**
   * Gets file stats
   * @param {string} filePath Path to check
   * @returns {Promise<fs.Stats>} File stats
   */
  async stat(filePath) {
    return fs.stat(filePath);
  }

  /**
   * Creates a read stream
   * @param {string} filePath Path to read
   * @returns {fs.ReadStream} Read stream
   */
  createReadStream(filePath, options) {
    return createReadStream(filePath, options);
  }

  /**
   * Creates a write stream
   * @param {string} filePath Path to write
   * @returns {fs.WriteStream} Write stream
   */
  createWriteStream(filePath, options) {
    return createWriteStream(filePath, options);
  }

  /**
   * Checks if a path should be included in theme
   * @param {string} filePath File path to check
   * @returns {boolean} Whether path should be included
   */
  checkPath(filePath) {
    // Hidden files and directories
    if (filePath.indexOf('/.') > -1 || filePath.indexOf('\\.') > -1) {
      return false;
    }
    // Git files
    if (filePath.indexOf('.git') > -1) {
      return false;
    }
    // Node modules
    if (filePath.indexOf('node_modules') > -1) {
      return false;
    }
    return true;
  }

  /**
   * Validates a directory to ensure it's appropriate for theme operations
   * @param {string} directory Directory path to validate
   * @returns {Promise<{valid: boolean, error: string|null}>} Result with validity and error message
   */
  async validateDirectory(directory) {
    try {
      // Check if directory exists
      if (!(await this.exists(directory))) {
        return {
          valid: false,
          error: `Directory does not exist: ${directory}`,
        };
      }

      // Check if it's actually a directory (not a file)
      const stats = await this.stat(directory);
      if (!stats.isDirectory()) {
        return { valid: false, error: `Not a directory: ${directory}` };
      }

      // Test write access by attempting to write and then delete a temp file
      const testFile = path.join(directory, '.finqu-write-test');
      try {
        await this.writeFile(testFile, 'test');
        await fs.unlink(testFile);
      } catch (err) {
        return {
          valid: false,
          error: `Directory is not writable: ${directory}`,
        };
      }

      // Test read access by listing contents
      try {
        await this.readdir(directory);
      } catch (err) {
        return {
          valid: false,
          error: `Directory is not readable: ${directory}`,
        };
      }

      return { valid: true, error: null };
    } catch (err) {
      return {
        valid: false,
        error: `Error validating directory: ${err.message}`,
      };
    }
  }

  /**
   * Recursively gets all files from a directory
   * @param {string} dir Directory to scan
   * @returns {Promise<Array>} List of files
   */
  async getFiles(dir) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      dirents.map(async (dirent) => {
        const res = require('path').resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
          return this.getFiles(res);
        } else {
          return res;
        }
      }),
    );
    return Array.prototype.concat(...files);
  }
}

/**
 * Factory function to create a FileSystem instance
 * @returns {FileSystem} A new FileSystem instance
 */
export function createFileSystem() {
  return new FileSystem();
}
