import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createCommandRegistry } from '../../src/commands/index.js';
import { Logger } from '../../src/core/logger.js';
import { createThemeApi } from '../../src/services/themeApi.js';
import { MACHINE_COMMANDS } from '../../src/core/non-interactive.js';

vi.mock('prompts', () => ({ default: vi.fn() }));
import prompts from 'prompts';

const THEME_DIR = '/theme';

function createConfig(values) {
  const config = {
    get: vi.fn((key, fallback = null) => (key in values ? values[key] : fallback)),
    set: vi.fn((key, value) => {
      values[key] = value;
      return config;
    }),
    remove: vi.fn(),
    saveConfig: vi.fn().mockResolvedValue(true),
  };
  return config;
}

function createFileSystem(overrides = {}) {
  return {
    lstat: vi.fn().mockResolvedValue({ isSymbolicLink: () => false }),
    stat: vi.fn().mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
      size: 10,
    }),
    getFiles: vi.fn().mockResolvedValue([]),
    checkPath: vi.fn().mockReturnValue(true),
    exists: vi.fn().mockResolvedValue(false),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('content'),
    ...overrides,
  };
}

function createThemeApiMock() {
  return {
    uploadAsset: vi.fn().mockResolvedValue(true),
    removeAsset: vi.fn().mockResolvedValue(undefined),
    compileAssets: vi.fn().mockResolvedValue(undefined),
    getAssets: vi.fn().mockResolvedValue([]),
    downloadAsset: vi.fn().mockResolvedValue(true),
    listStores: vi.fn().mockResolvedValue([]),
    listThemes: vi.fn().mockResolvedValue([]),
    listVersions: vi.fn().mockResolvedValue([{ id: 'release-1' }]),
  };
}

describe('non-interactive command registry', () => {
  let stdout;
  let consoleLog;
  let consoleError;
  let processExit;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  /**
   * Run the real command registry against a mock app.
   * @returns {Promise<Object>} The app, mocks and the parsed JSON line
   */
  async function run(args, { nonInteractive = true, json = false, themeApi, fileSystem, prepare } = {}) {
    const values = {
      themeDir: THEME_DIR,
      resourceUrl: 'https://api.example.test',
      nonInteractive,
      json,
    };
    const logger = new Logger();
    logger.setMachineOutput(json);
    logger.setExitOnFatal(!nonInteractive);

    const app = {
      config: createConfig(values),
      logger,
      fileSystem: fileSystem ?? createFileSystem(),
      services: { themeApi: themeApi ?? createThemeApiMock() },
    };

    const registry = createCommandRegistry();
    registry.setApp(app);
    prepare?.(registry);

    const program = new Command();
    program.exitOverride();
    registry.registerCommands(program);
    await program.parseAsync(['node', 'finqu', ...args]);

    const line = stdout.mock.calls
      .map(([chunk]) => String(chunk))
      .find((chunk) => chunk.startsWith('{"ok"'));
    return { app, registry, envelope: line ? JSON.parse(line) : null, line };
  }

  describe('allowlist', () => {
    it('runs theme download', async () => {
      const themeApi = createThemeApiMock();
      await run(['theme', 'download', 'templates/a.liquid'], { themeApi });
      expect(themeApi.downloadAsset).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });

    it('runs theme deploy', async () => {
      const themeApi = createThemeApiMock();
      await run(['theme', 'deploy', 'templates/a.liquid'], { themeApi });
      expect(themeApi.uploadAsset).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });

    it('runs theme delete', async () => {
      const themeApi = createThemeApiMock();
      await run(['theme', 'delete', 'templates/a.liquid'], { themeApi });
      expect(themeApi.removeAsset).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });

    it('runs theme configure with flags', async () => {
      const themeApi = createThemeApiMock();
      await run(
        ['theme', 'configure', '--channel', '12', '--theme', '34', '--version', 'release-1'],
        { themeApi },
      );
      expect(themeApi.listVersions).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });

    it('refuses every other registered command without running it', async () => {
      const probe = createCommandRegistry();
      const refused = probe.commands
        .map((name) => probe.commandInstances[name])
        .filter((cmd) => !MACHINE_COMMANDS.includes(`${cmd.group ? `${cmd.group} ` : ''}${cmd.name}`));

      const keys = refused.map((cmd) => `${cmd.group ? `${cmd.group} ` : ''}${cmd.name}`);
      expect(keys).toEqual(
        expect.arrayContaining(['app dev', 'theme dev', 'sign-in', 'storefront dev', 'storefront build', 'storefront create']),
      );

      for (const name of probe.commands) {
        const cmd = probe.commandInstances[name];
        const key = `${cmd.group ? `${cmd.group} ` : ''}${cmd.name}`;
        if (MACHINE_COMMANDS.includes(key)) continue;

        process.exitCode = undefined;
        const execute = vi.fn();
        const args = (cmd.syntax || cmd.name)
          .split(/\s+/)
          .slice(1)
          .filter((token) => token.startsWith('<'))
          .map(() => 'value');

        await run([...(cmd.group ? [cmd.group] : []), cmd.name, ...args], {
          prepare: (registry) => {
            registry.commandInstances[name].execute = execute;
          },
        });

        expect(execute, `${key} must not run`).not.toHaveBeenCalled();
        expect(process.exitCode, `${key} exit code`).toBe(2);
      }
      expect(prompts).not.toHaveBeenCalled();
    });

    it('reports a refusal as JSON with the refusal exit code', async () => {
      const { envelope } = await run(['app', 'dev'], { json: true });
      expect(envelope).toEqual({
        ok: false,
        command: 'app dev',
        exitCode: 2,
        error: {
          code: 'COMMAND_REFUSED',
          message: expect.stringContaining('"app dev" is not available in non-interactive mode'),
        },
        result: null,
      });
    });

    it('refuses --json on a command without a JSON result even when prompts are allowed', async () => {
      const execute = vi.fn();
      const { envelope } = await run(['app', 'list'], {
        nonInteractive: false,
        json: true,
        prepare: (registry) => {
          registry.commandInstances['app-list'].execute = execute;
        },
      });
      expect(execute).not.toHaveBeenCalled();
      expect(envelope.error.code).toBe('COMMAND_REFUSED');
      expect(process.exitCode).toBe(2);
    });

    it('leaves a plain interactive run alone', async () => {
      const execute = vi.fn().mockResolvedValue({ success: true });
      await run(['app', 'dev'], {
        nonInteractive: false,
        prepare: (registry) => {
          registry.commandInstances['app-dev'].execute = execute;
        },
      });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBeUndefined();
    });

    it('never prompts', async () => {
      await run(['theme', 'deploy', 'templates/a.liquid']);
      await run(['theme', 'download', 'templates/a.liquid']);
      await run(['theme', 'delete', 'templates/a.liquid']);
      expect(prompts).not.toHaveBeenCalled();
    });
  });

  describe('exit codes for theme deploy', () => {
    it('exits 1 for a failed upload', async () => {
      const themeApi = createThemeApiMock();
      themeApi.uploadAsset.mockRejectedValue(new Error('upload exploded'));

      const { envelope } = await run(['theme', 'deploy', 'templates/a.liquid'], { themeApi, json: true });

      expect(process.exitCode).toBe(1);
      expect(envelope.ok).toBe(false);
      expect(envelope.result.failed).toEqual([
        { path: 'templates/a.liquid', action: 'upload', error: 'upload exploded' },
      ]);
    });

    it('keeps the failed upload at exit 0 in a plain interactive run', async () => {
      const themeApi = createThemeApiMock();
      themeApi.uploadAsset.mockRejectedValue(new Error('upload exploded'));

      await run(['theme', 'deploy', 'templates/a.liquid'], { themeApi, nonInteractive: false });

      expect(process.exitCode).toBeUndefined();
    });

    it('exits 1 for a file skipped as too large', async () => {
      const themeApi = createThemeApiMock();
      themeApi.uploadAsset.mockImplementation(async (name, filePath, fs, options) => {
        if (name === 'assets/big.bin') {
          options.onSkip({ reason: 'too_large' });
          return false;
        }
        return true;
      });

      const { envelope } = await run(['theme', 'deploy', 'assets/big.bin', 'templates/a.liquid'], {
        themeApi,
        json: true,
      });

      expect(process.exitCode).toBe(1);
      expect(envelope.error).toEqual({ code: 'INCOMPLETE', message: '1 skipped' });
      expect(envelope.result.skipped).toEqual([{ path: 'assets/big.bin', reason: 'too_large' }]);
      expect(envelope.result.uploaded).toEqual(['templates/a.liquid']);
    });

    it('exits 1 for a real file over 10 MB through the real ThemeApi', async () => {
      const put = vi.fn().mockResolvedValue({});
      const logger = new Logger();
      const values = {
        themeDir: THEME_DIR,
        resourceUrl: 'https://api.example.test',
        nonInteractive: true,
        json: true,
        store: { id: '12', themeId: '34', versionId: 'release-1' },
      };
      const themeApi = createThemeApi({ put }, {}, logger, createConfig(values));
      const fileSystem = createFileSystem({
        stat: vi.fn().mockResolvedValue({
          isFile: () => true,
          isDirectory: () => false,
          size: 10 * 1024 * 1024 + 1,
        }),
      });

      const { envelope } = await run(['theme', 'deploy', 'assets/big.bin'], {
        themeApi,
        fileSystem,
        json: true,
      });

      expect(process.exitCode).toBe(1);
      expect(put).not.toHaveBeenCalled();
      expect(envelope.result.skipped).toEqual([{ path: 'assets/big.bin', reason: 'too_large' }]);
    });

    it('exits 1 for a named file that deploy excludes', async () => {
      const fileSystem = createFileSystem({ checkPath: vi.fn().mockReturnValue(false) });
      const themeApi = createThemeApiMock();

      const { envelope } = await run(['theme', 'deploy', 'node_modules/x.js'], {
        themeApi,
        fileSystem,
        json: true,
      });

      expect(process.exitCode).toBe(1);
      expect(themeApi.uploadAsset).not.toHaveBeenCalled();
      expect(envelope.result.skipped).toEqual([{ path: 'node_modules/x.js', reason: 'excluded' }]);
    });

    it('does not count excluded files found by a directory walk', async () => {
      const fileSystem = createFileSystem({
        getFiles: vi.fn().mockResolvedValue([`${THEME_DIR}/node_modules/x.js`, `${THEME_DIR}/templates/a.liquid`]),
        checkPath: vi.fn((relativePath) => !relativePath.startsWith('node_modules')),
      });
      const themeApi = createThemeApiMock();

      const { envelope } = await run(['theme', 'deploy'], { themeApi, fileSystem, json: true });

      expect(process.exitCode).toBe(0);
      expect(envelope.result.uploaded).toEqual(['templates/a.liquid']);
      expect(envelope.result.skipped).toEqual([]);
    });

    it('exits 1 for a failed compile and still lists the uploaded files', async () => {
      const themeApi = createThemeApiMock();
      themeApi.compileAssets.mockRejectedValue(new Error('compile down'));

      const { envelope } = await run(['theme', 'deploy', 'templates/a.liquid'], { themeApi, json: true });

      expect(process.exitCode).toBe(1);
      expect(processExit).not.toHaveBeenCalled();
      expect(envelope.ok).toBe(false);
      expect(envelope.result.uploaded).toEqual(['templates/a.liquid']);
      expect(envelope.result.compile).toEqual({ attempted: true, ok: false, error: 'compile down' });
    });

    it('exits 0 when everything is uploaded and compiled', async () => {
      const { envelope } = await run(['theme', 'deploy', 'templates/a.liquid'], { json: true });
      expect(process.exitCode).toBe(0);
      expect(envelope.ok).toBe(true);
    });

    it('exits 0 with no compile when nothing was uploaded and --no-compile is set', async () => {
      const { envelope } = await run(['theme', 'deploy', '--no-compile', 'templates/a.liquid'], { json: true });
      expect(process.exitCode).toBe(0);
      expect(envelope.result.compile).toEqual({ attempted: false, ok: null, error: null });
    });
  });

  describe('exit codes for theme delete and download', () => {
    it('exits 1 when a delete fails', async () => {
      const themeApi = createThemeApiMock();
      themeApi.removeAsset.mockRejectedValue(new Error('nope'));
      const { envelope } = await run(['theme', 'delete', 'a.liquid'], { themeApi, json: true });
      expect(process.exitCode).toBe(1);
      expect(envelope.result.failed).toEqual([{ path: 'a.liquid', action: 'delete', error: 'nope' }]);
    });

    it('exits 1 when the compile after a delete fails', async () => {
      const themeApi = createThemeApiMock();
      themeApi.compileAssets.mockRejectedValue(new Error('compile down'));
      const { envelope } = await run(['theme', 'delete', 'a.liquid'], { themeApi, json: true });
      expect(process.exitCode).toBe(1);
      expect(envelope.result.deleted).toEqual(['a.liquid']);
      expect(envelope.result.compile.ok).toBe(false);
    });

    it('exits 1 without throwing when delete has no sources', async () => {
      const { envelope } = await run(['theme', 'delete'], { json: true });
      expect(process.exitCode).toBe(1);
      expect(processExit).not.toHaveBeenCalled();
      expect(envelope.error.message).toContain('No sources specified');
    });

    it('exits 1 when a download fails', async () => {
      const themeApi = createThemeApiMock();
      themeApi.downloadAsset.mockRejectedValue(new Error('gone'));
      const { envelope } = await run(['theme', 'download', 'a.liquid'], { themeApi, json: true });
      expect(process.exitCode).toBe(1);
      expect(envelope.result.failed).toEqual([{ path: 'a.liquid', action: 'download', error: 'gone' }]);
    });

    it('exits 1 when a download is skipped', async () => {
      const themeApi = createThemeApiMock();
      themeApi.downloadAsset.mockResolvedValue(false);
      const { envelope } = await run(['theme', 'download', 'a.liquid'], { themeApi, json: true });
      expect(process.exitCode).toBe(1);
      expect(envelope.result.skipped).toEqual([{ path: 'a.liquid', reason: 'not_downloaded' }]);
    });

    it('exits 0 for a full download', async () => {
      const { envelope } = await run(['theme', 'download', 'a.liquid'], { json: true });
      expect(process.exitCode).toBe(0);
      expect(envelope.result).toEqual({
        downloadedCount: 1,
        downloaded: ['a.liquid'],
        failed: [],
        skipped: [],
      });
    });
  });

  describe('--json output', () => {
    it('prints exactly one JSON line on stdout and nothing else there', async () => {
      const { line } = await run(['theme', 'deploy', 'templates/a.liquid'], { json: true });

      const writes = stdout.mock.calls.map(([chunk]) => String(chunk)).filter((c) => c.startsWith('{'));
      expect(writes).toHaveLength(1);
      expect(line.endsWith('\n')).toBe(true);
      expect(line.trim().split('\n')).toHaveLength(1);
      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
    });

    it('has the documented shape for a successful deploy', async () => {
      const { envelope } = await run(['theme', 'deploy', 'templates/a.liquid'], { json: true });
      expect(envelope).toEqual({
        ok: true,
        command: 'theme deploy',
        exitCode: 0,
        error: null,
        result: {
          deployedCount: 1,
          removedCount: 0,
          uploaded: ['templates/a.liquid'],
          failed: [],
          skipped: [],
          compile: { attempted: true, ok: true, error: null },
        },
      });
    });

    it('prints nothing on stdout without --json', async () => {
      const { envelope } = await run(['theme', 'deploy', 'templates/a.liquid'], { json: false });
      expect(envelope).toBeNull();
      expect(consoleLog).toHaveBeenCalled();
    });

    it('does not print secrets from the config', async () => {
      const { line } = await run(['theme', 'deploy', 'templates/a.liquid'], { json: true });
      expect(line).not.toMatch(/token|secret|authorization/i);
    });
  });

  describe('theme configure without prompts', () => {
    it('exits 2 and never prompts or lists stores when flags are missing', async () => {
      const themeApi = createThemeApiMock();
      const { envelope } = await run(['theme', 'configure'], { themeApi, json: true });

      expect(process.exitCode).toBe(2);
      expect(prompts).not.toHaveBeenCalled();
      expect(themeApi.listStores).not.toHaveBeenCalled();
      expect(envelope.error.code).toBe('USAGE_ERROR');
    });

    it('exits 1 for an unknown version', async () => {
      const themeApi = createThemeApiMock();
      const { envelope, app } = await run(
        ['theme', 'configure', '--channel', '12', '--theme', '34', '--version', 'nope'],
        { themeApi, json: true },
      );

      expect(process.exitCode).toBe(1);
      expect(envelope.error.code).toBe('UNKNOWN_VERSION');
      expect(app.config.saveConfig).not.toHaveBeenCalled();
    });

    it('reports the stored target on success', async () => {
      const { envelope } = await run(
        [
          'theme', 'configure',
          '--channel', '12',
          '--theme', '34',
          '--version', 'release-1',
          '--resource-url', 'https://api.example.test/',
        ],
        { json: true },
      );

      expect(process.exitCode).toBe(0);
      expect(envelope).toEqual({
        ok: true,
        command: 'theme configure',
        exitCode: 0,
        error: null,
        result: {
          channelId: '12',
          themeId: '34',
          version: 'release-1',
          resourceUrl: 'https://api.example.test',
        },
      });
    });
  });
});
