// HTTP client service tests
import {
  vi,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { HttpClient, createHttpClient } from '../../src/services/http.js';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';

// Create MSW server for mocking HTTP requests
const server = setupServer();

// Configure MSW server before tests
beforeAll(() => {
  // Start the request interception
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // Reset request handlers between tests
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  // Stop the request interception when tests are done
  server.close();
});

describe('HttpClient', () => {
  let httpClient;
  let mockLogger;
  let defaultHeaders;

  beforeEach(() => {
    // Create a mock logger
    mockLogger = {
      printVerbose: vi.fn(),
    };

    // Create mock default headers
    defaultHeaders = vi.fn().mockReturnValue({
      'Content-Type': 'application/json',
      'User-Agent': 'Finqu-Theme-Kit',
    });

    // Create a new HTTP client instance for each test
    httpClient = new HttpClient({
      defaultHeaders,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    test('should create an instance with provided options', () => {
      expect(httpClient.defaultHeaders).toBe(defaultHeaders);
      expect(httpClient.logger).toBe(mockLogger);
    });

    test('should use empty default headers if not provided', () => {
      const client = new HttpClient({
        logger: mockLogger,
      });
      expect(client.defaultHeaders()).toEqual({});
    });

    test('factory function should return a new HttpClient instance', () => {
      const options = {
        defaultHeaders,
        logger: mockLogger,
      };
      const client = createHttpClient(options);
      expect(client).toBeInstanceOf(HttpClient);
      expect(client.defaultHeaders).toBe(defaultHeaders);
      expect(client.logger).toBe(mockLogger);
    });
  });

  describe('HTTP methods', () => {
    test('get should call request with GET method', async () => {
      // Setup spy on request method
      const requestSpy = vi
        .spyOn(httpClient, 'request')
        .mockResolvedValue({ data: 'test get' });

      // Call the method
      const result = await httpClient.get('https://test.com/api', {
        timeout: 5000,
      });

      // Verify the request function was called correctly
      expect(requestSpy).toHaveBeenCalledWith({
        url: 'https://test.com/api',
        method: 'GET',
        timeout: 5000,
      });

      // Verify the result
      expect(result).toEqual({ data: 'test get' });
    });

    test('post should call request with POST method and body', async () => {
      // Setup spy on request method
      const requestSpy = vi
        .spyOn(httpClient, 'request')
        .mockResolvedValue({ data: 'test post' });

      // Test data for POST request
      const data = { name: 'Test Product' };

      // Call the method
      const result = await httpClient.post('https://test.com/api', data, {
        timeout: 5000,
      });

      // Verify the request function was called correctly
      expect(requestSpy).toHaveBeenCalledWith({
        url: 'https://test.com/api',
        method: 'POST',
        body: data,
        timeout: 5000,
      });

      // Verify the result
      expect(result).toEqual({ data: 'test post' });
    });

    test('put should call request with PUT method and body', async () => {
      // Setup spy on request method
      const requestSpy = vi
        .spyOn(httpClient, 'request')
        .mockResolvedValue({ data: 'test put' });

      // Test data for PUT request
      const data = { name: 'Updated Product' };

      // Call the method
      const result = await httpClient.put('https://test.com/api', data, {
        timeout: 5000,
      });

      // Verify the request function was called correctly
      expect(requestSpy).toHaveBeenCalledWith({
        url: 'https://test.com/api',
        method: 'PUT',
        body: data,
        timeout: 5000,
      });

      // Verify the result
      expect(result).toEqual({ data: 'test put' });
    });

    test('delete should call request with DELETE method', async () => {
      // Setup spy on request method
      const requestSpy = vi
        .spyOn(httpClient, 'request')
        .mockResolvedValue({ data: 'test delete' });

      // Call the method
      const result = await httpClient.delete('https://test.com/api', {
        timeout: 5000,
      });

      // Verify the request function was called correctly
      expect(requestSpy).toHaveBeenCalledWith({
        url: 'https://test.com/api',
        method: 'DELETE',
        timeout: 5000,
      });

      // Verify the result
      expect(result).toEqual({ data: 'test delete' });
    });
  });

  describe('request method', () => {
    test('should make a successful GET request', async () => {
      const responseData = { success: true, id: '123' };

      // Setup MSW handler for this test
      server.use(
        http.get('https://test.com/api', () => {
          return HttpResponse.json(responseData, { status: 200 });
        }),
      );

      // Make the request
      const result = await httpClient.request({
        url: 'https://test.com/api',
        method: 'GET',
      });

      // Verify logger was called
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        'Making GET request to https://test.com/api',
        expect.objectContaining({
          url: 'https://test.com/api',
          method: 'GET',
        }),
      );

      // Verify success log message
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        'Request successful: https://test.com/api',
      );

      // Verify the result
      expect(result).toEqual(responseData);
    });

    test('should make a successful POST request with body', async () => {
      const requestBody = { name: 'Test Product' };
      const responseData = { id: '123', name: 'Test Product' };

      // Setup MSW handler for this test
      server.use(
        http.post('https://test.com/api', async ({ request }) => {
          const body = await request.json();
          expect(body).toEqual(requestBody);
          return HttpResponse.json(responseData, { status: 201 });
        }),
      );

      // Make the request
      const result = await httpClient.request({
        url: 'https://test.com/api',
        method: 'POST',
        body: requestBody,
      });

      // Verify the result
      expect(result).toEqual(responseData);
    });

    test('should handle network errors', async () => {
      // Setup MSW handler to simulate a network error
      server.use(
        http.get('https://test.com/api/error', () => {
          return HttpResponse.error();
        }),
      );

      // Make the request and expect it to fail
      await expect(
        httpClient.request({
          url: 'https://test.com/api/error',
          method: 'GET',
        }),
      ).rejects.toBeTruthy();

      // Verify error was logged
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        'Request failed: https://test.com/api/error',
        expect.anything(),
      );
    });

    test('should handle API errors (4xx response)', async () => {
      const errorResponse = {
        error: 'Invalid request',
        error_description: 'Missing required parameter',
      };

      // Setup MSW handler for API error response
      server.use(
        http.get('https://test.com/api/invalid', () => {
          return HttpResponse.json(errorResponse, { status: 400 });
        }),
      );

      // Make the request and expect it to fail with API error
      await expect(
        httpClient.request({
          url: 'https://test.com/api/invalid',
          method: 'GET',
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          error: 'Invalid request',
          error_description: 'Missing required parameter',
        }),
      );

      // Verify error was logged
      expect(mockLogger.printVerbose).toHaveBeenCalledWith(
        'Request failed: https://test.com/api/invalid',
        expect.objectContaining({
          status: 400,
          error: 'Invalid request',
        }),
      );
    });

    test('should handle server errors (5xx response)', async () => {
      // Setup MSW handler for server error response
      server.use(
        http.get('https://test.com/api/server-error', () => {
          return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
        }),
      );

      // Make the request and expect it to fail with server error
      await expect(
        httpClient.request({
          url: 'https://test.com/api/server-error',
          method: 'GET',
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 500,
        }),
      );
    });

    test('should handle slow responses', async () => {
      const responseData = { result: 'delayed response' };

      // Setup MSW handler with deliberate delay
      server.use(
        http.get('https://test.com/api/slow', async () => {
          await delay(100); // Delay response by 100ms
          return HttpResponse.json(responseData);
        }),
      );

      // Make the request
      const result = await httpClient.request({
        url: 'https://test.com/api/slow',
        method: 'GET',
      });

      // Verify the result
      expect(result).toEqual(responseData);
    });

    test('should use custom headers when provided', async () => {
      // Setup custom headers
      const customHeaders = {
        Authorization: 'Bearer token123',
        'X-Custom-Header': 'custom-value',
      };

      // Setup MSW handler that checks headers
      server.use(
        http.get('https://test.com/api/headers', async ({ request }) => {
          const authHeader = request.headers.get('authorization');
          const customHeader = request.headers.get('x-custom-header');
          const contentTypeHeader = request.headers.get('content-type');
          const userAgentHeader = request.headers.get('user-agent');

          expect(authHeader).toBe('Bearer token123');
          expect(customHeader).toBe('custom-value');
          expect(contentTypeHeader).toBe('application/json');
          expect(userAgentHeader).toBe('Finqu-Theme-Kit');

          return HttpResponse.json({ success: true });
        }),
      );

      // Make request with custom headers
      const result = await httpClient.request({
        url: 'https://test.com/api/headers',
        method: 'GET',
        headers: customHeaders,
      });

      // Verify the result
      expect(result).toEqual({ success: true });
    });
  });
});
