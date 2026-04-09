import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppListCommand } from '../../src/commands/app-list.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppListCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    command = new AppListCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('list');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });
  });

  describe('execute', () => {
    it('lists apps with details', async () => {
      const apps = [
        {
          id: 1,
          name: 'App One',
          handle: 'handle-1',
          is_published: true,
          published_version: '1.2.0',
        },
        {
          id: 2,
          name: 'App Two',
          handle: 'handle-2',
          is_published: false,
          published_version: null,
        },
      ];
      mockApp.services.appApi.listApps.mockResolvedValue(apps);

      const result = await command.execute();

      expect(mockApp.services.appApi.listApps).toHaveBeenCalled();
      expect(result).toEqual({ success: true, apps });
      // 2 blank lines + header + separator + 2 data rows = 6 print calls
      expect(mockApp.logger.print).toHaveBeenCalledTimes(6);
    });

    it('marks linked app', async () => {
      const apps = [
        {
          id: 42,
          name: 'Linked App',
          handle: 'linked',
          is_published: true,
          published_version: '1.0.0',
        },
      ];
      mockApp.services.appApi.listApps.mockResolvedValue(apps);
      mockApp.config.get.mockImplementation((key, defaultValue) => {
        if (key === 'appId') return 42;
        return defaultValue;
      });

      await command.execute();

      expect(mockApp.logger.print).toHaveBeenCalledWith(
        expect.stringContaining('●'),
      );
    });

    it('handles empty app list', async () => {
      mockApp.services.appApi.listApps.mockResolvedValue([]);

      const result = await command.execute();

      expect(result).toEqual({ success: true, apps: [] });
      expect(mockApp.logger.printInfo).toHaveBeenCalledWith('No apps found.');
    });

    it('returns failure on error', async () => {
      const error = AppError.authError('unauthorized');
      mockApp.services.appApi.listApps.mockRejectedValue(error);

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });
  });
});
