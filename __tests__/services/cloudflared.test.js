import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  Cloudflared,
  getReleaseAssetName,
  extractChecksum,
  parseTunnelUrl,
} from '../../src/services/cloudflared.js';

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal) => {
    setImmediate(() => {
      child.signalCode = signal;
      child.emit('exit', null, signal);
    });
    return true;
  });
  return child;
}

const waitForSpawn = async (cf) => {
  while (cf.spawnImpl.mock.calls.length === 0) {
    await new Promise((r) => setTimeout(r, 1));
  }
};

const logger = {
  printStatus: vi.fn(),
  printSuccess: vi.fn(),
  printInfo: vi.fn(),
  printVerbose: vi.fn(),
  printError: vi.fn(),
};

describe('cloudflared helpers', () => {
  it('maps platforms to release assets', () => {
    expect(getReleaseAssetName('darwin', 'arm64')).toBe(
      'cloudflared-darwin-arm64.tgz',
    );
    expect(getReleaseAssetName('darwin', 'x64')).toBe(
      'cloudflared-darwin-amd64.tgz',
    );
    expect(getReleaseAssetName('linux', 'x64')).toBe('cloudflared-linux-amd64');
    expect(getReleaseAssetName('linux', 'arm64')).toBe(
      'cloudflared-linux-arm64',
    );
    expect(getReleaseAssetName('win32', 'x64')).toBe(
      'cloudflared-windows-amd64.exe',
    );
    expect(getReleaseAssetName('darwin', 'ia32')).toBeNull();
    expect(getReleaseAssetName('freebsd', 'x64')).toBeNull();
  });

  it('extracts checksums from release notes', () => {
    const body = [
      '### SHA256 Checksums:',
      '```',
      `cloudflared-linux-amd64.deb: ${'b'.repeat(64)}`,
      `cloudflared-linux-amd64: ${'a'.repeat(64)}`,
      '```',
    ].join('\n');
    expect(extractChecksum(body, 'cloudflared-linux-amd64')).toBe(
      'a'.repeat(64),
    );
    expect(extractChecksum(body, 'cloudflared-linux-arm64')).toBeNull();
    expect(extractChecksum('', 'x')).toBeNull();
  });

  it('parses the quick tunnel URL from log output', () => {
    const log =
      '2026-11-10T05:47:49Z INF |  https://cindy-files-widescreen-ntsc.trycloudflare.com      |';
    expect(parseTunnelUrl(log)).toBe(
      'https://cindy-files-widescreen-ntsc.trycloudflare.com',
    );
    expect(parseTunnelUrl('https://api.trycloudflare.com')).toBe(
      'https://api.trycloudflare.com',
    );
    expect(parseTunnelUrl('nothing here')).toBeNull();
  });
});

describe('Cloudflared.startQuickTunnel', () => {
  let child;
  let cf;

  beforeEach(() => {
    vi.clearAllMocks();
    child = createFakeChild();
    cf = new Cloudflared({ logger, spawnImpl: vi.fn(() => child) });
  });

  it('resolves once the URL is printed and a connection is registered', async () => {
    const promise = cf.startQuickTunnel({
      binary: 'cloudflared',
      localUrl: 'http://localhost:3000',
    });

    await waitForSpawn(cf);
    child.stderr.write(
      'INF |  https://abc-def.trycloudflare.com                |\n',
    );
    await new Promise((r) => setImmediate(r));
    child.stderr.write('INF Registered tunnel connection connIndex=0\n');

    const tunnel = await promise;
    expect(tunnel.url).toBe('https://abc-def.trycloudflare.com');

    const [binary, args] = cf.spawnImpl.mock.calls[0];
    expect(binary).toBe('cloudflared');
    expect(args).toEqual(
      expect.arrayContaining([
        'tunnel',
        '--no-autoupdate',
        '--config',
        '--url',
        'http://localhost:3000',
      ]),
    );

    await tunnel.stop();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects with recent output if cloudflared exits early', async () => {
    const promise = cf.startQuickTunnel({
      binary: 'cloudflared',
      localUrl: 'http://localhost:3000',
    });

    await waitForSpawn(cf);
    child.stderr.write('ERR failed to request quick Tunnel: 429\n');
    await new Promise((r) => setImmediate(r));
    child.exitCode = 1;
    child.emit('exit', 1);

    await expect(promise).rejects.toThrow(/exited \(code 1\)[\s\S]*429/);
  });

  it('times out if the tunnel never becomes ready', async () => {
    const promise = cf.startQuickTunnel({
      binary: 'cloudflared',
      localUrl: 'http://localhost:3000',
      startTimeoutMs: 20,
    });

    await expect(promise).rejects.toThrow(/Timed out/);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

describe('Cloudflared.download', () => {
  let installDir;

  beforeEach(async () => {
    vi.clearAllMocks();
    installDir = await fs.mkdtemp(path.join(os.tmpdir(), 'finqu-cf-test-'));
  });

  function mockFetch(binary, checksum) {
    return vi.fn(async (url) => {
      if (url.includes('api.github.com')) {
        return {
          ok: true,
          json: async () => ({
            tag_name: '2026.1.0',
            body: `cloudflared-linux-amd64: ${checksum}\n`,
            assets: [
              {
                name: 'cloudflared-linux-amd64',
                browser_download_url: 'https://example.com/cloudflared',
              },
            ],
          }),
        };
      }
      return { ok: true, arrayBuffer: async () => binary };
    });
  }

  it('installs the binary when the checksum matches', async () => {
    const binary = Buffer.from('fake-binary');
    const checksum = crypto.createHash('sha256').update(binary).digest('hex');
    const cf = new Cloudflared({
      logger,
      installDir,
      platform: 'linux',
      arch: 'x64',
      fetchImpl: mockFetch(binary, checksum),
    });

    const target = await cf.download();

    expect(target).toBe(path.join(installDir, 'cloudflared'));
    expect(await fs.readFile(target, 'utf8')).toBe('fake-binary');
    const stat = await fs.stat(target);
    expect(stat.mode & 0o111).toBeTruthy();
    await fs.rm(installDir, { recursive: true, force: true });
  });

  it('refuses to install when the checksum does not match', async () => {
    const cf = new Cloudflared({
      logger,
      installDir,
      platform: 'linux',
      arch: 'x64',
      fetchImpl: mockFetch(Buffer.from('tampered'), 'c'.repeat(64)),
    });

    await expect(cf.download()).rejects.toThrow(/Checksum mismatch/);
    await expect(fs.access(path.join(installDir, 'cloudflared'))).rejects.toThrow();
    await fs.rm(installDir, { recursive: true, force: true });
  });
});

describe('Cloudflared.ensureBinary', () => {
  it('prefers cloudflared on PATH', async () => {
    const execFileImpl = vi.fn((_bin, _args, _opts, cb) => cb(null));
    const cf = new Cloudflared({ logger, execFileImpl });
    cf.download = vi.fn();

    await expect(cf.ensureBinary()).resolves.toBe('cloudflared');
    expect(cf.download).not.toHaveBeenCalled();
  });

  it('downloads when no binary is available', async () => {
    const execFileImpl = vi.fn((_bin, _args, _opts, cb) =>
      cb(new Error('ENOENT')),
    );
    const cf = new Cloudflared({
      logger,
      execFileImpl,
      installDir: '/tmp/x',
      platform: 'linux',
    });
    cf.download = vi.fn().mockResolvedValue('/tmp/x/cloudflared');

    await expect(cf.ensureBinary()).resolves.toBe('/tmp/x/cloudflared');
    expect(cf.download).toHaveBeenCalled();
  });
});
