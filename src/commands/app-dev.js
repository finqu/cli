/**
 * App dev command for Finqu CLI.
 * Exposes a local app server through a public HTTPS tunnel and points the
 * draft app's base URI at it for the duration of the session.
 */
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import prompts from 'prompts';
import { BaseCommand } from './base.js';
import { AppError } from '../core/error.js';
import { resolveAppId } from './app-resolve-id.js';
import { createCloudflared } from '../services/cloudflared.js';
import { createLocalServerDetector } from '../services/local-server-detector.js';
import {
  detectProject,
  planHostAllowance,
} from '../services/framework-config.js';

const DEFAULT_PORT = 3000;
const SESSION_FILENAME = '.finqu-dev-session.json';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Whether a URL points at the local machine.
 * @param {string} value URL string
 * @returns {boolean}
 */
export function isLocalUrl(value) {
  try {
    return LOCAL_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Add tunnel equivalents of local redirect URIs, keeping the originals.
 * e.g. "http://localhost:3000/cb" + "https://x.trycloudflare.com" becomes
 * "http://localhost:3000/cb|https://x.trycloudflare.com/cb".
 * @param {string|null|undefined} redirectUri Pipe-separated redirect URIs
 * @param {string} tunnelOrigin Public tunnel origin
 * @returns {string|null} Updated value, or null if nothing to add
 */
export function addTunnelRedirectUris(redirectUri, tunnelOrigin) {
  if (!redirectUri) return null;

  const uris = String(redirectUri)
    .split('|')
    .map((u) => u.trim())
    .filter(Boolean);

  const additions = [];
  for (const uri of uris) {
    if (!isLocalUrl(uri)) continue;
    const local = new URL(uri);
    const tunneled = `${tunnelOrigin}${local.pathname}${local.search}`;
    if (!uris.includes(tunneled) && !additions.includes(tunneled)) {
      additions.push(tunneled);
    }
  }

  return additions.length > 0 ? [...uris, ...additions].join('|') : null;
}

/**
 * Validate a user-supplied public tunnel URL and return its origin.
 * @param {string} value URL string
 * @returns {string} Origin (scheme + host + port)
 */
export function normalizeTunnelUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw AppError.validationError(`Invalid --tunnel-url: ${value}`);
  }
  if (parsed.protocol !== 'https:') {
    throw AppError.validationError(
      '--tunnel-url must use https. Finqu only calls apps over HTTPS.',
    );
  }
  return parsed.origin;
}

/**
 * Check whether something accepts TCP connections on localhost:port.
 * @param {number} port Port
 * @param {number} timeoutMs Timeout
 * @returns {Promise<boolean>}
 */
export function isPortOpen(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: 'localhost', port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

export class AppDevCommand extends BaseCommand {
  /**
   * @param {Object} app Application instance
   * @param {Object} [deps] Injectable dependencies (for tests)
   */
  constructor(app = null, deps = {}) {
    super(app);
    this.deps = deps;
  }

  get name() {
    return 'dev';
  }

  get group() {
    return 'app';
  }

  get syntax() {
    return 'dev';
  }

  get description() {
    return 'Expose your local app over a public HTTPS tunnel and point the draft app at it';
  }

  get options() {
    return [
      {
        flags: '-p, --port <number>',
        description:
          'Local port your app listens on (detected from the running dev server if omitted)',
      },
      {
        flags: '--app-id <id>',
        description: 'App ID (uses linked app if omitted)',
      },
      {
        flags: '--tunnel-url <url>',
        description:
          'Use an existing public HTTPS tunnel (ngrok, etc.) instead of starting a Cloudflare Quick Tunnel',
      },
    ];
  }

  get cwd() {
    return this.deps.cwd || process.cwd();
  }

  get sessionFilePath() {
    return path.join(this.cwd, SESSION_FILENAME);
  }

  get interactive() {
    if (this.deps.interactive !== undefined) return this.deps.interactive;
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
  }

  _prompt(question) {
    return (this.deps.prompt || prompts)(question);
  }

  /**
   * Work out which local server to tunnel to: an explicit --port, a dev
   * server already running from this directory, or the framework default.
   * @param {number|null} explicitPort Port from --port
   * @returns {Promise<{port: number, host: string, project: Object}>}
   */
  async _resolveLocalServer(explicitPort) {
    const cwd = this.cwd;
    const detector = this.deps.serverDetector || createLocalServerDetector();
    const servers = await detector.findServers(cwd);
    this.logger.printVerbose(
      `Dev servers running from ${cwd}: ${servers.map((s) => `${s.port} (pid ${s.pid}, ${s.cwd})`).join(', ') || 'none'}`,
    );

    const cwdProject = await detectProject(cwd);

    let server = null;
    if (explicitPort) {
      server = servers.find((s) => s.port === explicitPort) || null;
    } else if (servers.length === 1) {
      server = servers[0];
    } else if (servers.length > 1) {
      server = await this._chooseServer(servers, cwdProject);
    }

    // In a monorepo the dev server may run from a subdirectory with its own
    // package.json; detect the framework there.
    let project = cwdProject;
    if (server && server.cwd !== cwd) {
      const serverProject = await detectProject(server.cwd);
      if (serverProject.framework) project = serverProject;
    }

    const frameworkName = project.framework?.name;
    let port = explicitPort;

    if (server) {
      port = server.port;
      if (!explicitPort) {
        const where =
          server.cwd !== cwd ? `, in ${path.relative(cwd, server.cwd)}` : '';
        this.logger.printInfo(
          `Found ${frameworkName ? `${frameworkName} dev server` : `"${server.command}"`} on port ${port} (pid ${server.pid}${where}).`,
        );
      }
      return { port, host: server.host, project };
    }

    let source = '';
    if (!port) {
      if (project.scriptPort) {
        port = project.scriptPort;
        source = ' from your package.json dev script';
      } else if (project.framework) {
        port = project.framework.defaultPort;
        source = ` (${frameworkName} default)`;
      } else {
        port = DEFAULT_PORT;
      }
    }

    const checkPort = this.deps.isPortOpen || isPortOpen;
    if (await checkPort(port)) {
      if (!explicitPort) {
        this.logger.printInfo(`Using port ${port}${source}.`);
      }
    } else {
      this.logger.printInfo(
        `No dev server found${explicitPort ? ` on port ${port}` : ` running in ${cwd}; using port ${port}${source}`}. Start your app (or pass --port); requests will fail until it is up.`,
      );
    }

    return { port, host: 'localhost', project };
  }

  /**
   * Pick between several servers running from this directory.
   */
  async _chooseServer(servers, project) {
    if (this.interactive) {
      const { port } = await this._prompt({
        type: 'select',
        name: 'port',
        message: 'Several servers are running in this directory. Which one is your app?',
        choices: servers.map((s) => ({
          title: `${s.port}  ${s.command}${s.cwd !== this.cwd ? `  (${path.relative(this.cwd, s.cwd)})` : ''}`,
          value: s.port,
        })),
      });
      if (port === undefined) throw new AppError('Cancelled.');
      return servers.find((s) => s.port === port);
    }

    const preferred = [project.scriptPort, project.framework?.defaultPort];
    const chosen =
      servers.find((s) => preferred.includes(s.port)) || servers[0];
    this.logger.printInfo(
      `Several servers are running in this directory (ports ${servers.map((s) => s.port).join(', ')}). Using ${chosen.port}; pass --port to choose another.`,
    );
    return chosen;
  }

  /**
   * Make sure the framework's dev server accepts requests for the tunnel
   * host (Next.js allowedDevOrigins, Vite server.allowedHosts, ...).
   * @param {Object} project Result of detectProject()
   * @param {string} hostname Tunnel hostname
   */
  async _allowTunnelHost(project, hostname) {
    const plan = await planHostAllowance(project, hostname);
    if (plan.status === 'none' || plan.status === 'allowed') return;

    const { framework, configPath } = project;
    const configName = configPath
      ? path.relative(this.cwd, configPath)
      : framework.configFiles[0];

    if (plan.status === 'update') {
      let approved = false;
      if (this.interactive) {
        const answer = await this._prompt({
          type: 'confirm',
          name: 'ok',
          message: `${framework.name} blocks requests from unknown hosts. Add '${plan.pattern}' to ${framework.setting} in ${configName}?`,
          initial: true,
        });
        approved = Boolean(answer.ok);
      }

      if (approved) {
        await fs.writeFile(configPath, plan.updated);
        this.logger.printSuccess(
          `Added '${plan.pattern}' to ${framework.setting} in ${configName}. ${framework.name} restarts automatically when its config changes.`,
        );
        return;
      }
    }

    this.logger.printInfo(
      `${framework.name} blocks requests from unknown hosts. Add this to ${configName} and restart the dev server:\n\n    ${plan.snippet}\n`,
    );
  }

  _createTunnelProvider() {
    if (this.deps.cloudflared) return this.deps.cloudflared;
    return createCloudflared({ logger: this.logger });
  }

  async _readSession() {
    try {
      if (!(await this.fileSystem.exists(this.sessionFilePath))) return null;
      return JSON.parse(
        await this.fileSystem.readFile(this.sessionFilePath, 'utf8'),
      );
    } catch {
      return null;
    }
  }

  async _writeSession(session) {
    await this.fileSystem.writeFile(
      this.sessionFilePath,
      JSON.stringify(session, null, 2),
    );
  }

  async _clearSession() {
    try {
      await this.fileSystem.unlink(this.sessionFilePath);
    } catch {
      // Already gone.
    }
  }

  /**
   * Put the app's original configuration back.
   * @param {Object} appApi App API service
   * @param {Object} session Saved session
   */
  async _restore(appApi, session) {
    const data = { configuration: session.configuration || {} };
    if (session.redirectUri !== undefined) {
      data.redirect_uri = session.redirectUri ?? '';
    }
    await appApi.updateApp(session.appId, data);
    await this._clearSession();
  }

  /**
   * If a previous session crashed without restoring, restore it now.
   * @param {Object} appApi App API service
   */
  async _restoreStaleSession(appApi) {
    const stale = await this._readSession();
    if (!stale?.appId) return;

    this.logger.printInfo(
      `Found an unfinished dev session for app ${stale.appId}. Restoring base URI ${stale.configuration?.http?.base_uri ?? '(none)'}...`,
    );
    await this._restore(appApi, stale);
  }

  async execute(options = {}) {
    let stopRequested = false;
    let requestStop = () => {};
    const stopped = new Promise((resolve) => {
      requestStop = resolve;
    });
    const onSignal = () => {
      if (!stopRequested) {
        stopRequested = true;
        this.logger.printInfo('\nShutting down...');
      }
      requestStop('signal');
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    let tunnel = null;
    let session = null;
    let appApi = null;

    try {
      const explicitPort =
        options.port !== undefined ? Number(options.port) : null;
      if (
        explicitPort !== null &&
        (!Number.isInteger(explicitPort) ||
          explicitPort < 1 ||
          explicitPort > 65535)
      ) {
        throw AppError.validationError(`Invalid port: ${options.port}`);
      }

      if (!this.app.services.tokenManager.hasAccessToken()) {
        throw AppError.authError('Not signed in. Run "finqu sign-in" first.');
      }

      const appId = resolveAppId(options, this.config);
      appApi = this.app.services.appApi;

      await this._restoreStaleSession(appApi);

      const appData = await appApi.getApp(appId);
      if (appData.is_published) {
        throw AppError.validationError(
          `App "${appData.name}" (${appId}) is published. "finqu app dev" only rewrites the base URI of draft apps so live merchants are never affected. Create a separate draft app for development.`,
        );
      }

      const { port, host, project } =
        await this._resolveLocalServer(explicitPort);
      const localUrl = `http://${host}:${port}`;

      let publicOrigin;
      if (options.tunnelUrl) {
        publicOrigin = normalizeTunnelUrl(options.tunnelUrl);
        this.logger.printInfo(`Using tunnel ${publicOrigin}`);
      } else {
        const cloudflared = this._createTunnelProvider();
        const binary = await cloudflared.ensureBinary();
        if (stopRequested) return { success: true };

        this.logger.printStatus(`Starting Cloudflare tunnel to ${localUrl}...`);
        tunnel = await cloudflared.startQuickTunnel({ binary, localUrl });
        publicOrigin = new URL(tunnel.url).origin;
      }

      if (stopRequested) return { success: true };

      try {
        await this._allowTunnelHost(project, new URL(publicOrigin).hostname);
      } catch (configErr) {
        this.logger.printError(
          `Could not update ${project.framework?.name ?? 'framework'} config to allow the tunnel host.`,
          configErr,
        );
      }

      const originalConfiguration = appData.configuration || {};
      const newConfiguration = {
        ...originalConfiguration,
        http: { ...(originalConfiguration.http || {}), base_uri: publicOrigin },
      };

      const newRedirectUri = addTunnelRedirectUris(
        appData.redirect_uri,
        publicOrigin,
      );

      // Persist the original state before touching the app so a crash can be
      // recovered on the next run.
      session = {
        appId,
        startedAt: new Date().toISOString(),
        tunnelUrl: publicOrigin,
        configuration: originalConfiguration,
      };
      const update = { configuration: newConfiguration };
      if (newRedirectUri) {
        session.redirectUri = appData.redirect_uri;
        update.redirect_uri = newRedirectUri;
      }
      await this._writeSession(session);

      this.logger.printStatus(`Pointing app ${appId} at ${publicOrigin}...`);
      await appApi.updateApp(appId, update);

      this.logger.printSuccess(`Tunnel ready: ${publicOrigin} → ${localUrl}`);
      this.logger.print(
        `\n  App:        ${appData.name} (${appId})` +
          `\n  Base URI:   ${publicOrigin}` +
          (newRedirectUri
            ? `\n  Redirects:  ${newRedirectUri.split('|').join('\n              ')}`
            : '') +
          `\n\n  Your app is reachable from the public internet while this runs.` +
          `\n  Verify the Finqu-Signature header on incoming requests.` +
          `\n\n  Press Ctrl+C to stop and restore the original base URI` +
          ` (${originalConfiguration.http?.base_uri ?? 'none'}).\n`,
      );

      const reason = await Promise.race([
        stopped,
        ...(tunnel ? [tunnel.exited.then(() => 'tunnel-exit')] : []),
      ]);

      if (reason === 'tunnel-exit' && !stopRequested) {
        throw new AppError('The Cloudflare tunnel stopped unexpectedly.');
      }

      return { success: true };
    } catch (err) {
      if (stopRequested && !session) {
        // Ctrl+C during startup (cloudflared exits on SIGINT too).
        return { success: true };
      }
      if (err instanceof AppError) {
        this.logger.printError(err.message);
        return { success: false, error: err };
      }
      this.logger.handleError(err);
      return { success: false, error: err };
    } finally {
      if (session && appApi) {
        try {
          this.logger.printStatus('Restoring app configuration...');
          await this._restore(appApi, session);
          this.logger.printSuccess(
            `Restored base URI ${session.configuration?.http?.base_uri ?? '(none)'}.`,
          );
        } catch (restoreErr) {
          this.logger.printError(
            `Failed to restore app configuration. Run "finqu app dev" again to retry; the original values are saved in ${SESSION_FILENAME}.`,
            restoreErr,
          );
        }
      }
      if (tunnel) {
        await tunnel.stop();
      }
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }
  }
}

export function createAppDevCommand(app) {
  return new AppDevCommand(app);
}
