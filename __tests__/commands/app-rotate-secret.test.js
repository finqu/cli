import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppRotateSecretCommand } from '../../src/commands/app-rotate-secret.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppRotateSecretCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppRotateSecretCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('rotate-secret');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });
  });

  describe('execute', () => {
    it('rotates secret and displays new credentials', async () => {
      const secretData = {
        client_secret: 'newSecret123',
        client_secret_created_at: 'Mon, 07 Apr 2026 10:00:00 +0000',
      };
      mockApp.services.appApi.rotateSecret.mockResolvedValue(secretData);

      const result = await command.execute({});

      expect(mockApp.services.appApi.rotateSecret).toHaveBeenCalledWith(42);
      expect(mockApp.logger.printSuccess).toHaveBeenCalledWith(
        'Client secret rotated.',
      );
      expect(mockApp.logger.print).toHaveBeenCalledWith(
        expect.stringContaining('newSecret123'),
      );
      expect(mockApp.logger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('FINQU_CLIENT_SECRET'),
      );
      expect(result).toEqual({ success: true, result: secretData });
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.rotateSecret.mockResolvedValue({
        client_secret: 'secret',
        client_secret_created_at: 'now',
      });

      await command.execute({ appId: 99 });

      expect(mockApp.services.appApi.rotateSecret).toHaveBeenCalledWith(99);
    });

    it('handles no_oauth_client error', async () => {
      const error = AppError.validationError('no_oauth_client');
      mockApp.services.appApi.rotateSecret.mockRejectedValue(error);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });

    it('handles unexpected errors', async () => {
      const error = new Error('network error');
      mockApp.services.appApi.rotateSecret.mockRejectedValue(error);

      const result = await command.execute({});

      expect(result.success).toBe(false);
      expect(mockApp.logger.handleError).toHaveBeenCalledWith(error);
    });
  });
});
