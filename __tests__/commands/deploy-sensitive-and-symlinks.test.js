import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeployCommand } from '../../src/commands/deploy.js';
import { ThemeApi } from '../../src/services/themeApi.js';
import { ThemeWatcher } from '../../src/core/theme-watcher.js';
import {
  createFileSystem,
  SENSITIVE_PATH_PATTERNS,
} from '../../src/io/fileSystem.js';

const logger = {
  printInfo: vi.fn(),
  printStatus: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printVerbose: vi.fn(),
  printVerboseList: vi.fn(),
  suspendVerbose: vi.fn(),
  resumeVerbose: vi.fn(),
  handleError: vi.fn(),
};

const SENSITIVE = [
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  '.netrc',
  '.git-credentials',
  '.pgpass',
  '.aws/credentials',
  '.ssh/known_hosts',
  '.gnupg/pubring.kbx',
  '.docker/config.json',
  '.kube/config',
  'id_rsa',
  'id_rsa.pub',
  'id_ed25519',
  'id_ed25519.pub',
  'server.pem',
  'tls.key',
  'cert.p12',
  'cert.pfx',
  '.htaccess',
  '.htpasswd',
  '.git/config',
];

describe('checkPath excludes credential and key material', () => {
  const fileSystem = createFileSystem();

  it('exports one named list of patterns', () => {
    expect(SENSITIVE_PATH_PATTERNS.length).toBeGreaterThan(0);
  });

  it.each(SENSITIVE)('refuses %s at the top level, nested and in upper case', (name) => {
    expect(fileSystem.checkPath(name)).toBe(false);
    expect(fileSystem.checkPath(`snippets/deep/${name}`)).toBe(false);
    expect(fileSystem.checkPath(name.toUpperCase())).toBe(false);
    expect(fileSystem.checkPath(`snippets\\${name.replaceAll('/', '\\')}`)).toBe(false);
  });

  it.each([
    'layout/theme.liquid',
    'assets/app.js',
    'assets/keyboard.js',
    'assets/monkey.css',
    'snippets/id_card.liquid',
    'docker/config.json',
    'assets/npmrc.txt',
  ])('still allows %s', (name) => {
    expect(fileSystem.checkPath(name)).toBe(true);
  });
});

describe('deploy and watch never upload credential files or follow symlinks', () => {
  let themeDir;
  let outside;
  let put;
  let themeApi;

  function createThemeApi() {
    const values = {
      resourceUrl: 'http://127.0.0.1:1',
      store: { id: 12, themeId: 34, versionId: 'rel1' },
    };
    const config = { get: (k, d) => (k in values ? values[k] : d) };
    put = vi.fn().mockResolvedValue({});
    themeApi = new ThemeApi({ put }, null, logger, config);
    return config;
  }

  function createCommand() {
    const config = createThemeApi();
    const values = { themeDir };
    return new DeployCommand({
      services: { themeApi },
      logger,
      fileSystem: createFileSystem(),
      config: {
        get: (k, d) => (k in values ? values[k] : config.get(k, d)),
        configFilePath: undefined,
      },
    });
  }

  const uploadedKeys = () => put.mock.calls.map((call) => JSON.stringify(call[1]));

  beforeEach(() => {
    vi.clearAllMocks();
    themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finqu-theme-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'finqu-outside-'));
    fs.mkdirSync(path.join(themeDir, 'snippets'));
    fs.writeFileSync(path.join(themeDir, 'snippets', 'a.liquid'), 'a');
    fs.writeFileSync(path.join(outside, 'secret.env'), 'FIXTURE_SECRET=fixture-value');
    fs.mkdirSync(path.join(outside, 'dir'));
    fs.writeFileSync(path.join(outside, 'dir', 'inner.liquid'), 'FIXTURE_SECRET=fixture-value');
  });

  afterEach(() => {
    fs.rmSync(themeDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('deploy-all skips every sensitive file, nested or not', async () => {
    for (const name of SENSITIVE) {
      fs.mkdirSync(path.dirname(path.join(themeDir, name)), { recursive: true });
      fs.writeFileSync(path.join(themeDir, name), 'fixture');
    }
    const result = await createCommand().execute([], {});

    expect(uploadedKeys().join()).toContain('snippets/a.liquid');
    expect(put.mock.calls.filter((c) => c[1]?.asset)).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it('refuses a symlink to a credential file and reports it as skipped', async () => {
    fs.symlinkSync(path.join(outside, 'secret.env'), path.join(themeDir, 'snippets', 'leak.liquid'));

    const all = await createCommand().execute([], {});
    expect(uploadedKeys().join()).not.toContain('leak.liquid');
    expect(all.skipped).toEqual([{ path: 'snippets/leak.liquid', reason: 'symlink' }]);

    put.mockClear();
    const named = await createCommand().execute(['snippets/leak.liquid'], {});
    expect(put).not.toHaveBeenCalled();
    expect(named.skipped).toEqual([{ path: 'snippets/leak.liquid', reason: 'symlink' }]);
  });

  it('refuses a relative symlink to .env inside the theme', async () => {
    fs.writeFileSync(path.join(themeDir, '.env'), 'FIXTURE_SECRET=fixture-value');
    fs.symlinkSync('../.env', path.join(themeDir, 'snippets', 'leak.liquid'));

    const result = await createCommand().execute(['snippets/leak.liquid'], {});

    expect(put).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([{ path: 'snippets/leak.liquid', reason: 'symlink' }]);
  });

  it('does not walk into a symlinked directory, walked or named', async () => {
    fs.symlinkSync(path.join(outside, 'dir'), path.join(themeDir, 'linked'));

    const all = await createCommand().execute([], {});
    expect(uploadedKeys().join()).not.toContain('inner.liquid');
    expect(all.skipped).toEqual([{ path: 'linked', reason: 'symlink' }]);

    put.mockClear();
    const named = await createCommand().execute(['linked'], {});
    expect(put).not.toHaveBeenCalled();
    expect(named.skipped).toEqual([{ path: 'linked', reason: 'symlink' }]);

    const through = await createCommand().execute(['linked/inner.liquid'], {});
    expect(put).not.toHaveBeenCalled();
    expect(through.skipped).toEqual([{ path: 'linked/inner.liquid', reason: 'symlink' }]);
  });

  it('does not upload a symlink from the watcher path either', async () => {
    createThemeApi();
    fs.symlinkSync(path.join(outside, 'secret.env'), path.join(themeDir, 'snippets', 'leak.liquid'));
    fs.symlinkSync(path.join(outside, 'dir'), path.join(themeDir, 'linked'));
    const fileSystem = createFileSystem();

    const options = { quiet: true, rootDir: themeDir };
    const link = await themeApi.uploadAsset(
      'snippets/leak.liquid',
      path.join(themeDir, 'snippets', 'leak.liquid'),
      fileSystem,
      options,
    );
    const underLink = await themeApi.uploadAsset(
      'linked/inner.liquid',
      path.join(themeDir, 'linked', 'inner.liquid'),
      fileSystem,
      options,
    );

    expect(link).toBe(false);
    expect(underLink).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });

  it('ThemeWatcher passes the theme directory so links on the path are refused', async () => {
    const uploadAsset = vi.fn().mockResolvedValue(true);
    const watcher = new ThemeWatcher(
      themeDir,
      { uploadAsset },
      createFileSystem(),
      logger,
    );
    watcher.uploadQueue.add('snippets/a.liquid');
    await watcher._processQueues();

    expect(uploadAsset).toHaveBeenCalledTimes(1);
    expect(uploadAsset.mock.calls[0][3]).toMatchObject({ rootDir: themeDir });
  });
});
