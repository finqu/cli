import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ThemeDevCommand,
  createThemeDevCommand,
  resolveStoreDomain,
  serveSpawnEnv,
} from '../../src/commands/theme-dev.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';

describe('ThemeDevCommand', () => {
  let command;
  let mockApp;
  let mockLogger;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      printInfo: vi.fn(),
      printStatus: vi.fn(),
      printSuccess: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      handleError: vi.fn(),
    };

    mockConfig = {
      get: vi.fn((key) => {
        if (key === 'themeDir') return '/path/to/theme';
        if (key === 'storeDomain') return null;
        return null;
      }),
    };

    mockApp = {
      services: {},
      logger: mockLogger,
      fileSystem: {},
      config: mockConfig,
    };

    command = new ThemeDevCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('dev');
    });

    it('should have the correct description', () => {
      expect(command.description).toContain('local theme development');
    });

    it('should belong to the theme group', () => {
      expect(command.group).toBe('theme');
    });

    it('should have port and dir options', () => {
      const options = command.options;
      expect(options).toHaveLength(2);
      expect(options[0].flags).toContain('--port');
      expect(options[0].defaultValue).toBe('3000');
      expect(options[1].flags).toContain('--dir');
    });

    it('should create command with factory function', () => {
      const factoryCommand = createThemeDevCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(ThemeDevCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('resolveStoreDomain()', () => {
    it('should read storeDomain from config', () => {
      expect(
        resolveStoreDomain({
          get: (key) => (key === 'storeDomain' ? 'shop.example.com' : null),
        }),
      ).toBe('shop.example.com');
    });

    it('should fall back to store.domain', () => {
      expect(
        resolveStoreDomain({
          get: (key) =>
            key === 'store' ? { domain: 'from-store.example.com' } : null,
        }),
      ).toBe('from-store.example.com');
    });

    it('should return empty string when unset', () => {
      expect(resolveStoreDomain({ get: () => null })).toBe('');
      expect(resolveStoreDomain(null)).toBe('');
    });
  });

  describe('serveSpawnEnv()', () => {
    it('should set FINQU_STORE_DOMAIN when a domain is provided', () => {
      const env = serveSpawnEnv('shop.example.com');
      expect(env.FINQU_STORE_DOMAIN).toBe('shop.example.com');
    });

    it('should not override FINQU_STORE_DOMAIN when domain is empty', () => {
      const previous = process.env.FINQU_STORE_DOMAIN;
      delete process.env.FINQU_STORE_DOMAIN;
      try {
        const env = serveSpawnEnv('');
        expect(env.FINQU_STORE_DOMAIN).toBeUndefined();
      } finally {
        if (previous === undefined) {
          delete process.env.FINQU_STORE_DOMAIN;
        } else {
          process.env.FINQU_STORE_DOMAIN = previous;
        }
      }
    });
  });

  describe('execute() - binary not installed', () => {
    it('should return failure with install instructions when binary is missing', async () => {
      execFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = await command.execute({});

      expect(result).toEqual({ success: false });
      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringContaining('not installed'),
      );
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('developers.finqu.com'),
      );
    });

    it('should not attempt auth or serve when binary is missing', async () => {
      execFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await command.execute({});

      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe('execute() - auth required', () => {
    let authChild;

    beforeEach(() => {
      // Binary is installed
      execFileSync.mockReturnValue('1.0.0');
      // Not authenticated
      fs.existsSync.mockReturnValue(false);

      authChild = {
        on: vi.fn(),
        killed: false,
        kill: vi.fn(),
      };
    });

    it('should run finqu-theme-dev auth when credentials are missing', async () => {
      // Auth succeeds, then serve starts
      const serveChild = { on: vi.fn(), killed: false, kill: vi.fn() };

      spawn.mockImplementation((cmd, args) => {
        if (args[0] === 'auth') return authChild;
        return serveChild;
      });

      const executePromise = command.execute({});

      // Simulate auth completing successfully
      const authExitHandler = authChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      authExitHandler(0);

      // Wait a tick for the serve spawn to happen
      await vi.waitFor(() => {
        expect(serveChild.on).toHaveBeenCalled();
      });

      // Simulate serve exiting cleanly
      const serveExitHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      serveExitHandler(0);

      const result = await executePromise;

      expect(spawn).toHaveBeenCalledWith('finqu-theme-dev', ['auth'], {
        stdio: 'inherit',
      });
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('No finqu-theme-dev credentials found'),
      );
      expect(result).toEqual({ success: true });
    });

    it('should return failure when auth fails', async () => {
      spawn.mockReturnValue(authChild);

      const executePromise = command.execute({});

      // Simulate auth failing
      const exitHandler = authChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      exitHandler(1);

      const result = await executePromise;

      expect(result).toEqual({ success: false });
      expect(mockLogger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed'),
      );
    });

    it('should return failure when auth process errors', async () => {
      spawn.mockReturnValue(authChild);

      const executePromise = command.execute({});

      // Simulate process error
      const errorHandler = authChild.on.mock.calls.find(
        (c) => c[0] === 'error',
      )[1];
      errorHandler(new Error('spawn failed'));

      const result = await executePromise;

      expect(result).toEqual({ success: false });
    });
  });

  describe('execute() - serve', () => {
    let serveChild;

    beforeEach(() => {
      // Binary installed, already authenticated
      execFileSync.mockReturnValue('1.0.0');
      fs.existsSync.mockReturnValue(true);

      serveChild = {
        on: vi.fn(),
        killed: false,
        kill: vi.fn(),
      };
      spawn.mockReturnValue(serveChild);
    });

    it('should spawn serve with default options', async () => {
      const executePromise = command.execute({});

      const exitHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      exitHandler(0);

      const result = await executePromise;

      expect(spawn).toHaveBeenCalledWith(
        'finqu-theme-dev',
        ['serve', '--port', '3000', '--dir', '/path/to/theme'],
        expect.objectContaining({ stdio: 'inherit' }),
      );
      expect(result).toEqual({ success: true });
    });

    it('should pass custom port and dir options', async () => {
      const executePromise = command.execute({
        port: '8080',
        dir: '/custom/dir',
      });

      const exitHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      exitHandler(0);

      await executePromise;

      expect(spawn).toHaveBeenCalledWith(
        'finqu-theme-dev',
        ['serve', '--port', '8080', '--dir', '/custom/dir'],
        expect.objectContaining({ stdio: 'inherit' }),
      );
    });

    it('should pass FINQU_STORE_DOMAIN from CLI config', async () => {
      mockConfig.get.mockImplementation((key) => {
        if (key === 'themeDir') return '/path/to/theme';
        if (key === 'storeDomain') return 'shop.example.com';
        return null;
      });

      const executePromise = command.execute({});

      const exitHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      exitHandler(0);

      await executePromise;

      const serveCall = spawn.mock.calls.find((c) => c[1]?.[0] === 'serve');
      expect(serveCall[2].env.FINQU_STORE_DOMAIN).toBe('shop.example.com');
      expect(mockLogger.printStatus).toHaveBeenCalledWith(
        expect.stringContaining('shop.example.com'),
      );
    });

    it('should return failure when serve exits with non-zero code', async () => {
      const executePromise = command.execute({});

      const exitHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      exitHandler(1);

      const result = await executePromise;

      expect(result).toEqual({ success: false });
    });

    it('should return failure when serve process errors', async () => {
      const executePromise = command.execute({});

      const errorHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'error',
      )[1];
      errorHandler(new Error('spawn failed'));

      // Also fire exit so promise resolves
      const exitHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      exitHandler(1);

      const result = await executePromise;

      expect(result.success).toBe(false);
    });

    it('should print status message with port', async () => {
      const executePromise = command.execute({ port: '4000' });

      const exitHandler = serveChild.on.mock.calls.find(
        (c) => c[0] === 'exit',
      )[1];
      exitHandler(0);

      await executePromise;

      expect(mockLogger.printStatus).toHaveBeenCalledWith(
        expect.stringContaining('4000'),
      );
    });
  });
});
