#!/usr/bin/env node
/**
 * Finqu CLI
 * Command-line interface using the new modular code structure
 */
import path from 'path';
import { Command } from 'commander';
import { createFullApp } from './index.js'; // Assuming this now accepts logger and config
import { createLogger } from './core/logger.js';
import { createConfigManager } from './core/config.js';
import { createFileSystem } from './io/fileSystem.js';
import { isCliVersionRequest } from './core/argv.js';
import {
  EXIT_CODES,
  buildEnvelope,
  isNonInteractiveEnv,
  keyFromOperands,
  printEnvelope,
  refusalMessage,
} from './core/non-interactive.js';

// Configuration constants
const DEFAULT_CONFIG_FILE =
  process.env.FINQU_CONFIG || path.join(process.cwd(), '.env');

/**
 * Main CLI entry point function
 */
async function main() {
  // 1. Initialize Logger (starts with verbose off)
  const logger = createLogger();
  let nonInteractive = false;
  let json = false;

  try {
    if (isCliVersionRequest(process.argv.slice(2))) {
      console.log(__APP_VERSION__);
      return;
    }

    // Create the Commander program
    const program = new Command();

    // Configure basic CLI options
    program
      .name('finqu')
      .description('Finqu CLI')
      .version(__APP_VERSION__, '-V', 'Output the version number')
      .option('-v, --verbose', 'Enable verbose logging', false) // Default to false
      .option(
        '--non-interactive',
        'Never prompt. Only theme download, deploy, delete and configure are allowed (or set FINQU_NON_INTERACTIVE=1)',
        false,
      )
      .option(
        '--json',
        'Print one JSON result line on stdout (theme download, deploy, delete and configure)',
        false,
      )
      .option(
        '-c, --config <path>',
        'Path to config file',
        DEFAULT_CONFIG_FILE,
      );

    // 2. Parse arguments to get options like --verbose and --config
    // We parse *before* full app initialization to get these values
    const parsed = program.parseOptions(process.argv);
    const options = program.opts(); // Get parsed options

    nonInteractive = !!options.nonInteractive || isNonInteractiveEnv();
    json = !!options.json;
    if (json) {
      logger.setMachineOutput(true);
    }
    if (nonInteractive) {
      logger.setExitOnFatal(false);
    }

    // Refuse before reading config or building the app, so a refused command
    // never touches a token or the network.
    if (nonInteractive || json) {
      const operands = parsed.operands.slice(2);
      const key = keyFromOperands(operands);
      const refusal =
        operands.length > 0 ? refusalMessage(key, { nonInteractive, json }) : null;
      if (refusal) {
        logger.printError(refusal);
        if (json) {
          printEnvelope({
            ok: false,
            command: key,
            exitCode: EXIT_CODES.REFUSED,
            error: { code: 'COMMAND_REFUSED', message: refusal },
            result: null,
          });
        }
        process.exitCode = EXIT_CODES.REFUSED;
        return;
      }
    }

    // 3. Initialize ConfigManager
    const fileSystem = createFileSystem(); // Needed for config manager
    const initialConfigData = {
      verbose: options.verbose,
    };
    const configManager = await createConfigManager(
      fileSystem,
      options.config, // Use config path from options
      initialConfigData,
    );

    // Set after loading so a stray FINQU_* key in .env cannot override the flags
    configManager.set('nonInteractive', nonInteractive);
    configManager.set('json', json);

    if (!configManager.get('themeDir')) {
      configManager.set('themeDir', process.cwd());
    }

    // 4. Update logger verbosity based on final config
    // This ensures config file settings are also considered
    logger.setVerbose(configManager.get('verbose', false)); // Use getter with default

    // Validate the theme directory from config before initializing the app
    const themeDir = configManager.get('themeDir');
    const validationResult = await fileSystem.validateDirectory(themeDir);
    if (!validationResult.valid) {
      logger.error(validationResult.error);
      throw new Error(`Invalid theme directory: ${themeDir}`);
    }

    // 5. Initialize the full application with pre-configured logger and config
    const app = await createFullApp(
      {
        // Pass other app-specific options if needed, e.g., fileSystem
        fileSystem: fileSystem,
      },
      logger,
      configManager,
    );

    // 6. Register all commands with Commander
    // The command registry now gets the fully initialized app instance
    app.commands.registerCommands(program); // Access commands via app

    // 7. Parse the full command line arguments and execute the command
    await program.parseAsync(process.argv);
  } catch (err) {
    // Use the initialized logger to handle errors
    logger.handleError(err);
    // process.exit(1) is handled within logger.handleError, except in
    // non-interactive mode where the exit code is set here
    if (nonInteractive) {
      process.exitCode = EXIT_CODES.FAILED;
      if (json) {
        printEnvelope(buildEnvelope('startup', undefined, err));
      }
    }
  }
}

// Run the CLI
main();
