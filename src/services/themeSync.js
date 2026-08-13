/**
 * Theme sync helpers — pull settings_data and compiled public/ assets from the server
 */
import path from 'path';
import {
  ConcurrentProgress,
  runWithConcurrency,
} from '../core/concurrent-progress.js';

export const SETTINGS_DATA_PATH = 'config/settings_data.json';
export const PUBLIC_PREFIX = 'public/';

const BATCH_SIZE = 10;

/**
 * Download config/settings_data.json from the remote theme to the local theme dir
 * @param {Object} params
 * @param {Object} params.themeApi Theme API service
 * @param {Object} params.fileSystem File system
 * @param {string} params.themeDir Local theme directory
 * @param {Object} params.logger Logger
 * @returns {Promise<{success: boolean, skipped?: boolean}>}
 */
export async function pullSettingsData({
  themeApi,
  fileSystem,
  themeDir,
  logger,
}) {
  const localPath = path.join(themeDir, SETTINGS_DATA_PATH);
  logger.printStatus(`Syncing ${SETTINGS_DATA_PATH} from theme...`);

  try {
    const success = await themeApi.downloadAsset(
      SETTINGS_DATA_PATH,
      localPath,
      fileSystem,
      { quiet: true },
    );

    if (success) {
      logger.printSuccess(`Synced ${SETTINGS_DATA_PATH}`);
      return { success: true };
    }

    logger.printInfo(`Could not sync ${SETTINGS_DATA_PATH}`);
    return { success: false };
  } catch (err) {
    if (err.status === 404) {
      logger.printInfo(
        `Remote ${SETTINGS_DATA_PATH} not found; skipping settings sync.`,
      );
      return { success: true, skipped: true };
    }
    throw err;
  }
}

/**
 * Refresh local public/ from remote compiled assets and prune stale local files
 * @param {Object} params
 * @param {Object} params.themeApi Theme API service
 * @param {Object} params.fileSystem File system
 * @param {string} params.themeDir Local theme directory
 * @param {Object} params.logger Logger
 * @returns {Promise<{downloadedCount: number, removedCount: number, errors: Array}>}
 */
export async function syncPublicAssets({
  themeApi,
  fileSystem,
  themeDir,
  logger,
}) {
  logger.printStatus('Syncing compiled public/ assets from theme...');

  const assets = await themeApi.getAssets();
  const remotePublicPaths = [];

  for (const asset of assets || []) {
    if (
      asset.type !== 'dir' &&
      typeof asset.path === 'string' &&
      asset.path.startsWith(PUBLIC_PREFIX)
    ) {
      remotePublicPaths.push(asset.path);
    }
  }

  const remoteSet = new Set(remotePublicPaths);
  let downloadedCount = 0;
  const errors = [];
  const downloadedPaths = [];

  if (remotePublicPaths.length > 0) {
    const progress = new ConcurrentProgress(
      Math.min(BATCH_SIZE, remotePublicPaths.length),
    );
    logger.suspendVerbose();
    try {
      await runWithConcurrency(
        remotePublicPaths,
        BATCH_SIZE,
        async (assetPath, slot) => {
          try {
            const localFilePath = path.join(themeDir, assetPath);
            const dirPath = path.dirname(localFilePath);
            if (!(await fileSystem.exists(dirPath))) {
              await fileSystem.mkdir(dirPath, { recursive: true });
            }

            const success = await themeApi.downloadAsset(
              assetPath,
              localFilePath,
              fileSystem,
              {
                quiet: true,
                onStatus: (msg) => progress.update(slot, msg),
              },
            );

            if (success) {
              downloadedCount++;
              downloadedPaths.push(assetPath);
            }
          } catch (e) {
            errors.push({
              path: assetPath,
              error: e.message || e.error || e,
            });
          } finally {
            progress.finish(slot);
          }
        },
      );
    } finally {
      progress.clear();
      logger.resumeVerbose();
    }
  }

  logger.printVerboseList('Synced public/ files:', downloadedPaths);

  // Prune local public/ files that no longer exist remotely
  let removedCount = 0;
  const publicDir = path.join(themeDir, 'public');
  if (await fileSystem.exists(publicDir)) {
    const localPublicFiles = await fileSystem.getFiles(publicDir);
    for (const absolutePath of localPublicFiles) {
      const relativePath = path.relative(themeDir, absolutePath);
      if (!remoteSet.has(relativePath)) {
        try {
          await fileSystem.unlink(absolutePath);
          removedCount++;
          logger.printVerbose(`Removed stale local asset: ${relativePath}`);
        } catch (e) {
          errors.push({
            path: relativePath,
            error: e.message || e,
            action: 'prune',
          });
        }
      }
    }
  }

  for (const err of errors) {
    logger.printError(
      `Failed to sync public asset: ${err.path}`,
      err.error,
    );
  }

  if (downloadedCount > 0 || removedCount > 0) {
    logger.printSuccess(
      `Synced ${downloadedCount} compiled asset(s)` +
        (removedCount > 0 ? `, removed ${removedCount} stale local file(s)` : ''),
    );
  } else {
    logger.printInfo('No compiled public/ assets to sync.');
  }

  return { downloadedCount, removedCount, errors };
}
