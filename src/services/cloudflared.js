/**
 * Cloudflared tunnel service
 * Locates (or downloads) the cloudflared binary and runs a Cloudflare Quick
 * Tunnel (https://<random>.trycloudflare.com) pointing at a local port.
 * Quick Tunnels need no Cloudflare account.
 */
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppError } from '../core/error.js';

const BINARY_NAME = 'cloudflared';
const RELEASE_API_URL =
  'https://api.github.com/repos/cloudflare/cloudflared/releases/latest';
const DEFAULT_INSTALL_DIR = path.join(os.homedir(), '.finqu', 'bin');
const DEFAULT_START_TIMEOUT_MS = 30000;
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const TUNNEL_READY_PATTERN = /Registered tunnel connection/;

/**
 * Map Node's platform/arch to a cloudflared release asset name.
 * @param {string} platform process.platform value
 * @param {string} arch process.arch value
 * @returns {string|null} Asset name, or null if unsupported
 */
export function getReleaseAssetName(
  platform = process.platform,
  arch = process.arch,
) {
  const archMap = { x64: 'amd64', arm64: 'arm64', ia32: '386', arm: 'arm' };
  const cfArch = archMap[arch];
  if (!cfArch) return null;

  if (platform === 'darwin') {
    if (cfArch !== 'amd64' && cfArch !== 'arm64') return null;
    return `cloudflared-darwin-${cfArch}.tgz`;
  }
  if (platform === 'linux') {
    return `cloudflared-linux-${cfArch}`;
  }
  if (platform === 'win32') {
    if (cfArch !== 'amd64' && cfArch !== '386') return null;
    return `cloudflared-windows-${cfArch}.exe`;
  }
  return null;
}

/**
 * Extract the SHA256 checksum for an asset from cloudflared release notes.
 * Release notes contain lines like "cloudflared-linux-amd64: <sha256>".
 * @param {string} body Release notes markdown
 * @param {string} assetName Asset file name
 * @returns {string|null} Lowercase hex checksum, or null if not found
 */
export function extractChecksum(body, assetName) {
  if (!body || !assetName) return null;
  const escaped = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(
    new RegExp(`^\\s*${escaped}:\\s*([a-f0-9]{64})\\s*$`, 'im'),
  );
  return match ? match[1].toLowerCase() : null;
}

/**
 * Find the public trycloudflare.com URL in cloudflared log output.
 * @param {string} text Log output
 * @returns {string|null} Tunnel URL
 */
export function parseTunnelUrl(text) {
  const match = String(text || '').match(TUNNEL_URL_PATTERN);
  return match ? match[0] : null;
}

export class Cloudflared {
  /**
   * @param {Object} options
   * @param {Object} options.logger Logger instance
   * @param {string} [options.installDir] Where a downloaded binary is cached
   * @param {Function} [options.fetchImpl] fetch implementation
   * @param {Function} [options.spawnImpl] child_process.spawn implementation
   * @param {Function} [options.execFileImpl] child_process.execFile implementation
   */
  constructor(options = {}) {
    this.logger = options.logger;
    this.installDir = options.installDir || DEFAULT_INSTALL_DIR;
    this.fetchImpl = options.fetchImpl || fetch;
    this.spawnImpl = options.spawnImpl || spawn;
    this.execFileImpl = options.execFileImpl || execFile;
    this.platform = options.platform || process.platform;
    this.arch = options.arch || process.arch;
  }

  get installedBinaryPath() {
    const file = this.platform === 'win32' ? `${BINARY_NAME}.exe` : BINARY_NAME;
    return path.join(this.installDir, file);
  }

  /**
   * Check whether a binary runs (`<binary> --version`).
   * @param {string} binary Binary name or path
   * @returns {Promise<boolean>}
   */
  _canRun(binary) {
    return new Promise((resolve) => {
      this.execFileImpl(binary, ['--version'], { timeout: 10000 }, (err) =>
        resolve(!err),
      );
    });
  }

  /**
   * Resolve a usable cloudflared binary: PATH first, then the CLI-managed
   * copy, downloading it if needed.
   * @returns {Promise<string>} Binary name or absolute path
   */
  async ensureBinary() {
    if (await this._canRun(BINARY_NAME)) {
      this.logger.printVerbose('Using cloudflared from PATH.');
      return BINARY_NAME;
    }

    const installed = this.installedBinaryPath;
    if (await this._canRun(installed)) {
      this.logger.printVerbose(`Using cloudflared from ${installed}.`);
      return installed;
    }

    await this.download();
    return installed;
  }

  /**
   * Download the latest cloudflared release for this platform, verify its
   * SHA256 checksum against the release notes and install it to installDir.
   * @returns {Promise<string>} Installed binary path
   */
  async download() {
    const assetName = getReleaseAssetName(this.platform, this.arch);
    if (!assetName) {
      throw AppError.configError(
        `cloudflared is not available for ${this.platform}/${this.arch}. Install it manually (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) or pass --tunnel-url.`,
      );
    }

    this.logger.printStatus('Downloading cloudflared (first run only)...');

    const releaseResponse = await this.fetchImpl(RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Finqu CLI',
      },
    });
    if (!releaseResponse.ok) {
      throw new AppError(
        `Failed to look up the latest cloudflared release (HTTP ${releaseResponse.status}).`,
      );
    }
    const release = await releaseResponse.json();

    const asset = (release.assets || []).find((a) => a.name === assetName);
    if (!asset?.browser_download_url) {
      throw new AppError(
        `cloudflared release ${release.tag_name || ''} has no asset ${assetName}.`,
      );
    }

    const expectedChecksum = extractChecksum(release.body, assetName);
    if (!expectedChecksum) {
      throw new AppError(
        `Could not find a SHA256 checksum for ${assetName} in the cloudflared release notes. Install cloudflared manually or pass --tunnel-url.`,
      );
    }

    const assetResponse = await this.fetchImpl(asset.browser_download_url, {
      headers: { 'User-Agent': 'Finqu CLI' },
    });
    if (!assetResponse.ok) {
      throw new AppError(
        `Failed to download ${assetName} (HTTP ${assetResponse.status}).`,
      );
    }
    const data = Buffer.from(await assetResponse.arrayBuffer());
    const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
    const archiveChecksum = sha256(data);

    await fs.mkdir(this.installDir, { recursive: true });
    const target = this.installedBinaryPath;
    const tmpDir = await fs.mkdtemp(path.join(this.installDir, '.download-'));

    try {
      const downloaded = path.join(tmpDir, assetName);
      await fs.writeFile(downloaded, data);

      let binaryPath = downloaded;
      let binaryChecksum = archiveChecksum;
      if (assetName.endsWith('.tgz')) {
        await new Promise((resolve, reject) => {
          this.execFileImpl(
            'tar',
            ['-xzf', downloaded, '-C', tmpDir, BINARY_NAME],
            (err) => (err ? reject(err) : resolve()),
          );
        });
        binaryPath = path.join(tmpDir, BINARY_NAME);
        binaryChecksum = sha256(await fs.readFile(binaryPath));
      }

      // For macOS .tgz assets Cloudflare publishes the checksum of the
      // extracted binary; for raw binaries it is the file itself.
      if (
        binaryChecksum !== expectedChecksum &&
        archiveChecksum !== expectedChecksum
      ) {
        throw new AppError(
          `Checksum mismatch for ${assetName}: expected ${expectedChecksum}, got ${binaryChecksum}.`,
        );
      }

      await fs.chmod(binaryPath, 0o755);
      await fs.rename(binaryPath, target);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    this.logger.printSuccess(
      `Installed cloudflared ${release.tag_name || ''} to ${target}`,
    );
    return target;
  }

  /**
   * Start a Quick Tunnel to a local URL and resolve once the public URL is
   * known.
   * @param {Object} options
   * @param {string} options.binary cloudflared binary
   * @param {string} options.localUrl Local origin, e.g. http://localhost:3000
   * @param {number} [options.startTimeoutMs] Max wait for the tunnel to come up
   * @returns {Promise<{url: string, child: Object, exited: Promise<number|null>, stop: Function}>}
   */
  async startQuickTunnel({
    binary,
    localUrl,
    startTimeoutMs = DEFAULT_START_TIMEOUT_MS,
  }) {
    // An existing ~/.cloudflared/config.yaml with a `tunnel:` key makes
    // cloudflared refuse to start a quick tunnel. Point it at a minimal
    // config file of our own so the user's setup can't interfere.
    const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'finqu-cf-'));
    const configPath = path.join(configDir, 'config.yml');
    await fs.writeFile(configPath, 'no-autoupdate: true\n');

    const args = [
      'tunnel',
      '--no-autoupdate',
      '--config',
      configPath,
      '--url',
      localUrl,
    ];
    this.logger.printVerbose(`Running ${binary} ${args.join(' ')}`);

    const child = this.spawnImpl(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const exited = new Promise((resolve) => {
      const done = (code) => {
        fs.rm(configDir, { recursive: true, force: true }).catch(() => {});
        resolve(code);
      };
      child.once('exit', (code) => done(code));
      child.once('error', () => done(null));
    });

    const stop = async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(timer);
      }
    };

    // cloudflared logs to stderr. Always drain both pipes so it never blocks,
    // and surface the raw log in verbose mode.
    let output = '';
    let starting = true;
    let onOutput = () => {};
    const handleChunk = (chunk) => {
      const text = chunk.toString();
      if (starting) output += text;
      for (const line of text.split('\n')) {
        if (line.trim()) this.logger.printVerbose(`[cloudflared] ${line}`);
      }
      onOutput();
    };
    child.stdout?.on('data', handleChunk);
    child.stderr?.on('data', handleChunk);

    let timer;
    try {
      const url = await Promise.race([
        // Ready once the public URL is known and an edge connection is up,
        // so requests to the URL work as soon as we hand it out.
        new Promise((resolve) => {
          onOutput = () => {
            const found = parseTunnelUrl(output);
            if (found && TUNNEL_READY_PATTERN.test(output)) resolve(found);
          };
        }),
        new Promise((_, reject) => {
          child.once('error', (err) =>
            reject(new AppError(`Failed to start cloudflared: ${err.message}`)),
          );
          child.once('exit', (code) =>
            reject(
              new AppError(
                `cloudflared exited (code ${code}) before the tunnel was ready.\n${output.trim().split('\n').slice(-5).join('\n')}`,
              ),
            ),
          );
          timer = setTimeout(
            () =>
              reject(
                new AppError(
                  `Timed out after ${Math.round(startTimeoutMs / 1000)}s waiting for the Cloudflare tunnel.`,
                ),
              ),
            startTimeoutMs,
          );
        }),
      ]);
      return { url, child, exited, stop };
    } catch (err) {
      await stop();
      throw err;
    } finally {
      clearTimeout(timer);
      starting = false;
      onOutput = () => {};
      output = '';
    }
  }
}

export function createCloudflared(options) {
  return new Cloudflared(options);
}
