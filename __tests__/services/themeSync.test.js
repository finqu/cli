import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import {
  pullSettingsData,
  syncPublicAssets,
  SETTINGS_DATA_PATH,
} from '../../src/services/themeSync.js';

describe('themeSync', () => {
  let themeApi;
  let fileSystem;
  let logger;
  const themeDir = '/path/to/theme';

  beforeEach(() => {
    vi.clearAllMocks();
    themeApi = {
      downloadAsset: vi.fn().mockResolvedValue(true),
      getAssets: vi.fn().mockResolvedValue([]),
    };
    fileSystem = {
      exists: vi.fn().mockResolvedValue(true),
      mkdir: vi.fn().mockResolvedValue(undefined),
      getFiles: vi.fn().mockResolvedValue([]),
      unlink: vi.fn().mockResolvedValue(undefined),
    };
    logger = {
      printStatus: vi.fn(),
      printSuccess: vi.fn(),
      printInfo: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      printVerboseList: vi.fn(),
      suspendVerbose: vi.fn(),
      resumeVerbose: vi.fn(),
    };
  });

  describe('pullSettingsData()', () => {
    it('downloads settings_data.json to the theme dir', async () => {
      const result = await pullSettingsData({
        themeApi,
        fileSystem,
        themeDir,
        logger,
      });

      expect(themeApi.downloadAsset).toHaveBeenCalledWith(
        SETTINGS_DATA_PATH,
        path.join(themeDir, SETTINGS_DATA_PATH),
        fileSystem,
        { quiet: true },
      );
      expect(logger.printSuccess).toHaveBeenCalledWith(
        `Synced ${SETTINGS_DATA_PATH}`,
      );
      expect(result).toEqual({ success: true });
    });

    it('skips when remote settings_data.json is missing', async () => {
      themeApi.downloadAsset.mockRejectedValueOnce({
        status: 404,
        error: 'File not found',
      });

      const result = await pullSettingsData({
        themeApi,
        fileSystem,
        themeDir,
        logger,
      });

      expect(result).toEqual({ success: true, skipped: true });
      expect(logger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
      );
    });

    it('rethrows non-404 errors', async () => {
      const err = { status: 500, error: 'Server error' };
      themeApi.downloadAsset.mockRejectedValueOnce(err);

      await expect(
        pullSettingsData({ themeApi, fileSystem, themeDir, logger }),
      ).rejects.toEqual(err);
    });
  });

  describe('syncPublicAssets()', () => {
    it('downloads remote public/ files and prunes stale local ones', async () => {
      themeApi.getAssets.mockResolvedValueOnce([
        { type: 'dir', path: 'public' },
        { type: 'file', path: 'public/main.abc123.css' },
        { type: 'file', path: 'assets/main.scss.liquid' },
        { type: 'file', path: 'public/js/app.def456.js' },
      ]);
      fileSystem.exists.mockResolvedValue(true);
      fileSystem.getFiles.mockResolvedValueOnce([
        path.join(themeDir, 'public/main.abc123.css'),
        path.join(themeDir, 'public/main.oldhash.css'),
        path.join(themeDir, 'public/js/app.def456.js'),
      ]);

      const result = await syncPublicAssets({
        themeApi,
        fileSystem,
        themeDir,
        logger,
      });

      expect(themeApi.downloadAsset).toHaveBeenCalledTimes(2);
      expect(themeApi.downloadAsset).toHaveBeenCalledWith(
        'public/main.abc123.css',
        path.join(themeDir, 'public/main.abc123.css'),
        fileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(themeApi.downloadAsset).toHaveBeenCalledWith(
        'public/js/app.def456.js',
        path.join(themeDir, 'public/js/app.def456.js'),
        fileSystem,
        expect.objectContaining({ quiet: true }),
      );
      expect(fileSystem.unlink).toHaveBeenCalledWith(
        path.join(themeDir, 'public/main.oldhash.css'),
      );
      expect(result.downloadedCount).toBe(2);
      expect(result.removedCount).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('reports when there are no public assets', async () => {
      themeApi.getAssets.mockResolvedValueOnce([
        { type: 'file', path: 'assets/main.scss.liquid' },
      ]);
      fileSystem.exists.mockResolvedValueOnce(false);

      const result = await syncPublicAssets({
        themeApi,
        fileSystem,
        themeDir,
        logger,
      });

      expect(themeApi.downloadAsset).not.toHaveBeenCalled();
      expect(result.downloadedCount).toBe(0);
      expect(logger.printInfo).toHaveBeenCalledWith(
        'No compiled public/ assets to sync.',
      );
    });
  });
});
