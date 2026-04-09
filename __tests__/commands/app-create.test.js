import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppCreateCommand, handleize } from '../../src/commands/app-create.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

// Mock prompts
vi.mock('prompts', () => ({
  default: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  access: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import prompts from 'prompts';
import fs from 'node:fs/promises';

describe('handleize', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(handleize('My App')).toBe('my-app');
  });

  it('replaces special characters with hyphens', () => {
    expect(handleize('My App! (v2)')).toBe('my-app-v2');
  });

  it('collapses multiple hyphens', () => {
    expect(handleize('My---App')).toBe('my-app');
  });

  it('trims leading/trailing hyphens', () => {
    expect(handleize('--My App--')).toBe('my-app');
  });
});

describe('AppCreateCommand', () => {
  let command;
  let mockApp;
  const createdApp = {
    id: 42,
    name: 'My App',
    handle: 'abc123',
    client_id: 7,
    client_secret: 'secret-value',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    mockApp.services.appApi.createApp.mockResolvedValue(createdApp);

    // Default: directory does not exist (access throws ENOENT)
    fs.access.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    fs.mkdir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);

    command = new AppCreateCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('create');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });

    it('has correct syntax', () => {
      expect(command.syntax).toBe('create [name]');
    });

    it('has options for name, base-uri, install-endpoint, redirect-uri', () => {
      const flags = command.options.map((o) => o.flags);
      expect(flags).toContain('--name <name>');
      expect(flags).toContain('--base-uri <uri>');
      expect(flags).toContain('--install-endpoint <path>');
      expect(flags).toContain('--redirect-uri <uri>');
    });
  });

  describe('non-interactive (all flags)', () => {
    it('creates app with correct API calls and scaffolds directory', async () => {
      const result = await command.execute(undefined, {
        name: 'My App',
        baseUri: 'http://localhost:3000',
        installEndpoint: '/api/install',
        redirectUri: 'http://localhost:3000/api/install/callback',
      });

      expect(prompts).not.toHaveBeenCalled();

      expect(mockApp.services.appApi.createApp).toHaveBeenCalledWith('My App', {
        redirect_uri: 'http://localhost:3000/api/install/callback',
        http: { base_uri: 'http://localhost:3000' },
        endpoints: { install: '/api/install' },
      });

      expect(fs.mkdir).toHaveBeenCalled();

      // Should write a single .env file with app config + credentials
      const envWrite = fs.writeFile.mock.calls.find((c) =>
        c[0].endsWith('.env'),
      );
      expect(envWrite).toBeDefined();
      expect(envWrite[1]).toContain('FINQU_APP_ID=42');
      expect(envWrite[1]).toContain('FINQU_API_CLIENT_ID=abc123');
      expect(envWrite[1]).toContain('FINQU_API_CLIENT_SECRET=secret-value');

      expect(result).toEqual({
        success: true,
        app: createdApp,
        dirName: 'my-app',
      });
    });

    it('uses positional name arg as app name', async () => {
      const result = await command.execute('CLI App', {
        baseUri: 'http://localhost:4000',
        installEndpoint: '/install',
        redirectUri: 'http://localhost:4000/callback',
      });

      expect(prompts).not.toHaveBeenCalled();
      expect(mockApp.services.appApi.createApp).toHaveBeenCalledWith(
        'CLI App',
        expect.any(Object),
      );
      expect(result.dirName).toBe('cli-app');
    });

    it('flag --name takes precedence over positional arg', async () => {
      await command.execute('Positional', {
        name: 'Flag Name',
        baseUri: 'http://localhost:3000',
        installEndpoint: '/api/install',
        redirectUri: 'http://localhost:3000/callback',
      });

      expect(mockApp.services.appApi.createApp).toHaveBeenCalledWith(
        'Flag Name',
        expect.any(Object),
      );
    });
  });

  describe('interactive (no flags)', () => {
    it('prompts for all values when no flags provided', async () => {
      prompts
        .mockResolvedValueOnce({ appName: 'Prompted App' })
        .mockResolvedValueOnce({ baseUri: 'http://localhost:3000' })
        .mockResolvedValueOnce({ installEndpoint: '/api/install' })
        .mockResolvedValueOnce({
          redirectUri: 'http://localhost:3000/api/install/callback',
        });

      const result = await command.execute(undefined, {});

      expect(prompts).toHaveBeenCalledTimes(4);
      expect(mockApp.services.appApi.createApp).toHaveBeenCalledWith(
        'Prompted App',
        {
          redirect_uri: 'http://localhost:3000/api/install/callback',
          http: { base_uri: 'http://localhost:3000' },
          endpoints: { install: '/api/install' },
        },
      );
      expect(result.success).toBe(true);
      expect(result.dirName).toBe('prompted-app');
    });

    it('only prompts for missing values', async () => {
      prompts.mockResolvedValueOnce({
        redirectUri: 'http://localhost:3000/callback',
      });

      await command.execute('My App', {
        baseUri: 'http://localhost:3000',
        installEndpoint: '/api/install',
      });

      // Only redirectUri was prompted
      expect(prompts).toHaveBeenCalledTimes(1);
      expect(prompts).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'redirectUri' }),
        expect.any(Object),
      );
    });
  });

  describe('directory scaffolding', () => {
    it('fails when directory already exists', async () => {
      fs.access.mockResolvedValue(undefined); // directory exists

      const result = await command.execute(undefined, {
        name: 'My App',
        baseUri: 'http://localhost:3000',
        installEndpoint: '/api/install',
        redirectUri: 'http://localhost:3000/callback',
      });

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        'Directory "my-app" already exists.',
      );
    });

    it('writes .env with app config and client credentials', async () => {
      await command.execute(undefined, {
        name: 'Test App',
        baseUri: 'http://localhost:3000',
        installEndpoint: '/api/install',
        redirectUri: 'http://localhost:3000/callback',
      });

      const envWrite = fs.writeFile.mock.calls.find((c) =>
        c[0].endsWith('.env'),
      );
      expect(envWrite).toBeDefined();
      expect(envWrite[1]).toContain('FINQU_APP_ID=42');
      expect(envWrite[1]).toContain('FINQU_API_CLIENT_ID=abc123');
      expect(envWrite[1]).toContain('FINQU_API_CLIENT_SECRET=secret-value');
    });
  });

  describe('error handling', () => {
    it('handles API errors', async () => {
      const error = AppError.validationError('invalid_name');
      mockApp.services.appApi.createApp.mockRejectedValue(error);

      const result = await command.execute(undefined, {
        name: 'Bad',
        baseUri: 'http://localhost:3000',
        installEndpoint: '/api/install',
        redirectUri: 'http://localhost:3000/callback',
      });

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });

    it('handles unexpected errors', async () => {
      mockApp.services.appApi.createApp.mockRejectedValue(
        new Error('Network error'),
      );

      const result = await command.execute(undefined, {
        name: 'Bad',
        baseUri: 'http://localhost:3000',
        installEndpoint: '/api/install',
        redirectUri: 'http://localhost:3000/callback',
      });

      expect(result.success).toBe(false);
      expect(mockApp.logger.handleError).toHaveBeenCalled();
    });
  });
});
