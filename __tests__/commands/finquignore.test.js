import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import watch from 'watch';
import { createCommandRegistry } from '../../src/commands/index.js';
import { DeployCommand } from '../../src/commands/deploy.js';
import { DownloadCommand } from '../../src/commands/download.js';
import { WatchCommand } from '../../src/commands/watch.js';
import { Logger } from '../../src/core/logger.js';
import { ThemeWatcher } from '../../src/core/theme-watcher.js';
import { createFileSystem } from '../../src/io/fileSystem.js';
import { PATH_VERDICT, loadThemeIgnore } from '../../src/io/themeIgnore.js';
import {
  pullSettingsData,
  syncPublicAssets,
} from '../../src/services/themeSync.js';

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

const THEME_FILES = {
  'layout/theme.liquid': 'layout',
  'templates/index.liquid': 'index',
  'assets/app.js': 'app',
  'assets/app.js.map': 'map',
  'assets/vendor/lib.js': 'lib',
  'assets/vendor/keep.js': 'keep',
  'config/settings_data.json': '{}',
  '.envrc': 'export FIXTURE=1',
  '.pypirc': '[distutils]',
  '.vercel/project.json': '{}',
  '.env': 'FINQU_ACCESS_TOKEN=fixture-token',
};

describe('.finquignore', () => {
  let themeDir;
  let themeApi;

  const write = (name, content = 'x') => {
    fs.mkdirSync(path.dirname(path.join(themeDir, name)), { recursive: true });
    fs.writeFileSync(path.join(themeDir, name), content);
  };
  const writeIgnore = (content) => write('.finquignore', content);
  const uploaded = () =>
    themeApi.uploadAsset.mock.calls.map((call) => call[0]).sort();
  const removed = () =>
    themeApi.removeAsset.mock.calls.map((call) => call[0]).sort();
  const downloaded = () =>
    themeApi.downloadAsset.mock.calls.map((call) => call[0]).sort();

  function createApp(values = {}) {
    const config = {
      get: (key, fallback) =>
        key in { themeDir, ...values } ? { themeDir, ...values }[key] : fallback,
      configFilePath: path.join(themeDir, 'unrelated.conf'),
    };
    return {
      services: { themeApi },
      logger,
      fileSystem: createFileSystem(),
      config,
    };
  }
  const deploy = (sources = [], options = {}) =>
    new DeployCommand(createApp()).execute(sources, options);
  const download = (sources = []) =>
    new DownloadCommand(createApp()).execute(sources);

  beforeEach(() => {
    vi.clearAllMocks();
    themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finqu-finquignore-'));
    themeApi = {
      uploadAsset: vi.fn().mockResolvedValue(true),
      removeAsset: vi.fn().mockResolvedValue(undefined),
      compileAssets: vi.fn().mockResolvedValue(undefined),
      getAssets: vi.fn().mockResolvedValue([]),
      downloadAsset: vi.fn().mockResolvedValue(true),
    };
    for (const [name, content] of Object.entries(THEME_FILES)) {
      write(name, content);
    }
  });

  afterEach(() => {
    fs.rmSync(themeDir, { recursive: true, force: true });
  });

  describe('deploy', () => {
    it('uploads every non-excluded file when there is no .finquignore', async () => {
      const result = await deploy();

      expect(uploaded()).toEqual([
        'assets/app.js',
        'assets/app.js.map',
        'assets/vendor/keep.js',
        'assets/vendor/lib.js',
        'layout/theme.liquid',
        'templates/index.liquid',
      ]);
      expect(result.ignored).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('does not upload ignored files and lists them in ignored', async () => {
      writeIgnore('# build output\n*.map\n\nassets/vendor/\n');

      const result = await deploy();

      expect(uploaded()).toEqual([
        'assets/app.js',
        'layout/theme.liquid',
        'templates/index.liquid',
      ]);
      expect([...result.ignored].sort()).toEqual([
        'assets/app.js.map',
        'assets/vendor/keep.js',
        'assets/vendor/lib.js',
      ]);
      expect(result.skipped).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('lets ! re-include an ordinary file', async () => {
      writeIgnore('assets/vendor/*\n!assets/vendor/keep.js\n');

      const result = await deploy();

      expect(uploaded()).toContain('assets/vendor/keep.js');
      expect(uploaded()).not.toContain('assets/vendor/lib.js');
      expect(result.ignored).toEqual(['assets/vendor/lib.js']);
    });

    it('anchors a leading-slash pattern to the theme root', async () => {
      write('app.js', 'root');
      writeIgnore('/app.js\n');

      await deploy();

      expect(uploaded()).not.toContain('app.js');
      expect(uploaded()).toContain('assets/app.js');
    });

    it('never uploads .finquignore itself', async () => {
      writeIgnore('*.map\n');

      const result = await deploy();

      expect(uploaded()).not.toContain('.finquignore');
      expect(result.ignored).not.toContain('.finquignore');
      expect(result.skipped).toEqual([]);
    });

    it('refuses .finquignore named on the command line as an excluded file', async () => {
      writeIgnore('*.map\n');

      const result = await deploy(['.finquignore']);

      expect(uploaded()).toEqual([]);
      expect(result.skipped).toEqual([
        { path: '.finquignore', reason: 'excluded' },
      ]);
    });

    it('cannot be told to upload root dotfiles, .env or .git', async () => {
      write('.git/config', '[core]');
      write('node_modules/pkg/index.js', 'x');
      writeIgnore('!.envrc\n!.pypirc\n!.vercel/\n!.env\n!.git/\n!node_modules/\n!.*\n');

      const result = await deploy();

      expect(uploaded().filter((p) => p.startsWith('.'))).toEqual([]);
      expect(uploaded().join()).not.toMatch(/node_modules|\.git|\.env/);
      expect(result.skipped).toEqual([]);
      expect(result.success).toBe(true);
    });

    it('excludes root dotfiles even without a .finquignore', async () => {
      await deploy();

      expect(uploaded()).not.toContain('.envrc');
      expect(uploaded()).not.toContain('.pypirc');
      expect(uploaded()).not.toContain('.vercel/project.json');
    });

    it.each(['.envrc', '.pypirc', '.vercel/project.json'])(
      'reports root dotfile %s named on the command line as skipped, not ignored',
      async (name) => {
        writeIgnore(`!${name}\n`);

        const result = await deploy([name, 'layout/theme.liquid']);

        expect(uploaded()).toEqual(['layout/theme.liquid']);
        expect(result.skipped).toEqual([{ path: name, reason: 'excluded' }]);
        expect(result.ignored).toEqual([]);
      },
    );

    it('reports a named file that only .finquignore matches as ignored', async () => {
      writeIgnore('*.map\n');

      const result = await deploy(['assets/app.js.map', 'assets/app.js']);

      expect(uploaded()).toEqual(['assets/app.js']);
      expect(result.ignored).toEqual(['assets/app.js.map']);
      expect(result.skipped).toEqual([]);
    });

    it('matches a named file spelled with ./', async () => {
      writeIgnore('*.map\n');

      const result = await deploy(['./assets/app.js.map']);

      expect(uploaded()).toEqual([]);
      expect(result.ignored).toEqual(['./assets/app.js.map']);
    });

    it('applies the rules to the files of a named directory', async () => {
      writeIgnore('*.map\nassets/vendor/\n');

      const result = await deploy(['assets']);

      expect(uploaded()).toEqual(['assets/app.js']);
      expect([...result.ignored].sort()).toEqual([
        'assets/app.js.map',
        'assets/vendor/keep.js',
        'assets/vendor/lib.js',
      ]);
    });

    it('refuses a symlink that .finquignore does not mention, as before', async () => {
      writeIgnore('*.map\n');
      fs.symlinkSync(
        path.join(themeDir, 'layout', 'theme.liquid'),
        path.join(themeDir, 'layout', 'link.liquid'),
      );

      const result = await deploy(['layout/link.liquid']);

      expect(uploaded()).toEqual([]);
      expect(result.skipped).toEqual([
        { path: 'layout/link.liquid', reason: 'symlink' },
      ]);
      expect(result.ignored).toEqual([]);
    });

    it('does not push settings_data.json that .finquignore matches', async () => {
      writeIgnore('config/settings_data.json\n');

      const result = await deploy([], { configPush: true });

      expect(uploaded()).not.toContain('config/settings_data.json');
      expect(result.ignored).toEqual(['config/settings_data.json']);
    });

    it('still pushes settings_data.json with --config-push when not ignored', async () => {
      writeIgnore('*.map\n');

      await deploy([], { configPush: true });

      expect(uploaded()).toContain('config/settings_data.json');
    });

    it('fails without uploading anything when .finquignore cannot be read', async () => {
      fs.mkdirSync(path.join(themeDir, '.finquignore'));

      const result = await deploy();

      expect(result.success).toBe(false);
      expect(themeApi.uploadAsset).not.toHaveBeenCalled();
    });

    it('prints a count of ignored files and names them in the verbose list', async () => {
      writeIgnore('*.map\n');

      await deploy();

      expect(logger.printInfo).toHaveBeenCalledWith(
        'Ignored 1 file(s) matched by .finquignore.',
      );
      expect(logger.printVerboseList).toHaveBeenCalledWith('Ignored files:', [
        'assets/app.js.map',
      ]);
    });

    it('prints no ignored line when nothing is ignored', async () => {
      await deploy();

      const infos = logger.printInfo.mock.calls.map(([message]) => message);
      expect(infos.join('\n')).not.toMatch(/Ignored/);
    });
  });

  describe('deploy --clean', () => {
    const remote = (...paths) =>
      themeApi.getAssets.mockResolvedValue(
        paths.map((p) => ({ type: 'file', path: p })),
      );

    it('never deletes a remote file that .finquignore matches', async () => {
      writeIgnore('*.map\nassets/vendor/\nlegacy/\n');
      remote(
        'layout/theme.liquid',
        'assets/old.map',
        'assets/vendor/gone.js',
        'legacy/page.liquid',
        'snippets/stale.liquid',
      );

      await deploy([], { clean: true });

      expect(removed()).toEqual(['snippets/stale.liquid']);
    });

    it('never deletes a remote file the safety list matches, even with a ! rule', async () => {
      writeIgnore('!.envrc\n!.env\n!.git/config\n');
      remote(
        '.envrc',
        '.env',
        '.pypirc',
        '.vercel/project.json',
        '.git/config',
        'node_modules/pkg/index.js',
        'deploy.key',
        'snippets/stale.liquid',
      );

      await deploy([], { clean: true });

      expect(removed()).toEqual(['snippets/stale.liquid']);
    });

    it('protects a remote file matched by a directory rule at any depth', async () => {
      writeIgnore('vendor/\n');
      remote('assets/vendor/x.js', 'vendor/y.js', 'assets/stale.js');

      await deploy([], { clean: true });

      expect(removed()).toEqual(['assets/stale.js']);
    });

    it('still deletes remote files that nothing protects', async () => {
      writeIgnore('*.map\n');
      remote('layout/theme.liquid', 'snippets/stale.liquid', 'assets/a.css');

      await deploy([], { clean: true });

      expect(removed()).toEqual(['assets/a.css', 'snippets/stale.liquid']);
    });

    it('lets ! re-include a remote file so --clean may delete it', async () => {
      writeIgnore('legacy/*\n!legacy/keep.liquid\n');
      remote('legacy/keep.liquid', 'legacy/other.liquid');

      await deploy([], { clean: true });

      expect(removed()).toEqual(['legacy/keep.liquid']);
    });

    it('with no .finquignore, protects root dotfiles and the safety list', async () => {
      remote('.envrc', '.pypirc', '.vercel/project.json', 'snippets/stale.liquid');

      await deploy([], { clean: true });

      expect(removed()).toEqual(['snippets/stale.liquid']);
    });
  });

  describe('download', () => {
    const remote = (files, dirs = []) =>
      themeApi.getAssets.mockResolvedValue([
        ...dirs.map((p) => ({ type: 'dir', path: p })),
        ...files.map((p) => ({ type: 'file', path: p })),
      ]);

    it('never writes an ignored path and reports it as ignored', async () => {
      writeIgnore('*.map\nbuild/\n');
      remote(
        ['templates/index.liquid', 'assets/app.js.map', 'build/out.js'],
        ['build'],
      );

      const result = await download();

      expect(downloaded()).toEqual(['templates/index.liquid']);
      expect([...result.ignored].sort()).toEqual([
        'assets/app.js.map',
        'build/out.js',
      ]);
      expect(fs.existsSync(path.join(themeDir, 'build'))).toBe(false);
      expect(result.success).toBe(true);
      expect(result.skipped).toEqual([]);
    });

    it('does not write safety-list paths and does not fail the run', async () => {
      writeIgnore('!.env\n!.envrc\n');
      remote(['.env', '.envrc', '.git/config', '../escape.liquid', 'layout/a.liquid']);

      const result = await download();

      expect(downloaded()).toEqual(['layout/a.liquid']);
      expect([...result.ignored].sort()).toEqual([
        '../escape.liquid',
        '.env',
        '.envrc',
        '.git/config',
      ]);
      expect(result.success).toBe(true);
    });

    it('refuses an ignored path named on the command line', async () => {
      writeIgnore('*.map\n');

      const result = await download(['assets/app.js.map', 'assets/app.js']);

      expect(downloaded()).toEqual(['assets/app.js']);
      expect(result.ignored).toEqual(['assets/app.js.map']);
    });

    it('downloads everything when there is no .finquignore', async () => {
      remote(['assets/app.js.map', 'build/out.js']);

      const result = await download();

      expect(downloaded()).toEqual(['assets/app.js.map', 'build/out.js']);
      expect(result.ignored).toEqual([]);
    });

    it('prints a count of ignored files', async () => {
      writeIgnore('*.map\n');
      remote(['assets/app.js.map', 'a.liquid']);

      await download();

      expect(logger.printInfo).toHaveBeenCalledWith(
        'Ignored 1 file(s) (.finquignore and built-in exclusions).',
      );
    });

    it('fails without writing when .finquignore cannot be read', async () => {
      fs.mkdirSync(path.join(themeDir, '.finquignore'));
      remote(['a.liquid']);

      const result = await download();

      expect(result.success).toBe(false);
      expect(themeApi.downloadAsset).not.toHaveBeenCalled();
    });
  });

  describe('deploy --config-pull and --assets-pull', () => {
    it('does not write an ignored settings_data.json', async () => {
      writeIgnore('config/settings_data.json\n');
      const fileSystem = createFileSystem();
      const themeIgnore = await loadThemeIgnore(fileSystem, themeDir);

      const result = await pullSettingsData({
        themeApi,
        fileSystem,
        themeDir,
        logger,
        themeIgnore,
      });

      expect(themeApi.downloadAsset).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, skipped: true, ignored: true });
    });

    it('neither writes nor prunes ignored public/ files', async () => {
      writeIgnore('public/skip-*.css\n');
      write('public/skip-local.css', 'local only');
      write('public/stale.css', 'stale');
      themeApi.getAssets.mockResolvedValue([
        { type: 'file', path: 'public/app.css' },
        { type: 'file', path: 'public/skip-remote.css' },
      ]);
      const fileSystem = createFileSystem();
      const themeIgnore = await loadThemeIgnore(fileSystem, themeDir);

      const result = await syncPublicAssets({
        themeApi,
        fileSystem,
        themeDir,
        logger,
        themeIgnore,
      });

      expect(downloaded()).toEqual(['public/app.css']);
      expect(result.ignored).toEqual(['public/skip-remote.css']);
      expect(fs.existsSync(path.join(themeDir, 'public/skip-local.css'))).toBe(true);
      expect(fs.existsSync(path.join(themeDir, 'public/stale.css'))).toBe(false);
    });
  });

  describe('machine mode', () => {
    let stdout;
    let processExit;

    beforeEach(() => {
      process.exitCode = undefined;
      stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      processExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    });

    afterEach(() => {
      process.exitCode = undefined;
      processExit.mockRestore();
      stdout.mockRestore();
    });

    async function run(args, { json = true } = {}) {
      const values = { themeDir, nonInteractive: true, json };
      const machineLogger = new Logger();
      machineLogger.setMachineOutput(json);
      machineLogger.setExitOnFatal(false);
      const registry = createCommandRegistry();
      registry.setApp({
        config: {
          get: (key, fallback = null) => (key in values ? values[key] : fallback),
          set: vi.fn(),
          remove: vi.fn(),
          configFilePath: path.join(themeDir, 'unrelated.conf'),
        },
        logger: machineLogger,
        fileSystem: createFileSystem(),
        services: { themeApi },
      });
      const program = new Command();
      program.exitOverride();
      registry.registerCommands(program);
      await program.parseAsync(['node', 'finqu', ...args]);
      const line = stdout.mock.calls
        .map(([chunk]) => String(chunk))
        .find((chunk) => chunk.startsWith('{"ok"'));
      return line ? JSON.parse(line) : null;
    }

    it('lists ignored files in a separate array and exits 0', async () => {
      writeIgnore('*.map\nassets/vendor/\n');

      const envelope = await run(['theme', 'deploy']);

      expect(process.exitCode).toBe(0);
      expect(envelope.ok).toBe(true);
      expect(envelope.exitCode).toBe(0);
      expect(envelope.error).toBeNull();
      expect([...envelope.result.ignored].sort()).toEqual([
        'assets/app.js.map',
        'assets/vendor/keep.js',
        'assets/vendor/lib.js',
      ]);
      expect(envelope.result.skipped).toEqual([]);
      expect(envelope.result.failed).toEqual([]);
      expect(envelope.result.uploaded).not.toContain('assets/app.js.map');
    });

    it('reports an empty ignored array without .finquignore', async () => {
      const envelope = await run(['theme', 'deploy']);

      expect(process.exitCode).toBe(0);
      expect(envelope.result.ignored).toEqual([]);
    });

    it('exits 0 when the only named file is ignored', async () => {
      writeIgnore('*.map\n');

      const envelope = await run(['theme', 'deploy', 'assets/app.js.map']);

      expect(process.exitCode).toBe(0);
      expect(envelope.result.ignored).toEqual(['assets/app.js.map']);
      expect(envelope.result.skipped).toEqual([]);
    });

    it('still exits 1 and lists a refused credential file in skipped', async () => {
      writeIgnore('*.map\n!.env\n');

      const envelope = await run([
        'theme',
        'deploy',
        '.env',
        'assets/app.js.map',
        'assets/app.js',
      ]);

      expect(process.exitCode).toBe(1);
      expect(envelope.result.skipped).toEqual([
        { path: '.env', reason: 'excluded' },
      ]);
      expect(envelope.result.ignored).toEqual(['assets/app.js.map']);
      expect(envelope.error).toEqual({ code: 'INCOMPLETE', message: '1 skipped' });
    });

    it('still exits 1 for a symlink and keeps ignored files separate', async () => {
      writeIgnore('*.map\n');
      fs.symlinkSync(
        path.join(themeDir, 'layout', 'theme.liquid'),
        path.join(themeDir, 'layout', 'link.liquid'),
      );

      const envelope = await run([
        'theme',
        'deploy',
        'layout/link.liquid',
        'assets/app.js.map',
      ]);

      expect(process.exitCode).toBe(1);
      expect(envelope.result.skipped).toEqual([
        { path: 'layout/link.liquid', reason: 'symlink' },
      ]);
      expect(envelope.result.ignored).toEqual(['assets/app.js.map']);
    });

    it('lists ignored files for theme download and exits 0', async () => {
      writeIgnore('*.map\n');
      themeApi.getAssets.mockResolvedValue([
        { type: 'file', path: 'assets/app.js.map' },
        { type: 'file', path: 'layout/theme.liquid' },
      ]);

      const envelope = await run(['theme', 'download']);

      expect(process.exitCode).toBe(0);
      expect(envelope.result.downloaded).toEqual(['layout/theme.liquid']);
      expect(envelope.result.ignored).toEqual(['assets/app.js.map']);
      expect(envelope.result.skipped).toEqual([]);
    });

    it('prints the ignored count on stderr, never on stdout', async () => {
      writeIgnore('*.map\n');

      await run(['theme', 'deploy']);

      const stdoutText = stdout.mock.calls.map(([chunk]) => String(chunk));
      expect(stdoutText.every((chunk) => chunk.startsWith('{"ok"'))).toBe(true);
    });
  });

  describe('watch', () => {
    const fileStat = { isDirectory: () => false, nlink: 1 };
    let watcher;

    async function createWatcher(extraPatterns = []) {
      const fileSystem = createFileSystem();
      const themeIgnore = await loadThemeIgnore(
        fileSystem,
        themeDir,
        extraPatterns,
      );
      watcher = new ThemeWatcher(
        themeDir,
        { uploadAsset: vi.fn(), removeAsset: vi.fn(), compileAssets: vi.fn() },
        fileSystem,
        logger,
        1000,
        undefined,
        themeIgnore,
      );
      watcher._processQueuesDebounced = vi.fn();
      return watcher;
    }
    const change = (name, prev = null, curr = fileStat) =>
      watcher._handleFileChange(path.join(themeDir, name), curr, prev);

    afterEach(() => {
      watcher?.stop();
      watch.unwatchTree(themeDir);
      watcher = undefined;
    });

    it('queues allowed files and drops ignored ones', async () => {
      writeIgnore('*.map\nassets/vendor/\n');
      await createWatcher();

      change('assets/app.js');
      change('assets/app.js.map');
      change('assets/vendor/lib.js');

      expect([...watcher.uploadQueue]).toEqual(['assets/app.js']);
    });

    it('does not queue the removal of an ignored file', async () => {
      writeIgnore('*.map\n');
      await createWatcher();

      change('assets/app.js.map', fileStat, { ...fileStat, nlink: 0 });
      change('assets/app.js', fileStat, { ...fileStat, nlink: 0 });

      expect([...watcher.deleteQueue]).toEqual(['assets/app.js']);
    });

    it('never queues .finquignore, root dotfiles or .env, whatever the rules say', async () => {
      writeIgnore('!.envrc\n!.env\n!.finquignore\n!.*\n');
      await createWatcher();

      change('.finquignore');
      change('.envrc');
      change('.pypirc');
      change('.vercel/project.json');
      change('.env');
      change('.git/config');

      expect([...watcher.uploadQueue]).toEqual([]);
    });

    it('works without a .finquignore', async () => {
      await createWatcher();

      change('assets/app.js.map');
      change('.envrc');

      expect([...watcher.uploadQueue]).toEqual(['assets/app.js.map']);
    });

    it('reloads the rules when asked and drops queued files that are now ignored', async () => {
      await createWatcher();
      change('assets/app.js.map');
      change('assets/app.js');
      expect([...watcher.uploadQueue].sort()).toEqual([
        'assets/app.js',
        'assets/app.js.map',
      ]);

      writeIgnore('*.map\n');
      await watcher._reloadIgnore();

      expect([...watcher.uploadQueue]).toEqual(['assets/app.js']);
      change('assets/other.map');
      expect([...watcher.uploadQueue]).toEqual(['assets/app.js']);

      fs.rmSync(path.join(themeDir, '.finquignore'));
      await watcher._reloadIgnore();
      change('assets/other.map');
      expect([...watcher.uploadQueue].sort()).toEqual([
        'assets/app.js',
        'assets/other.map',
      ]);
    });

    it('keeps the previous rules when the reload fails', async () => {
      writeIgnore('*.map\n');
      await createWatcher();
      fs.rmSync(path.join(themeDir, '.finquignore'));
      fs.mkdirSync(path.join(themeDir, '.finquignore'));

      await watcher._reloadIgnore();

      expect(logger.printError).toHaveBeenCalledWith(
        'Could not reload .finquignore; keeping the previous rules',
        expect.stringContaining('Cannot read .finquignore'),
      );
      change('assets/app.js.map');
      expect([...watcher.uploadQueue]).toEqual([]);
    });

    it('re-reads .finquignore on disk when the file itself changes', async () => {
      writeIgnore('*.map\n');
      await createWatcher();
      watcher.start();

      change('assets/app.js.map');
      expect([...watcher.uploadQueue]).toEqual([]);

      // Let the poller take its first stat of the file before changing it.
      await new Promise((resolve) => setTimeout(resolve, 800));
      writeIgnore('# nothing is ignored any more, and this line is longer\n');
      await vi.waitFor(
        () =>
          expect(logger.printInfo).toHaveBeenCalledWith('Reloaded .finquignore'),
        { timeout: 8000, interval: 100 },
      );

      change('assets/app.js.map');
      expect([...watcher.uploadQueue]).toEqual(['assets/app.js.map']);
    }, 10000);

    it('applies watch --ignore on top of the file', async () => {
      writeIgnore('*.map\n');
      const spy = vi
        .spyOn(ThemeWatcher.prototype, 'start')
        .mockImplementation(function capture() {
          watcher = this;
        });
      try {
        const result = await new WatchCommand(createApp()).execute({
          ignore: ['*.tmp', 'scratch/'],
        });
        expect(result).toEqual({ success: true });
      } finally {
        spy.mockRestore();
      }
      watcher._processQueuesDebounced = vi.fn();

      change('assets/app.js.map');
      change('assets/a.tmp');
      change('scratch/a.liquid');
      change('assets/app.js');

      expect([...watcher.uploadQueue]).toEqual(['assets/app.js']);
    });

    it('keeps working without watch --ignore', async () => {
      writeIgnore('*.map\n');
      const spy = vi
        .spyOn(ThemeWatcher.prototype, 'start')
        .mockImplementation(function capture() {
          watcher = this;
        });
      try {
        await new WatchCommand(createApp()).execute({});
      } finally {
        spy.mockRestore();
      }
      watcher._processQueuesDebounced = vi.fn();

      change('assets/app.js.map');
      change('assets/a.tmp');

      expect([...watcher.uploadQueue]).toEqual(['assets/a.tmp']);
    });
  });

  it('classifies with the same verdicts the commands use', async () => {
    writeIgnore('*.map\n');
    const themeIgnore = await loadThemeIgnore(createFileSystem(), themeDir);

    expect(themeIgnore.classify('a.map')).toBe(PATH_VERDICT.IGNORED);
    expect(themeIgnore.classify('.env')).toBe(PATH_VERDICT.EXCLUDED);
    expect(themeIgnore.classify('a.liquid')).toBe(PATH_VERDICT.ALLOWED);
  });
});
