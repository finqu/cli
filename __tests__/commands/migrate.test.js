import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MigrateCommand } from '../../src/commands/migrate.js';
import { createMockApp } from '../helpers/testSetup.js';

describe('MigrateCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    command = new MigrateCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('migrate');
    });

    it('has null group (top-level)', () => {
      expect(command.group).toBeNull();
    });

    it('has options for json-config, output, and force', () => {
      const flags = command.options.map((o) => o.flags);
      expect(flags).toContain('--json-config <path>');
      expect(flags).toContain('--output <path>');
      expect(flags).toContain('--force');
    });
  });

  describe('execute', () => {
    const legacyConfig = {
      production: {
        accessToken: 'tok123',
        refreshToken: 'ref456',
        expiresAt: 1791380679313,
        merchant: 14990,
        resourceUrl: 'https://api.example.com',
        appId: 178,
        store: {
          merchantId: 100,
          id: 200,
          themeId: 300,
          versionId: 400,
          domain: 'test.example.com',
        },
      },
    };

    it('migrates finqu.config.json to .env format', async () => {
      mockApp.fileSystem.exists.mockImplementation((p) => {
        if (p.endsWith('finqu.config.json')) return Promise.resolve(true);
        return Promise.resolve(false); // .env doesn't exist
      });
      mockApp.fileSystem.readFile.mockResolvedValue(
        JSON.stringify(legacyConfig),
      );

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
      });

      expect(result.success).toBe(true);
      expect(result.migratedCount).toBeGreaterThan(0);

      const written = mockApp.fileSystem.writeFile.mock.calls[0][1];
      expect(written).toContain('FINQU_ACCESS_TOKEN=tok123');
      expect(written).toContain('FINQU_REFRESH_TOKEN=ref456');
      expect(written).toContain('FINQU_EXPIRES_AT=1791380679313');
      expect(written).toContain('FINQU_MERCHANT=14990');
      expect(written).toContain('FINQU_RESOURCE_URL=https://api.example.com');
      expect(written).toContain('FINQU_APP_ID=178');
      expect(written).toContain('FINQU_STORE_MERCHANT_ID=100');
      expect(written).toContain('FINQU_STORE_ID=200');
      expect(written).toContain('FINQU_STORE_THEME_ID=300');
      expect(written).toContain('FINQU_STORE_VERSION_ID=400');
      expect(written).toContain('FINQU_STORE_DOMAIN=test.example.com');
    });

    it('fails when legacy config does not exist', async () => {
      mockApp.fileSystem.exists.mockResolvedValue(false);

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
      });

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
    });

    it('fails when .env already exists without --force', async () => {
      mockApp.fileSystem.exists.mockResolvedValue(true); // both exist

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
      });

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
      );
    });

    it('overwrites .env when --force is set', async () => {
      mockApp.fileSystem.exists.mockResolvedValue(true);
      mockApp.fileSystem.readFile.mockResolvedValue(
        JSON.stringify(legacyConfig),
      );

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
        force: true,
      });

      expect(result.success).toBe(true);
      expect(mockApp.fileSystem.writeFile).toHaveBeenCalled();
    });

    it('warns about multiple environments', async () => {
      const multiEnvConfig = {
        production: { merchant: 1 },
        staging: { merchant: 2 },
      };

      mockApp.fileSystem.exists.mockImplementation((p) => {
        if (p.endsWith('finqu.config.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });
      mockApp.fileSystem.readFile.mockResolvedValue(
        JSON.stringify(multiEnvConfig),
      );

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
      });

      expect(result.success).toBe(true);
      expect(mockApp.logger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('staging'),
      );
    });

    it('handles invalid JSON gracefully', async () => {
      mockApp.fileSystem.exists.mockImplementation((p) => {
        if (p.endsWith('finqu.config.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });
      mockApp.fileSystem.readFile.mockResolvedValue('not valid json');

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
      });

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse'),
      );
    });

    it('handles empty config', async () => {
      mockApp.fileSystem.exists.mockImplementation((p) => {
        if (p.endsWith('finqu.config.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });
      mockApp.fileSystem.readFile.mockResolvedValue(JSON.stringify({}));

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
      });

      expect(result.success).toBe(false);
    });

    it('skips unknown keys', async () => {
      const configWithUnknown = {
        production: {
          merchant: 42,
          unknownKey: 'should-be-skipped',
        },
      };

      mockApp.fileSystem.exists.mockImplementation((p) => {
        if (p.endsWith('finqu.config.json')) return Promise.resolve(true);
        return Promise.resolve(false);
      });
      mockApp.fileSystem.readFile.mockResolvedValue(
        JSON.stringify(configWithUnknown),
      );

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
      });

      expect(result.success).toBe(true);
      const written = mockApp.fileSystem.writeFile.mock.calls[0][1];
      expect(written).toContain('FINQU_MERCHANT=42');
      expect(written).not.toContain('unknownKey');
    });

    it('preserves existing non-FINQU keys when using --force', async () => {
      mockApp.fileSystem.exists.mockResolvedValue(true);
      // First readFile call for legacy config, second for existing .env
      mockApp.fileSystem.readFile
        .mockResolvedValueOnce(JSON.stringify({ production: { merchant: 42 } }))
        .mockResolvedValueOnce(
          'FINQU_API_CLIENT_ID=my-client\nFINQU_API_CLIENT_SECRET=my-secret\nFINQU_OLD_KEY=old\n',
        );

      const result = await command.execute(undefined, {
        jsonConfig: '/test/finqu.config.json',
        output: '/test/.env',
        force: true,
      });

      expect(result.success).toBe(true);
      const written = mockApp.fileSystem.writeFile.mock.calls[0][1];
      expect(written).toContain('FINQU_API_CLIENT_ID=my-client');
      expect(written).toContain('FINQU_API_CLIENT_SECRET=my-secret');
      expect(written).toContain('FINQU_MERCHANT=42');
    });
  });
});
