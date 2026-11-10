import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import {
  AppDevCommand,
  createAppDevCommand,
  addTunnelRedirectUris,
  normalizeTunnelUrl,
  isLocalUrl,
} from '../../src/commands/app-dev.js';

let projectDir;
let SESSION_PATH;

function createMemoryFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    exists: vi.fn(async (p) => files.has(p)),
    readFile: vi.fn(async (p) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(p);
    }),
    writeFile: vi.fn(async (p, data) => files.set(p, data)),
    unlink: vi.fn(async (p) => files.delete(p)),
  };
}

const waitFor = async (predicate, timeoutMs = 1000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('app dev helpers', () => {
  it('detects local URLs', () => {
    expect(isLocalUrl('http://localhost:3000/cb')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalUrl('https://myapp.example.com')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });

  it('adds tunnel variants of local redirect URIs', () => {
    expect(
      addTunnelRedirectUris(
        'http://localhost:3000/api/install/callback|https://prod.example.com/cb',
        'https://abc.trycloudflare.com',
      ),
    ).toBe(
      'http://localhost:3000/api/install/callback|https://prod.example.com/cb|https://abc.trycloudflare.com/api/install/callback',
    );
  });

  it('returns null when nothing needs adding', () => {
    expect(addTunnelRedirectUris('', 'https://abc.trycloudflare.com')).toBeNull();
    expect(
      addTunnelRedirectUris(
        'https://prod.example.com/cb',
        'https://abc.trycloudflare.com',
      ),
    ).toBeNull();
    expect(
      addTunnelRedirectUris(
        'http://localhost:3000/cb|https://abc.trycloudflare.com/cb',
        'https://abc.trycloudflare.com',
      ),
    ).toBeNull();
  });

  it('requires https tunnel URLs and normalizes to the origin', () => {
    expect(normalizeTunnelUrl('https://foo.ngrok.app/some/path')).toBe(
      'https://foo.ngrok.app',
    );
    expect(() => normalizeTunnelUrl('http://foo.ngrok.app')).toThrow(/https/);
    expect(() => normalizeTunnelUrl('nope')).toThrow(/Invalid/);
  });
});

describe('AppDevCommand', () => {
  let mockApp;
  let mockAppApi;
  let mockLogger;
  let mockFs;
  let cloudflared;
  let tunnel;
  let resolveTunnelExit;
  let command;

  const draftApp = {
    id: 42,
    name: 'My App',
    is_published: false,
    redirect_uri: 'http://localhost:3000/api/install/callback',
    configuration: {
      redirect_uri: 'http://localhost:3000/api/install/callback',
      http: { base_uri: 'http://localhost:3000' },
      endpoints: { install: '/api/install' },
    },
  };

  let serverDetector;
  let prompt;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'finqu-app-dev-'));
    SESSION_PATH = path.join(projectDir, '.finqu-dev-session.json');
    serverDetector = { findServers: vi.fn().mockResolvedValue([]) };
    prompt = vi.fn();

    mockAppApi = {
      getApp: vi.fn().mockResolvedValue(structuredClone(draftApp)),
      updateApp: vi.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      print: vi.fn(),
      printStatus: vi.fn(),
      printInfo: vi.fn(),
      printSuccess: vi.fn(),
      printError: vi.fn(),
      printVerbose: vi.fn(),
      handleError: vi.fn(),
    };

    mockFs = createMemoryFs();

    tunnel = {
      url: 'https://abc-def.trycloudflare.com',
      exited: new Promise((resolve) => {
        resolveTunnelExit = resolve;
      }),
      stop: vi.fn(async () => resolveTunnelExit(0)),
    };

    cloudflared = {
      ensureBinary: vi.fn().mockResolvedValue('/bin/cloudflared'),
      startQuickTunnel: vi.fn().mockResolvedValue(tunnel),
    };

    mockApp = {
      config: { get: vi.fn((key) => (key === 'appId' ? 42 : undefined)) },
      logger: mockLogger,
      fileSystem: mockFs,
      services: {
        tokenManager: { hasAccessToken: vi.fn().mockReturnValue(true) },
        appApi: mockAppApi,
      },
    };

    command = new AppDevCommand(mockApp, {
      cloudflared,
      isPortOpen: vi.fn().mockResolvedValue(true),
      serverDetector,
      cwd: projectDir,
      interactive: false,
      prompt,
    });
  });

  afterEach(async () => {
    await fsp.rm(projectDir, { recursive: true, force: true });
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  it('has expected metadata', () => {
    expect(command.name).toBe('dev');
    expect(command.group).toBe('app');
    expect(createAppDevCommand(mockApp)).toBeInstanceOf(AppDevCommand);
  });

  it('points the app at the tunnel and restores it on Ctrl+C', async () => {
    const run = command.execute({ port: '3000' });

    await waitFor(() => mockAppApi.updateApp.mock.calls.length === 1);

    expect(cloudflared.startQuickTunnel).toHaveBeenCalledWith({
      binary: '/bin/cloudflared',
      localUrl: 'http://localhost:3000',
    });

    const [appId, update] = mockAppApi.updateApp.mock.calls[0];
    expect(appId).toBe(42);
    expect(update.configuration.http.base_uri).toBe(
      'https://abc-def.trycloudflare.com',
    );
    expect(update.configuration.endpoints).toEqual({ install: '/api/install' });
    expect(update.redirect_uri).toBe(
      'http://localhost:3000/api/install/callback|https://abc-def.trycloudflare.com/api/install/callback',
    );

    // Original state is persisted before the app is modified.
    const saved = JSON.parse(mockFs.files.get(SESSION_PATH));
    expect(saved.appId).toBe(42);
    expect(saved.configuration.http.base_uri).toBe('http://localhost:3000');

    process.emit('SIGINT');
    const result = await run;

    expect(result.success).toBe(true);
    expect(mockAppApi.updateApp).toHaveBeenCalledTimes(2);
    expect(mockAppApi.updateApp.mock.calls[1]).toEqual([
      42,
      {
        configuration: draftApp.configuration,
        redirect_uri: draftApp.redirect_uri,
      },
    ]);
    expect(mockFs.files.has(SESSION_PATH)).toBe(false);
    expect(tunnel.stop).toHaveBeenCalled();
  });

  it('restores and fails if the tunnel dies', async () => {
    const run = command.execute({});
    await waitFor(() => mockAppApi.updateApp.mock.calls.length === 1);

    resolveTunnelExit(1);
    const result = await run;

    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('stopped unexpectedly'),
    );
    expect(mockAppApi.updateApp).toHaveBeenCalledTimes(2);
    expect(mockAppApi.updateApp.mock.calls[1][1].configuration).toEqual(
      draftApp.configuration,
    );
  });

  it('uses --tunnel-url without starting cloudflared', async () => {
    const run = command.execute({ tunnelUrl: 'https://me.ngrok.app/' });
    await waitFor(() => mockAppApi.updateApp.mock.calls.length === 1);

    expect(cloudflared.ensureBinary).not.toHaveBeenCalled();
    expect(
      mockAppApi.updateApp.mock.calls[0][1].configuration.http.base_uri,
    ).toBe('https://me.ngrok.app');

    process.emit('SIGINT');
    await expect(run).resolves.toEqual({ success: true });
  });

  it('refuses to modify a published app', async () => {
    mockAppApi.getApp.mockResolvedValue({ ...draftApp, is_published: true });

    const result = await command.execute({});

    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('is published'),
    );
    expect(cloudflared.startQuickTunnel).not.toHaveBeenCalled();
    expect(mockAppApi.updateApp).not.toHaveBeenCalled();
  });

  it('restores a stale session left by a crashed run', async () => {
    const stale = {
      appId: 42,
      configuration: { http: { base_uri: 'http://localhost:4000' } },
      redirectUri: 'http://localhost:4000/cb',
    };
    mockFs.files.set(SESSION_PATH, JSON.stringify(stale));
    mockAppApi.getApp.mockResolvedValue({ ...draftApp, is_published: true });

    await command.execute({});

    expect(mockAppApi.updateApp).toHaveBeenCalledWith(42, {
      configuration: stale.configuration,
      redirect_uri: stale.redirectUri,
    });
    expect(mockFs.files.has(SESSION_PATH)).toBe(false);
  });

  it('keeps the session file if restoring fails', async () => {
    const run = command.execute({});
    await waitFor(() => mockAppApi.updateApp.mock.calls.length === 1);

    mockAppApi.updateApp.mockRejectedValueOnce(new Error('network down'));
    process.emit('SIGINT');
    await run;

    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to restore'),
      expect.any(Error),
    );
    expect(mockFs.files.has(SESSION_PATH)).toBe(true);
  });

  it('fails when not signed in', async () => {
    mockApp.services.tokenManager.hasAccessToken.mockReturnValue(false);
    const result = await command.execute({});
    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('Not signed in'),
    );
  });

  it('rejects invalid ports', async () => {
    const result = await command.execute({ port: 'abc' });
    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port'),
    );
  });

  describe('local server detection', () => {
    const runUntilUpdated = async (opts = {}) => {
      const run = command.execute(opts);
      await waitFor(() => mockAppApi.updateApp.mock.calls.length >= 1);
      process.emit('SIGINT');
      return run;
    };

    it('tunnels to the dev server running in the project', async () => {
      serverDetector.findServers.mockResolvedValue([
        { port: 5173, host: '[::1]', pid: 10, command: 'node', cwd: projectDir },
      ]);

      await runUntilUpdated();

      expect(serverDetector.findServers).toHaveBeenCalledWith(projectDir);
      expect(cloudflared.startQuickTunnel).toHaveBeenCalledWith({
        binary: '/bin/cloudflared',
        localUrl: 'http://[::1]:5173',
      });
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('on port 5173 (pid 10)'),
      );
    });

    it('lets the user pick when several servers run', async () => {
      serverDetector.findServers.mockResolvedValue([
        { port: 3000, host: 'localhost', pid: 1, command: 'node', cwd: projectDir },
        { port: 6006, host: 'localhost', pid: 2, command: 'node', cwd: projectDir },
      ]);
      command.deps.interactive = true;
      prompt.mockResolvedValue({ port: 6006 });

      await runUntilUpdated();

      expect(prompt).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'select' }),
      );
      expect(cloudflared.startQuickTunnel.mock.calls[0][0].localUrl).toBe(
        'http://localhost:6006',
      );
    });

    it('falls back to the framework default port', async () => {
      await fsp.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ devDependencies: { vite: '6.0.0' } }),
      );
      command.deps.isPortOpen.mockResolvedValue(false);

      await runUntilUpdated();

      expect(cloudflared.startQuickTunnel.mock.calls[0][0].localUrl).toBe(
        'http://localhost:5173',
      );
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining('using port 5173 (Vite default)'),
      );
    });

    it('respects an explicit --port', async () => {
      serverDetector.findServers.mockResolvedValue([
        { port: 3000, host: 'localhost', pid: 1, command: 'node', cwd: projectDir },
      ]);

      await runUntilUpdated({ port: '4000' });

      expect(cloudflared.startQuickTunnel.mock.calls[0][0].localUrl).toBe(
        'http://localhost:4000',
      );
    });
  });

  describe('framework config', () => {
    const nextConfig = `const nextConfig = {\n  reactStrictMode: true,\n};\n\nmodule.exports = nextConfig;\n`;

    beforeEach(async () => {
      await fsp.writeFile(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '15.0.0' } }),
      );
      await fsp.writeFile(path.join(projectDir, 'next.config.js'), nextConfig);
    });

    const runUntilUpdated = async () => {
      const run = command.execute({});
      await waitFor(() => mockAppApi.updateApp.mock.calls.length >= 1);
      process.emit('SIGINT');
      return run;
    };

    it('adds the tunnel domain to allowedDevOrigins after confirmation', async () => {
      command.deps.interactive = true;
      prompt.mockResolvedValue({ ok: true });

      await runUntilUpdated();

      expect(prompt).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'confirm' }),
      );
      const updated = await fsp.readFile(
        path.join(projectDir, 'next.config.js'),
        'utf8',
      );
      expect(updated).toContain(`allowedDevOrigins: ['*.trycloudflare.com'],`);
      expect(updated).toContain('reactStrictMode: true');
    });

    it('prints instructions instead of editing when not interactive', async () => {
      await runUntilUpdated();

      expect(prompt).not.toHaveBeenCalled();
      expect(
        await fsp.readFile(path.join(projectDir, 'next.config.js'), 'utf8'),
      ).toBe(nextConfig);
      expect(mockLogger.printInfo).toHaveBeenCalledWith(
        expect.stringContaining(`allowedDevOrigins: ['*.trycloudflare.com'],`),
      );
    });

    it('does nothing when the domain is already allowed', async () => {
      await fsp.writeFile(
        path.join(projectDir, 'next.config.js'),
        `module.exports = { allowedDevOrigins: ['*.trycloudflare.com'] };\n`,
      );
      command.deps.interactive = true;

      await runUntilUpdated();

      expect(prompt).not.toHaveBeenCalled();
    });
  });
});
