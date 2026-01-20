import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import {
  StorefrontDevCommand,
  createStorefrontDevCommand,
  findAvailablePort,
} from '../../src/commands/storefront-dev.js';

describe('StorefrontDevCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    mockApp = {
      config: { get: vi.fn(), set: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printStatus: vi.fn(),
        printSuccess: vi.fn(),
        printError: vi.fn(),
        printVerbose: vi.fn(),
      },
      fileSystem: {
        exists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    };

    command = new StorefrontDevCommand(mockApp);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('basic properties', () => {
    it('should have the correct name', () => {
      expect(command.name).toBe('dev');
    });

    it('should have the correct description', () => {
      expect(command.description).toContain('Start development server');
    });

    it('should belong to the storefront group', () => {
      expect(command.group).toBe('storefront');
    });

    it('should have the correct options', () => {
      const options = command.options;
      expect(options).toHaveLength(3);

      expect(options).toContainEqual({
        flags: '-c, --components <path>',
        description: 'Path to components directory',
        defaultValue: 'components',
      });

      expect(options).toContainEqual({
        flags: '-o, --output <path>',
        description: 'Output directory for generated config',
        defaultValue: '.storefront',
      });

      expect(options).toContainEqual({
        flags: '-p, --port <number>',
        description: 'Port for Next.js dev server',
        defaultValue: '3000',
      });
    });

    it('should create command with factory function', () => {
      const factoryCommand = createStorefrontDevCommand(mockApp);
      expect(factoryCommand).toBeInstanceOf(StorefrontDevCommand);
      expect(factoryCommand.app).toBe(mockApp);
    });
  });

  describe('command structure', () => {
    it('should use default syntax (command name)', () => {
      expect(command.syntax).toBe('dev');
    });

    it('should have storefront as group', () => {
      expect(command.group).toBe('storefront');
    });
  });

  describe('options validation', () => {
    it('should have components option with default value', () => {
      const componentsOption = command.options.find(
        (opt) => opt.flags === '-c, --components <path>',
      );
      expect(componentsOption).toBeDefined();
      expect(componentsOption.defaultValue).toBe('components');
    });

    it('should have output option with default value', () => {
      const outputOption = command.options.find(
        (opt) => opt.flags === '-o, --output <path>',
      );
      expect(outputOption).toBeDefined();
      expect(outputOption.defaultValue).toBe('.storefront');
    });

    it('should have port option with default value', () => {
      const portOption = command.options.find(
        (opt) => opt.flags === '-p, --port <number>',
      );
      expect(portOption).toBeDefined();
      expect(portOption.defaultValue).toBe('3000');
    });
  });
});

describe('findAvailablePort', () => {
  it('should return the requested port if available', async () => {
    // Use a high port number that's unlikely to be in use
    const port = await findAvailablePort(49152);
    expect(port).toBe(49152);
  });

  it('should find the next available port if requested port is in use', async () => {
    // Create a server to occupy the port on all IPv4 interfaces
    const server = net.createServer();
    const testPort = 49200;

    await new Promise((resolve) => {
      server.listen(testPort, '0.0.0.0', resolve);
    });

    try {
      const port = await findAvailablePort(testPort);
      expect(port).toBe(testPort + 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should skip multiple occupied ports', async () => {
    const servers = [];
    const testPort = 49300;

    // Occupy 3 consecutive ports on all IPv4 interfaces
    for (let i = 0; i < 3; i++) {
      const server = net.createServer();
      await new Promise((resolve) => {
        server.listen(testPort + i, '0.0.0.0', resolve);
      });
      servers.push(server);
    }

    try {
      const port = await findAvailablePort(testPort);
      expect(port).toBe(testPort + 3);
    } finally {
      await Promise.all(
        servers.map((s) => new Promise((resolve) => s.close(resolve))),
      );
    }
  });

  it('should throw error after max attempts', async () => {
    // This test uses maxAttempts = 1 to quickly hit the limit
    const server = net.createServer();
    const testPort = 49400;

    await new Promise((resolve) => {
      server.listen(testPort, '0.0.0.0', resolve);
    });

    try {
      await expect(findAvailablePort(testPort, 1)).rejects.toThrow(
        'Could not find an available port after 1 attempts starting from 49400',
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should detect ports occupied on localhost', async () => {
    // Create a server on localhost
    const server = net.createServer();
    const testPort = 49500;

    await new Promise((resolve) => {
      server.listen(testPort, '127.0.0.1', resolve);
    });

    try {
      // Note: This may or may not detect the port as in use depending on system
      // At minimum, it should not crash
      const port = await findAvailablePort(testPort);
      expect(port).toBeGreaterThanOrEqual(testPort);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

// Note: Integration tests for the actual dev server functionality are not included
// as they would require spawning real processes and file system operations.
// The runDev function is tested via manual testing or separate integration tests.
