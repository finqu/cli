/**
 * Theme Dev command for Finqu CLI
 * Wraps the finqu-theme-dev binary for local theme rendering
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BaseCommand } from './base.js';

const BINARY_NAME = 'finqu-theme-dev';
const CREDENTIALS_PATH = path.join(
  os.homedir(),
  '.finqu-theme-dev',
  'credentials.json',
);
const RELEASES_URL =
  'https://developers.finqu.com/apis-and-tools/theme-development-kit/install';

/**
 * Check if the finqu-theme-dev binary is available on PATH
 * @returns {boolean} Whether the binary is found
 */
function isBinaryInstalled() {
  try {
    execFileSync(BINARY_NAME, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if finqu-theme-dev auth has been completed
 * @returns {boolean} Whether credentials exist
 */
function isAuthenticated() {
  return fs.existsSync(CREDENTIALS_PATH);
}

/**
 * Run finqu-theme-dev auth interactively
 * @returns {Promise<boolean>} Whether auth succeeded
 */
function runAuth() {
  return new Promise((resolve) => {
    const child = spawn(BINARY_NAME, ['auth'], { stdio: 'inherit' });

    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * ThemeDevCommand class for local theme development using finqu-theme-dev
 */
export class ThemeDevCommand extends BaseCommand {
  get name() {
    return 'dev';
  }

  get group() {
    return 'theme';
  }

  get description() {
    return 'Start local theme development server (requires finqu-theme-dev)';
  }

  get options() {
    return [
      {
        flags: '-p, --port <number>',
        description: 'Port to listen on',
        defaultValue: '3000',
      },
      {
        flags: '-d, --dir <path>',
        description: 'Theme directory path',
      },
    ];
  }

  /**
   * Execute the theme dev command
   * @param {Object} options Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(options) {
    // 1. Check binary is installed
    if (!isBinaryInstalled()) {
      this.logger.printError(
        `"${BINARY_NAME}" is not installed or not found on your PATH.`,
      );
      this.logger.printInfo(`Install it from: ${RELEASES_URL}`);
      return { success: false };
    }

    // 2. Check auth / run it if needed
    if (!isAuthenticated()) {
      this.logger.printInfo(
        'No finqu-theme-dev credentials found. Starting authentication...',
      );

      const authOk = await runAuth();

      if (!authOk) {
        this.logger.printError('Authentication failed or was cancelled.');
        return { success: false };
      }

      this.logger.printSuccess('Authentication complete.');
    }

    // 3. Build serve args
    const dir = options.dir || this.config.get('themeDir') || process.cwd();
    const port = options.port || '3000';
    const args = ['serve', '--port', String(port), '--dir', dir];

    this.logger.printStatus(`Starting local dev server on port ${port}...`);

    // 4. Spawn serve process
    return new Promise((resolve) => {
      const child = spawn(BINARY_NAME, args, { stdio: 'inherit' });
      let isCleaningUp = false;

      const cleanup = () => {
        if (isCleaningUp) return;
        isCleaningUp = true;

        if (child && !child.killed) {
          child.kill('SIGTERM');
        }
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      child.on('error', (err) => {
        this.logger.printError(
          `Failed to start ${BINARY_NAME}: ${err.message}`,
        );
        process.removeListener('SIGINT', cleanup);
        process.removeListener('SIGTERM', cleanup);
        resolve({ success: false, error: err });
      });

      child.on('exit', (code) => {
        process.removeListener('SIGINT', cleanup);
        process.removeListener('SIGTERM', cleanup);

        if (isCleaningUp || code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false });
        }
      });
    });
  }
}

/**
 * Factory function to create a ThemeDevCommand
 * @param {Object} app Application instance
 * @returns {ThemeDevCommand} A new command instance
 */
export function createThemeDevCommand(app) {
  return new ThemeDevCommand(app);
}
