import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppReplayCommand,
  createAppReplayCommand,
} from '../../src/commands/app-replay.js';

describe('AppReplayCommand', () => {
  let command;
  let mockApp;
  let mockListener;
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockListener = {
      getBufferedEvents: vi.fn().mockResolvedValue([]),
      replayEvents: vi.fn().mockResolvedValue(0),
      forwardEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      printStatus: vi.fn(),
      printInfo: vi.fn(),
      printSuccess: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      handleError: vi.fn(),
    };

    mockApp = {
      config: {},
      logger: mockLogger,
      services: {
        appWebhookListener: mockListener,
      },
    };

    command = new AppReplayCommand(mockApp);
  });

  it('should have expected command metadata', () => {
    expect(command.name).toBe('replay');
    expect(command.group).toBe('app');
    expect(command.syntax).toBe('replay');
    expect(command.description).toContain('Replay');
  });

  it('should create command using factory', () => {
    const factoryCommand = createAppReplayCommand(mockApp);
    expect(factoryCommand).toBeInstanceOf(AppReplayCommand);
  });

  it('should list buffered events with --list flag', async () => {
    const events = [
      { topic: 'orders/create', receivedAt: '2026-01-01T00:00:00.000Z' },
      { topic: 'products/update', receivedAt: '2026-01-01T00:00:01.000Z' },
    ];
    mockListener.getBufferedEvents.mockResolvedValue(events);

    const result = await command.execute({ list: true });

    expect(result.success).toBe(true);
    expect(result.events).toEqual(events);
    expect(mockListener.getBufferedEvents).toHaveBeenCalledWith({ topics: [] });
    expect(mockLogger.printStatus).toHaveBeenCalledWith(
      expect.stringContaining('2'),
    );
  });

  it('should show message when no events buffered with --list', async () => {
    mockListener.getBufferedEvents.mockResolvedValue([]);

    const result = await command.execute({ list: true });

    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
    expect(mockLogger.printInfo).toHaveBeenCalledWith(
      'No buffered webhook events.',
    );
  });

  it('should filter listed events by topic', async () => {
    mockListener.getBufferedEvents.mockResolvedValue([]);

    await command.execute({ list: true, topic: ['orders/create'] });

    expect(mockListener.getBufferedEvents).toHaveBeenCalledWith({
      topics: ['orders/create'],
    });
  });

  it('should replay events to default URL', async () => {
    mockListener.replayEvents.mockResolvedValue(3);

    const result = await command.execute({});

    expect(result.success).toBe(true);
    expect(result.forwarded).toBe(3);
    expect(mockListener.replayEvents).toHaveBeenCalledWith(
      'http://localhost:3000',
      { topics: [] },
    );
    expect(mockLogger.printSuccess).toHaveBeenCalledWith('Replayed 3 events.');
  });

  it('should replay events to custom URL', async () => {
    mockListener.replayEvents.mockResolvedValue(1);

    const result = await command.execute({
      url: 'http://localhost:4000/hooks',
    });

    expect(result.success).toBe(true);
    expect(result.forwarded).toBe(1);
    expect(mockListener.replayEvents).toHaveBeenCalledWith(
      'http://localhost:4000/hooks',
      { topics: [] },
    );
    expect(mockLogger.printSuccess).toHaveBeenCalledWith('Replayed 1 event.');
  });

  it('should replay with topic filters', async () => {
    mockListener.replayEvents.mockResolvedValue(2);

    await command.execute({
      topic: ['orders/create,products/update'],
    });

    expect(mockListener.replayEvents).toHaveBeenCalledWith(
      'http://localhost:3000',
      { topics: ['orders/create', 'products/update'] },
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('something broke');
    mockListener.replayEvents.mockRejectedValue(error);

    const result = await command.execute({});

    expect(result.success).toBe(false);
    expect(mockLogger.handleError).toHaveBeenCalledWith(error);
  });

  it('should replay a specific event by --index', async () => {
    const events = [
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
    mockListener.getBufferedEvents.mockResolvedValue(events);

    const result = await command.execute({ index: '2' });

    expect(result.success).toBe(true);
    expect(result.forwarded).toBe(1);
    expect(mockListener.forwardEvent).toHaveBeenCalledWith(
      'http://localhost:3000',
      events[1],
    );
    expect(mockLogger.printSuccess).toHaveBeenCalledWith(
      expect.stringContaining('products/update'),
    );
  });

  it('should error on invalid --index', async () => {
    const events = [
      { topic: 'orders/create', receivedAt: '2026-01-01T00:00:00.000Z' },
    ];
    mockListener.getBufferedEvents.mockResolvedValue(events);

    const result = await command.execute({ index: '5' });

    expect(result.success).toBe(false);
    expect(mockListener.forwardEvent).not.toHaveBeenCalled();
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid index'),
    );
  });

  it('should show list with indices', async () => {
    const events = [
      { topic: 'orders/create', receivedAt: '2026-01-01T00:00:00.000Z' },
      { topic: 'products/update', receivedAt: '2026-01-01T00:00:01.000Z' },
    ];
    mockListener.getBufferedEvents.mockResolvedValue(events);

    await command.execute({ list: true });

    expect(mockLogger.printInfo).toHaveBeenCalledWith(
      expect.stringContaining('[1]'),
    );
    expect(mockLogger.printInfo).toHaveBeenCalledWith(
      expect.stringContaining('[2]'),
    );
  });
});
