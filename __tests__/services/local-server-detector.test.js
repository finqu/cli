import { describe, it, expect, vi } from 'vitest';
import {
  LocalServerDetector,
  parseAddress,
  parseLsofListeners,
  parseLsofCwds,
  parseSsListeners,
  pickLocalHost,
  isWithin,
} from '../../src/services/local-server-detector.js';

describe('parsers', () => {
  it('parses addresses', () => {
    expect(parseAddress('*:3000')).toEqual({ host: '*', port: 3000 });
    expect(parseAddress('[::1]:5173')).toEqual({ host: '[::1]', port: 5173 });
    expect(parseAddress('127.0.0.1:8080')).toEqual({
      host: '127.0.0.1',
      port: 8080,
    });
    expect(parseAddress('garbage')).toBeNull();
  });

  it('parses lsof listener output', () => {
    const out = [
      'p100',
      'cnode',
      'f20',
      'n*:3000',
      'f21',
      'n[::1]:3000',
      'p200',
      'cpostgres',
      'f5',
      'n127.0.0.1:5432',
      '',
    ].join('\n');
    expect(parseLsofListeners(out)).toEqual([
      { pid: 100, command: 'node', host: '*', port: 3000 },
      { pid: 100, command: 'node', host: '[::1]', port: 3000 },
      { pid: 200, command: 'postgres', host: '127.0.0.1', port: 5432 },
    ]);
  });

  it('parses lsof cwd output', () => {
    const cwds = parseLsofCwds('p100\nfcwd\nn/work/app\np200\nfcwd\nn/\n');
    expect(cwds.get(100)).toBe('/work/app');
    expect(cwds.get(200)).toBe('/');
  });

  it('parses ss output', () => {
    const out = [
      'LISTEN 0 511 *:3000 *:* users:(("next-server (v1",pid=1234,fd=20))',
      'LISTEN 0 128 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=99,fd=5))',
      'LISTEN 0 128 0.0.0.0:22 0.0.0.0:*',
    ].join('\n');
    expect(parseSsListeners(out)).toEqual([
      { pid: 1234, command: 'next-server (v1', host: '*', port: 3000 },
      { pid: 99, command: 'postgres', host: '127.0.0.1', port: 5432 },
    ]);
  });

  it('picks a reachable local host', () => {
    expect(pickLocalHost(['*'])).toBe('localhost');
    expect(pickLocalHost(['127.0.0.1', '[::1]'])).toBe('127.0.0.1');
    expect(pickLocalHost(['[::1]'])).toBe('[::1]');
  });

  it('checks directory containment', () => {
    expect(isWithin('/work/app', '/work/app')).toBe(true);
    expect(isWithin('/work/app', '/work/app/apps/web')).toBe(true);
    expect(isWithin('/work/app', '/work/application')).toBe(false);
    expect(isWithin('/work/app', '/work')).toBe(false);
  });
});

describe('LocalServerDetector.findServers', () => {
  function fakeExec(responses) {
    return vi.fn((cmd, args, _opts, cb) => {
      const key = `${cmd} ${args.join(' ')}`;
      const match = Object.entries(responses).find(([k]) => key.startsWith(k));
      cb(null, match ? match[1] : '');
    });
  }

  it('returns servers running from inside the directory (macOS)', async () => {
    const execFileImpl = fakeExec({
      'lsof -nP -iTCP': [
        'p100', 'cnode', 'n[::1]:5173',
        'p101', 'cnode', 'n*:3000',
        'p200', 'cnode', 'n*:4000',
        'p300', 'ccloudflared', 'n127.0.0.1:20241',
        'p999', 'cnode', 'n*:9229',
      ].join('\n'),
      'lsof -a -d cwd': [
        'p100', 'n/work/app/apps/web',
        'p101', 'n/work/app',
        'p200', 'n/work/other',
        'p300', 'n/work/app',
        'p999', 'n/work/app',
      ].join('\n'),
    });

    const detector = new LocalServerDetector({
      execFileImpl,
      platform: 'darwin',
      realpath: async (p) => p,
      ownPid: 999,
    });

    expect(await detector.findServers('/work/app')).toEqual([
      { port: 3000, host: 'localhost', pid: 101, command: 'node', cwd: '/work/app' },
      { port: 5173, host: '[::1]', pid: 100, command: 'node', cwd: '/work/app/apps/web' },
    ]);
  });

  it('uses ss and /proc on Linux', async () => {
    const execFileImpl = fakeExec({
      'ss -Hltnp':
        'LISTEN 0 511 *:3000 *:* users:(("node",pid=42,fd=20))\n',
    });
    const detector = new LocalServerDetector({
      execFileImpl,
      platform: 'linux',
      readlink: async () => '/home/dev/app',
      realpath: async (p) => p,
    });

    expect(await detector.findServers('/home/dev/app')).toEqual([
      { port: 3000, host: 'localhost', pid: 42, command: 'node', cwd: '/home/dev/app' },
    ]);
  });

  it('returns nothing on unsupported platforms or tool failures', async () => {
    const win = new LocalServerDetector({ platform: 'win32' });
    expect(await win.findServers('C:\\app')).toEqual([]);

    const broken = new LocalServerDetector({
      platform: 'darwin',
      execFileImpl: (_c, _a, _o, cb) =>
        cb(Object.assign(new Error('nope'), { code: 'ENOENT' })),
    });
    expect(await broken.findServers('/x')).toEqual([]);
  });
});
