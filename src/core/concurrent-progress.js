/**
 * Fixed-slot concurrent progress display for theme transfers.
 * Shows exactly `concurrency` spinner lines, rewritten in place.
 */
import chalk from 'chalk';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Normalize removeAsset's second argument (boolean silent or options object).
 * @param {boolean|Object} silentOrOptions
 * @returns {{ quiet: boolean, silent: boolean, onStatus: Function|null }}
 */
export function normalizeRemoveOptions(silentOrOptions = false) {
  if (
    silentOrOptions &&
    typeof silentOrOptions === 'object' &&
    !Array.isArray(silentOrOptions)
  ) {
    return {
      quiet: !!silentOrOptions.quiet,
      silent: !!silentOrOptions.silent,
      onStatus:
        typeof silentOrOptions.onStatus === 'function'
          ? silentOrOptions.onStatus
          : null,
    };
  }
  return {
    quiet: false,
    silent: !!silentOrOptions,
    onStatus: null,
  };
}

/**
 * Run async work over items with a fixed concurrency pool.
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, slot: number) => Promise<void>} worker
 * @returns {Promise<void>}
 */
export async function runWithConcurrency(items, concurrency, worker) {
  if (!items.length) return;

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  const runWorker = async (slot) => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index], slot);
    }
  };

  await Promise.all(
    Array.from({ length: limit }, (_, slot) => runWorker(slot)),
  );
}

/**
 * Multi-line TTY progress renderer with a fixed number of spinner slots.
 *
 * Always reserves exactly `concurrency` lines so cursor math stays stable.
 * Renders are serialized to avoid interleaved ANSI writes from concurrent workers.
 */
export class ConcurrentProgress {
  /**
   * @param {number} concurrency Max simultaneous spinner lines
   * @param {Object} [options]
   * @param {NodeJS.WriteStream} [options.stream]
   * @param {boolean} [options.enabled] Force enable/disable (defaults to stream.isTTY)
   */
  constructor(concurrency, options = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.stream = options.stream || process.stdout;
    this.enabled =
      options.enabled !== undefined
        ? !!options.enabled
        : !!(this.stream && this.stream.isTTY);
    this.slots = Array.from({ length: this.concurrency }, () => null);
    this.frameIndex = 0;
    this.timer = null;
    this.drawn = false;
    this.renderQueued = false;
  }

  /**
   * Assign text to a slot and render.
   * @param {number} slot
   * @param {string} text
   */
  start(slot, text) {
    if (!this.enabled) return;
    this._ensureSlot(slot);
    this.slots[slot] = text;
    this._ensureTimer();
    this._scheduleRender();
  }

  /**
   * Update text for an active slot.
   * @param {number} slot
   * @param {string} text
   */
  update(slot, text) {
    if (!this.enabled) return;
    this._ensureSlot(slot);
    this.slots[slot] = text;
    this._ensureTimer();
    this._scheduleRender();
  }

  /**
   * Clear a slot when its work finishes (line stays reserved until reused).
   * @param {number} slot
   */
  finish(slot) {
    if (!this.enabled) return;
    this._ensureSlot(slot);
    this.slots[slot] = null;
    this._scheduleRender();
  }

  /**
   * Clear all progress lines from the terminal and stop the spinner.
   */
  clear() {
    if (!this.enabled) return;
    this._stopTimer();
    if (this.drawn) {
      this._moveToBlockStart();
      for (let i = 0; i < this.concurrency; i++) {
        this.stream.write('\x1b[2K\n');
      }
      this._moveToBlockStart();
      this.drawn = false;
    }
    this.slots = Array.from({ length: this.concurrency }, () => null);
    this.renderQueued = false;
  }

  _ensureSlot(slot) {
    if (slot < 0 || slot >= this.concurrency) {
      throw new Error(`Invalid progress slot: ${slot}`);
    }
  }

  _ensureTimer() {
    if (this.timer || !this.enabled) return;
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this._scheduleRender();
    }, 80);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  _stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Coalesce concurrent render requests onto the next tick so ANSI writes
   * never interleave and we always paint the latest slot state.
   */
  _scheduleRender() {
    if (!this.enabled || this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (!this.enabled) return;
      this._render();
    });
  }

  _columns() {
    const cols = this.stream && this.stream.columns;
    return typeof cols === 'number' && cols > 0 ? cols : 80;
  }

  _truncateMessage(text) {
    const max = Math.max(16, this._columns() - 1);
    // Reserve room for spinner glyph + space (approx 2 cols)
    const maxMsg = Math.max(8, max - 2);
    if (text.length <= maxMsg) return text;
    return `${text.slice(0, Math.max(0, maxMsg - 1))}…`;
  }

  _moveToBlockStart() {
    if (this.concurrency > 0) {
      this.stream.write(`\x1b[${this.concurrency}A`);
    }
  }

  _render() {
    if (!this.enabled) return;

    const frame = SPINNER_FRAMES[this.frameIndex];
    const lines = this.slots.map((text) => {
      if (!text) return '';
      return `${chalk.cyan(frame)} ${this._truncateMessage(text)}`;
    });

    if (this.drawn) {
      this._moveToBlockStart();
    }

    for (let i = 0; i < this.concurrency; i++) {
      this.stream.write('\x1b[2K\r');
      this.stream.write(lines[i]);
      this.stream.write('\n');
    }

    this.drawn = true;
  }
}

/**
 * Create a ConcurrentProgress instance.
 * @param {number} concurrency
 * @param {Object} [options]
 * @returns {ConcurrentProgress}
 */
export function createConcurrentProgress(concurrency, options = {}) {
  return new ConcurrentProgress(concurrency, options);
}
