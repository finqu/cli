/**
 * HTTP client service for Finqu Theme Kit
 * Abstracts HTTP requests for better testability
 */
import request from 'request';

/**
 * HTTP client class
 */
export class HttpClient {
  /**
   * Create a new HTTP client
   * @param {Object} options Client options
   * @param {Function} options.defaultHeaders Function that returns default headers
   * @param {Object} options.logger Logger instance
   */
  constructor(options = {}) {
    this.defaultHeaders = options.defaultHeaders || (() => ({}));
    this.logger = options.logger;
  }

  /**
   * Make a GET request
   * @param {string} url URL to request
   * @param {Object} options Request options
   * @returns {Promise<Object>} Response data
   */
  async get(url, options = {}) {
    return this.request({ url, method: 'GET', ...options });
  }

  /**
   * Make a POST request
   * @param {string} url URL to request
   * @param {Object} data Request body
   * @param {Object} options Request options
   * @returns {Promise<Object>} Response data
   */
  async post(url, data, options = {}) {
    return this.request({ url, method: 'POST', body: data, ...options });
  }

  /**
   * Make a PUT request
   * @param {string} url URL to request
   * @param {Object} data Request body
   * @param {Object} options Request options
   * @returns {Promise<Object>} Response data
   */
  async put(url, data, options = {}) {
    return this.request({ url, method: 'PUT', body: data, ...options });
  }

  /**
   * Make a DELETE request
   * @param {string} url URL to request
   * @param {Object} options Request options
   * @returns {Promise<Object>} Response data
   */
  async delete(url, options = {}) {
    return this.request({ url, method: 'DELETE', ...options });
  }

  /**
   * Make a generic request
   * @param {Object} options Request options
   * @returns {Promise<Object|Stream>} Response data or stream for streaming requests
   */
  async request(options) {
    const finalOptions = {
      ...options,
      headers: { ...this.defaultHeaders(), ...options.headers },
      json: options.json !== false,
      forever: options.forever !== false, // Keep connections alive by default
      timeout: options.timeout || 12000,
      gzip: options.gzip !== false, // Enable gzip compression by default
    };

    // Create a simplified log version that doesn't include auth headers or other sensitive data
    const logOptions = {
      url: options.url,
      method: options.method,
    };

    this.logger.printVerbose(
      `Making ${options.method} request to ${options.url}`,
      logOptions,
    );

    // Handle streaming requests differently
    if (options.stream) {
      return new Promise((resolve, reject) => {
        const req = request(finalOptions);

        req.on('error', (err) => {
          this.logger.printVerbose(
            `Stream request failed: ${options.url}`,
            err,
          );
          reject(err);
        });

        resolve(req);
      });
    }

    // Handle regular (non-streaming) requests
    return new Promise((resolve, reject) => {
      request(finalOptions, (err, res, body) => {
        if (err || (res && res.statusCode >= 400)) {
          let errorDetails = err;

          // For API errors, extract meaningful information
          if (!err && res && body) {
            errorDetails = {
              status: res.statusCode,
              error:
                typeof body === 'object' && body.error
                  ? body.error
                  : 'Request failed',
            };

            if (typeof body === 'object' && body.error_description) {
              errorDetails.error_description = body.error_description;
            }
          }

          this.logger.printVerbose(
            `Request failed: ${options.url}`,
            errorDetails,
          );

          reject(
            errorDetails ||
              body || {
                error: 'Request failed',
                status: res ? res.statusCode : 'unknown',
              },
          );
        } else {
          this.logger.printVerbose(`Request successful: ${options.url}`);
          resolve(body);
        }
      });
    });
  }
}

/**
 * Factory function to create a HTTP client
 * @param {Object} options Client options
 * @returns {HttpClient} A new HTTP client
 */
export function createHttpClient(options) {
  return new HttpClient(options);
}
