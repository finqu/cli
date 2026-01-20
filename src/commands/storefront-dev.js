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
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} Whether the port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
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
 * @returns {import('node:child_process').ChildProcess} Child process
 */
function startNextDev(port) {
  const nextProcess = spawn('npx', ['next', 'dev', '-p', port], {
    stdio: 'inherit',
    shell: true,
  });

  nextProcess.on('error', (error) => {
    console.error(pc.red('✗'), 'Failed to start Next.js:', error.message);
    process.exit(1);
  });

  nextProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(pc.red('✗'), `Next.js exited with code ${code}`);
      process.exit(code);
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

  // Start Next.js dev server
  console.log(pc.cyan('→'), `Starting Next.js dev server on port ${pc.bold(availablePort)}...\n`);
  const nextProcess = startNextDev(availablePort);

  // Watch for component changes
  console.log(pc.cyan('→'), 'Watching for component changes...\n');

  const watcher = chokidar.watch(watchPattern, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
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

  // Handle cleanup
  const cleanup = () => {
    console.log(pc.dim('\nShutting down...'));
    watcher.close();
    nextProcess.kill('SIGTERM');
    process.exit(0);
  };

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
