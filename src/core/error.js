/**
 * Error handling utilities for Finqu Theme Kit
 * Provides consistent error handling across the application
 */

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
