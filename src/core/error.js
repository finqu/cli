/**
 * Error handling utilities for Finqu CLI
 * Provides consistent error handling across the application
 */

/**
 * Format an error value into a human-readable message.
 * Handles Error instances, API-style objects ({ status, error, error_description }),
 * nested object `error` fields, and plain strings.
 *
 * @param {*} err Error value
 * @param {Object} [options]
 * @param {boolean} [options.compact=false] Single-line output (for lists)
 * @returns {string} Formatted message (may be empty)
 */
export function formatErrorMessage(err, options = {}) {
  const compact = !!options.compact;

  if (err == null || err === '') {
    return '';
  }

  if (typeof err === 'string') {
    return err;
  }

  if (err instanceof Error) {
    return err.message || err.name || 'Unknown error';
  }

  if (typeof err !== 'object') {
    return String(err);
  }

  const stringify = (value) => {
    try {
      return compact ? JSON.stringify(value) : JSON.stringify(value, null, 2);
    } catch {
      return compact ? '[Complex Object]' : '[Complex Object]';
    }
  };

  const parts = [];

  if (err.status != null) {
    parts.push(`HTTP ${err.status}`);
  }

  if (typeof err.error_description === 'string' && err.error_description) {
    parts.push(err.error_description);
  } else if (typeof err.error === 'string' && err.error) {
    parts.push(err.error);
  } else if (err.error != null && typeof err.error === 'object') {
    parts.push(stringify(err.error));
  } else if (typeof err.message === 'string' && err.message) {
    parts.push(err.message);
  } else if (parts.length === 0) {
    // Unknown object shape — show the whole thing
    return stringify(err);
  }

  if (compact) {
    return parts.join(': ').replace(/\s+/g, ' ').trim();
  }

  // Prefer description/message on its own line after the status when both exist
  if (parts.length === 1) {
    return parts[0];
  }

  const [first, ...rest] = parts;
  // If the rest is already multi-line JSON, keep newlines
  const detail = rest.join('\n');
  if (detail.includes('\n')) {
    return `${first}:\n${detail}`;
  }
  return `${first}: ${detail}`;
}

/**
 * Application-specific error class with error codes and details
 */
export class AppError extends Error {
  /**
   * Create a new AppError
   * @param {string} message Error message
   * @param {string} code Error code
   * @param {*} details Additional error details
   */
  constructor(message, code, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  /**
   * Factory method to create error from API error response
   * @param {Object} error API error response
   * @returns {AppError} New application error
   */
  static fromApiError(error) {
    if (error.error_description) {
      return new AppError(error.error_description, 'API_ERROR', error);
    }
    return new AppError(
      error.message || 'Unknown API error',
      'API_ERROR',
      error,
    );
  }

  /**
   * Factory method to create a validation error
   * @param {string} message Error message
   * @param {*} details Validation details
   * @returns {AppError} New validation error
   */
  static validationError(message, details = null) {
    return new AppError(message, 'VALIDATION_ERROR', details);
  }

  /**
   * Factory method to create a configuration error
   * @param {string} message Error message
   * @param {*} details Configuration details
   * @returns {AppError} New configuration error
   */
  static configError(message, details = null) {
    return new AppError(message, 'CONFIG_ERROR', details);
  }

  /**
   * Factory method to create a file system error
   * @param {string} message Error message
   * @param {*} details File system details
   * @returns {AppError} New file system error
   */
  static fileSystemError(message, details = null) {
    return new AppError(message, 'FILE_SYSTEM_ERROR', details);
  }

  /**
   * Factory method to create an authentication error
   * @param {string} message Error message
   * @param {*} details Authentication details
   * @returns {AppError} New authentication error
   */
  static authError(message, details = null) {
    return new AppError(message, 'AUTH_ERROR', details);
  }
}
