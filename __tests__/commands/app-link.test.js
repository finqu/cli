import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppLinkCommand } from '../../src/commands/app-link.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppLinkCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
    command = new AppLinkCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('link');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });

    it('has correct syntax', () => {
      expect(command.syntax).toBe('link <appId>');
    });

    it('has correct description', () => {
      expect(command.description).toBe('Link this project to an existing app');
    });
  });

  describe('execute', () => {
    it('verifies app exists and saves appId to config', async () => {
      const mockAppData = { id: 42, name: 'My App', handle: 'abc123' };
      mockApp.services.appApi.getApp.mockResolvedValue(mockAppData);

      const result = await command.execute(42);

      expect(mockApp.services.appApi.getApp).toHaveBeenCalledWith(42);
      expect(mockApp.config.saveConfigValue).toHaveBeenCalledWith('appId', 42);
      expect(mockApp.logger.printSuccess).toHaveBeenCalledWith(
        'Linked to app "My App" (abc123)',
      );
      expect(result).toEqual({ success: true, app: mockAppData });
    });

    it('converts appId to number', async () => {
      mockApp.services.appApi.getApp.mockResolvedValue({
        id: 42,
        name: 'My App',
        handle: 'abc123',
      });

      await command.execute('42');

      expect(mockApp.config.saveConfigValue).toHaveBeenCalledWith('appId', 42);
    });

    it('returns failure on AppError', async () => {
      const error = AppError.configError('not found');
      mockApp.services.appApi.getApp.mockRejectedValue(error);

      const result = await command.execute(999);

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });

    it('handles unexpected errors', async () => {
      const error = new Error('network failure');
      mockApp.services.appApi.getApp.mockRejectedValue(error);

      const result = await command.execute(42);

      expect(result.success).toBe(false);
      expect(mockApp.logger.handleError).toHaveBeenCalledWith(error);
    });
  });
});
