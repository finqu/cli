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

  it('should resolve target URL from event.path and base localUrl', async () => {
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

    await listener.forwardEvent('http://localhost:3000', {
      topic: 'orders/create',
      path: '/api/webhooks/orders/create',
      payload: { id: 1 },
      source: 'api',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/webhooks/orders/create',
      expect.objectContaining({
        method: 'POST',
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

  it('should buffer received events during listen', async () => {
    const ws = new FakeWebSocket();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    let fileContent = '[]';
    const mockFileSystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockImplementation(() => fileContent),
      writeFile: vi.fn().mockImplementation((_path, data) => {
        fileContent = data;
      }),
    };

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
      fileSystem: mockFileSystem,
    });

    const abortController = new AbortController();

    const listenPromise = listener.listen({
      realtimeUrl: 'wss://realtime.example.com/ws/webhooks',
      accessToken: 'token',
      localUrl: 'http://localhost:3000/webhooks',
      topics: [],
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

    // Give async _bufferEvent time to write
    await new Promise((r) => setTimeout(r, 50));

    abortController.abort();
    ws.emit('close', 1000, 'done');

    await listenPromise;

    const buffered = await listener.getBufferedEvents();
    expect(buffered).toHaveLength(2);
    expect(buffered[0].topic).toBe('orders/create');
    expect(buffered[1].topic).toBe('products/update');
    expect(buffered[0].receivedAt).toBeDefined();
  });

  it('should filter buffered events by topic', async () => {
    const storedEvents = [
      { topic: 'orders/create', receivedAt: '2026-01-01T00:00:00.000Z' },
      { topic: 'products/update', receivedAt: '2026-01-01T00:00:01.000Z' },
      { topic: 'orders/create', receivedAt: '2026-01-01T00:00:02.000Z' },
    ];
    const mockFileSystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(JSON.stringify(storedEvents)),
      writeFile: vi.fn(),
    };

    const listener = new AppWebhookListener({
      config: { get: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printError: vi.fn(),
        printSuccess: vi.fn(),
        printVerbose: vi.fn(),
        printStatus: vi.fn(),
      },
      fileSystem: mockFileSystem,
    });

    const filtered = await listener.getBufferedEvents({
      topics: ['orders/create'],
    });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.topic === 'orders/create')).toBe(true);
  });

  it('should enforce max buffer size', async () => {
    let fileContent = '[]';
    const mockFileSystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockImplementation(() => fileContent),
      writeFile: vi.fn().mockImplementation((_path, data) => {
        fileContent = data;
      }),
    };

    const listener = new AppWebhookListener({
      config: { get: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printError: vi.fn(),
        printSuccess: vi.fn(),
        printVerbose: vi.fn(),
        printStatus: vi.fn(),
      },
      maxBufferSize: 3,
      fileSystem: mockFileSystem,
    });

    for (let i = 0; i < 5; i++) {
      await listener._bufferEvent({ topic: `topic-${i}` });
    }

    const events = await listener._readBuffer();
    expect(events).toHaveLength(3);
    expect(events[0].topic).toBe('topic-2');
    expect(events[2].topic).toBe('topic-4');
  });

  it('should replay buffered events to local URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const logger = {
      printInfo: vi.fn(),
      printError: vi.fn(),
      printSuccess: vi.fn(),
      printVerbose: vi.fn(),
      printStatus: vi.fn(),
    };
    const storedEvents = [
      {
        topic: 'orders/create',
        payload: { id: 1 },
        receivedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        topic: 'products/update',
        payload: { id: 2 },
        receivedAt: '2026-01-01T00:00:01.000Z',
      },
    ];
    const mockFileSystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(JSON.stringify(storedEvents)),
      writeFile: vi.fn(),
    };

    const listener = new AppWebhookListener({
      config: { get: vi.fn() },
      logger,
      fetchImpl: fetchMock,
      fileSystem: mockFileSystem,
    });

    const count = await listener.replayEvents('http://localhost:3000/webhooks');

    expect(count).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.printInfo).toHaveBeenCalledWith(
      expect.stringContaining('Replayed orders/create'),
    );
  });

  it('should replay only matching topics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const storedEvents = [
      {
        topic: 'orders/create',
        payload: { id: 1 },
        receivedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        topic: 'products/update',
        payload: { id: 2 },
        receivedAt: '2026-01-01T00:00:01.000Z',
      },
    ];
    const mockFileSystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(JSON.stringify(storedEvents)),
      writeFile: vi.fn(),
    };

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
      fileSystem: mockFileSystem,
    });

    const count = await listener.replayEvents('http://localhost:3000', {
      topics: ['orders/create'],
    });

    expect(count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should return 0 when no events to replay', async () => {
    const logger = {
      printInfo: vi.fn(),
      printError: vi.fn(),
      printSuccess: vi.fn(),
      printVerbose: vi.fn(),
      printStatus: vi.fn(),
    };
    const mockFileSystem = {
      exists: vi.fn().mockResolvedValue(false),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    };

    const listener = new AppWebhookListener({
      config: { get: vi.fn() },
      logger,
      fileSystem: mockFileSystem,
    });

    const count = await listener.replayEvents('http://localhost:3000');

    expect(count).toBe(0);
    expect(logger.printInfo).toHaveBeenCalledWith(
      'No buffered events to replay.',
    );
  });

  it('should return empty array when buffer file does not exist', async () => {
    const mockFileSystem = {
      exists: vi.fn().mockResolvedValue(false),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    };

    const listener = new AppWebhookListener({
      config: { get: vi.fn() },
      logger: {
        printInfo: vi.fn(),
        printError: vi.fn(),
        printSuccess: vi.fn(),
        printVerbose: vi.fn(),
        printStatus: vi.fn(),
      },
      fileSystem: mockFileSystem,
    });

    const events = await listener.getBufferedEvents();
    expect(events).toEqual([]);
  });
});
