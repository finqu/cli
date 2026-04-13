/**
 * App webhook listener service
 * Connects to Finqu realtime websocket and forwards webhook events to localhost.
 */
import WebSocket from 'ws';
import { AppError } from '../core/error.js';

const DEFAULT_WS_PATH = '/ws/webhooks';
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_RESET_DELAY_AFTER_MS = 30000;
const DEFAULT_FORWARD_TIMEOUT_MS = 10000;

function toWebSocketScheme(url) {
  if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }
}

export function normalizeRealtimeUrl(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return null;
  }

  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)
    ? value
    : `https://${value}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  toWebSocketScheme(parsed);

  if (!parsed.pathname || parsed.pathname === '/') {
    parsed.pathname = DEFAULT_WS_PATH;
  }

  return parsed.toString();
}

export function extractRealtimeUrlFromProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  return normalizeRealtimeUrl(profile?.merchant?.endpoints?.realtime);
}

export function shouldForwardTopic(topic, selectedTopics = []) {
  if (!selectedTopics || selectedTopics.length === 0) {
    return true;
  }

  return selectedTopics.includes(topic);
}

export class AppWebhookListener {
  constructor(options = {}) {
    this.config = options.config;
    this.logger = options.logger;
    this.webSocketFactory =
      options.webSocketFactory ||
      ((url, wsOptions) => new WebSocket(url, wsOptions));
    this.fetchImpl = options.fetchImpl || fetch;
  }

  resolveRealtimeUrl({ explicitRealtimeUrl = null, profile = null } = {}) {
    const explicit = normalizeRealtimeUrl(explicitRealtimeUrl);
    if (explicit) {
      return explicit;
    }

    const fromProfile = extractRealtimeUrlFromProfile(profile);
    if (fromProfile) {
      return fromProfile;
    }

    const configured = normalizeRealtimeUrl(this.config.get('appRealtimeUrl'));
    if (configured) {
      return configured;
    }

    return null;
  }

  async forwardEvent(
    localUrl,
    event,
    forwardTimeoutMs = DEFAULT_FORWARD_TIMEOUT_MS,
  ) {
    const targetUrl = event.path
      ? new URL(event.path, localUrl).toString()
      : localUrl;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), forwardTimeoutMs);

    try {
      const response = await this.fetchImpl(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Finqu-Topic': event.topic || '',
          'X-Finqu-Source': event.source || '',
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Local endpoint responded with ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async listen(options) {
    const {
      realtimeUrl,
      accessToken,
      localUrl,
      topics = [],
      signal,
      initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
      maxDelayMs = DEFAULT_MAX_DELAY_MS,
      backoffFactor = DEFAULT_BACKOFF_FACTOR,
      resetDelayAfterMs = DEFAULT_RESET_DELAY_AFTER_MS,
      forwardTimeoutMs = DEFAULT_FORWARD_TIMEOUT_MS,
    } = options;

    if (!realtimeUrl) {
      throw AppError.configError(
        'Realtime websocket URL could not be resolved. Set appRealtimeUrl or pass --realtime-url.',
      );
    }

    if (!accessToken) {
      throw AppError.authError(
        'Missing access token. Run "finqu sign-in" first.',
      );
    }

    if (!localUrl) {
      throw AppError.validationError('Local forwarding URL is required.');
    }

    let delayMs = initialDelayMs;

    while (!signal?.aborted) {
      const result = await this._connectAndForward({
        realtimeUrl,
        accessToken,
        localUrl,
        topics,
        signal,
        forwardTimeoutMs,
      });

      if (signal?.aborted) {
        return;
      }

      if (result?.statusCode === 403) {
        throw AppError.authError(
          'Realtime endpoint rejected authentication (403). Run "finqu sign-in" to refresh credentials.',
        );
      }

      if (result.openDurationMs > resetDelayAfterMs) {
        delayMs = initialDelayMs;
      }

      this.logger.printInfo(
        `Realtime connection closed. Reconnecting in ${Math.round(delayMs / 1000)}s...`,
      );
      await this._wait(delayMs, signal);
      delayMs = Math.min(maxDelayMs, Math.ceil(delayMs * backoffFactor));
    }
  }

  _connectAndForward({
    realtimeUrl,
    accessToken,
    localUrl,
    topics,
    signal,
    forwardTimeoutMs,
  }) {
    return new Promise((resolve) => {
      let settled = false;
      let openTimestamp = 0;
      const ws = this.webSocketFactory(realtimeUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const cleanupSignal = () => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const settle = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanupSignal();
        resolve(value);
      };

      const onAbort = () => {
        try {
          ws.close(1000, 'Client shutdown');
        } catch {
          // Ignore close errors during shutdown.
        }
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      ws.on('open', () => {
        openTimestamp = Date.now();
        this.logger.printSuccess(
          `Connected to realtime websocket ${realtimeUrl}`,
        );
      });

      ws.on('unexpected-response', (_request, response) => {
        if (response.statusCode && response.statusCode >= 400) {
          this.logger.printError(
            `Realtime websocket handshake failed with status ${response.statusCode}`,
          );
        }

        settle({
          statusCode: response.statusCode,
          openDurationMs: openTimestamp ? Date.now() - openTimestamp : 0,
        });
      });

      ws.on('message', async (rawData) => {
        const data = typeof rawData === 'string' ? rawData : rawData.toString();
        let event;

        try {
          event = JSON.parse(data);
        } catch {
          this.logger.printError('Failed to parse webhook event JSON');
          return;
        }

        if (!event || typeof event !== 'object' || !event.topic) {
          this.logger.printVerbose(
            'Ignoring webhook event with missing topic.',
          );
          return;
        }

        if (!shouldForwardTopic(event.topic, topics)) {
          this.logger.printVerbose(
            `Skipping topic ${event.topic} due to topic filters.`,
          );
          return;
        }

        const targetUrl = event.path
          ? new URL(event.path, localUrl).toString()
          : localUrl;

        try {
          await this.forwardEvent(localUrl, event, forwardTimeoutMs);
          this.logger.printInfo(`Forwarded ${event.topic} to ${targetUrl}`);
        } catch (err) {
          this.logger.printError(
            `Failed to forward ${event.topic} to ${targetUrl}`,
            err,
          );
        }
      });

      ws.on('error', (err) => {
        this.logger.printError('Realtime websocket error', err);
        if (!openTimestamp) {
          settle({
            statusCode: 0,
            reason: err?.message || 'connection error',
            openDurationMs: 0,
          });
        }
      });

      ws.on('close', (code, reason) => {
        this.logger.printVerbose('Realtime websocket close event received.');
        settle({
          statusCode: code,
          reason: reason ? reason.toString() : '',
          openDurationMs: openTimestamp ? Date.now() - openTimestamp : 0,
        });
      });
    });
  }

  _wait(delayMs, signal) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, delayMs);

      const onAbort = () => {
        clearTimeout(timeout);
        cleanup();
        resolve();
      };

      const cleanup = () => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }
}

export function createAppWebhookListener(options) {
  return new AppWebhookListener(options);
}
