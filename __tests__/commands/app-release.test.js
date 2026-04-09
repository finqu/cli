import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppReleaseCommand } from '../../src/commands/app-release.js';
import { createMockApp } from '../helpers/testSetup.js';
import { AppError } from '../../src/core/error.js';

describe('AppReleaseCommand', () => {
  let command;
  let mockApp;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp({ config: { appId: 42 } });
    command = new AppReleaseCommand(mockApp);
  });

  describe('properties', () => {
    it('has correct name', () => {
      expect(command.name).toBe('release');
    });

    it('has correct group', () => {
      expect(command.group).toBe('app');
    });

    it('has version, type, and changelog options', () => {
      const flags = command.options.map((o) => o.flags);
      expect(flags).toContain('--version <version>');
      expect(flags).toContain('--type <type>');
      expect(flags).toContain('--changelog <text>');
    });
  });

  describe('execute', () => {
    it('releases with explicit version', async () => {
      const versionData = {
        version: '2.0.0',
        changelog: 'Major release',
        created_at: 'Mon, 07 Apr 2026 10:00:00 +0000',
      };
      mockApp.services.appApi.releaseVersion.mockResolvedValue(versionData);

      const result = await command.execute({
        version: '2.0.0',
        changelog: 'Major release',
      });

      expect(mockApp.services.appApi.releaseVersion).toHaveBeenCalledWith(42, {
        version: '2.0.0',
        changelog: 'Major release',
      });
      expect(mockApp.logger.printSuccess).toHaveBeenCalledWith(
        'Version 2.0.0 released.',
      );
      expect(result).toEqual({ success: true, result: versionData });
    });

    it('releases with type bump', async () => {
      mockApp.services.appApi.releaseVersion.mockResolvedValue({
        version: '1.1.0',
        created_at: 'Mon, 07 Apr 2026 10:00:00 +0000',
      });

      await command.execute({ type: 'minor' });

      expect(mockApp.services.appApi.releaseVersion).toHaveBeenCalledWith(42, {
        type: 'minor',
      });
    });

    it('uses --app-id override', async () => {
      mockApp.services.appApi.releaseVersion.mockResolvedValue({
        version: '1.0.1',
        created_at: 'Mon, 07 Apr 2026 10:00:00 +0000',
      });

      await command.execute({ appId: 99, type: 'patch' });

      expect(mockApp.services.appApi.releaseVersion).toHaveBeenCalledWith(
        99,
        expect.any(Object),
      );
    });

    it('handles version_too_low error', async () => {
      const error = AppError.validationError('version_too_low');
      mockApp.services.appApi.releaseVersion.mockRejectedValue(error);

      const result = await command.execute({ version: '0.1.0' });

      expect(result.success).toBe(false);
      expect(mockApp.logger.printError).toHaveBeenCalled();
    });
  });
});
