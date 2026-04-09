import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppInfoCommand } from '../../src/commands/app-info.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppInfoCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppInfoCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('info');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });

    it('has --app-id option', () => {
      expect(command.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ flags: '--app-id <id>' }),
        ]),
      );
    });
  });

  describe('execute', () => {
    const mockAppData = {
      id: 42,
      name: 'Test App',
      handle: 'test-handle',
      is_published: true,
      published_version: '1.2.0',
      domain: '.myfinqu.com',
      client_id: 7,
      redirect_uri: 'https://example.com/callback',
      version_history: [
        {
          version: '1.2.0',
          changelog: 'Bug fixes',
          created_at: 'Mon, 07 Apr 2026 10:00:00 +0000',
        },
      ],
    };

    it('displays app details using linked appId', async () => {
      mockApp.services.appApi.getApp.mockResolvedValue(mockAppData);

      const result = await command.execute({});

      expect(mockApp.services.appApi.getApp).toHaveBeenCalledWith(42);
      expect(result).toEqual({ success: true, app: mockAppData });
      expect(mockApp.logger.print).toHaveBeenCalledWith(
        expect.stringContaining('Test App'),
      );
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.getApp.mockResolvedValue(mockAppData);

      await command.execute({ appId: 99 });

      expect(mockApp.services.appApi.getApp).toHaveBeenCalledWith(99);
    });

    it('displays version history', async () => {
      mockApp.services.appApi.getApp.mockResolvedValue(mockAppData);

      await command.execute({});

      expect(mockApp.logger.print).toHaveBeenCalledWith(
        expect.stringContaining('Version history'),
      );
      expect(mockApp.logger.print).toHaveBeenCalledWith(
        expect.stringContaining('1.2.0'),
      );
    });

    it('throws when no appId available', async () => {
      mockApp = createMockApp();
      command = new AppInfoCommand(mockApp);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        expect.stringContaining('No app ID'),
      );
    });

    it('handles API errors', async () => {
      const error = new Error('network error');
      mockApp.services.appApi.getApp.mockRejectedValue(error);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.handleError).toHaveBeenCalledWith(error);
    });
  });
});
