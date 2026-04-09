import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppUpdateCommand } from '../../src/commands/app-update.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppUpdateCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppUpdateCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('update');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });
  });

  describe('execute', () => {
    it('updates app with configuration', async () => {
      mockApp.services.appApi.updateApp.mockResolvedValue(undefined);

      const result = await command.execute({
        configuration: '{"http":{"base_uri":"https://example.com"}}',
      });

      expect(mockApp.services.appApi.updateApp).toHaveBeenCalledWith(42, {
        configuration: { http: { base_uri: 'https://example.com' } },
      });
      expect(result).toEqual({ success: true });
    });

    it('updates app with listing', async () => {
      mockApp.services.appApi.updateApp.mockResolvedValue(undefined);

      await command.execute({
        listing: '{"default":{"name":"New Name"}}',
      });

      expect(mockApp.services.appApi.updateApp).toHaveBeenCalledWith(42, {
        listing: { default: { name: 'New Name' } },
      });
    });

    it('updates app with redirect URI', async () => {
      mockApp.services.appApi.updateApp.mockResolvedValue(undefined);

      await command.execute({
        redirectUri: 'https://example.com/callback',
      });

      expect(mockApp.services.appApi.updateApp).toHaveBeenCalledWith(42, {
        redirect_uri: 'https://example.com/callback',
      });
    });

    it('updates app with locations', async () => {
      mockApp.services.appApi.updateApp.mockResolvedValue(undefined);

      await command.execute({
        locations: ['FI', 'SE'],
      });

      expect(mockApp.services.appApi.updateApp).toHaveBeenCalledWith(42, {
        locations: ['FI', 'SE'],
      });
    });

    it('errors when no update fields provided', async () => {
      const result = await command.execute({});

      expect(result).toEqual({ success: false });
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        expect.stringContaining('No update fields specified'),
      );
    });

    it('handles invalid JSON', async () => {
      const result = await command.execute({
        configuration: 'bad-json',
      });

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid JSON'),
      );
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.updateApp.mockResolvedValue(undefined);

      await command.execute({
        appId: 99,
        redirectUri: 'https://example.com',
      });

      expect(mockApp.services.appApi.updateApp).toHaveBeenCalledWith(
        99,
        expect.any(Object),
      );
    });
  });
});
