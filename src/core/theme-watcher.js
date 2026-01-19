import path from 'path';
import watch from 'watch';
import { AppError } from './error.js';

// Debounce implementation
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export class ThemeWatcher {
  constructor(
    themeDir,
    themeApi,
    fileSystem,
    logger,
    debounceDelay = 1000,
    maxQueueSize = 1000,
  ) {
    this.themeDir = themeDir;
    this.themeApi = themeApi;
    this.fileSystem = fileSystem;
    this.logger = logger;
    this.debounceDelay = debounceDelay;
    this.maxQueueSize = maxQueueSize;
    this.isProcessing = false;

    this.uploadQueue = new Set();
    this.deleteQueue = new Set();

    // Bind the debounced processor to the instance
    this._processQueuesDebounced = debounce(
      this._processQueues.bind(this),
      this.debounceDelay,
    );

    // Reference to the watcher for cleanup
    this.watcher = null;
  }

  async _processQueues() {
    // If already processing, skip this run
    if (this.isProcessing) {
      this.logger.printVerbose(
        'Queue processing already in progress, changes will be handled in next run',
      );
      return;
    }

    this.isProcessing = true;

    try {
      const uploads = [...this.uploadQueue];
      const deletes = [...this.deleteQueue];
      this.uploadQueue.clear();
      this.deleteQueue.clear();

      let processedCount = 0;

      // Process deletions first
      if (deletes.length > 0) {
        this.logger.printStatus(
          `Removing ${deletes.length} deleted file(s)...`,
        );
        const deletePromises = deletes.map((relativePath) =>
          this.themeApi
            .removeAsset(relativePath, true) // silent = true
            .then(() => processedCount++)
            .catch((e) =>
              this.logger.printError(
                `Failed to remove ${relativePath}`,
                e.message || e,
              ),
            ),
        );
        await Promise.all(deletePromises);
      }

      // Process uploads/updates
      if (uploads.length > 0) {
        this.logger.printStatus(
          `Uploading ${uploads.length} changed file(s)...`,
        );
        const uploadPromises = uploads.map((relativePath) =>
          this.themeApi
            .uploadAsset(
              relativePath,
              path.join(this.themeDir, relativePath),
              this.fileSystem,
            )
            .then((success) => {
              if (success !== false) processedCount++;
            })
            .catch((e) =>
              this.logger.printError(
                `Failed to upload ${relativePath}`,
                e.message || e,
              ),
            ),
        );
        await Promise.all(uploadPromises);
      }

      // Compile if any changes were processed
      if (processedCount > 0) {
        this.logger.printStatus('Compiling assets...');
        try {
          await this.themeApi.compileAssets();
          this.logger.printSuccess('Changes synced and assets compiled.');
        } catch (e) {
          this.logger.printError('Failed to compile assets', e.message || e);
        }
      } else if (uploads.length > 0 || deletes.length > 0) {
        this.logger.printInfo(
          'Sync finished, but no assets required server changes.',
        );
      }
    } finally {
      this.isProcessing = false;

      // Show watching message again
      this.logger.printStatus(
        `Watching for changes in directory: ${this.themeDir}`,
      );
    }
  }

  _handleFileChange(f, curr, prev) {
    if (typeof f == 'object' && prev === null && curr === null) {
      // Finished walking the tree - ignore
      return;
    }

    // f is the full path to the file/directory
    const relativePath = path.relative(this.themeDir, f);

    try {
      // Skip if path is empty (shouldn't happen often) or not valid
      // Also ignore the config file itself if it's inside themeDir
      if (
        !relativePath ||
        !this._isPathSafe(relativePath) ||
        relativePath === 'finqu-theme-kit.json'
      ) {
        return;
      }

      // Check if we're dealing with a directory deletion
      if (prev && prev.isDirectory() && (!curr || curr.nlink === 0)) {
        // Directory deleted - potentially remove multiple files via API?
        // Simple approach: Let file deletion events handle children.
        this.logger.printVerbose(
          `Directory deleted: ${relativePath}. Individual file deletions will be handled if tracked.`,
        );
        return;
      }

      // Check if we're dealing with a directory creation
      if (prev === null && curr && curr.isDirectory()) {
        // Directory created - no direct API action needed.
        this.logger.printVerbose(`Directory created: ${relativePath}`);
        return;
      }

      // Now handle file events
      if (curr && !curr.isDirectory()) {
        if (prev === null) {
          // File created
          this.logger.printVerbose(`File created: ${relativePath}`);
          this.deleteQueue.delete(relativePath); // Ensure it's not marked for deletion
          this._addToUploadQueue(relativePath);
        } else if (curr.nlink === 0) {
          // File deleted
          this.logger.printVerbose(`File deleted: ${relativePath}`);
          this.uploadQueue.delete(relativePath); // Ensure it's not marked for upload
          this._addToDeleteQueue(relativePath);
        } else {
          // File changed
          this.logger.printVerbose(`File changed: ${relativePath}`);
          // Add to upload queue (createOrUpdate handles both)
          this.deleteQueue.delete(relativePath); // Ensure it's not marked for deletion
          this._addToUploadQueue(relativePath);
        }
      }
    } catch (e) {
      this.logger.printError(
        `Error processing file change for ${relativePath || f}`,
        e.message || e,
      );
    }
  }

  /**
   * Adds a path to the upload queue, checking queue size limits
   * @param {string} relativePath The relative path to add
   * @private
   */
  _addToUploadQueue(relativePath) {
    if (this.uploadQueue.size >= this.maxQueueSize) {
      this.logger.printError(
        `Upload queue size limit (${this.maxQueueSize}) reached. Some changes may not be processed.`,
        `Consider using manual deploy if you have many changes.`,
      );
      return;
    }
    this.uploadQueue.add(relativePath);
    this._processQueuesDebounced();
  }

  /**
   * Adds a path to the delete queue, checking queue size limits
   * @param {string} relativePath The relative path to add
   * @private
   */
  _addToDeleteQueue(relativePath) {
    if (this.deleteQueue.size >= this.maxQueueSize) {
      this.logger.printError(
        `Delete queue size limit (${this.maxQueueSize}) reached. Some changes may not be processed.`,
        `Consider using manual deploy if you have many changes.`,
      );
      return;
    }
    this.deleteQueue.add(relativePath);
    this._processQueuesDebounced();
  }

  /**
   * Validates that a path is safe (doesn't try to traverse outside theme dir)
   * @param {string} relativePath Relative path to check
   * @returns {boolean} True if path is safe, false otherwise
   * @private
   */
  _isPathSafe(relativePath) {
    // First check with fileSystem.checkPath for project-specific validation
    if (!this.fileSystem.checkPath(relativePath)) {
      return false;
    }

    // Additional security checks:
    // 1. Prevent path traversal attempts
    if (relativePath.includes('..')) {
      this.logger.printError(
        `Potential path traversal attempt detected: ${relativePath}`,
      );
      return false;
    }

    // 2. Ensure the path is truly relative (doesn't start with /)
    if (path.isAbsolute(relativePath)) {
      this.logger.printError(`Invalid absolute path detected: ${relativePath}`);
      return false;
    }

    // 3. Validate that the resolved path is still within theme directory
    const resolvedPath = path.resolve(this.themeDir, relativePath);
    if (!resolvedPath.startsWith(this.themeDir)) {
      this.logger.printError(
        `Path resolves outside theme directory: ${relativePath}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Stops watching for changes and cleans up resources
   */
  stop() {
    if (this.watcher && typeof this.watcher.close === 'function') {
      try {
        this.watcher.close();
        this.logger.printInfo('Stopped watching for changes.');
      } catch (e) {
        this.logger.printError('Error while stopping watcher', e.message || e);
      }
    }
  }

  start() {
    const watchOptions = {
      ignoreDotFiles: true,
      interval: 0.5, // Poll interval in seconds
      filter: (filePath, stat) => {
        // Use relative path for checkPath
        const relativePath = path.relative(this.themeDir, filePath);
        // Important: Also ignore the config file itself if it's inside themeDir
        if (filePath.endsWith('finqu-theme-kit.json')) return false;
        // Use fileSystem checkPath method passed in constructor
        return this._isPathSafe(relativePath || '.');
      },
      ignoreDirectoryPattern: /node_modules|\.git/, // Ignore common directories
    };

    this.logger.printStatus(
      `Watching for changes in directory: ${this.themeDir}`,
    );
    this.logger.printInfo('Press Ctrl+C to stop watching.');

    try {
      // Start watching the file system
      this.watcher = watch.watchTree(
        this.themeDir,
        watchOptions,
        this._handleFileChange.bind(this), // Bind the handler to the instance
      );

      // Handle watch errors (if the watchTree implementation supports it)
      if (this.watcher && typeof this.watcher.on === 'function') {
        this.watcher.on('error', (err) => {
          this.logger.printError('File watcher error:', err.message || err);
        });
      }
    } catch (e) {
      const message = `Failed to start watching directory: ${e.message || e}`;
      this.logger.printError(message);
      throw new AppError(message, 'WATCHER_ERROR');
    }
  }
}
