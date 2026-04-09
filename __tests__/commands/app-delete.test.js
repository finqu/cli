import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppDeleteCommand } from '../../src/commands/app-delete.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppDeleteCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppDeleteCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('delete');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });
  });

  describe('execute', () => {
    it('deletes draft app immediately', async () => {
      mockApp.services.appApi.deleteApp.mockResolvedValue({ deleted: true });

      const result = await command.execute({});

      expect(mockApp.services.appApi.deleteApp).toHaveBeenCalledWith(42);
      expect(mockApp.logger.printSuccess).toHaveBeenCalledWith(
        'App deleted immediately.',
      );
      expect(result.success).toBe(true);
    });

    it('schedules deletion for non-draft app', async () => {
      mockApp.services.appApi.deleteApp.mockResolvedValue({
        deleted: false,
        delete_requested_at: 'Mon, 07 Jul 2026 10:00:00 +0000',
      });

      const result = await command.execute({});

      expect(mockApp.logger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('scheduled'),
      );
      expect(result.success).toBe(true);
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.deleteApp.mockResolvedValue({ deleted: true });

      await command.execute({ appId: 99 });

      expect(mockApp.services.appApi.deleteApp).toHaveBeenCalledWith(99);
    });

    it('handles API errors', async () => {
      const error = AppError.authError('insufficient scope');
      mockApp.services.appApi.deleteApp.mockRejectedValue(error);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });
  });
});
