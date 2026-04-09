import { describe, it, expect, vi } from 'vitest';
import {
  AppWebhookListener,
  normalizeRealtimeUrl,
  extractRealtimeUrlFromProfile,
  shouldForwardTopic,
} from '../../src/services/app-webhook-listener.js';
import { EventEmitter } from 'node:events';

class FakeWebSocket extends EventEmitter {
  constructor() {
    super();
  }

  close() {
    this.emit('close', 1000, 'closed');
  }
}

describe('app-webhook-listener utilities', () => {
  it('should normalize realtime URL', () => {
    expect(normalizeRealtimeUrl('https://realtime.example.com')).toBe(
      'wss://realtime.example.com/ws/webhooks',
    );
    expect(normalizeRealtimeUrl('wss://realtime.example.com/ws/webhooks')).toBe(
      'wss://realtime.example.com/ws/webhooks',
    );
  });

  it('should extract realtime URL from profile payload', () => {
    expect(
      extractRealtimeUrlFromProfile({
        merchant: { endpoints: { realtime: 'https://realtime.example.com' } },
      }),
    ).toBe('wss://realtime.example.com/ws/webhooks');
  });

  it('should return null when merchant realtime endpoint is absent', () => {
    expect(
      extractRealtimeUrlFromProfile({
        endpoints: { realtime: 'https://realtime.example.com' },
      }),
    ).toBeNull();
    expect(extractRealtimeUrlFromProfile({})).toBeNull();
  });

  it('should match topic filters correctly', () => {
    expect(shouldForwardTopic('orders/create', [])).toBe(true);
    expect(shouldForwardTopic('orders/create', ['orders/create'])).toBe(true);
    expect(shouldForwardTopic('orders/create', ['products/update'])).toBe(
      false,
    );
  });
});

describe('AppWebhookListener', () => {
  it('should resolve realtime URL from explicit, profile and config', () => {
    const listener = new AppWebhookListener({
      config: {
        get: vi.fn().mockImplementation((key) => {
          if (key === 'appRealtimeUrl')
            return 'https://config-realtime.example.com';
          return null;
        }),
      },
      logger: {
        printInfo: vi.fn(),
        printError: vi.fn(),
        printSuccess: vi.fn(),
        printVerbose: vi.fn(),
        printStatus: vi.fn(),
      },
    });

    expect(
      listener.resolveRealtimeUrl({
        explicitRealtimeUrl: 'https://explicit.example.com',
      }),
    ).toBe('wss://explicit.example.com/ws/webhooks');
    expect(
      listener.resolveRealtimeUrl({
        profile: {
          merchant: { endpoints: { realtime: 'https://profile.example.com' } },
        },
      }),
    ).toBe('wss://profile.example.com/ws/webhooks');
    expect(listener.resolveRealtimeUrl({})).toBe(
      'wss://config-realtime.example.com/ws/webhooks',
    );
  });

  it('should forward events to localhost endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const listener = new AppWebhookListener({
      config: { get: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printError: vi.fn(),
        printSuccess: vi.fn(),
        printVerbose: vi.fn(),
        printStatus: vi.fn(),
      },
      fetchImpl: fetchMock,
    });

    await listener.forwardEvent('http://localhost:3000/webhooks', {
      topic: 'orders/create',
      payload: { id: 1 },
      source: 'api',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/webhooks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Finqu-Topic': 'orders/create',
        }),
      }),
    );
  });

  it('should stream websocket messages and forward matching topics', async () => {
    const ws = new FakeWebSocket();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const listener = new AppWebhookListener({
      config: { get: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printError: vi.fn(),
        printSuccess: vi.fn(),
        printVerbose: vi.fn(),
        printStatus: vi.fn(),
      },
      fetchImpl: fetchMock,
      webSocketFactory: vi.fn().mockReturnValue(ws),
    });

    const abortController = new AbortController();

    const listenPromise = listener.listen({
      realtimeUrl: 'wss://realtime.example.com/ws/webhooks',
      accessToken: 'token',
      localUrl: 'http://localhost:3000/webhooks',
      topics: ['orders/create'],
      signal: abortController.signal,
      initialDelayMs: 1,
      maxDelayMs: 1,
    });

    ws.emit('open');
    ws.emit(
      'message',
      JSON.stringify({ topic: 'orders/create', payload: { id: 1 } }),
    );
    ws.emit(
      'message',
      JSON.stringify({ topic: 'products/update', payload: { id: 2 } }),
    );

    abortController.abort();
    ws.emit('close', 1000, 'done');

    await listenPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/webhooks',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
