import { describe, test, expect } from 'vitest';
import { AppError } from '../../src/core/error.js';

describe('AppError', () => {
  describe('constructor', () => {
    test('should create an error with message, code, and details', () => {
      const error = new AppError('Test error', 'TEST_CODE', { foo: 'bar' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AppError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ foo: 'bar' });
    });

    test('should handle null details', () => {
      const error = new AppError('Test error', 'TEST_CODE');

      expect(error.details).toBe(null);
    });

    test('should allow stack traces', () => {
      const error = new AppError('Test error', 'TEST_CODE');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('fromApiError', () => {
    test('should create AppError from API error with error_description', () => {
      const apiError = {
        error: 'invalid_request',
        error_description: 'Invalid request parameters',
        status: 400,
      };

      const error = AppError.fromApiError(apiError);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid request parameters');
      expect(error.code).toBe('API_ERROR');
      expect(error.details).toBe(apiError);
    });

    test('should create AppError from API error with message', () => {
      const apiError = {
        message: 'Resource not found',
        status: 404,
      };

      const error = AppError.fromApiError(apiError);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Resource not found');
      expect(error.code).toBe('API_ERROR');
      expect(error.details).toBe(apiError);
    });

    test('should handle API error without message or error_description', () => {
      const apiError = {
        status: 500,
      };

      const error = AppError.fromApiError(apiError);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Unknown API error');
      expect(error.code).toBe('API_ERROR');
      expect(error.details).toBe(apiError);
    });

    test('should handle null or undefined API error', () => {
      const error = AppError.fromApiError({});

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Unknown API error');
      expect(error.code).toBe('API_ERROR');
    });
  });

  describe('validationError', () => {
    test('should create a validation error with message', () => {
      const error = AppError.validationError('Invalid input');

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toBe(null);
    });

    test('should create a validation error with details', () => {
      const details = { field: 'username', reason: 'required' };
      const error = AppError.validationError('Invalid input', details);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toBe(details);
    });
  });

  describe('configError', () => {
    test('should create a configuration error with message', () => {
      const error = AppError.configError('Missing configuration');

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Missing configuration');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.details).toBe(null);
    });

    test('should create a configuration error with details', () => {
      const details = { missingKey: 'apiKey' };
      const error = AppError.configError('Missing configuration', details);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Missing configuration');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.details).toBe(details);
    });
  });

  describe('fileSystemError', () => {
    test('should create a file system error with message', () => {
      const error = AppError.fileSystemError('File not found');

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('File not found');
      expect(error.code).toBe('FILE_SYSTEM_ERROR');
      expect(error.details).toBe(null);
    });

    test('should create a file system error with details', () => {
      const details = { path: '/path/to/file.txt', code: 'ENOENT' };
      const error = AppError.fileSystemError('File not found', details);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('File not found');
      expect(error.code).toBe('FILE_SYSTEM_ERROR');
      expect(error.details).toBe(details);
    });
  });

  describe('authError', () => {
    test('should create an authentication error with message', () => {
      const error = AppError.authError('Unauthorized');

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.details).toBe(null);
    });

    test('should create an authentication error with details', () => {
      const details = { reason: 'expired_token' };
      const error = AppError.authError('Unauthorized', details);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.details).toBe(details);
    });
  });

  describe('error handling', () => {
    test('should be catchable like regular errors', () => {
      expect(() => {
        throw new AppError('Test error', 'TEST_CODE');
      }).toThrow('Test error');
    });

    test('should be identifiable in catch blocks', () => {
      try {
        throw new AppError('Test error', 'TEST_CODE');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect(error.code).toBe('TEST_CODE');
      }
    });

    test('should work with async/await error handling', async () => {
      await expect(async () => {
        throw new AppError('Async error', 'ASYNC_ERROR');
      }).rejects.toBeInstanceOf(AppError);

      await expect(async () => {
        throw new AppError('Async error', 'ASYNC_ERROR');
      }).rejects.toHaveProperty('code', 'ASYNC_ERROR');
    });
  });
});
