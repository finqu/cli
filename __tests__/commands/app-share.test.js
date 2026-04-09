import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppShareCommand } from '../../src/commands/app-share.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppShareCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppShareCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('share');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });
  });

  describe('execute', () => {
    it('displays share URL', async () => {
      const shareData = {
        share_token: 'abc123',
        share_url: 'https://login.finqu.com/apps/handle/share?token=abc123',
      };
      mockApp.services.appApi.getShareLink.mockResolvedValue(shareData);

      const result = await command.execute({});

      expect(mockApp.services.appApi.getShareLink).toHaveBeenCalledWith(42);
      expect(mockApp.logger.print).toHaveBeenCalledWith(
        expect.stringContaining(shareData.share_url),
      );
      expect(result).toEqual({ success: true, result: shareData });
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.getShareLink.mockResolvedValue({
        share_url: 'https://example.com',
      });

      await command.execute({ appId: 99 });

      expect(mockApp.services.appApi.getShareLink).toHaveBeenCalledWith(99);
    });

    it('handles errors', async () => {
      const error = AppError.authError('unauthorized');
      mockApp.services.appApi.getShareLink.mockRejectedValue(error);

      const result = await command.execute({});

      expect(result.success).toBe(false);
    });
  });
});
