import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConcurrentProgress,
  runWithConcurrency,
  normalizeRemoveOptions,
} from '../../src/core/concurrent-progress.js';

async function flushRenders() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('normalizeRemoveOptions', () => {
  it('treats boolean as silent flag', () => {
    expect(normalizeRemoveOptions(true)).toEqual({
      quiet: false,
      silent: true,
      onStatus: null,
    });
    expect(normalizeRemoveOptions(false)).toEqual({
      quiet: false,
      silent: false,
      onStatus: null,
    });
  });

  it('accepts options object', () => {
    const onStatus = vi.fn();
    expect(
      normalizeRemoveOptions({ quiet: true, silent: true, onStatus }),
    ).toEqual({
      quiet: true,
      silent: true,
      onStatus,
    });
  });
});

describe('runWithConcurrency', () => {
  it('processes all items with limited concurrency', async () => {
    const seen = [];
    let inFlight = 0;
    let maxInFlight = 0;

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      seen.push(item);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('does nothing for empty lists', async () => {
    const worker = vi.fn();
    await runWithConcurrency([], 5, worker);
    expect(worker).not.toHaveBeenCalled();
  });

  it('passes slot indexes within concurrency', async () => {
    const slots = new Set();
    await runWithConcurrency(['a', 'b', 'c'], 2, async (_item, slot) => {
      slots.add(slot);
    });
    expect([...slots].sort()).toEqual([0, 1]);
  });
});

describe('ConcurrentProgress', () => {
  let stream;
  let writes;

  beforeEach(() => {
    writes = [];
    stream = {
      isTTY: true,
      columns: 120,
      write: vi.fn((chunk) => {
        writes.push(String(chunk));
        return true;
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a no-op when disabled / non-TTY', async () => {
    const progress = new ConcurrentProgress(2, {
      stream: { isTTY: false, write: vi.fn() },
    });
    progress.start(0, 'Uploading file: a.js');
    progress.update(0, 'Uploading a.js as a plain text file');
    await flushRenders();
    progress.clear();
    expect(progress.stream.write).not.toHaveBeenCalled();
  });

  it('writes a fixed number of lines for concurrency', async () => {
    const progress = new ConcurrentProgress(2, { stream, enabled: true });
    progress.start(0, 'Uploading file: a.js');
    progress.start(1, 'Uploading file: b.js');
    await flushRenders();

    const output = writes.join('');
    expect(output).toContain('Uploading file: a.js');
    expect(output).toContain('Uploading file: b.js');
    // First paint writes exactly concurrency newlines (no cursor-up yet)
    expect((output.match(/\n/g) || []).length).toBe(2);

    progress.clear();
  });

  it('rewrites in place on subsequent renders instead of appending', async () => {
    const progress = new ConcurrentProgress(2, { stream, enabled: true });
    progress.start(0, 'Uploading file: a.js');
    progress.start(1, 'Uploading file: b.js');
    await flushRenders();

    writes.length = 0;
    progress.update(0, 'Uploading a.js as a plain text file');
    await flushRenders();

    const output = writes.join('');
    // Move cursor up by concurrency before rewriting
    expect(output).toContain('\x1b[2A');
    expect(output).toContain('Uploading a.js as a plain text file');
    expect((output.match(/\n/g) || []).length).toBe(2);

    progress.clear();
  });

  it('keeps fixed line count when a slot finishes', async () => {
    const progress = new ConcurrentProgress(3, { stream, enabled: true });
    progress.start(0, 'a');
    progress.start(1, 'b');
    progress.start(2, 'c');
    await flushRenders();

    writes.length = 0;
    progress.finish(1);
    await flushRenders();

    const output = writes.join('');
    expect(output).toContain('\x1b[3A');
    expect((output.match(/\n/g) || []).length).toBe(3);

    progress.clear();
  });

  it('clears the full reserved block', async () => {
    const progress = new ConcurrentProgress(3, { stream, enabled: true });
    progress.start(0, 'a');
    await flushRenders();

    writes.length = 0;
    progress.clear();

    const output = writes.join('');
    expect(output).toContain('\x1b[3A');
    expect((output.match(/\n/g) || []).length).toBe(3);
  });

  it('updates slot text in place', async () => {
    const progress = new ConcurrentProgress(1, { stream, enabled: true });
    progress.start(0, 'Uploading file: a.js');
    await flushRenders();
    progress.update(0, 'Uploading a.js as a plain text file');
    await flushRenders();
    const output = writes.join('');
    expect(output).toContain('Uploading a.js as a plain text file');
    progress.clear();
  });
});
