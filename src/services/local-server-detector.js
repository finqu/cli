/**
 * Local dev server detection
 * Finds processes listening on TCP ports whose working directory is inside a
 * given project directory, so `finqu app dev` can find the app's port without
 * being told.
 *
 * Supported on macOS (lsof) and Linux (ss + /proc, falling back to lsof).
 * Other platforms return no results.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Run a command and return stdout. Non-zero exits with output (lsof exits 1
 * when nothing matches) still return what was printed.
 * @param {Function} execFileImpl execFile implementation
 * @param {string} cmd Command
 * @param {string[]} args Arguments
 * @returns {Promise<string>}
 */
function run(execFileImpl, cmd, args) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      cmd,
      args,
      { timeout: 5000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err && err.code === 'ENOENT') return reject(err);
        resolve(String(stdout || ''));
      },
    );
  });
}

/**
 * Split "host:port" as printed by lsof/ss into its parts.
 * @param {string} value e.g. "*:3000", "127.0.0.1:3000", "[::1]:5173"
 * @returns {{host: string, port: number}|null}
 */
export function parseAddress(value) {
  const idx = value.lastIndexOf(':');
  if (idx === -1) return null;
  const port = Number(value.slice(idx + 1));
  if (!Number.isInteger(port) || port <= 0) return null;
  return { host: value.slice(0, idx), port };
}

/**
 * Parse `lsof -nP -iTCP -sTCP:LISTEN -Fpcn` output.
 * @param {string} output lsof field output
 * @returns {Array<{pid: number, command: string, host: string, port: number}>}
 */
export function parseLsofListeners(output) {
  const result = [];
  let pid = null;
  let command = '';
  for (const line of output.split('\n')) {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') {
      pid = Number(value);
      command = '';
    } else if (tag === 'c') {
      command = value;
    } else if (tag === 'n' && pid) {
      const addr = parseAddress(value);
      if (addr) result.push({ pid, command, ...addr });
    }
  }
  return result;
}

/**
 * Parse `lsof -a -d cwd -p <pids> -Fpn` output.
 * @param {string} output lsof field output
 * @returns {Map<number, string>} pid → cwd
 */
export function parseLsofCwds(output) {
  const cwds = new Map();
  let pid = null;
  for (const line of output.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

/**
 * Parse `ss -Hltnp` output.
 * @param {string} output ss output
 * @returns {Array<{pid: number, command: string, host: string, port: number}>}
 */
export function parseSsListeners(output) {
  const result = [];
  for (const line of output.split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const addr = parseAddress(cols[3]);
    if (!addr) continue;
    const users = cols.slice(5).join(' ');
    for (const m of users.matchAll(/\("([^"]*)",pid=(\d+)/g)) {
      result.push({ pid: Number(m[2]), command: m[1], ...addr });
    }
  }
  return result;
}

/**
 * Whether `child` is `parent` or inside it.
 * @param {string} parent Directory
 * @param {string} child Directory
 * @returns {boolean}
 */
export function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Pick the URL host to reach a listener on. Servers bound only to IPv6
 * loopback (common for Vite) must be addressed as [::1].
 * @param {string[]} hosts Bound addresses for one port
 * @returns {string}
 */
export function pickLocalHost(hosts) {
  if (hosts.some((h) => h === '*' || h === '0.0.0.0' || h === '[::]')) {
    return 'localhost';
  }
  if (hosts.includes('127.0.0.1')) return '127.0.0.1';
  if (hosts.includes('[::1]')) return '[::1]';
  return 'localhost';
}

export class LocalServerDetector {
  constructor(options = {}) {
    this.execFileImpl = options.execFileImpl || execFile;
    this.platform = options.platform || process.platform;
    this.readlink = options.readlink || fs.readlink;
    this.realpath = options.realpath || fs.realpath;
    this.ownPid = options.ownPid || process.pid;
  }

  async _listenersViaLsof() {
    const out = await run(this.execFileImpl, 'lsof', [
      '-nP',
      '-iTCP',
      '-sTCP:LISTEN',
      '-Fpcn',
    ]);
    const listeners = parseLsofListeners(out);
    const pids = [...new Set(listeners.map((l) => l.pid))];
    if (pids.length === 0) return [];

    const cwdOut = await run(this.execFileImpl, 'lsof', [
      '-a',
      '-d',
      'cwd',
      '-p',
      pids.join(','),
      '-Fpn',
    ]);
    const cwds = parseLsofCwds(cwdOut);
    return listeners.map((l) => ({ ...l, cwd: cwds.get(l.pid) || null }));
  }

  async _listenersViaSs() {
    const out = await run(this.execFileImpl, 'ss', ['-Hltnp']);
    const listeners = parseSsListeners(out);
    return Promise.all(
      listeners.map(async (l) => ({
        ...l,
        cwd: await this.readlink(`/proc/${l.pid}/cwd`).catch(() => null),
      })),
    );
  }

  async _listListeners() {
    if (this.platform === 'darwin') return this._listenersViaLsof();
    if (this.platform === 'linux') {
      try {
        return await this._listenersViaSs();
      } catch {
        return this._listenersViaLsof();
      }
    }
    return [];
  }

  /**
   * Find dev servers running from inside a directory.
   * @param {string} dir Project directory
   * @returns {Promise<Array<{port: number, host: string, pid: number, command: string, cwd: string}>>}
   *   One entry per port, sorted by port.
   */
  async findServers(dir) {
    let listeners;
    try {
      listeners = await this._listListeners();
    } catch {
      return [];
    }

    const root = await this.realpath(dir).catch(() => dir);
    const byPort = new Map();

    for (const l of listeners) {
      if (!l.cwd || l.pid === this.ownPid) continue;
      if (/cloudflared/i.test(l.command)) continue;
      const cwd = await this.realpath(l.cwd).catch(() => l.cwd);
      if (!isWithin(root, cwd)) continue;

      const entry = byPort.get(l.port) || {
        port: l.port,
        pid: l.pid,
        command: l.command,
        cwd,
        hosts: [],
      };
      if (!entry.hosts.includes(l.host)) entry.hosts.push(l.host);
      byPort.set(l.port, entry);
    }

    return [...byPort.values()]
      .sort((a, b) => a.port - b.port)
      .map(({ hosts, ...rest }) => ({ ...rest, host: pickLocalHost(hosts) }));
  }
}

export function createLocalServerDetector(options) {
  return new LocalServerDetector(options);
}
