import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppApi, createAppApi } from '../../src/services/appApi.js';

describe('AppApi', () => {
  let appApi;
  let mockHttpClient;
  let mockTokenManager;
  let mockLogger;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockHttpClient = {
      get: vi.fn().mockResolvedValue({}),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      request: vi.fn().mockResolvedValue({}),
    };

    mockTokenManager = {
      ensureValidToken: vi.fn().mockResolvedValue('fake-token'),
    };

    mockLogger = {
      printVerbose: vi.fn(),
      printError: vi.fn(),
    };

    mockConfig = {
      get: vi.fn((key, defaultValue) => {
        if (key === 'authDomain') return 'account.finqu.com';
        return defaultValue;
      }),
    };

    appApi = createAppApi(
      mockHttpClient,
      mockTokenManager,
      mockLogger,
      mockConfig,
    );
  });

  describe('constructor', () => {
    it('sets base URL from authDomain config', () => {
      expect(appApi.baseUrl).toBe(
        'https://account.finqu.com/api/external/v1/developer/apps',
      );
    });

    it('uses custom authDomain', () => {
      mockConfig.get.mockImplementation((key, defaultValue) => {
        if (key === 'authDomain') return 'custom.finqu.com';
        return defaultValue;
      });

      const api = createAppApi(
        mockHttpClient,
        mockTokenManager,
        mockLogger,
        mockConfig,
      );
      expect(api.baseUrl).toBe(
        'https://custom.finqu.com/api/external/v1/developer/apps',
      );
    });

    it('falls back to default authDomain', () => {
      mockConfig.get.mockImplementation((key, defaultValue) => defaultValue);

      const api = createAppApi(
        mockHttpClient,
        mockTokenManager,
        mockLogger,
        mockConfig,
      );
      expect(api.baseUrl).toBe(
        'https://account.finqu.com/api/external/v1/developer/apps',
      );
    });
  });

  describe('listApps', () => {
    it('calls GET on base URL', async () => {
      const apps = [{ id: 1, name: 'App' }];
      mockHttpClient.get.mockResolvedValue(apps);

      const result = await appApi.listApps();

      expect(mockTokenManager.ensureValidToken).toHaveBeenCalled();
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://account.finqu.com/api/external/v1/developer/apps',
      );
      expect(result).toEqual(apps);
    });
  });

  describe('getApp', () => {
    it('calls GET with app ID', async () => {
      const app = { id: 42, name: 'My App' };
      mockHttpClient.get.mockResolvedValue(app);

      const result = await appApi.getApp(42);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://account.finqu.com/api/external/v1/developer/apps/42',
      );
      expect(result).toEqual(app);
    });
  });

  describe('createApp', () => {
    it('posts name as form data', async () => {
      mockHttpClient.request.mockResolvedValue({ id: 42 });

      const result = await appApi.createApp('My App');

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        url: 'https://account.finqu.com/api/external/v1/developer/apps',
        method: 'POST',
        form: { name: 'My App' },
      });
      expect(result).toEqual({ id: 42 });
    });

    it('includes configuration as JSON string', async () => {
      mockHttpClient.request.mockResolvedValue({ id: 42 });

      await appApi.createApp('App', {
        http: { base_uri: 'https://example.com' },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        url: expect.any(String),
        method: 'POST',
        form: {
          name: 'App',
          configuration: '{"http":{"base_uri":"https://example.com"}}',
        },
      });
    });
  });

  describe('updateApp', () => {
    it('puts form data with configuration', async () => {
      await appApi.updateApp(42, {
        configuration: { http: { base_uri: 'https://example.com' } },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        url: 'https://account.finqu.com/api/external/v1/developer/apps/42',
        method: 'PUT',
        form: {
          configuration: '{"http":{"base_uri":"https://example.com"}}',
        },
      });
    });

    it('handles listing as JSON string', async () => {
      await appApi.updateApp(42, {
        listing: { default: { name: 'Updated Name' } },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          form: { listing: '{"default":{"name":"Updated Name"}}' },
        }),
      );
    });

    it('passes redirect_uri directly', async () => {
      await appApi.updateApp(42, {
        redirect_uri: 'https://example.com/callback',
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          form: { redirect_uri: 'https://example.com/callback' },
        }),
      );
    });

    it('handles locations as JSON array', async () => {
      await appApi.updateApp(42, { locations: ['FI', 'SE'] });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          form: { locations: '["FI","SE"]' },
        }),
      );
    });

    it('handles locations as null', async () => {
      await appApi.updateApp(42, { locations: null });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          form: { locations: null },
        }),
      );
    });

    it('accepts pre-stringified configuration', async () => {
      await appApi.updateApp(42, {
        configuration: '{"already":"stringified"}',
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          form: { configuration: '{"already":"stringified"}' },
        }),
      );
    });
  });

  describe('deleteApp', () => {
    it('calls DELETE with app ID', async () => {
      mockHttpClient.delete.mockResolvedValue({ deleted: true });

      const result = await appApi.deleteApp(42);

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        'https://account.finqu.com/api/external/v1/developer/apps/42',
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('getShareLink', () => {
    it('calls GET on share-token endpoint', async () => {
      const shareData = {
        share_token: 'abc',
        share_url: 'https://example.com/share',
      };
      mockHttpClient.get.mockResolvedValue(shareData);

      const result = await appApi.getShareLink(42);

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://account.finqu.com/api/external/v1/developer/apps/42/share-token',
      );
      expect(result).toEqual(shareData);
    });
  });

  describe('publishApp', () => {
    it('posts to publish endpoint', async () => {
      await appApi.publishApp(42);

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        url: 'https://account.finqu.com/api/external/v1/developer/apps/42/publish',
        method: 'POST',
        form: {},
      });
    });
  });

  describe('unpublishApp', () => {
    it('posts to unpublish endpoint', async () => {
      await appApi.unpublishApp(42);

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        url: 'https://account.finqu.com/api/external/v1/developer/apps/42/unpublish',
        method: 'POST',
        form: {},
      });
    });
  });

  describe('releaseVersion', () => {
    it('posts version data', async () => {
      mockHttpClient.request.mockResolvedValue({
        version: '2.0.0',
        created_at: 'Mon, 07 Apr 2026 10:00:00 +0000',
      });

      const result = await appApi.releaseVersion(42, {
        version: '2.0.0',
        changelog: 'Major release',
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        url: 'https://account.finqu.com/api/external/v1/developer/apps/42/versions',
        method: 'POST',
        form: { version: '2.0.0', changelog: 'Major release' },
      });
      expect(result.version).toBe('2.0.0');
    });

    it('posts type bump', async () => {
      mockHttpClient.request.mockResolvedValue({ version: '1.1.0' });

      await appApi.releaseVersion(42, { type: 'minor' });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          form: { type: 'minor' },
        }),
      );
    });

    it('defaults to empty data', async () => {
      mockHttpClient.request.mockResolvedValue({ version: '1.0.1' });

      await appApi.releaseVersion(42);

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          form: {},
        }),
      );
    });
  });

  describe('rotateSecret', () => {
    it('posts to rotate-secret endpoint', async () => {
      const secretData = {
        client_secret: 'newSecret',
        client_secret_created_at: 'Mon, 07 Apr 2026 10:00:00 +0000',
      };
      mockHttpClient.request.mockResolvedValue(secretData);

      const result = await appApi.rotateSecret(42);

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        url: 'https://account.finqu.com/api/external/v1/developer/apps/42/rotate-secret',
        method: 'POST',
        form: {},
      });
      expect(result).toEqual(secretData);
    });
  });

  describe('authentication', () => {
    it('ensures valid token before each request', async () => {
      await appApi.listApps();
      await appApi.getApp(1);
      await appApi.createApp('Test');

      expect(mockTokenManager.ensureValidToken).toHaveBeenCalledTimes(3);
    });
  });
});
