import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppPublishCommand } from '../../src/commands/app-publish.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppPublishCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppPublishCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('publish');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });
  });

  describe('execute', () => {
    it('publishes the app', async () => {
      mockApp.services.appApi.publishApp.mockResolvedValue(undefined);

      const result = await command.execute({});

      expect(mockApp.services.appApi.publishApp).toHaveBeenCalledWith(42);
      expect(mockApp.logger.printSuccess).toHaveBeenCalledWith(
        'App published successfully.',
      );
      expect(result).toEqual({ success: true });
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.publishApp.mockResolvedValue(undefined);

      await command.execute({ appId: 99 });

      expect(mockApp.services.appApi.publishApp).toHaveBeenCalledWith(99);
    });

    it('handles errors', async () => {
      const error = AppError.authError('insufficient_scope');
      mockApp.services.appApi.publishApp.mockRejectedValue(error);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });

    it('throws when no appId available', async () => {
      mockApp = createMockApp();
      command = new AppPublishCommand(mockApp);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalledWith(
        expect.stringContaining('No app ID'),
      );
    });
  });
});
