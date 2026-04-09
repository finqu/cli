import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppUnpublishCommand } from '../../src/commands/app-unpublish.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppUnpublishCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppUnpublishCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('unpublish');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });
  });

  describe('execute', () => {
    it('unpublishes the app', async () => {
      mockApp.services.appApi.unpublishApp.mockResolvedValue(undefined);

      const result = await command.execute({});

      expect(mockApp.services.appApi.unpublishApp).toHaveBeenCalledWith(42);
      expect(mockApp.logger.printSuccess).toHaveBeenCalledWith(
        'App unpublished successfully.',
      );
      expect(result).toEqual({ success: true });
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.unpublishApp.mockResolvedValue(undefined);

      await command.execute({ appId: 99 });

      expect(mockApp.services.appApi.unpublishApp).toHaveBeenCalledWith(99);
    });

    it('handles errors', async () => {
      const error = AppError.authError('insufficient_scope');
      mockApp.services.appApi.unpublishApp.mockRejectedValue(error);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });
  });
});
