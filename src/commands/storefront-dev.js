/**
 * Storefront Dev command for Finqu CLI
 * Starts development server with hot reload
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import chokidar from 'chokidar';
import pc from 'picocolors';
import { BaseCommand } from './base.js';
import { runBuild } from './storefront-build.js';

/**
 * Check if a port is available on a specific host
 * @param {number} port - Port to check
 * @param {string} host - Host to check
 * @returns {Promise<boolean|null>} Whether the port is available, or null if check failed (e.g., IPv6 not supported)
 */
function checkPortOnHost(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      // EADDRINUSE means port is in use
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors (e.g., EAFNOSUPPORT for IPv6) mean check failed
        resolve(null);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, host);
  });
}

/**
 * Check if a port is available on all interfaces
 * Next.js binds to '::' (IPv6 all interfaces) by default, so we need to check both
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} Whether the port is available
 */
async function isPortAvailable(port) {
  // Check IPv6 all interfaces (what Next.js uses by default)
  const ipv6Available = await checkPortOnHost(port, '::');
  // If IPv6 check succeeded and port is in use, return false
  if (ipv6Available === false) return false;

  // Check IPv4 all interfaces
  const ipv4Available = await checkPortOnHost(port, '0.0.0.0');
  // If IPv4 check succeeded and port is in use, return false
  if (ipv4Available === false) return false;

  // Port is available if at least one check succeeded and showed available
  // If both checks failed (null), fall back to localhost check
  if (ipv6Available === null && ipv4Available === null) {
    const localhostAvailable = await checkPortOnHost(port, '127.0.0.1');
    return localhostAvailable !== false;
  }

  return true;
}

/**
 * Find the next available port starting from the given port
 * @param {number} startPort - Port to start searching from
 * @param {number} maxAttempts - Maximum number of ports to try
 * @returns {Promise<number>} Available port
 */
export async function findAvailablePort(startPort, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`,
  );
}

/**
 * Start Next.js dev server as child process
 * @param {string} port - Port for Next.js dev server
 * @param {Function} onExit - Callback when process exits
 * @returns {import('node:child_process').ChildProcess} Child process
 */
function startNextDev(port, onExit) {
  const nextProcess = spawn('npx', ['next', 'dev', '-p', port.toString()], {
    stdio: 'inherit',
    // No shell: true - direct process spawning for proper signal handling
  });

  nextProcess.on('error', (error) => {
    console.error(pc.red('✗'), 'Failed to start Next.js:', error.message);
    process.exit(1);
  });

  nextProcess.on('exit', (code) => {
    if (onExit) {
      onExit(code);
    }
  });

  return nextProcess;
}

/**
 * Run dev mode programmatically
 * @param {Object} options - Dev options
 * @param {string} options.components - Path to components directory
 * @param {string} options.output - Output directory for generated config
 * @param {string} options.port - Port for Next.js dev server
 * @returns {Promise<void>}
 */
export async function runDev(options) {
  const cwd = process.cwd();
  const componentsDir = path.resolve(cwd, options.components);
  const watchPattern = path.join(componentsDir, '**/*.puck.tsx');

  // Run initial build
  console.log(pc.cyan('→'), 'Running initial build...\n');
  await runBuild(options);
  console.log();

  // Find available port
  const requestedPort = parseInt(options.port, 10);
  const availablePort = await findAvailablePort(requestedPort);

  if (availablePort !== requestedPort) {
    console.log(
      pc.yellow('⚠'),
      `Port ${requestedPort} is in use, using port ${pc.bold(availablePort)} instead\n`,
    );
  }

  // Track cleanup state
  let isCleaningUp = false;

  // Watch for component changes
  console.log(pc.cyan('→'), 'Watching for component changes...\n');

  const watcher = chokidar.watch(watchPattern, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  // Handle cleanup - wait for child process to exit before exiting parent
  const cleanup = () => {
    if (isCleaningUp) return;
    isCleaningUp = true;

    console.log(pc.dim('\nShutting down...'));
    watcher.close();

    if (nextProcess && !nextProcess.killed) {
      nextProcess.kill('SIGTERM');
    }
    // Don't call process.exit() here - wait for onExit callback
  };

  // Start Next.js dev server
  console.log(pc.cyan('→'), `Starting Next.js dev server on port ${pc.bold(availablePort)}...\n`);
  const nextProcess = startNextDev(availablePort, (code) => {
    // Child process has exited, now we can safely exit
    if (isCleaningUp) {
      process.exit(0);
    } else if (code !== null && code !== 0) {
      console.error(pc.red('✗'), `Next.js exited with code ${code}`);
      process.exit(code);
    }
  });

  let isRebuilding = false;

  const rebuild = async (event, filePath) => {
    if (isRebuilding) return;
    isRebuilding = true;

    const fileName = path.basename(filePath);
    console.log();
    console.log(pc.cyan('→'), `Component ${event}: ${pc.dim(fileName)}`);

    try {
      await runBuild(options);
    } catch (error) {
      console.error(pc.red('✗'), 'Build failed:', error);
    }

    isRebuilding = false;
  };

  watcher.on('add', (filePath) => rebuild('added', filePath));
  watcher.on('change', (filePath) => rebuild('changed', filePath));
  watcher.on('unlink', (filePath) => rebuild('removed', filePath));

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

/**
 * StorefrontDevCommand class for development server
 */
export class StorefrontDevCommand extends BaseCommand {
  /**
   * Get command name
   * @returns {string} Command name
   */
  get name() {
    return 'dev';
  }

  /**
   * Get command group
   * @returns {string} Command group
   */
  get group() {
    return 'storefront';
  }

  /**
   * Get command description
   * @returns {string} Command description
   */
  get description() {
    return 'Start development server with hot reload';
  }

  /**
   * Get command options
   * @returns {Array<Object>} Array of command options
   */
  get options() {
    return [
      {
        flags: '-c, --components <path>',
        description: 'Path to components directory',
        defaultValue: 'components',
      },
      {
        flags: '-o, --output <path>',
        description: 'Output directory for generated config',
        defaultValue: '.storefront',
      },
      {
        flags: '-p, --port <number>',
        description: 'Port for Next.js dev server',
        defaultValue: '3000',
      },
    ];
  }

  /**
   * Execute the dev command
   * @param {Object} options Command options
   * @returns {Promise<Object>} Command result
   */
  async execute(options) {
    try {
      await runDev({
        components: options.components,
        output: options.output,
        port: options.port,
      });
      return { success: true };
    } catch (err) {
      console.error(pc.red('✗'), 'Dev server failed:', err.message);
      return { success: false, error: err };
    }
  }
}

/**
 * Factory function to create a StorefrontDevCommand
 * @param {Object} app Application instance
 * @returns {StorefrontDevCommand} A new command instance
 */
export function createStorefrontDevCommand(app) {
  return new StorefrontDevCommand(app);
}
