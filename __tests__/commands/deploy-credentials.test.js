import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeployCommand } from '../../src/commands/deploy.js';
import { createFileSystem } from '../../src/io/fileSystem.js';
import { createCommandRegistry } from '../../src/commands/index.js';

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

const FIXTURE_FILES = {
  'layout/theme.liquid': 'layout',
  '.env': 'FINQU_ACCESS_TOKEN=fixture-token',
  '.env.local': 'FINQU_REFRESH_TOKEN=fixture-refresh',
  '.env.production': 'FINQU_API_CLIENT_SECRET=fixture-secret',
  '.ENV': 'upper case',
  '.finqu-webhooks.json': '[]',
  '.finqu-dev-session.json': '{}',
  'creds.conf': 'FINQU_ACCESS_TOKEN=fixture-token',
  '--clean': 'a file named like an option',
};

const CREDENTIAL_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.ENV',
  '.finqu-webhooks.json',
  '.finqu-dev-session.json',
  'creds.conf',
];

describe('deploy never uploads credential files', () => {
  let themeDir;
  let themeApi;
  let configFilePath;

  function createCommand() {
    const values = { themeDir };
    const config = {
      get: (key, fallback) => (key in values ? values[key] : fallback),
      configFilePath,
    };
    themeApi = {
      uploadAsset: vi.fn().mockResolvedValue(true),
      removeAsset: vi.fn().mockResolvedValue(undefined),
      compileAssets: vi.fn().mockResolvedValue(undefined),
      getAssets: vi.fn().mockResolvedValue([]),
    };
    return new DeployCommand({
      services: { themeApi },
      logger,
      fileSystem: createFileSystem(),
      config,
    });
  }

  const uploaded = () => themeApi.uploadAsset.mock.calls.map((call) => call[0]).sort();

  beforeEach(() => {
    vi.clearAllMocks();
    themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finqu-deploy-'));
    configFilePath = path.join(themeDir, 'creds.conf');
    for (const [name, content] of Object.entries(FIXTURE_FILES)) {
      fs.mkdirSync(path.dirname(path.join(themeDir, name)), { recursive: true });
      fs.writeFileSync(path.join(themeDir, name), content);
    }
  });

  afterEach(() => {
    fs.rmSync(themeDir, { recursive: true, force: true });
  });

  it('skips .env, .env.* and the config file when deploying everything', async () => {
    const result = await createCommand().execute([], {});

    expect(uploaded()).toEqual(['--clean', 'layout/theme.liquid']);
    expect(result.success).toBe(true);
  });

  it.each(CREDENTIAL_FILES)('refuses %s named on the command line and reports it as skipped', async (name) => {
    const result = await createCommand().execute([name, 'layout/theme.liquid'], {});

    expect(uploaded()).toEqual(['layout/theme.liquid']);
    expect(result.skipped).toEqual([{ path: name, reason: 'excluded' }]);
  });

  it('refuses a credential file named through a ./ prefix', async () => {
    const result = await createCommand().execute(['./.env'], {});

    expect(uploaded()).toEqual([]);
    expect(result.skipped).toEqual([{ path: './.env', reason: 'excluded' }]);
  });

  it('refuses the config file reached through a different spelling', async () => {
    const result = await createCommand().execute(['layout/../creds.conf'], {});

    expect(uploaded()).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it('skips credential files inside a named directory', async () => {
    fs.mkdirSync(path.join(themeDir, 'sub'));
    fs.writeFileSync(path.join(themeDir, 'sub', '.env'), 'x');
    fs.writeFileSync(path.join(themeDir, 'sub', 'a.liquid'), 'a');

    await createCommand().execute(['sub'], {});

    expect(uploaded()).toEqual(['sub/a.liquid']);
  });
});

describe('deploy paths after --', () => {
  it('reads a file named --clean as a path, not as the --clean option', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const registry = createCommandRegistry();
    registry.setApp({
      config: { get: () => undefined },
      logger,
      fileSystem: {},
      services: {},
    });
    registry.commandInstances.deploy.execute = execute;

    const program = new Command();
    registry.registerCommands(program);
    await program.parseAsync(['theme', 'deploy', '--', '--clean', '--config-push'], { from: 'user' });

    const [sources, options] = execute.mock.calls[0];
    expect(sources).toEqual(['--clean', '--config-push']);
    expect(options.clean).toBeUndefined();
    expect(options.configPush).toBeUndefined();
  });

  it('still reads --clean before -- as the option', async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    const registry = createCommandRegistry();
    registry.setApp({
      config: { get: () => undefined },
      logger,
      fileSystem: {},
      services: {},
    });
    registry.commandInstances.deploy.execute = execute;

    const program = new Command();
    registry.registerCommands(program);
    await program.parseAsync(['theme', 'deploy', '--clean', '--', 'a.liquid'], { from: 'user' });

    const [sources, options] = execute.mock.calls[0];
    expect(sources).toEqual(['a.liquid']);
    expect(options.clean).toBe(true);
  });
});
