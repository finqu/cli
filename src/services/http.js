/**
 * HTTP client service for Finqu CLI
 * Abstracts HTTP requests for better testability
 */
import { PassThrough } from 'stream';
import zlib from 'zlib';
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
   * @param {Object} [dataOrOptions] Request body, or legacy options when no body is sent
   * @param {Object} [options] Request options when a body is provided
   * @returns {Promise<Object>} Response data
   */
  async delete(url, dataOrOptions, options) {
    // Legacy: delete(url) or delete(url, options)
    // New: delete(url, body) or delete(url, body, options)
    if (arguments.length < 2) {
      return this.request({ url, method: 'DELETE' });
    }

    if (arguments.length === 2) {
      const value = dataOrOptions;
      const looksLikeOptions =
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        ('timeout' in value ||
          'headers' in value ||
          'json' in value ||
          'stream' in value ||
          'forever' in value ||
          'gzip' in value) &&
        !('key' in value);

      if (looksLikeOptions) {
        return this.request({ url, method: 'DELETE', ...value });
      }

      return this.request({ url, method: 'DELETE', body: value });
    }

    return this.request({
      url,
      method: 'DELETE',
      ...(dataOrOptions !== undefined ? { body: dataOrOptions } : {}),
      ...(options || {}),
    });
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

    // A streamed request resolves with the response body only after a 2xx
    // status. Any other status rejects, so a caller never writes an error page
    // as if it were the content it asked for.
    if (options.stream) {
      return new Promise((resolve, reject) => {
        const req = request(finalOptions);
        const body = new PassThrough();
        let state = 'pending';

        req.on('error', (err) => {
          this.logger.printVerbose(
            `Stream request failed: ${options.url}`,
            err,
          );
          if (state === 'resolved') {
            body.destroy(err);
          } else if (state === 'pending') {
            state = 'rejected';
            reject(err);
          }
        });

        req.on('response', (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            state = 'rejected';
            req.abort();
            this.logger.printVerbose(
              `Stream request failed: ${options.url}`,
              { status: res.statusCode },
            );
            reject({
              status: res.statusCode,
              error: `Request failed with status ${res.statusCode}`,
            });
            return;
          }

          // `request` inflates gzip and deflate itself; brotli is decoded here.
          // A body in any other encoding would be saved as undecoded bytes, so
          // it fails instead.
          const encoding = String(res.headers['content-encoding'] || '')
            .trim()
            .toLowerCase();
          const requestInflates = finalOptions.gzip;
          const supported =
            encoding === '' ||
            encoding === 'identity' ||
            encoding === 'br' ||
            (requestInflates && (encoding === 'gzip' || encoding === 'deflate'));
          if (!supported) {
            state = 'rejected';
            req.abort();
            reject({
              status: res.statusCode,
              error: `Unsupported Content-Encoding: ${encoding}`,
            });
            return;
          }

          // Piping must start in the same tick as the response, or the first
          // chunks are lost.
          if (encoding === 'br') {
            const decoder = zlib.createBrotliDecompress();
            decoder.on('error', (err) => body.destroy(err));
            req.pipe(decoder).pipe(body);
          } else {
            req.pipe(body);
          }
          state = 'resolved';
          resolve(body);
        });
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
