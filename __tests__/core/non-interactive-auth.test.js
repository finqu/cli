import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/core/app.js';
import { createConfigManager } from '../../src/core/config.js';
import { Logger } from '../../src/core/logger.js';
import { AppError } from '../../src/core/error.js';

vi.mock('request', () => ({ default: vi.fn() }));
vi.mock('prompts', () => ({ default: vi.fn() }));
vi.mock('open', () => ({ default: vi.fn() }));

import request from 'request';
import prompts from 'prompts';

const RESOURCE_URL = 'https://api.example.test';
const STORE_LINES = [
  `FINQU_RESOURCE_URL=${RESOURCE_URL}`,
  'FINQU_STORE_ID=12',
  'FINQU_STORE_THEME_ID=34',
  'FINQU_STORE_VERSION_ID=release-1',
];

/**
 * Build a real ConfigManager from in-memory .env content, so no real
 * credential file is read.
 */
async function loadConfig(envLines, { nonInteractive }) {
  const content = `${envLines.join('\n')}\n`;
  const fileSystem = {
    exists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue(content),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
  const config = await createConfigManager(fileSystem, '/fixture/.env', {});
  config.set('nonInteractive', nonInteractive);
  return { config, fileSystem };
}

describe('non-interactive authentication', () => {
  let logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new Logger();
    logger.setExitOnFatal(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    request.mockImplementation((options, callback) => {
      callback(null, { statusCode: 200 }, {});
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function headersOf(call) {
    return Object.keys(call[0].headers ?? {}).map((name) => name.toLowerCase());
  }

  describe('with no token in .env', () => {
    it('starts, calls the API without an Authorization header and never refreshes or prompts', async () => {
      const { config, fileSystem } = await loadConfig(STORE_LINES, { nonInteractive: true });

      const app = await createApp({ fileSystem }, config, logger);
      await app.services.themeApi.compileAssets();

      expect(request).toHaveBeenCalledTimes(1);
      const [options] = request.mock.calls[0];
      expect(options.url).toBe(`${RESOURCE_URL}/3.2/channels/12/themes/34/versions/release-1/assets/compile`);
      expect(headersOf(request.mock.calls[0])).not.toContain('authorization');
      expect(options.headers['User-Agent']).toBe('Finqu CLI');

      const urls = request.mock.calls.map(([o]) => o.url);
      expect(urls.some((url) => url.includes('oauth2'))).toBe(false);
      expect(prompts).not.toHaveBeenCalled();
    });

    it('does not validate a token at startup', async () => {
      const { config, fileSystem } = await loadConfig(STORE_LINES, { nonInteractive: true });
      const app = await createApp({ fileSystem }, config, logger);

      expect(app.services.tokenManager.hasAccessToken()).toBe(false);
      expect(request).not.toHaveBeenCalled();
      expect(prompts).not.toHaveBeenCalled();
    });
  });

  describe('with a token in .env', () => {
    it('sends the token when it is still valid', async () => {
      const lines = [
        ...STORE_LINES,
        'FINQU_ACCESS_TOKEN=fixture-token-valid',
        `FINQU_EXPIRES_AT=${Date.now() + 60 * 60 * 1000}`,
      ];
      const { config, fileSystem } = await loadConfig(lines, { nonInteractive: true });

      const app = await createApp({ fileSystem }, config, logger);
      await app.services.themeApi.compileAssets();

      expect(request.mock.calls[0][0].headers.Authorization).toBe('Bearer fixture-token-valid');
      expect(prompts).not.toHaveBeenCalled();
    });

    it('fails an expired token without a prompt or a refresh call', async () => {
      const lines = [
        ...STORE_LINES,
        'FINQU_ACCESS_TOKEN=fixture-token-expired',
        'FINQU_REFRESH_TOKEN=fixture-refresh',
        `FINQU_EXPIRES_AT=${Date.now() - 60 * 60 * 1000}`,
      ];
      const { config, fileSystem } = await loadConfig(lines, { nonInteractive: true });

      await expect(createApp({ fileSystem }, config, logger)).rejects.toMatchObject({
        name: 'AppError',
        code: 'AUTH_ERROR',
      });

      expect(prompts).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    });

    it('still prompts for an expired token when not non-interactive', async () => {
      const lines = [
        ...STORE_LINES,
        'FINQU_ACCESS_TOKEN=fixture-token-expired',
        'FINQU_REFRESH_TOKEN=fixture-refresh',
        `FINQU_EXPIRES_AT=${Date.now() - 60 * 60 * 1000}`,
      ];
      const { config, fileSystem } = await loadConfig(lines, { nonInteractive: false });
      prompts.mockRejectedValue(new Error('stop here'));

      await expect(createApp({ fileSystem }, config, logger)).rejects.toThrow('stop here');

      expect(prompts).toHaveBeenCalledTimes(1);
    });
  });

  it('refuses the sign-in flow without opening a server or prompting', async () => {
    const { config, fileSystem } = await loadConfig(STORE_LINES, { nonInteractive: true });
    const app = await createApp({ fileSystem }, config, logger);

    await expect(app.services.tokenManager.getAccessToken()).rejects.toBeInstanceOf(AppError);

    expect(prompts).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('is not switched on by a FINQU_NON_INTERACTIVE key in .env', async () => {
    const { config } = await loadConfig([...STORE_LINES, 'FINQU_NON_INTERACTIVE=true'], {
      nonInteractive: false,
    });

    expect(config.get('nonInteractive')).toBe(false);
  });
});
