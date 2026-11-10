import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import {
  AppDevCommand,
  createAppDevCommand,
  addTunnelRedirectUris,
  removeTunnelRedirectUris,
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

// JSON Merge Patch, as the server applies a PATCH to the configuration.
function mergePatch(target, patch) {
  const isObject = (v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v);
  const out = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (isObject(value))
      out[key] = mergePatch(isObject(out[key]) ? out[key] : {}, value);
    else out[key] = value;
  }
  return out;
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

  it('removes only the tunnel redirect URIs', () => {
    expect(
      removeTunnelRedirectUris(
        'http://localhost:3000/cb|https://abc.trycloudflare.com/cb|https://prod.example.com/cb',
        'https://abc.trycloudflare.com',
      ),
    ).toBe('http://localhost:3000/cb|https://prod.example.com/cb');
    expect(
      removeTunnelRedirectUris(
        'https://abc.trycloudflare.com/cb',
        'https://abc.trycloudflare.com',
      ),
    ).toBe('');
    expect(
      removeTunnelRedirectUris(
        'http://localhost:3000/cb',
        'https://abc.trycloudflare.com',
      ),
    ).toBeNull();
    expect(
      removeTunnelRedirectUris(null, 'https://abc.trycloudflare.com'),
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
  let serverApp;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'finqu-app-dev-'));
    SESSION_PATH = path.join(projectDir, '.finqu-dev-session.json');
    serverDetector = { findServers: vi.fn().mockResolvedValue([]) };
    prompt = vi.fn();

    // A fake server holding the app, so tests can check what it ends up as.
    serverApp = structuredClone(draftApp);
    mockAppApi = {
      getApp: vi.fn(async () => structuredClone(serverApp)),
      patchApp: vi.fn(async (id, data) => {
        if (data.configuration) {
          serverApp.configuration = mergePatch(
            serverApp.configuration,
            data.configuration,
          );
        }
        if (data.redirect_uri !== undefined) {
          serverApp.redirect_uri = data.redirect_uri;
        }
      }),
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

    await waitFor(() => mockAppApi.patchApp.mock.calls.length === 1);

    expect(cloudflared.startQuickTunnel).toHaveBeenCalledWith({
      binary: '/bin/cloudflared',
      localUrl: 'http://localhost:3000',
    });

    // Only the base URI and redirect URIs are sent, never the configuration
    // that was read.
    expect(mockAppApi.patchApp.mock.calls[0]).toEqual([
      42,
      {
        configuration: {
          http: { base_uri: 'https://abc-def.trycloudflare.com' },
        },
        redirect_uri:
          'http://localhost:3000/api/install/callback|https://abc-def.trycloudflare.com/api/install/callback',
      },
    ]);

    // What to undo is saved before the app is changed.
    expect(JSON.parse(mockFs.files.get(SESSION_PATH))).toEqual({
      appId: 42,
      startedAt: expect.any(String),
      tunnelUrl: 'https://abc-def.trycloudflare.com',
      baseUri: 'http://localhost:3000',
    });

    process.emit('SIGINT');
    const result = await run;

    expect(result.success).toBe(true);
    expect(mockAppApi.patchApp).toHaveBeenCalledTimes(2);
    expect(mockAppApi.patchApp.mock.calls[1]).toEqual([
      42,
      {
        configuration: { http: { base_uri: 'http://localhost:3000' } },
        redirect_uri: 'http://localhost:3000/api/install/callback',
      },
    ]);
    expect(serverApp).toEqual(draftApp);
    expect(mockAppApi.updateApp).not.toHaveBeenCalled();
    expect(mockFs.files.has(SESSION_PATH)).toBe(false);
    expect(tunnel.stop).toHaveBeenCalled();
  });

  it('keeps settings changed while it runs', async () => {
    const run = command.execute({});
    await waitFor(() => mockAppApi.patchApp.mock.calls.length === 1);

    // Someone edits the app in the dashboard during the session.
    serverApp.configuration.http.base_uri = 'https://staging.example.com';
    serverApp.configuration.callbacks = { payment: { checkout: '/checkout' } };

    process.emit('SIGINT');
    await run;

    expect(mockAppApi.patchApp.mock.calls[1]).toEqual([
      42,
      { redirect_uri: 'http://localhost:3000/api/install/callback' },
    ]);
    expect(serverApp.configuration.http.base_uri).toBe(
      'https://staging.example.com',
    );
    expect(serverApp.configuration.callbacks).toEqual({
      payment: { checkout: '/checkout' },
    });
    expect(mockLogger.printInfo).toHaveBeenCalledWith(
      expect.stringContaining(
        'Left the base URI as https://staging.example.com',
      ),
    );
  });

  it('restores and fails if the tunnel dies', async () => {
    const run = command.execute({});
    await waitFor(() => mockAppApi.patchApp.mock.calls.length === 1);

    resolveTunnelExit(1);
    const result = await run;

    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('stopped unexpectedly'),
    );
    expect(mockAppApi.patchApp).toHaveBeenCalledTimes(2);
    expect(serverApp).toEqual(draftApp);
  });

  it('uses --tunnel-url without starting cloudflared', async () => {
    const run = command.execute({ tunnelUrl: 'https://me.ngrok.app/' });
    await waitFor(() => mockAppApi.patchApp.mock.calls.length === 1);

    expect(cloudflared.ensureBinary).not.toHaveBeenCalled();
    expect(
      mockAppApi.patchApp.mock.calls[0][1].configuration.http.base_uri,
    ).toBe('https://me.ngrok.app');

    process.emit('SIGINT');
    await expect(run).resolves.toEqual({ success: true });
  });

  it('leaves the app alone when the server cannot change only the base URI', async () => {
    mockAppApi.patchApp.mockRejectedValueOnce({
      status: 405,
      error: 'method_not_allowed',
    });

    const run = command.execute({});
    await waitFor(() =>
      mockLogger.print.mock.calls.some(([text]) =>
        text.includes("set the app's base URI to"),
      ),
    );

    const [instructions] = mockLogger.print.mock.calls.at(-1);
    expect(instructions).toContain('https://abc-def.trycloudflare.com');
    expect(instructions).toContain(
      'https://abc-def.trycloudflare.com/api/install/callback',
    );
    expect(instructions).toContain('back to http://localhost:3000');
    expect(mockFs.files.has(SESSION_PATH)).toBe(false);

    process.emit('SIGINT');
    await expect(run).resolves.toEqual({ success: true });

    expect(mockAppApi.patchApp).toHaveBeenCalledTimes(1);
    expect(mockAppApi.updateApp).not.toHaveBeenCalled();
    expect(serverApp).toEqual(draftApp);
    expect(tunnel.stop).toHaveBeenCalled();
  });

  it('refuses to modify a published app', async () => {
    mockAppApi.getApp.mockResolvedValue({ ...draftApp, is_published: true });

    const result = await command.execute({});

    expect(result.success).toBe(false);
    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining('is published'),
    );
    expect(cloudflared.startQuickTunnel).not.toHaveBeenCalled();
    expect(mockAppApi.patchApp).not.toHaveBeenCalled();
    expect(mockAppApi.updateApp).not.toHaveBeenCalled();
  });

  it('restores only the base URI from a stale session left by a crashed run', async () => {
    // Session files from earlier versions hold the whole configuration that
    // was read. Writing it back would delete the settings the read left out.
    const stale = {
      appId: 42,
      tunnelUrl: 'https://old.trycloudflare.com',
      configuration: {
        http: { base_uri: 'http://localhost:4000' },
        endpoints: { install: '/api/install' },
      },
      redirectUri: 'http://localhost:4000/cb',
    };
    mockFs.files.set(SESSION_PATH, JSON.stringify(stale));
    serverApp.is_published = true;
    serverApp.configuration.http.base_uri = 'https://old.trycloudflare.com';
    serverApp.configuration.callbacks = { payment: { checkout: '/checkout' } };
    serverApp.redirect_uri =
      'http://localhost:4000/cb|https://old.trycloudflare.com/cb';

    await command.execute({});

    expect(mockAppApi.patchApp).toHaveBeenCalledWith(42, {
      configuration: { http: { base_uri: 'http://localhost:4000' } },
      redirect_uri: 'http://localhost:4000/cb',
    });
    expect(serverApp.configuration.callbacks).toEqual({
      payment: { checkout: '/checkout' },
    });
    expect(mockAppApi.updateApp).not.toHaveBeenCalled();
    expect(mockFs.files.has(SESSION_PATH)).toBe(false);
  });

  it('says what to restore by hand when the server cannot change only the base URI', async () => {
    mockFs.files.set(
      SESSION_PATH,
      JSON.stringify({
        appId: 42,
        tunnelUrl: 'https://old.trycloudflare.com',
        baseUri: 'http://localhost:4000',
      }),
    );
    serverApp.is_published = true;
    serverApp.configuration.http.base_uri = 'https://old.trycloudflare.com';
    mockAppApi.patchApp.mockRejectedValue({ status: 405 });

    await command.execute({});

    expect(mockLogger.printInfo).toHaveBeenCalledWith(
      expect.stringContaining('base URI back to http://localhost:4000 by hand'),
    );
    expect(mockAppApi.updateApp).not.toHaveBeenCalled();
    expect(mockFs.files.has(SESSION_PATH)).toBe(false);
  });

  it('keeps the session file if restoring fails', async () => {
    const run = command.execute({});
    await waitFor(() => mockAppApi.patchApp.mock.calls.length === 1);

    mockAppApi.patchApp.mockRejectedValueOnce(new Error('network down'));
    process.emit('SIGINT');
    await run;

    expect(mockLogger.printError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to restore the base URI (http://localhost:3000)',
      ),
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
      await waitFor(() => mockAppApi.patchApp.mock.calls.length >= 1);
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
      await waitFor(() => mockAppApi.patchApp.mock.calls.length >= 1);
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
